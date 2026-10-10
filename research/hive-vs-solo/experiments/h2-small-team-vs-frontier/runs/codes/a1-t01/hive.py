import sys


def main():
    MOD = 998244353
    data = sys.stdin.read().split()
    N = data[0]
    D = int(data[1])
    R = int(data[2])
    n = len(N)
    total = 0

    def conv(v, d):
        res = [0] * D
        for s in range(D):
            if v[s]:
                vs = v[s]
                for t in range(D):
                    res[(s + t) % D] += vs * d[t]
        return [x % MOD for x in res]

    # Lengths 2..n-1: no upper bound, every string of that length is allowed.
    if n >= 3:
        Geq = [0] * D
        Ggt = [0] * D
        A = [0] * D
        for a in range(10):
            for b in range(10):
                t = (a + b) % D
                A[t] += 1
                if a == b:
                    Geq[t] += 1
                elif b > a:
                    Ggt[t] += 1
        # State after the first (outer) pair: a, b in 1..9
        U = [0] * D  # rev undecided
        G = [0] * D  # rev decided good
        for a in range(1, 10):
            for b in range(1, 10):
                t = (a + b) % D
                if a == b:
                    U[t] += 1
                elif b > a:
                    G[t] += 1
        Mc = [0] * D
        for c in range(10):
            Mc[c % D] += 1

        Kmax = (n - 1) // 2 - 1
        Gs = [G]
        for k in range(1, Kmax + 1):
            newU = conv(U, Geq)
            newG = conv(U, Ggt)
            cg = conv(G, A)
            newG = [(x + y) % MOD for x, y in zip(newG, cg)]
            U, G = newU, newG
            Gs.append(G)

        for L in range(2, n):
            k = L // 2 - 1
            g = Gs[k]
            if L % 2 == 0:
                total += g[R]
            else:
                total += sum(g[s] * Mc[(R - s) % D] for s in range(D))
        total %= MOD

    # Length n: bounded by N.
    B = [int(c) for c in N]
    L = n
    P = L // 2
    zero = [0] * D
    # key: (cL, cR, rev); cL: 0 = prefix less, 1 = prefix equal
    # cR: 0 = suffix less, 1 = equal, 2 = greater; rev: 0 undecided, 1 good
    st = {(1, 1, 0): [1] + [0] * (D - 1)}
    for i in range(P):
        j = L - 1 - i
        lo = 1 if i == 0 else 0
        groups = {}
        for a in range(lo, 10):
            ca = 0 if a < B[i] else (1 if a == B[i] else 2)
            for b in range(lo, 10):
                cb = 0 if b < B[j] else (1 if b == B[j] else 2)
                rel = 0 if a == b else (1 if b > a else 2)
                key = (ca, cb, rel, (a + b) % D)
                groups[key] = groups.get(key, 0) + 1
        nst = {}
        for (cL, cR, rev), vec in st.items():
            for (ca, cb, rel, t), cnt in groups.items():
                if cL == 1:
                    if ca == 2:
                        continue
                    ncL = 0 if ca == 0 else 1
                else:
                    ncL = 0
                if ncL == 0:
                    ncR = 1
                else:
                    ncR = cR if cb == 1 else cb
                if rev == 0:
                    if rel == 2:
                        continue
                    nrev = 1 if rel == 1 else 0
                else:
                    nrev = 1
                key2 = (ncL, ncR, nrev)
                rolled = vec[D - t:] + vec[:D - t]
                cur = nst.get(key2, zero)
                nst[key2] = [x + cnt * y for x, y in zip(cur, rolled)]
        st = {k: [x % MOD for x in v] for k, v in nst.items()}

    if L % 2 == 1:
        m = P
        bm = B[m]
        mgroups = {}
        for c in range(10):
            ca = 0 if c < bm else (1 if c == bm else 2)
            key = (ca, c % D)
            mgroups[key] = mgroups.get(key, 0) + 1
        nst = {}
        for (cL, cR, rev), vec in st.items():
            for (ca, t), cnt in mgroups.items():
                if cL == 1:
                    if ca == 2:
                        continue
                    ncL = 0 if ca == 0 else 1
                else:
                    ncL = 0
                key2 = (ncL, cR, rev)
                rolled = vec[D - t:] + vec[:D - t]
                cur = nst.get(key2, zero)
                nst[key2] = [x + cnt * y for x, y in zip(cur, rolled)]
        st = {k: [x % MOD for x in v] for k, v in nst.items()}

    for (cL, cR, rev), vec in st.items():
        if rev == 1 and (cL == 0 or cR != 2):
            total += vec[R]

    print(total % MOD)


main()
