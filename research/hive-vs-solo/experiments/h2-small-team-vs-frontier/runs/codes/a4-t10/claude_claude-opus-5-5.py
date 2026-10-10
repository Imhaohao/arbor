import sys
from math import comb, isqrt
from itertools import accumulate

def main():
    data = sys.stdin.read().split()
    n = int(data[0]); m = int(data[1])
    MOD = 998244353
    if n > 240:
        print(0)
        return
    # comb table
    maxt = 241
    cmb = [comb(t, n) % MOD for t in range(maxt + 1)]
    # small primes
    r = isqrt(m)
    small = [True] * (r + 1)
    primes = []
    for i in range(2, r + 1):
        if small[i]:
            primes.append(i)
            for j in range(i * i, r + 1, i):
                small[j] = False
    spf = list(range(m + 1))
    for p in reversed(primes):
        start = p * p
        cnt = len(range(start, m + 1, p))
        spf[start::p] = [p] * cnt
    tau = [0] * (m + 1)
    mu = [0] * (m + 1)
    e = [0] * (m + 1)
    rest = [0] * (m + 1)
    if m >= 1:
        tau[1] = 1; mu[1] = 1; rest[1] = 1
    for d in range(2, m + 1):
        p = spf[d]
        q = d // p
        if spf[q] == p:
            k = e[q] + 1
            e[d] = k
            rr = rest[q]
            rest[d] = rr
            tau[d] = tau[rr] * (k + 1)
        else:
            e[d] = 1
            rest[d] = q
            tau[d] = tau[q] << 1
            mu[d] = -mu[q]
    mert = list(accumulate(mu))
    tau[0] = 0
    cvals = list(map(cmb.__getitem__, tau))
    cvals[0] = 0
    S = list(accumulate(cvals))
    total = 0
    d = 1
    while d <= m:
        v = m // d
        hi = m // v
        total += mert[v] * (S[hi] - S[d - 1])
        d = hi + 1
    total %= MOD
    f = 1
    for i in range(2, n + 1):
        f = f * i % MOD
    print(total * f % MOD)

main()
