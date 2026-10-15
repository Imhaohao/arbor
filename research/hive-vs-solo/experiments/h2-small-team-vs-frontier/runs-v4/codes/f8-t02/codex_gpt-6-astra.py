import sys
from math import gcd

MOD = 998244353
INV2 = 499122177


def main():
    data = list(map(int, sys.stdin.buffer.read().split()))
    n = data[0]
    values = data[1:]

    common = 0
    for x in values:
        common = gcd(common, x)
    if common > 1:
        values = [x // common for x in values]

    maximum = max(values)
    if maximum == 1:
        print((pow(3, n, MOD) - pow(2, n, MOD)) % MOD)
        return

    freq = [0] * (maximum + 1)
    for x in values:
        freq[x] += 1

    spf = list(range(maximum + 1))
    for p in range(2, int(maximum ** 0.5) + 1):
        if spf[p] == p:
            for x in range(p * p, maximum + 1, p):
                if spf[x] == x:
                    spf[x] = p

    omega = [0] * (maximum + 1)
    distinct = [0] * (maximum + 1)
    primes = []
    for x in range(2, maximum + 1):
        p = spf[x]
        q = x // p
        omega[x] = omega[q] + 1
        distinct[x] = distinct[q] + (q % p != 0)
        if p == x:
            primes.append(x)

    max_omega = maximum.bit_length() - 1

    power2 = [1] * (n + 1)
    power3 = [1] * (n + 1)
    inverse2 = [1] * (n + max_omega + 2)
    for i in range(1, n + 1):
        power2[i] = power2[i - 1] * 2 % MOD
        power3[i] = power3[i - 1] * 3 % MOD
    for i in range(1, len(inverse2)):
        inverse2[i] = inverse2[i - 1] * INV2 % MOD

    histograms = [None] * (maximum + 1)
    totals = [0] * (maximum + 1)
    for d in range(1, maximum + 1):
        base = omega[d]
        counts = [0] * ((maximum // d).bit_length())
        total = 0
        for x in range(d, maximum + 1, d):
            count = freq[x]
            if count:
                counts[omega[x] - base] += count
                total += count
        histograms[d] = counts
        totals[d] = total

    combinations = [[1]]
    for r in range(1, max(distinct) + 1):
        previous = combinations[-1]
        combinations.append(
            [1] + [previous[i - 1] + previous[i] for i in range(1, r)] + [1]
        )

    # B[h][t] aggregates the first gcd condition for Omega(g) = t.
    boards = [None] * (maximum + 1)
    for h in range(1, maximum + 1):
        degree = omega[h]
        r = distinct[h]
        row = [0] * (degree + 1)
        scale = power2[totals[h]]
        for removed, coefficient in enumerate(combinations[r]):
            value = scale * coefficient % MOD
            if removed & 1:
                value = -value % MOD
            row[degree - removed] = value
        boards[h] = row

    # Divisor zeta transform, one prime at a time.
    for p in primes:
        for h in range(p, maximum + 1, p):
            source = boards[h // p]
            target = boards[h]
            for t, value in enumerate(source):
                result = target[t] + value
                if result >= MOD:
                    result -= MOD
                target[t] = result

    packed_columns = []
    zero_markers = []
    cutoffs = []
    bit_indices = {}
    marker = 0
    for base in range(max_omega + 1):
        bit = 1 << (3 * base)
        marker |= bit
        bit_indices[bit] = base
        zero_markers.append(marker)
        cutoffs.append((1 << (3 * (base + 1))) - 1)

        columns = []
        for extra in range(max_omega - base + 1):
            w = base + extra
            code = 0
            for t in range(base + 1):
                code |= ((w - t) // 2) << (3 * t)
            columns.append(code)
        packed_columns.append(columns)

    answer = 0

    for d in range(1, maximum + 1):
        total = totals[d]
        if not total:
            continue

        base = omega[d]
        codes = packed_columns[base]
        columns = {}
        neutral = 0

        for extra, count in enumerate(histograms[d]):
            if count:
                code = codes[extra]
                if code:
                    columns[code] = columns.get(code, 0) + count
                else:
                    neutral += count

        distribution = {0: 1}
        for code, count in columns.items():
            even = power3[count] + 1
            odd = power3[count] - 1

            if code in distribution:
                old = distribution
                distribution = {
                    state: (weight * even + old[state ^ code] * odd) % MOD
                    for state, weight in old.items()
                }
            else:
                updated = {}
                for state, weight in distribution.items():
                    updated[state] = weight * even % MOD
                    updated[state ^ code] = weight * odd % MOD
                distribution = updated

        factor = (
            power3[neutral] * inverse2[total + len(columns)] % MOD
        )

        if d == 1:
            answer = (
                answer + power2[n] * distribution[0] % MOD * factor
            ) % MOD
            continue

        # The coefficient for a state losing at every shift is zero here.
        groups = {}
        marker = zero_markers[base]
        for state, weight in distribution.items():
            if state == 0:
                continue
            losing = ~(state | (state >> 1) | (state >> 2)) & marker
            if losing:
                groups[losing] = groups.get(losing, 0) + weight

        if not groups:
            continue

        squarefree_divisions = [(d, 1)]
        remaining = d
        while remaining > 1:
            p = spf[remaining]
            size = len(squarefree_divisions)
            for i in range(size):
                h, sign = squarefree_divisions[i]
                squarefree_divisions.append((h // p, -sign))
            while remaining % p == 0:
                remaining //= p

        contribution = 0
        for losing, weight in groups.items():
            coefficient = 0
            for h, sign in squarefree_divisions:
                u = omega[h]
                if losing & (1 << (3 * u)):
                    selected = losing & cutoffs[u]
                    row = boards[h]
                    subtotal = 0
                    while selected:
                        bit = selected & -selected
                        subtotal += row[bit_indices[bit]]
                        selected -= bit
                    coefficient += sign * subtotal

            contribution += (coefficient % MOD) * (weight % MOD)

        answer = (answer + contribution % MOD * factor) % MOD

    print((answer - power2[n]) % MOD)


if __name__ == "__main__":
    main()
