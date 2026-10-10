import sys

MOD = 998244353


def main():
    data = list(map(int, sys.stdin.buffer.read().split()))
    d = data[0]
    groups = [(data[i], data[i + 1]) for i in range(1, 2 * d + 1, 2)]

    total = sum(e * c for e, c in groups)
    largest = max(e for e, _ in groups)

    fact = [1] * (total + 2)
    for i in range(2, total + 2):
        fact[i] = fact[i - 1] * i % MOD

    invfact = [1] * (total + 2)
    invfact[total + 1] = pow(fact[total + 1], MOD - 2, MOD)
    for i in range(total + 1, 0, -1):
        invfact[i - 1] = invfact[i] * i % MOD

    normalization = 1
    for e, c in groups:
        normalization = normalization * pow(invfact[e], c, MOD) % MOD

    # For k labeled steps, allowing empty steps, the count is
    # A(k) = product(C(k, e) ** c).
    # Inclusion-exclusion over empty steps gives answer = sum(w[k] * A(k)),
    # where sum(w[k] * x**k) = sum((x - 1)**j for j in range(total + 1)).
    weight = 1
    answer = 0
    numerator = fact[total + 1]

    for k in range(total, largest - 1, -1):
        value = 1
        fk = fact[k]
        for e, c in groups:
            falling = fk * invfact[k - e] % MOD
            value = value * pow(falling, c, MOD) % MOD

        answer = (answer + weight * value) % MOD

        coefficient = numerator * invfact[k] % MOD
        coefficient = coefficient * invfact[total + 1 - k] % MOD
        if (total - k) & 1:
            weight = (2 * weight + coefficient) % MOD
        else:
            weight = (2 * weight - coefficient) % MOD

    print(answer * normalization % MOD)


if __name__ == "__main__":
    main()
