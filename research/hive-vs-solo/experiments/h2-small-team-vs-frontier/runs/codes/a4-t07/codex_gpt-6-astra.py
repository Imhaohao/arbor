import sys
from math import isqrt

MOD = 998244353


def main():
    data = list(map(int, sys.stdin.buffer.read().split()))
    n = data[0]
    values = set(data[1:])
    del data

    maximum = max(values)
    limit = isqrt(maximum)

    spf = [0] * (maximum + 1)
    prime_bit = [0] * (limit + 1)
    dimensions = 1  # Bit 0 represents the parity of the sum.

    for p in range(2, limit + 1):
        if spf[p] == 0:
            prime_bit[p] = 1 << dimensions
            dimensions += 1
            for multiple in range(p * p, maximum + 1, p):
                if spf[multiple] == 0:
                    spf[multiple] = p

    small_basis = [0] * dimensions
    large_basis = {}
    small_rank = 0
    rank = 0

    for value in values:
        x = value

        if small_rank == dimensions:
            p = spf[x]
            while p:
                x //= p
                p = spf[x]
            if x > limit and x not in large_basis:
                large_basis[x] = 0
                rank += 1
            continue

        mask = value & 1
        p = spf[x]
        while p:
            mask ^= prime_bit[p]
            x //= p
            p = spf[x]

        if x > 1:
            if x <= limit:
                mask ^= prime_bit[x]
            else:
                previous = large_basis.get(x, -1)
                if previous == -1:
                    large_basis[x] = mask
                    rank += 1
                    continue
                mask ^= previous

        while mask:
            pivot = mask.bit_length() - 1
            previous = small_basis[pivot]
            if previous:
                mask ^= previous
            else:
                small_basis[pivot] = mask
                small_rank += 1
                rank += 1
                break

    print((pow(2, n - rank, MOD) - 1) % MOD)


if __name__ == "__main__":
    main()
