import sys
from itertools import compress
from math import comb

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    vals = list(map(int, data[1:1 + n]))
    MOD = 998244353
    N = max(vals)
    cnt = [0] * (N + 1)
    for v in vals:
        cnt[v] += 1
    spf = [0] * (N + 1)
    primes = []
    for i in range(2, N + 1):
        if spf[i] == 0:
            primes.append(i)
            for j in range(i, N + 1, i):
                if spf[j] == 0:
                    spf[j] = i
    Om = [0] * (N + 1)
    om = [0] * (N + 1)
    for i in range(2, N + 1):
        p = spf[i]
        j = i // p
        Om[i] = Om[j] + 1
        om[i] = om[j] + (1 if j % p else 0)
    m = [0] * (N + 1)
    for d in range(1, N + 1):
        m[d] = sum(cnt[d::d])
    inv2 = (MOD + 1) // 2
    th = 3 * inv2 % MOD
    pw2 = [1] * (n + 1)
    P12 = [1] * (n + 1)
    P32 = [1] * (n + 1)
    for i in range(1, n + 1):
        pw2[i] = pw2[i - 1] * 2 % MOD
        P12[i] = P12[i - 1] * inv2 % MOD
        P32[i] = P32[i - 1] * th % MOD
    E = [(x + y) * inv2 % MOD for x, y in zip(P32, P12)]
    O = [(x - y) * inv2 % MOD for x, y in zip(P32, P12)]
    pow2m = [pw2[x] for x in m]
    X = pw2[n]
    T0 = max(N // 8, 1)
    tot = 0

    if T0 < N:
        S3 = [0] * (N + 1)
        PS = [0] * (N + 1)
        b3 = [(-1 if Om[k] & 1 else 1) * (1 << om[k]) for k in range(N + 1)]
        for D in range(1, N + 1):
            k0 = T0 // D + 1
            kmax = N // D
            if k0 > kmax:
                continue
            aD = pow2m[D] * (1 << om[D]) % MOD
            st = D * k0
            S3[st::D] = [s + aD * b for s, b in zip(S3[st::D], b3[k0:kmax + 1])]
        for p in primes:
            k0 = T0 // p + 1
            kmax = N // p
            if k0 > kmax:
                continue
            st = p * k0
            PS[st::p] = [s + v for s, v in zip(PS[st::p], pow2m[k0:kmax + 1])]
        cx = cnt + [0] * (6 * N + 1)
        inv4 = inv2 * inv2 % MOD
        for d in range(T0 + 1, N + 1):
            if not m[d]:
                continue
            c0 = cx[d]
            c1 = cx[2 * d] + cx[3 * d] + cx[5 * d] + cx[7 * d]
            c2 = cx[4 * d] + cx[6 * d]
            M = pow2m[d]
            w = om[d]
            if c1 == 0 and c2 == 0:
                tot += O[c0] * M * (1 - w)
                continue
            E0 = E[c0]; O0 = O[c0]; E1 = E[c1]; O1 = O[c1]; E2 = E[c2]; O2 = O[c2]
            P = PS[d] % MOD
            s3 = S3[d] % MOD
            WMX = (1 << w) * (M + X)
            Ss = (WMX + s3) * inv4 % MOD
            So = (s3 - WMX) * inv4 % MOD
            part1 = (O0 * E1 % MOD * M % MOD * (1 - w) + E0 * O1 % MOD * M + O0 * O1 % MOD * Ss) % MOD
            part2 = (E0 * So - O0 * P) % MOD
            tot += E2 * part1 + O1 * O2 % MOD * part2

    divs = [[] for _ in range(T0 + 1)]
    for D in range(1, T0 + 1):
        for mult in range(D, T0 + 1, D):
            divs[mult].append(D)
    cvD = [None] * (T0 + 1)
    for D in range(1, T0 + 1):
        w = om[D]
        cvD[D] = [(Om[D] - i, (-1) ** i * comb(w, i)) for i in range(w + 1)]
    evk = [[(e, (-1) ** e * comb(w, e)) for e in range(w + 1)] for w in range(9)]
    L = N.bit_length()
    Om1 = Om[1:]
    maskj = [[x == j for x in Om1] for j in range(L + 1)]

    def build(e1, e2, relmask):
        js = [j for j in range(17) if relmask >> j & 1]
        k = len(js)
        ws = [(((j + e1) >> 1) << 4) | ((j + e2) >> 1) for j in js]
        basis = {}
        gens = []
        for i, wv in enumerate(ws):
            cm = 1 << i
            v = wv
            while v:
                hb = v.bit_length() - 1
                if hb in basis:
                    bv, bc = basis[hb]
                    v ^= bv
                    cm ^= bc
                else:
                    basis[hb] = (v, cm)
                    break
            if v == 0:
                gens.append(cm)
        r = len(basis)
        h = k // 2
        lomask = (1 << h) - 1
        if len(gens) <= r:
            span = [0]
            for g in gens:
                span += [x ^ g for x in span]
            return (0, [(z & lomask, z >> h) for z in span], 1)
        span = {0}
        for b in range(8):
            mk = 0
            for i, wv in enumerate(ws):
                if wv >> b & 1:
                    mk |= 1 << i
            if mk not in span:
                span |= {x ^ mk for x in span}
        return (1, [(z & lomask, z >> h) for z in span], pow(inv2, r, MOD))

    def table(xs, ys):
        t = [1]
        for x, y in zip(xs, ys):
            t = [v * x % MOD for v in t] + [v * y % MOD for v in t]
        return t

    memo = {}
    for d in range(1, T0 + 1):
        if not m[d]:
            continue
        sl = cnt[d::d]
        R = len(sl)
        maxj = R.bit_length() - 1
        cl = [sum(compress(sl, maskj[j])) for j in range(maxj + 1)]
        js = [j for j in range(maxj + 1) if cl[j]]
        cs = [cl[j] for j in js]
        relmask = 0
        for j in js:
            relmask |= 1 << j
        k = len(js)
        h = k // 2
        Od = Om[d]
        ow = om[d]
        W1 = ow + 1
        arr = [0] * ((Od + 1) * W1)
        for D in divs[d]:
            wD = pow2m[D]
            ek = evk[om[d // D]]
            for t1, cu in cvD[D]:
                x = wD * cu
                base = t1 * W1
                for e, ce in ek:
                    arr[base + e] += x * ce
        tabs = [None, None]
        contrib = 0
        for idx in range(len(arr)):
            val = arr[idx] % MOD
            if not val:
                continue
            t1, e = divmod(idx, W1)
            key = (Od - t1, e, relmask)
            ent = memo.get(key)
            if ent is None:
                ent = build(Od - t1, e, relmask)
                memo[key] = ent
            mode, pairs, fac = ent
            if tabs[mode] is None:
                if mode == 0:
                    xs = [E[c] for c in cs]
                    ys = [O[c] for c in cs]
                else:
                    xs = [P32[c] for c in cs]
                    ys = [P12[c] for c in cs]
                tabs[mode] = (table(xs[:h], ys[:h]), table(xs[h:], ys[h:]))
            lo, hi = tabs[mode]
            g1 = sum(lo[x] * hi[y] for x, y in pairs) % MOD * fac % MOD
            contrib += val * (g1 - 1)
        tot += contrib

    print(tot % MOD)

main()
