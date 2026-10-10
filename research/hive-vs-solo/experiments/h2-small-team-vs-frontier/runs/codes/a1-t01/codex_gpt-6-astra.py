import sys

MOD = 998244353
INV2 = (MOD + 1) // 2


def main():
    data = sys.stdin.buffer.read().split()
    digits_n = [c - 48 for c in data[0]]
    length = len(digits_n)
    D = int(data[1])
    R = int(data[2])

    if length == 1:
        print(0)
        return

    rotations = [[(r + s) % D for r in range(D)] for s in range(D)]

    def frequencies(start, multiplier):
        result = [0] * D
        for digit in range(start, 10):
            result[(digit * multiplier) % D] += 1
        return result

    all_digits = frequencies(0, 1)
    nonzero_digits = frequencies(1, 1)
    all_pairs = frequencies(0, 2)
    nonzero_pairs = frequencies(1, 2)

    def convolve(a, b):
        result = [0] * D
        for shift, count in enumerate(b):
            if count:
                rotation = rotations[shift]
                for r, value in enumerate(a):
                    result[rotation[r]] += value * count
        return [value % MOD for value in result]

    # For unrestricted lengths, reversal pairs all non-palindromes.
    shorter = 0
    prefix = nonzero_digits
    for _ in range(2, length):
        total = convolve(prefix, nonzero_digits)
        shorter += total[R]
        prefix = convolve(prefix, all_digits)

    palindrome = nonzero_pairs
    for size in range(2, length, 2):
        shorter -= palindrome[R]
        if size + 1 < length:
            shorter -= convolve(palindrome, all_digits)[R]
        palindrome = convolve(palindrome, all_pairs)

    answer = shorter % MOD * INV2 % MOD

    # Bound states:
    # 0: left prefix is smaller than N's.
    # 1, 2, 3: left prefix is equal; right suffix is smaller/equal/larger.
    # Each bound state has reversal states equal (0) and greater (1).
    cache = {}

    def get_transitions(left_limit, right_limit, outer):
        key = (left_limit, right_limit, outer)
        if key in cache:
            return cache[key]

        transitions = []
        start = 1 if outer else 0

        for state in range(8):
            bound = state // 2
            greater = state & 1
            counts = [0] * (8 * D)

            for a in range(start, 10):
                if bound and a > left_limit:
                    continue

                for b in range(start, 10):
                    if not greater and b < a:
                        continue
                    new_greater = greater or b > a

                    if bound == 0 or a < left_limit:
                        new_bound = 0
                    elif b < right_limit:
                        new_bound = 1
                    elif b > right_limit:
                        new_bound = 3
                    else:
                        new_bound = bound

                    new_state = 2 * new_bound + int(new_greater)
                    counts[new_state * D + (a + b) % D] += 1

            entries = []
            for index, count in enumerate(counts):
                if count:
                    destination, shift = divmod(index, D)
                    entries.append((destination, rotations[shift], count))
            transitions.append(entries)

        cache[key] = transitions
        return transitions

    dp = [[0] * D for _ in range(8)]
    dp[4][0] = 1

    for position in range(length // 2):
        transitions = get_transitions(
            digits_n[position], digits_n[-1 - position], position == 0
        )
        next_dp = [[0] * D for _ in range(8)]

        for state, row in enumerate(dp):
            if not any(row):
                continue
            for destination, rotation, count in transitions[state]:
                target = next_dp[destination]
                for residue, value in enumerate(row):
                    target[rotation[residue]] += value * count

        dp = [[value % MOD for value in row] for row in next_dp]

    if length % 2 == 0:
        answer += dp[1][R] + dp[3][R] + dp[5][R]
    else:
        middle = digits_n[length // 2]
        for bound in range(4):
            if bound == 0:
                limit = 9
            elif bound == 3:
                limit = middle - 1
            else:
                limit = middle

            row = dp[2 * bound + 1]
            for digit in range(limit + 1):
                answer += row[(R - digit) % D]

    print(answer % MOD)


if __name__ == "__main__":
    main()
