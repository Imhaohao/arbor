import sys
import math
from itertools import accumulate, compress
from operator import mul


def main():
    n, m = map(int, sys.stdin.read().split()[:2])
    MOD = 998244353

    # Sieve of Eratosthenes for primes up to m
    sieve = bytearray([1]) * (m + 1)
    sieve[0] = 0
    sieve[1] = 0
    for i in range(2, math.isqrt(m) + 1):
        if sieve[i]:
            sieve[i * i::i] = bytes(len(range(i * i, m + 1, i)))
    primes = list(compress(range(m + 1), sieve))

    # tau (divisor count) and mu (Mobius) via slice operations per prime
    tau = [1] * (m + 1)
    mu = [1] * (m + 1)
    mu[0] = 0
    for p in primes:
        mu[p::p] = [-x for x in mu[p::p]]
        q = p
        j = 1
        while q <= m:
            # multiples of p^j gain exponent j: factor j -> j+1 (exact integer update)
            tau[q::q] = [x * (j + 1) // j for x in tau[q::q]]
            q *= p
            j += 1
        pp = p * p
        if pp <= m:
            mu[pp::pp] = [0] * len(range(pp, m + 1, pp))

    # Mertens function prefix sums
    M = list(accumulate(mu))

    maxt = max(tau)
    b = [math.comb(t, n) % MOD for t in range(maxt + 1)]

    # sum over d of C(tau(d), n) * M(m // d)
    total = sum(map(mul,
                    map(b.__getitem__, tau[1:]),
                    map(M.__getitem__, [m // d for d in range(1, m + 1)])))

    f = 1
    for i in range(2, n + 1):
        f = f * i % MOD

    print(f * (total % MOD) % MOD)


main()
