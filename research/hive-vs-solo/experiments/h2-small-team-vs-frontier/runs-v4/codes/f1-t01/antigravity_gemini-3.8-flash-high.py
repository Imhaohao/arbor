import sys

# Increase recursion depth just in case, though the algorithm is purely iterative
sys.setrecursionlimit(200000)


def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    n = int(input_data[0])
    A = [0] + [int(x) for x in input_data[1 : n + 1]]

    MOD = 998244353

    if n == 1:
        print(A[1] % MOD)
        return
    if n == 2:
        print((A[1] * A[2]) % MOD)
        return

    f = [0] * (n + 1)
    P = [0] * (n + 1)
    prefix_val = [0] * (n + 2)

    f[0] = 1
    P[0] = 1
    f[1] = A[1] % MOD
    P[1] = A[1] % MOD

    prefix_val[2] = 1
    prefix_val[3] = (f[1] - f[0]) % MOD

    M = [0] * (n + 1)
    prod_T = [0] * (n + 1)

    non_routable = 0

    for i in range(2, n + 1):
        P[i] = (P[i - 1] * A[i]) % MOD
        non_routable = (non_routable * A[i]) % MOD

        b = i - 1
        if b >= 2:
            sum_W = 0
            # Update existing runs for a < b with a = b (mod 2)
            a = b - 2
            val_b = A[b]
            val_next = A[b + 1]
            mul_prev = A[b - 1] - 1

            while a >= 2:
                if val_b < M[a]:
                    M[a] = val_b
                if val_next < M[a]:
                    M[a] = val_next
                prod_T[a] = (prod_T[a] * mul_prev) % MOD

                w = (M[a] % MOD) * prod_T[a] % MOD * prefix_val[a] % MOD
                sum_W = (sum_W + w) % MOD
                a -= 2

            # New run starting at a = b
            m_val = A[b - 1]
            if A[b] < m_val:
                m_val = A[b]
            if A[b + 1] < m_val:
                m_val = A[b + 1]

            M[b] = m_val
            prod_T[b] = 1
            w = (M[b] % MOD) * prefix_val[b] % MOD
            sum_W = (sum_W + w) % MOD

            non_routable = (non_routable + sum_W) % MOD

        f[i] = (P[i] - non_routable) % MOD
        if i + 1 <= n + 1:
            prefix_val[i + 1] = (f[i - 1] - f[i - 2]) % MOD

    print(f[n])


if __name__ == '__main__':
    solve()
