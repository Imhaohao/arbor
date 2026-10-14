import sys


def build_mobius(limit):
    mu = [0] * (limit + 1)
    if limit >= 1:
        mu[1] = 1
    composite = bytearray(limit + 1)
    primes = []
    for i in range(2, limit + 1):
        if not composite[i]:
            primes.append(i)
            mu[i] = -1
        for p in primes:
            ip = i * p
            if ip > limit:
                break
            composite[ip] = 1
            if i % p == 0:
                mu[ip] = 0
                break
            mu[ip] = -mu[i]
    return mu


def main():
    MOD = 998244353
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    values = list(map(int, data[1:1 + n]))
    limit = max(values)

    freq = [0] * (limit + 1)
    for v in values:
        freq[v] += 1

    cnt = [0] * (limit + 1)
    for d in range(1, limit + 1):
        cnt[d] = sum(freq[d::d])

    mu = build_mobius(limit)
    nonzero_t = [t for t in range(1, limit + 1) if mu[t] != 0]

    fact = [1] * (n + 1)
    for i in range(1, n + 1):
        fact[i] = fact[i - 1] * i % MOD
    inv_fact = [1] * (n + 1)
    inv_fact[n] = pow(fact[n], MOD - 2, MOD)
    for i in range(n, 0, -1):
        inv_fact[i - 1] = inv_fact[i] * i % MOD

    total = 0
    for k in range(1, min(n, limit) + 1):
        if cnt[k] < k:
            continue
        acc = 0
        for t in nonzero_t:
            kt = k * t
            if kt > limit:
                break
            x = cnt[kt]
            if x < k:
                continue
            term = fact[x] * inv_fact[x - k] % MOD
            if mu[t] > 0:
                acc += term
            else:
                acc -= term
        total = (total + (acc % MOD) * inv_fact[k]) % MOD

    print(total % MOD)


main()
