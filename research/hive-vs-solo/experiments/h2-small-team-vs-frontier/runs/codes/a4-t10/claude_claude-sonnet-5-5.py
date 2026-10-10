import sys
from itertools import accumulate

def main():
    n, m = map(int, sys.stdin.read().split())
    MOD = 998244353
    P = [0] * 300
    for dd in range(n, 300):
        v = 1
        for t in range(n):
            v = v * (dd - t) % MOD
        P[dd] = v
    d = [0] * (m + 1)
    mu = [0] * (m + 1)
    cnt = [0] * (m + 1)
    d[1] = 1
    mu[1] = 1
    primes = []
    for i in range(2, m + 1):
        if d[i] == 0:
            d[i] = 2
            mu[i] = -1
            cnt[i] = 1
            primes.append(i)
        di = d[i]
        mi = mu[i]
        ci = cnt[i]
        for p in primes:
            ip = i * p
            if ip > m:
                break
            if i % p == 0:
                cnt[ip] = ci + 1
                d[ip] = di // (ci + 1) * (ci + 2)
                break
            cnt[ip] = 1
            d[ip] = di * 2
            mu[ip] = -mi
    vals = [0] + [P[d[j]] for j in range(1, m + 1)]
    G = list(accumulate(vals))
    ans = 0
    for k in range(1, m + 1):
        u = mu[k]
        if u:
            ans += u * G[m // k]
    print(ans % MOD)

main()
