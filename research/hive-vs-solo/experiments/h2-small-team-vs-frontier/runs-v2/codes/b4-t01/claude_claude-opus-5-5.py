import sys

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = data[1:1 + n]
    MOD = 998244353
    vals = list(map(int, a))
    M = max(vals)
    cnt = [0] * (M + 1)
    for v in vals:
        cnt[v] += 1
    c = [0] * (M + 1)
    for d in range(1, M + 1):
        c[d] = sum(cnt[d::d])

    mu = [1] * (M + 1)
    is_comp = bytearray(M + 1)
    primes = []
    for i in range(2, M + 1):
        if not is_comp[i]:
            primes.append(i)
            mu[i] = -1
        for p in primes:
            ip = i * p
            if ip > M:
                break
            is_comp[ip] = 1
            if i % p == 0:
                mu[ip] = 0
                break
            mu[ip] = -mu[i]
    sqf = [(m, mu[m]) for m in range(1, M + 1) if mu[m] != 0]

    fact = [1] * (n + 1)
    for i in range(1, n + 1):
        fact[i] = fact[i - 1] * i % MOD
    inv_fact = [1] * (n + 1)
    inv_fact[n] = pow(fact[n], MOD - 2, MOD)
    for i in range(n, 0, -1):
        inv_fact[i - 1] = inv_fact[i] * i % MOD

    ans = 0
    for k in range(1, M + 1):
        if c[k] < k:
            continue
        limit = M // k
        s = 0
        for m, sign in sqf:
            if m > limit:
                break
            v = c[k * m]
            if v >= k:
                term = fact[v] * inv_fact[v - k]
                if sign > 0:
                    s += term
                else:
                    s -= term
        ans = (ans + (s % MOD) * inv_fact[k]) % MOD

    print(ans % MOD)

main()
