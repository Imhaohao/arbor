import sys
from itertools import accumulate
from operator import ne
from array import array
import struct


def compute_f(s):
    n = len(s)
    rank = [c - 96 for c in s]
    M = max(n, 26) + 2
    k = 1
    while True:
        sh = rank[k:] + [0] * min(k, n)
        key = [a * M + b for a, b in zip(rank, sh)]
        sa = sorted(range(n), key=key.__getitem__)
        sk = [key[i] for i in sa]
        rs = list(accumulate(map(ne, sk[1:], sk), initial=1))
        for i, rv in zip(sa, rs):
            rank[i] = rv
        if rs[-1] == n:
            break
        k *= 2
    lcp = [0] * n
    h = 0
    for i in range(n):
        ri = rank[i] - 1
        if ri > 0:
            j = sa[ri - 1]
            while i + h < n and j + h < n and s[i + h] == s[j + h]:
                h += 1
            lcp[ri] = h
            if h > 0:
                h -= 1
        else:
            h = 0
    tb = [lcp]
    p = 1
    while (1 << p) <= n:
        prev = tb[-1]
        tb.append(list(map(min, prev, prev[1 << (p - 1):])))
        p += 1
    f = [n + 1] * (n + 2)
    stack = []
    for k in range(n - 1, -1, -1):
        rk = rank[k]
        while stack and rank[stack[-1]] < rk:
            stack.pop()
        if stack:
            j = stack[-1]
            lo = rk
            hi = rank[j] - 1
            ln = hi - lo + 1
            pp = ln.bit_length() - 1
            a = tb[pp][lo]
            b = tb[pp][hi - (1 << pp) + 1]
            f[k + 1] = j + 1 + (a if a < b else b)
        stack.append(k)
    return f


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    q = int(data[1])
    s = data[2]
    vals = [0] + [int(x) for x in data[3:3 + n]]
    pos = 3 + n
    q_at = [[] for _ in range(n + 2)]
    for qi in range(q):
        L = int(data[pos])
        R = int(data[pos + 1])
        pos += 2
        q_at[R].append((L, qi))
    f = compute_f(s)
    fr = compute_f(s[::-1])
    g = [0] * (n + 2)
    for K in range(1, n + 1):
        g[K] = n + 1 - fr[n + 1 - K]
    pops_at = [[] for _ in range(n + 2)]
    for K in range(1, n + 1):
        if f[K] <= n:
            pops_at[f[K]].append(K)

    BIAS = 1 << 62
    HBIT = 1 << 63
    MM = n + 2
    SH = 64 * MM
    ONES = int.from_bytes((b'\x01' + b'\x00' * 7) * MM, 'little')
    ONES_n = ONES >> (64 * (MM - n))
    BIASFULL = BIAS * ONES_n
    HBFULL = HBIT * ONES_n
    Vb = BIASFULL
    Hb = 0
    pack = struct.Struct('<Q').pack
    ans = [0] * q
    TB = 128
    t0 = 1
    while t0 <= n:
        t1 = min(n, t0 + TB - 1)
        cset = {0, n}
        cset.update(range(t0 - 1, t1 + 1))
        for r in range(t0, t1 + 1):
            cset.add(g[r])
            for k in pops_at[r]:
                cset.add(k)
                cset.add(g[k])
            for L, qi in q_at[r]:
                cset.add(L - 1)
        cs = sorted(cset)
        idx = {c: i for i, c in enumerate(cs)}
        m = len(cs) - 1
        Vl = memoryview(Vb.to_bytes(8 * n, 'little')).cast('Q').tolist()
        Hl = memoryview(Hb.to_bytes(8 * n, 'little')).cast('Q').tolist()
        spans = list(zip(cs, cs[1:]))
        maxVb = [max(Vl[a:b]) for a, b in spans]
        maxHb = [max(Hl[a:b]) for a, b in spans]
        SMH = list(accumulate(reversed(maxHb), max))
        SMH.reverse()
        MVpack = int.from_bytes(array('Q', maxVb).tobytes(), 'little')
        ONES_m = ONES >> (64 * (MM - m))
        C = (BIAS | HBIT) * ONES_m
        h = 0
        pc = {0: 0}
        for r in range(t0, t1 + 1):
            b = idx[r]
            pb = pc.get(b)
            if pb is None:
                pb = pc[b] = ONES >> (SH - 64 * b)
            delta = 0
            v = vals[r]
            if v:
                a = idx[g[r]]
                pa = pc.get(a)
                if pa is None:
                    pa = pc[a] = ONES >> (SH - 64 * a)
                delta = v * (pb - pa)
            for k in pops_at[r]:
                v = vals[k]
                if v:
                    ka = idx[k]
                    kg = idx[g[k]]
                    pka = pc.get(ka)
                    if pka is None:
                        pka = pc[ka] = ONES >> (SH - 64 * ka)
                    pkg = pc.get(kg)
                    if pkg is None:
                        pkg = pc[kg] = ONES >> (SH - 64 * kg)
                    delta -= v * (pka - pkg)
            if delta:
                C += delta
            t = C - h
            gg = t & (pb << 63)
            h ^= (h ^ C) & (gg - (gg >> 63))
            qlist = q_at[r]
            if qlist:
                T = h + MVpack
                mv = memoryview(T.to_bytes(8 * m, 'little')).cast('Q')
                for L, qi in qlist:
                    i = idx[L - 1]
                    a1 = SMH[i] - BIAS
                    a2 = max(mv[i:]) - HBIT
                    ans[qi] = a1 if a1 > a2 else a2
        Cl = memoryview(C.to_bytes(8 * m, 'little')).cast('Q').tolist()
        hl = memoryview(h.to_bytes(8 * m, 'little')).cast('Q').tolist()
        lens = [b - a for a, b in spans]
        CE = int.from_bytes(
            b''.join([pack(c - HBIT) * ln for c, ln in zip(Cl, lens)]), 'little')
        HDE = int.from_bytes(
            b''.join([pack(x) * ln for x, ln in zip(hl, lens)]), 'little')
        cand = Vb + HDE - BIASFULL
        Vb = Vb + CE - BIASFULL
        t = (cand + HBFULL) - Hb
        gg = t & HBFULL
        Mk = gg - (gg >> 63)
        Hb ^= (Hb ^ cand) & Mk
        t0 = t1 + 1
    sys.stdout.write('\n'.join(map(str, ans)) + '\n')


main()
