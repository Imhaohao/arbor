import sys
import numpy as np
from math import comb


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = np.array(data[1:1 + n], dtype=np.int64)
    P = 998244353
    N = int(a.max())
    cntval = np.bincount(a, minlength=N + 1)

    sieve = np.ones(N + 1, dtype=bool)
    sieve[:2] = False
    for i in range(2, int(N ** 0.5) + 1):
        if sieve[i]:
            sieve[i * i::i] = False
    primes = np.flatnonzero(sieve).tolist()

    Om = np.zeros(N + 1, dtype=np.int64)
    om = np.zeros(N + 1, dtype=np.int64)
    for p in primes:
        om[p::p] += 1
        q = p
        while q <= N:
            Om[q::q] += 1
            q *= p

    C = np.zeros((N + 1, 16), dtype=np.int32)
    C[np.arange(1, N + 1), Om[1:]] = cntval[1:]
    for p in primes:
        top = N // p
        while top >= 1:
            lo = top // p
            C[lo + 1:top + 1] += C[(lo + 1) * p:top * p + 1:p]
            top = lo
    m = C.sum(axis=1, dtype=np.int64)
    mdpos = m > 0

    def powtable(base, length):
        arr = np.ones(length, dtype=np.int64)
        size = 1
        while size < length:
            take = min(size, length - size)
            arr[size:size + take] = arr[:take] * pow(base, size, P) % P
            size *= 2
        return arr

    LEN = n + 20
    pow2 = powtable(2, LEN)
    pow3 = powtable(3, LEN)
    invp2 = powtable((P + 1) // 2, LEN)

    NPd = np.where(mdpos, (Om + 1) * (Om + 2) // 2, 0)
    off = np.cumsum(NPd) - NPd
    TOT = int(NPd.sum())

    ks = np.arange(1, N + 1, dtype=np.int64)
    cnts = N // ks
    total_pairs = int(cnts.sum())
    K = np.repeat(ks, cnts)
    starts = np.cumsum(cnts) - cnts
    E = np.arange(total_pairs, dtype=np.int64) - np.repeat(starts, cnts) + 1
    D = E * K
    keep = mdpos[D]
    K = K[keep]
    E = E[keep]
    D = D[keep]
    Oe = Om[E]
    we = om[E]
    Ok = Om[K]
    wk = om[K]
    pw = pow2[m[E]]
    offD = off[D]

    combtab = np.array([[comb(r, c) for c in range(8)] for r in range(8)], dtype=np.int64)
    Zacc = np.zeros(TOT, dtype=np.float64)
    maxwe = int(we.max())
    maxwk = int(wk.max())
    for i in range(maxwe + 1):
        selI = np.flatnonzero(we >= i)
        for j in range(maxwk + 1):
            sel = selI[wk[selI] >= j]
            if sel.size == 0:
                continue
            we_s = we[sel]
            wk_s = wk[sel]
            beta = Oe[sel] + Ok[sel] - wk_s + j
            w = Oe[sel] - we_s + i
            idx = offD[sel] + beta * (beta + 1) // 2 + w
            coef = combtab[we_s, i] * combtab[wk_s, j]
            parity = ((we_s + wk_s) & 1) ^ ((i + j) & 1)
            coef = coef * (1 - 2 * parity)
            vals = (pw[sel] * coef).astype(np.float64)
            Zacc += np.bincount(idx, weights=vals, minlength=TOT)
    Zc = np.rint(Zacc).astype(np.int64) % P

    dlist = np.flatnonzero(mdpos)
    nz = C[dlist] > 0
    last = 15 - np.argmax(nz[:, ::-1], axis=1)
    Lrel = last - Om[dlist] + 1
    keys = Om[dlist] * 32 + Lrel

    total = 0
    neg = 0
    for key in np.unique(keys).tolist():
        og = key // 32
        L = key % 32
        ds = dlist[keys == key]
        numd = ds.size
        cs = C[ds][:, og:og + L].astype(np.int64)
        arr = np.ones((numd, 1), dtype=np.int64)
        for j in range(L):
            p3 = pow3[cs[:, j]]
            n0 = ((p3 + 1) % P)[:, None]
            n1 = ((p3 - 1) % P)[:, None]
            arr = np.concatenate((arr * n0 % P, arr * n1 % P), axis=1)
        arr = arr * invp2[m[ds] + L][:, None] % P

        betas = np.arange(og + 1, dtype=np.int64)
        S = np.zeros((og + 1, 1), dtype=np.int64)
        for j in range(L):
            v = ((og + j - betas) // 2)[:, None]
            S = np.concatenate((S, S ^ v), axis=1)
        zbits = (S == 0).astype(np.int64)
        code = (zbits * (1 << betas)[:, None]).sum(axis=0)
        uniq, inv = np.unique(code, return_inverse=True)
        order = np.argsort(inv, kind='stable')
        inv_sorted = inv[order]
        cstarts = np.searchsorted(inv_sorted, np.arange(len(uniq)))
        Wagg = np.add.reduceat(arr[:, order], cstarts, axis=1) % P

        bp = []
        wp = []
        for b in range(og + 1):
            for ww in range(b + 1):
                bp.append(b)
                wp.append(ww)
        bp = np.array(bp, dtype=np.int64)
        wp = np.array(wp, dtype=np.int64)
        NPg = bp.size
        Pind = (((uniq[None, :] >> bp[:, None]) & 1) & ((uniq[None, :] >> wp[:, None]) & 1))
        Zmat = Zc[off[ds][:, None] + np.arange(NPg)[None, :]]
        T = (Zmat.astype(np.float64) @ Pind.astype(np.float64)).astype(np.int64) % P
        total += int(((Wagg * T) % P).sum())
        neg += int(Zmat.sum())

    print((total - neg) % P)


main()
