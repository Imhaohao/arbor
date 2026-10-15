import sys
import numpy as np

MOD = 998244353


def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    a = list(map(int, data[1:1 + n]))
    order = sorted(range(n), key=lambda i: (a[i], i))
    rk = [0] * n
    for r, i in enumerate(order):
        rk[i] = r
    val = np.array([a[i] for i in order], dtype=np.int64)

    def dotval(v):
        return int((v * val % MOD).sum() % MOD)

    def clip_add(target, v, r, sign):
        tail = int(v[r:].sum())
        if sign > 0:
            target[:r] += v[:r]
            target[r] += tail
        else:
            target[:r] -= v[:r]
            target[r] -= tail

    P = np.zeros(n, dtype=np.int64)
    N = np.zeros(n, dtype=np.int64)
    Qm = np.zeros(n, dtype=np.int64)
    Qs = np.zeros(n, dtype=np.int64)
    N[rk[0]] = 1

    for i in range(1, n):
        ra = rk[i]
        P2 = np.zeros(n, dtype=np.int64)
        N2 = np.zeros(n, dtype=np.int64)
        Qm2 = np.zeros(n, dtype=np.int64)
        Qs2 = P.copy()
        clip_add(Qm2, P, ra, -1)

        X = (N + Qm) % MOD
        dX = dotval(X)
        N2[ra] += dX
        clip_add(N2, X, ra, -1)
        clip_add(P2, X, ra, 1)

        if i >= 2:
            b = a[i - 1]
            rb = rk[i - 1]
            r2 = min(rb, ra)
            dV = dotval(Qs)
            Vb = Qs * b % MOD
            N2[ra] += dV * b % MOD
            N2[r2] -= dV
            clip_add(N2, Vb, ra, -1)
            clip_add(N2, Qs, r2, 1)
            P2[r2] += dV
            clip_add(P2, Vb, ra, 1)
            clip_add(P2, Qs, r2, -1)

        P = P2 % MOD
        N = N2 % MOD
        Qm = Qm2 % MOD
        Qs = Qs2 % MOD

    ans = dotval((P + N + Qm) % MOD) + dotval(Qs) * a[n - 1]
    print(ans % MOD)


main()
