import sys


def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    it = iter(input_data)
    n = int(next(it))
    K = int(next(it))

    A = [0] * (n + 1)
    B = [0] * (n + 1)
    C_pref = [0] * (n + 1)
    D = [0] * (n + 1)
    E = [0] * (n + 1)
    F = [0] * (n + 1)
    P = [0] * (n + 1)
    Q = [0] * (n + 1)

    for i in range(1, n + 1):
        ai = int(next(it))
        bi = int(next(it))
        ci = int(next(it))
        di = int(next(it))
        pi = int(next(it))
        qi = int(next(it))

        A[i] = A[i - 1] + ai
        B[i] = B[i - 1] + bi
        C_pref[i] = C_pref[i - 1] + ci
        D[i] = D[i - 1] + di

        ei = A[i] - B[i]
        fi = C_pref[i] - D[i]
        E[i] = ei
        F[i] = fi
        P[i] = 2 * ei + pi
        Q[i] = 2 * fi + qi

    _range = range
    C_cols = [None] * (n + 1)

    for r in _range(1, n + 1):
        col_r = [0] * r
        min_P = P[r]
        min_Q = Q[r]
        Ar = A[r]
        Br = B[r]
        Cr = C_pref[r]
        Dr = D[r]
        Er = E[r]
        Fr = F[r]

        for l in _range(r, 0, -1):
            l1 = l - 1
            pl = P[l]
            if pl < min_P:
                min_P = pl
            ql = Q[l]
            if ql < min_Q:
                min_Q = ql

            u = (Ar - A[l1]) * (Br - B[l1]) - E[l1] - Er + min_P
            v = (Cr - C_pref[l1]) * (Dr - D[l1]) - F[l1] - Fr + min_Q

            col_r[l1] = 2 * (u if u < v else v)

        C_cols[r] = col_r

    if K == 1:
        print(C_cols[n][0])
        return

    if K == n:
        total = 0
        for i in _range(1, n + 1):
            total += C_cols[i][i - 1]
        print(total)
        return

    max_i1 = n - K + 1
    dp = [0] * (max_i1 + 1)
    for i in _range(1, max_i1 + 1):
        dp[i] = C_cols[i][0]

    for t in _range(2, K):
        max_i = n - K + t
        new_dp = [0] * (max_i + 1)
        start = t - 1

        for i in _range(t, max_i + 1):
            c_i = C_cols[i]
            best = dp[start] + c_i[start]
            for j in _range(start + 1, i):
                v = dp[j] + c_i[j]
                if v < best:
                    best = v
            new_dp[i] = best

        dp = new_dp

    c_n = C_cols[n]
    start = K - 1
    best = dp[start] + c_n[start]
    for j in _range(start + 1, n):
        v = dp[j] + c_n[j]
        if v < best:
            best = v

    print(best)


if __name__ == "__main__":
    main()
