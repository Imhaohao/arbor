import sys


def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    n = int(input_data[0])
    a = [int(x) for x in input_data[1 : n + 1]]

    max_val = max(a)
    limit = max(1000, max_val)

    # Smallest prime factor (SPF) sieve up to limit
    spf = list(range(limit + 1))
    spf[4::2] = [2] * ((limit - 4) // 2 + 1)
    for i in range(3, 1001, 2):
        if spf[i] == i:
            for j in range(i * i, limit + 1, 2 * i):
                if spf[j] == j:
                    spf[j] = i

    small_primes = [p for p in range(2, 1001) if spf[p] == p]
    p_to_bit = [0] * 1001
    for idx, p in enumerate(small_primes):
        p_to_bit[p] = 1 << idx

    num_small = len(small_primes)
    PARITY_BIT = 1 << num_small

    # Factor unique values
    cache = {}
    for val in set(a):
        mask = PARITY_BIT if (val & 1) else 0
        large_p = 0
        temp = val
        while temp > 1:
            p = spf[temp]
            if p > 1000:
                large_p = p
                break
            cnt = 0
            while spf[temp] == p:
                cnt ^= 1
                temp //= p
            if cnt:
                mask ^= p_to_bit[p]
        cache[val] = (mask, large_p)

    large_prime_groups = {}
    U = []

    for val in a:
        mask, lp = cache[val]
        if lp == 0:
            if mask:
                U.append(mask)
        else:
            if lp in large_prime_groups:
                large_prime_groups[lp].append(mask)
            else:
                large_prime_groups[lp] = [mask]

    large_p_rank = len(large_prime_groups)

    for masks in large_prime_groups.values():
        pivot = masks[0]
        for m in masks[1:]:
            diff = m ^ pivot
            if diff:
                U.append(diff)

    unique_U = set(U)
    max_small_rank = num_small + 1
    basis = [0] * max_small_rank
    small_rank = 0

    for x in unique_U:
        while x:
            b = x.bit_length() - 1
            p = basis[b]
            if not p:
                basis[b] = x
                small_rank += 1
                break
            x ^= p
        if small_rank == max_small_rank:
            break

    total_rank = large_p_rank + small_rank
    mod = 998244353
    ans = (pow(2, n - total_rank, mod) - 1) % mod
    print(ans)


if __name__ == "__main__":
    solve()
