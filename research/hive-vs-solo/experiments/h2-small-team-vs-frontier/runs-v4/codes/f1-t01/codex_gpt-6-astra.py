import sys

MOD = 998244353


def main():
    data = list(map(int, sys.stdin.buffer.read().split()))
    n = data[0]
    a = data[1:n + 1]

    values = sorted(set(a))
    m = len(values)
    rank = {v: i + 1 for i, v in enumerate(values)}

    widths = [0] * m
    previous = 0
    for i, v in enumerate(values):
        widths[i] = v - previous
        previous = v

    q = [0] * m
    r = [0] * m
    dp = 1
    high = 0
    mod = MOD

    for bound in a:
        limit = rank[bound]
        coefficient = bound - 2
        cluster_sum = 0

        for j in range(limit):
            old_r = r[j]
            cluster_sum += old_r

            new_r = q[j] - old_r
            if new_r < 0:
                new_r += mod

            q[j] = (coefficient * old_r - dp * widths[j]) % mod
            r[j] = new_r

        for j in range(limit, high):
            old_r = r[j]
            q[j] = bound * old_r % mod if old_r else 0
            r[j] = 0

        if limit > high:
            high = limit

        dp = (bound * dp + cluster_sum) % mod

    print(dp)


if __name__ == "__main__":
    main()
