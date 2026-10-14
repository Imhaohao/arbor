import sys

MOD = 998244353

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]
    MAX = max(a)

    freq = [0] * (MAX + 1)
    for x in a:
        freq[x] += 1

    cnt = [0] * (MAX + 1)
    for i in range(1, MAX + 1):
        s = 0
        for j in range(i, MAX + 1, i):
            s += freq[j]
        cnt[i] = s

    mu = [0] * (MAX + 1)
    is_comp = bytearray(MAX + 1)
    primes = []
    mu[1] = 1
    for i in range(2, MAX + 1):
        if not is_comp[i]:
            primes.append(i)
            mu[i] = -1
        for p in primes:
            ip = i * p
            if ip > MAX:
                break
            is_comp[ip] = 1
            if i % p == 0:
                break
            mu[ip] = -mu[i]

    fact = [1] * (n + 1)
    for i in range(1, n + 1):
        fact[i] = fact[i - 1] * i % MOD
    invfact = [1] * (n + 1)
    invfact[n] = pow(fact[n], MOD - 2, MOD)
    for i in range(n, 0, -1):
        invfact[i - 1] = invfact[i] * i % MOD

    ans = 0
    for t in range(1, MAX + 1):
        mt = mu[t]
        if mt == 0:
            continue
        ct = cnt[t]
        if ct == 0:
            continue
        limit = MAX // t
        if ct < limit:
            limit = ct
        if n < limit:
            limit = n
        ans += mt * ct
        g = t + t
        for m in range(2, limit + 1):
            c = cnt[g]
            g += t
            if c < m:
                continue
            ways = fact[c] * invfact[m] % MOD * invfact[c - m] % MOD
            ans += mt * ways

    print(ans % MOD)

main()
