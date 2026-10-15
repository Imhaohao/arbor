import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    q = int(data[1])
    text = data[2]

    queries = [[] for _ in range(n + 1)]
    pos = 3
    for i in range(q):
        left = int(data[pos]) - 1
        right = int(data[pos + 1])
        queries[right].append((left, i))
        pos += 2
    del data

    # Build a suffix automaton, remembering the state of each prefix.
    transitions = [{}]
    length = [0]
    link = [-1]
    prefix_states = []
    last = 0

    for ch in text:
        cur = len(length)
        length.append(length[last] + 1)
        link.append(0)
        transitions.append({})

        p = last
        while p >= 0 and ch not in transitions[p]:
            transitions[p][ch] = cur
            p = link[p]

        if p >= 0:
            target = transitions[p][ch]
            if length[p] + 1 == length[target]:
                link[cur] = target
            else:
                clone = len(length)
                length.append(length[p] + 1)
                link.append(link[target])
                transitions.append(transitions[target].copy())

                while p >= 0 and transitions[p].get(ch) == target:
                    transitions[p][ch] = clone
                    p = link[p]

                link[target] = clone
                link[cur] = clone

        last = cur
        prefix_states.append(cur)

    del transitions, text

    # Heavy paths in the suffix-link tree.
    count = len(length)
    order = sorted(range(1, count), key=length.__getitem__)
    size = [1] * count
    heavy = [-1] * count

    for v in reversed(order):
        p = link[v]
        size[p] += size[v]
        old = heavy[p]
        if old == -1 or size[v] > size[old]:
            heavy[p] = v

    head = [0] * count
    for v in order:
        p = link[v]
        head[v] = head[p] if heavy[p] == v else v

    del order, size, heavy

    # Each stack records constant last-occurrence segments on a heavy path.
    stacks = [None] * count
    chain_low = [1] * count
    for v in range(1, count):
        if head[v] == v:
            chain_low[v] = length[link[v]] + 1

    # Difference-array segment tree:
    # sums stores interval sums, best stores maximum nonempty prefix sums.
    base = 1 << n.bit_length()
    sums = [0] * (base * 2)
    best = [0] * (base * 2)

    def add_interval(left, right, value,
                     sums=sums, best=best, base=base):
        a = base + left
        b = base + right + 1

        sums[a] += value
        best[a] = sums[a]
        sums[b] -= value
        best[b] = sums[b]

        a >>= 1
        b >>= 1

        while a != b:
            sums[a] += value
            child = a << 1
            first = best[child]
            second = sums[child] + best[child + 1]
            best[a] = first if first >= second else second

            sums[b] -= value
            child = b << 1
            first = best[child]
            second = sums[child] + best[child + 1]
            best[b] = first if first >= second else second

            a >>= 1
            b >>= 1

        while a:
            child = a << 1
            first = best[child]
            second = sums[child] + best[child + 1]
            value_here = first if first >= second else second
            if best[a] == value_here:
                break
            best[a] = value_here
            a >>= 1

    answers = [""] * q

    for right, state in enumerate(prefix_states, 1):
        v = state
        while v > 0:
            h = head[v]
            high = length[v]
            low = chain_low[h]
            stack = stacks[h]

            if stack is None:
                stacks[h] = [(high, right)]
            else:
                while stack and stack[-1][0] <= high:
                    end_length, previous = stack.pop()
                    stride = right - previous
                    usable = end_length if end_length < stride else stride

                    if low <= usable:
                        add_interval(
                            previous - usable,
                            previous - low,
                            stride,
                        )
                    low = end_length + 1

                if stack and low <= high:
                    previous = stack[-1][1]
                    stride = right - previous
                    usable = high if high < stride else stride

                    if low <= usable:
                        add_interval(
                            previous - usable,
                            previous - low,
                            stride,
                        )

                stack.append((high, right))

            v = link[h]

        # Starts beyond 'right' still have score zero, so a suffix maximum
        # over the entire array equals the required maximum over [L, right].
        for left, query_id in queries[right]:
            node = base + left
            answer = best[node]

            while node > 1:
                if node & 1:
                    answer += sums[node - 1]
                else:
                    candidate = sums[node] + best[node + 1]
                    if candidate > answer:
                        answer = candidate
                node >>= 1

            answers[query_id] = str(answer)

    sys.stdout.write("\n".join(answers))


if __name__ == "__main__":
    main()
