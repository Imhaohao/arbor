import sys
from math import gcd

MOD = 998244353


def divisors_with_phi(value):
    factors = []
    p = 2
    while p * p <= value:
        if value % p == 0:
            exponent = 0
            while value % p == 0:
                value //= p
                exponent += 1
            factors.append((p, exponent))
        p = 3 if p == 2 else p + 2
    if value > 1:
        factors.append((value, 1))

    result = [(1, 1)]
    for p, exponent in factors:
        base = result[:]
        power = 1
        phi_power = 1
        for e in range(1, exponent + 1):
            power *= p
            phi_power = p - 1 if e == 1 else phi_power * p
            result.extend((d * power, phi * phi_power) for d, phi in base)
    return result


def main():
    n, c, k = map(int, sys.stdin.buffer.readline().split())

    if c == 1 or k > n // 2:
        print(0)
        return

    if c == 2:
        print(int(n % 2 == 0 and k == n // 2))
        return

    q = (c - 1) % MOD
    r = (c - 2) % MOD

    if k == 1:
        total = pow(r, n - 2, MOD)
        if n % 2 == 0:
            total += pow(r, n // 2 - 1, MOD)
        print(total * q % MOD * ((MOD + 1) // 2) % MOD)
        return

    divisors = divisors_with_phi(gcd(n, k))

    if k == 0:
        total = 0
        for repeats, phi in divisors:
            length = n // repeats
            fixed = pow(r, length, MOD)
            fixed += r if length % 2 == 0 else -r
            total = (total + phi * fixed) % MOD

        if n % 2 == 0:
            m = n // 2
            total = (total + m * q * pow(r, m, MOD)) % MOD

        print(total * pow(2 * n, MOD - 2, MOD) % MOD)
        return

    # Only factorials needed by the formulas are retained.
    needed = {0}
    rotations = []
    for repeats, phi in divisors:
        length = n // repeats
        special = k // repeats
        top = length - special - 1
        remaining = length - 2 * special
        rotations.append((length, special, remaining, top, phi))
        needed.update((top, special, remaining))

    reflection_combinations = []
    if n % 2 == 0:
        m = n // 2
        h = k // 2
        if k % 2:
            reflection_combinations.append((m - h - 1, h))
        else:
            reflection_combinations.append((m - h, h))
            reflection_combinations.append((m - h - 1, h - 1))

        for a, b in reflection_combinations:
            needed.update((a, b, a - b))

    factorial = {}
    current = 1
    previous = 0
    for index in sorted(needed):
        for i in range(previous + 1, index + 1):
            current = current * i % MOD
        factorial[index] = current
        previous = index

    total = 0
    for length, special, remaining, top, phi in rotations:
        denominator = factorial[special] * factorial[remaining] % MOD
        fixed = length * factorial[top] % MOD
        fixed = fixed * pow(denominator, MOD - 2, MOD) % MOD
        fixed = fixed * pow(q, special, MOD) % MOD
        fixed = fixed * pow(r, remaining, MOD) % MOD
        total = (total + phi * fixed) % MOD

    if n % 2 == 0:
        combinations = []
        for a, b in reflection_combinations:
            denominator = factorial[b] * factorial[a - b] % MOD
            combinations.append(
                factorial[a] * pow(denominator, MOD - 2, MOD) % MOD
            )

        if k % 2:
            fixed = 2 * combinations[0] * pow(q, h + 1, MOD) % MOD
        else:
            fixed = (combinations[0] * q + combinations[1]) % MOD
            fixed = fixed * pow(q, h, MOD) % MOD

        fixed = fixed * pow(r, m - k, MOD) % MOD
        total = (total + m * fixed) % MOD

    print(total * pow(2 * n, MOD - 2, MOD) % MOD)


if __name__ == "__main__":
    main()
