import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    q = int(data[1])
    h = [0] * (n + 1)
    for i in range(n):
        h[i + 1] = int(data[2 + i])

    order = sorted(range(1, n + 1), key=lambda i: (h[i], -i))

    prev = [0] + list(range(0, n + 1))
    nxt = list(range(1, n + 3))
    second_screen = [0] * (n + 1)
    for i in order:
        a = prev[i]
        second_screen[i] = prev[a]
        b = nxt[i]
        nxt[a] = b
        prev[b] = a

    bits_width = max(1, n.bit_length())
    columns = list(zip(*[format(second_screen[i], "0%db" % bits_width) for i in range(1, n + 1)]))
    slices = []
    for b in range(bits_width):
        column = columns[bits_width - 1 - b]
        slices.append((b, int("".join(column), 2)))

    queries = []
    base = 2 + n
    needed = [False] * (n + 2)
    for k in range(q):
        l = int(data[base + 3 * k])
        r = int(data[base + 3 * k + 1])
        x = int(data[base + 3 * k + 2])
        queries.append((x, l, r, k))
        needed[l] = True

    by_second = [[] for _ in range(n + 1)]
    for i in range(1, n + 1):
        if second_screen[i] > 0:
            by_second[second_screen[i]].append(i)

    prefix_sets = [0] * (n + 2)
    current = 0
    for l in range(n, 0, -1):
        group = by_second[l]
        if group:
            acc = 0
            for i in group:
                acc |= 1 << (n - i)
            current |= acc
        if needed[l]:
            prefix_sets[l] = current

    queries.sort(key=lambda t: -t[0])
    descending = order[::-1]

    tree = [0] * (n + 1)
    unit = 1 << 32
    low_mask = unit - 1
    active = 0
    pointer = 0
    answers = [0] * q

    for x, l, r, k in queries:
        while pointer < n and h[descending[pointer]] > x:
            i = descending[pointer]
            pointer += 1
            active |= 1 << (n - i)
            value = unit + i
            j = i
            while j <= n:
                tree[j] += value
                j += j & -j

        total = 0
        j = r
        while j > 0:
            total += tree[j]
            j -= j & -j
        j = l - 1
        while j > 0:
            total -= tree[j]
            j -= j & -j
        count_all = total >> 32
        sum_positions = total & low_mask

        shift = n - r
        masked = ((active & prefix_sets[l]) >> shift) << shift
        count_far = 0
        sum_far = 0
        if masked:
            count_far = masked.bit_count()
            for b, slice_bits in slices:
                sum_far += (masked & slice_bits).bit_count() << b

        answers[k] = sum_positions - (sum_far + (l - 1) * (count_all - count_far))

    sys.stdout.write("\n".join(map(str, answers)) + "\n")


main()
