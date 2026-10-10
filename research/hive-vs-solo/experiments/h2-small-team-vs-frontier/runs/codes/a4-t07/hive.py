import sys
from array import array
from math import isqrt

def main():
    MOD = 998244353
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]
    M = max(a)

    # Smallest-prime-factor sieve up to M (0 means "prime or 1").
    spf = array('i', [0]) * (M + 1)
    r = isqrt(M)
    small = [True] * (r + 1)
    primes = []
    for i in range(2, r + 1):
        if small[i]:
            primes.append(i)
            for j in range(i * i, r + 1, i):
                small[j] = False
    # Descending order so the smallest prime factor is written last.
    for p in reversed(primes):
        start = p * p
        cnt = len(range(start, M + 1, p))
        spf[start::p] = array('i', [p]) * cnt

    pos = {}  # prime -> bit position (>= 1); bit 0 holds parity of a_i

    def vector(x):
        parity = x & 1
        mask = 0
        while x > 1:
            p = spf[x]
            if p == 0:
                p = x
            e = 0
            while x % p == 0:
                x //= p
                e ^= 1
            if e:
                b = pos.get(p)
                if b is None:
                    b = len(pos) + 1
                    pos[p] = b
                mask |= 1 << b
        return (mask << 1) | parity

    memo = {}
    for x in a:
        if x not in memo:
            memo[x] = vector(x)
    vecs = set(memo[x] for x in a)

    # GF(2) rank via xor basis keyed by highest set bit.
    basis = {}
    rank = 0
    for w in vecs:
        x = w
        while x:
            h = x.bit_length() - 1
            b = basis.get(h)
            if b is None:
                basis[h] = x
                rank += 1
                break
            x ^= b

    ans = (pow(2, n - rank, MOD) - 1) % MOD
    print(ans)

main()
