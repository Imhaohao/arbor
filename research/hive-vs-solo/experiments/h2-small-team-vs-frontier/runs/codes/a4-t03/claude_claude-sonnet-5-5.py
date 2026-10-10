import sys

def main():
    n, c, k = map(int, sys.stdin.read().split())
    M = 998244353
    m = (c - 1) % M
    m1 = (c - 2) % M
    fact = [1] * (n + 2)
    f = 1
    for i in range(1, n + 2):
        f = f * i % M
        fact[i] = f

    def C(a, b):
        if b < 0 or a < 0 or b > a:
            return 0
        return fact[a] * pow(fact[b] * fact[a - b] % M, -1, M) % M

    def F(d, j):
        if j == 0:
            return (pow(m1, d, M) + (-1) ** d * m1) % M
        if d < 2 * j:
            return 0
        return d * pow(j, -1, M) % M * C(d - j - 1, j - 1) % M * pow(m, j, M) % M * pow(m1, d - 2 * j, M) % M

    def phi(x):
        r = x
        p = 2
        y = x
        while p * p <= y:
            if y % p == 0:
                while y % p == 0:
                    y //= p
                r -= r // p
            p += 1
        if y > 1:
            r -= r // y
        return r

    divs = set()
    i = 1
    while i * i <= n:
        if n % i == 0:
            divs.add(i)
            divs.add(n // i)
        i += 1
    rot = 0
    for d in divs:
        q = n // d
        if k % q:
            continue
        j = k // q
        rot = (rot + phi(q) % M * F(d, j)) % M

    refl = 0
    if n % 2 == 0:
        L = n // 2 + 1
        R = 0
        if k == 0:
            R = m * pow(m1, L - 1, M) % M
        else:
            for e, mult in ((0, 1), (1, 2), (2, 1)):
                if k - e < 0 or (k - e) % 2:
                    continue
                t = (k - e) // 2
                j = e + t
                if j < 1:
                    continue
                s = j - 1 + 2 - e
                if s < 1 or L - j < s:
                    continue
                ex = L - j - s
                if ex < 0:
                    continue
                R = (R + mult * C(L - j - 1, s - 1) % M * pow(m, s, M) % M * pow(m1, ex, M)) % M
        refl = (n // 2) % M * R % M
    ans = (rot + refl) % M * pow(2 * n, -1, M) % M
    print(ans)

main()
