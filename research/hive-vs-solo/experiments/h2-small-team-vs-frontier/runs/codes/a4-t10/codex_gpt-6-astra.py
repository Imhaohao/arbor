import sys

MOD = 998244353


def main():
    n, m = map(int, sys.stdin.buffer.read().split())

    if n == 1:
        print(m)
        return
    if n > m:
        print(0)
        return

    half = m // 2
    tau = [2] * (m + 1)
    mu = [-1] * (m + 1)
    exponent = bytearray(m + 1)
    primes = []

    tau[0] = 0
    tau[1] = 1
    mu[0] = 0
    mu[1] = 1

    # Every composite <= m is generated from a number <= m // 2.
    # Primes already have the correct default tau and mu values.
    for i in range(2, half + 1):
        e = exponent[i]
        if e == 0:
            primes.append(i)
            exponent[i] = 1
            e = 1

        ti = tau[i]
        mui = mu[i]

        for p in primes:
            j = i * p
            if j > m:
                break
            if i % p == 0:
                exponent[j] = e + 1
                tau[j] = ti // (e + 1) * (e + 2)
                mu[j] = 0
                break

            exponent[j] = 1
            tau[j] = ti * 2
            mu[j] = -mui

    max_tau = max(tau)
    if n > max_tau:
        print(0)
        return

    # Turn mu into Mertens prefix sums where they will be needed.
    running = 0
    for i in range(1, half + 1):
        running += mu[i]
        mu[i] = running

    # Möbius inversion:
    # answer = sum_d falling_factorial(tau[d], n) * M(m // d).
    weights = [0] * (max_tau + 1)
    left = 2
    while left <= m:
        quotient = m // left
        right = m // quotient
        weight = mu[quotient]
        if weight:
            for d in range(left, right + 1):
                weights[tau[d]] += weight
        left = right + 1

    factorial = [1] * (max_tau + 1)
    for i in range(2, max_tau + 1):
        factorial[i] = factorial[i - 1] * i % MOD

    inverse_factorial = [1] * (max_tau + 1)
    inverse_factorial[max_tau] = pow(factorial[max_tau], MOD - 2, MOD)
    for i in range(max_tau, 0, -1):
        inverse_factorial[i - 1] = inverse_factorial[i] * i % MOD

    answer = 0
    for k in range(n, max_tau + 1):
        answer += weights[k] * factorial[k] * inverse_factorial[k - n]

    print(answer % MOD)


if __name__ == "__main__":
    main()
