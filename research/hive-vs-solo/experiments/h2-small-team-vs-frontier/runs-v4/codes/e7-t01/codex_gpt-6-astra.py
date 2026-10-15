import sys


def main():
    data = list(map(int, sys.stdin.buffer.read().split()))
    n = data[0]
    a = data[1:n + 1]

    adj = [[] for _ in range(n)]
    for i in range(n + 1, len(data), 2):
        u = data[i] - 1
        v = data[i + 1] - 1
        adj[u].append(v)
        adj[v].append(u)
    del data

    parent = [-1] * n
    parent[0] = 0
    order = [0]
    for u in order:
        p = parent[u]
        for v in adj[u]:
            if v != p:
                parent[v] = u
                order.append(v)

    polarity = bytearray(n)
    low = [0] * n
    high = [0] * n

    # Initially, each message describes the component below its vertex.
    for u in reversed(order):
        p = parent[u]
        differences = []
        zero_low = zero_high = 0
        one_low = one_high = spread = 0

        for v in adj[u]:
            if v == p:
                continue
            l = low[v]
            h = high[v]
            if polarity[v] == 0:
                zero_low += l
                zero_high += h
                differences.append(l + h)
            else:
                one_low += l
                one_high += h
                spread += max(h, -l)

        k = len(differences)
        if k == 0:
            low[u] = a[u] + one_low
            high[u] = a[u] + one_high
        elif k == 1:
            polarity[u] = 1
            low[u] = -a[u] + zero_low - one_high
            high[u] = -a[u] + zero_high - one_low
        else:
            polarity[u] = 1
            differences.sort()
            half = k // 2
            small = sum(differences[:half])
            base = -a[u] if k & 1 else a[u]
            high[u] = base + zero_high - small + spread
            if k & 1:
                small += differences[half]
            low[u] = base - zero_high + small - spread

    answer = [0] * n

    # Before visiting u, its message has been replaced by parent -> u.
    # Its children's messages still describe child -> u.
    for u in order:
        p = parent[u]
        zeros = []
        ones = []
        zero_low = zero_high = 0
        one_low = one_high = spread = 0

        for v in adj[u]:
            idx = u if v == p else v
            l = low[idx]
            h = high[idx]
            if polarity[idx] == 0:
                zero_low += l
                zero_high += h
                zeros.append((l + h, v))
            else:
                one_low += l
                one_high += h
                spread += max(h, -l)
                ones.append(v)

        k = len(zeros)
        weight = a[u]

        if k == 0:
            root_low = weight + one_low
            root_high = weight + one_high
        elif k == 1:
            root_low = -weight + zero_low - one_high
            root_high = -weight + zero_high - one_low
        else:
            zeros.sort()
            prefix = [0]
            total = 0
            for difference, _ in zeros:
                total += difference
                prefix.append(total)

            base = -weight if k & 1 else weight
            root_low = (
                base - zero_high + prefix[(k + 1) // 2] - spread
            )
            root_high = (
                base + zero_high - prefix[k // 2] + spread
            )

        answer[u] = root_high

        # Excluding a polarity-one neighbor preserves the zero count.
        if k == 0:
            for v in ones:
                if v != p:
                    low[v] = root_low - low[v]
                    high[v] = root_high - high[v]
                    polarity[v] = 0
        elif k == 1:
            for v in ones:
                if v != p:
                    l = low[v]
                    h = high[v]
                    low[v] = root_low + h
                    high[v] = root_high + l
                    polarity[v] = 1
        else:
            for v in ones:
                if v != p:
                    contribution = max(high[v], -low[v])
                    low[v] = root_low + contribution
                    high[v] = root_high - contribution
                    polarity[v] = 1

        # Excluding a polarity-zero neighbor decreases the zero count.
        if k == 1:
            v = zeros[0][1]
            if v != p:
                low[v] = weight + one_low
                high[v] = weight + one_high
                polarity[v] = 0
        elif k == 2:
            for _, v in zeros:
                if v != p:
                    l = low[v]
                    h = high[v]
                    low[v] = -weight + zero_low - l - one_high
                    high[v] = -weight + zero_high - h - one_low
                    polarity[v] = 1
        elif k >= 3:
            floor_half = (k - 1) // 2
            ceil_half = k // 2
            outgoing_base = -base

            for rank, (difference, v) in enumerate(zeros):
                if v == p:
                    continue

                small_floor = prefix[floor_half]
                if rank < floor_half:
                    small_floor = prefix[floor_half + 1] - difference

                small_ceil = prefix[ceil_half]
                if rank < ceil_half:
                    small_ceil = prefix[ceil_half + 1] - difference

                remaining_high = zero_high - high[v]
                low[v] = (
                    outgoing_base - remaining_high + small_ceil - spread
                )
                high[v] = (
                    outgoing_base + remaining_high - small_floor + spread
                )
                polarity[v] = 1

    sys.stdout.write(" ".join(map(str, answer)))


if __name__ == "__main__":
    main()
