import sys

def main():
    MOD = 998244353
    n, c, k = map(int, sys.stdin.read().split()[:3])
    if c == 1:
        print(0)
        return
    q = (c - 1) % MOD      # colours other than 1 (count as q)
    qm1 = (c - 2) % MOD    # q - 1

    fact = [1] * (n + 1)
    for i in range(1, n + 1):
        fact[i] = fact[i - 1] * i % MOD

    def binom(a, b):
        if a < 0 or b < 0 or b > a:
            return 0
        return fact[a] * pow(fact[b] * fact[a - b] % MOD, MOD - 2, MOD) % MOD

    def F(m, j):
        # proper cyclic colourings of length m with exactly j beads of colour 1
        if j == 0:
            sign = 1 if m % 2 == 0 else -1
            return (pow(qm1, m, MOD) + sign * qm1) % MOD
        if 2 * j > m:
            return 0
        res = m * pow(j, MOD - 2, MOD) % MOD
        res = res * binom(m - j - 1, j - 1) % MOD
        res = res * pow(q, j, MOD) % MOD
        res = res * pow(qm1, m - 2 * j, MOD) % MOD
        return res

    def H(j, T):
        # [x^T] G1^j, where G1 = q x / (1 - (q-1) x)
        if T < j or j < 0:
            return 0
        if j == 0:
            return 1 if T == 0 else 0
        return pow(q, j, MOD) * binom(T - 1, j - 1) % MOD * pow(qm1, T - j, MOD) % MOD

    def phi(t):
        result = t
        x = t
        p = 2
        while p * p <= x:
            if x % p == 0:
                while x % p == 0:
                    x //= p
                result -= result // p
            p += 1
        if x > 1:
            result -= result // x
        return result

    divs = set()
    d = 1
    while d * d <= n:
        if n % d == 0:
            divs.add(d)
            divs.add(n // d)
        d += 1

    S = 0
    for t in divs:
        if k % t == 0:
            S += phi(t) * F(n // t, k // t)
    S %= MOD

    if n % 2 == 0:
        m = n // 2
        if k % 2 == 0:
            r1 = k // 2
            R = (H(r1 + 1, m + 1 - r1) + H(r1, m - r1)) % MOD
        else:
            r = (k + 1) // 2
            R = 2 * H(r, m + 1 - r) % MOD
        S = (S + m % MOD * R) % MOD

    ans = S * pow(2 * n % MOD, MOD - 2, MOD) % MOD
    print(ans)

main()
