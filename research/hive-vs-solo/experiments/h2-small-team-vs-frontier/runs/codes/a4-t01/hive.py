import sys

def main():
    data = sys.stdin.read().split()
    D = int(data[0])
    MOD = 998244353
    groups = []
    K = 0
    for j in range(D):
        e = int(data[1 + 2 * j])
        c = int(data[2 + 2 * j])
        groups.append((e, c))
        K += e * c

    n = K + 2
    fact = [1] * (n + 1)
    for i in range(1, n + 1):
        fact[i] = fact[i - 1] * i % MOD
    inv = [1] * (n + 1)
    inv[n] = pow(fact[n], MOD - 2, MOD)
    for i in range(n, 0, -1):
        inv[i - 1] = inv[i] * i % MOD

    def binom(a, b):
        if b < 0 or b > a:
            return 0
        return fact[a] * inv[b] % MOD * inv[a - b] % MOD

    sgnK = 1 if K % 2 == 0 else MOD - 1  # (-1)^K mod p

    # T(m) = sum_{k=m}^{K} (-1)^k C(k, m), computed by backward recurrence
    T = [0] * (K + 2)
    T[K] = sgnK
    for m in range(K - 1, -1, -1):
        T[m] = (-2 * T[m + 1] + sgnK * binom(K + 1, m + 1)) % MOD

    ans = 0
    for m in range(1, K + 1):
        g = 1
        fm = fact[m]
        for e, c in groups:
            if m < e:
                g = 0
                break
            b = fm * inv[e] % MOD * inv[m - e] % MOD
            g = g * pow(b, c, MOD) % MOD
        if g == 0:
            continue
        term = g * T[m] % MOD
        if m & 1:
            ans -= term
        else:
            ans += term

    print(ans % MOD)

main()
