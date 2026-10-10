import sys

def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    n = int(input_data[0])
    c = int(input_data[1])
    k = int(input_data[2])

    MOD = 998244353

    if c <= 1:
        print(0)
        return

    if k < 0 or k > n // 2:
        print(0)
        return

    C = (c - 1) % MOD
    C1 = (c - 2) % MOD

    def power(base, exp):
        if exp == 0:
            return 1
        return pow(base % MOD, exp, MOD)

    # Prime factorization of n
    temp = n
    d = 2
    prime_factors = []
    while d * d <= temp:
        if temp % d == 0:
            count = 0
            while temp % d == 0:
                count += 1
                temp //= d
            prime_factors.append((d, count))
        d += 1
    if temp > 1:
        prime_factors.append((temp, 1))

    # Generate all divisors of n
    divisors = [1]
    for p, count in prime_factors:
        new_divs = []
        p_pow = 1
        for _ in range(count):
            p_pow *= p
            for div in divisors:
                new_divs.append(div * p_pow)
        divisors.extend(new_divs)

    def get_phi(x):
        res = x
        for p, _ in prime_factors:
            if x % p == 0:
                res -= res // p
        return res

    # Precompute factorials up to n - k
    max_fact = n - k if k > 0 else 0
    if max_fact > 0:
        fact = [1] * (max_fact + 1)
        f = 1
        for i in range(1, max_fact + 1):
            f = (f * i) % MOD
            fact[i] = f

        def comb(a, b):
            if b < 0 or a < 0 or b > a:
                return 0
            num = fact[a]
            den = (fact[b] * fact[a - b]) % MOD
            return (num * pow(den, MOD - 2, MOD)) % MOD
    else:
        def comb(a, b):
            if b < 0 or a < 0 or b > a:
                return 0
            if b == 0 or b == a:
                return 1
            return 0

    # Part 1: Rotations
    rot_sum = 0
    for g in divisors:
        d = n // g
        if k % d != 0:
            continue
        k_prime = k // d
        phi_d = get_phi(d) % MOD

        if g == 1:
            f_g = 0
        elif k_prime == 0:
            if g % 2 == 0:
                f_g = (power(C1, g) + C1) % MOD
            else:
                f_g = (power(C1, g) - C1) % MOD
        else:
            if k_prime > g // 2:
                f_g = 0
            else:
                ways = (comb(g - k_prime, k_prime) + comb(g - k_prime - 1, k_prime - 1)) % MOD
                ways = (ways * power(C, k_prime)) % MOD
                ways = (ways * power(C1, g - 2 * k_prime)) % MOD
                f_g = ways

        rot_sum = (rot_sum + phi_d * f_g) % MOD

    # Part 2: Reflections
    refl_sum = 0
    if n % 2 == 0:
        m = n // 2
        path_ways = 0
        if k % 2 == 0:
            # Case 1: c0 = 0, cm = 0
            t1 = k // 2
            ways1 = comb(m - t1, t1)
            ways1 = (ways1 * power(C, t1 + 1)) % MOD
            ways1 = (ways1 * power(C1, m - k)) % MOD
            path_ways = (path_ways + ways1) % MOD

            # Case 2: c0 = 1, cm = 1
            t2 = k // 2 - 1
            if t2 >= 0:
                ways2 = comb(m - t2 - 2, t2)
                ways2 = (ways2 * power(C, t2 + 1)) % MOD
                ways2 = (ways2 * power(C1, m - k)) % MOD
                path_ways = (path_ways + ways2) % MOD
        else:
            # Case 3: c0 = 1, cm = 0 or c0 = 0, cm = 1
            t3 = (k - 1) // 2
            ways3 = comb(m - t3 - 1, t3)
            ways3 = (ways3 * power(C, t3 + 1)) % MOD
            ways3 = (ways3 * power(C1, m - k)) % MOD
            path_ways = (path_ways + 2 * ways3) % MOD

        refl_sum = (m * path_ways) % MOD

    total_sum = (rot_sum + refl_sum) % MOD
    inv_2n = pow(2 * n % MOD, MOD - 2, MOD)
    ans = (total_sum * inv_2n) % MOD
    print(ans)

if __name__ == '__main__':
    solve()
