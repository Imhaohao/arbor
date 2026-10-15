import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    q = int(data[1])
    s = data[2]
    initial = data[3]

    # Suffix array.
    sa = list(range(n))
    if n > 1:
        rank = list(s)
        gap = 1
        base = max(rank) + 2
        while True:
            keys = [
                (rank[i] + 1) * base
                + (rank[i + gap] + 1 if i + gap < n else 0)
                for i in range(n)
            ]
            sa.sort(key=keys.__getitem__)
            new_rank = [0] * n
            classes = 0
            previous = keys[sa[0]]
            for j in range(1, n):
                i = sa[j]
                key = keys[i]
                if key != previous:
                    classes += 1
                    previous = key
                new_rank[i] = classes
            rank = new_rank
            if classes == n - 1:
                break
            gap <<= 1
            base = classes + 2

    inverse = [0] * n
    for i, p in enumerate(sa):
        inverse[p] = i

    # LCP of consecutive suffixes.
    lcp = [0] * (n - 1)
    h = 0
    for p in range(n):
        r = inverse[p]
        if r == n - 1:
            h = 0
            continue
        other = sa[r + 1]
        while p + h < n and other + h < n and s[p + h] == s[other + h]:
            h += 1
        lcp[r] = h
        if h:
            h -= 1

    shift = n.bit_length()
    index_mask = (1 << shift) - 1

    # RMQ returns the leftmost minimum LCP, hence its Cartesian-tree node.
    sparse = []
    if n > 1:
        sparse.append([(v << shift) | i for i, v in enumerate(lcp)])
        span = 2
        while span <= n - 1:
            previous = sparse[-1]
            half = span >> 1
            sparse.append([
                min(previous[i], previous[i + half])
                for i in range(n - span)
            ])
            span <<= 1

    def lca(a, b):
        if a == b:
            return a
        k = (b - a).bit_length() - 1
        row = sparse[k]
        x = row[a]
        y = row[b - (1 << k)]
        return n + ((x if x < y else y) & index_mask)

    # Binary suffix tree; zero-length edges are harmless.
    total = 2 * n - 1
    left = [-1] * total
    right = [-1] * total
    parent = [-1] * total
    depth = [n - p for p in sa] + lcp

    if n == 1:
        root = 0
    else:
        cart_left = [-1] * (n - 1)
        cart_right = [-1] * (n - 1)
        stack = []
        for i in range(n - 1):
            last = -1
            while stack and lcp[stack[-1]] > lcp[i]:
                last = stack.pop()
            if stack:
                cart_right[stack[-1]] = i
            if last != -1:
                cart_left[i] = last
            stack.append(i)

        root = n + stack[0]
        for i in range(n - 1):
            v = n + i
            a = n + cart_left[i] if cart_left[i] != -1 else i
            b = n + cart_right[i] if cart_right[i] != -1 else i + 1
            left[v] = a
            right[v] = b
            parent[a] = v
            parent[b] = v

    marks = [initial[p] - 48 for p in sa]

    # Bitsets support nearest active position and nearest different mark.
    raw_bits = [bytearray((n + 7) >> 3) for _ in range(5)]
    for i, c in enumerate(marks):
        if c:
            raw_bits[c][i >> 3] |= 1 << (i & 7)
    bits = [int.from_bytes(b, "little") for b in raw_bits]
    active = bits[1] | bits[2] | bits[3] | bits[4]

    # Each contribution changes all ancestors of its associated node.
    value = [0] * total
    run_colors = []
    run_starts = []
    run_ends = []
    previous_position = -1
    previous_color = 0

    for i, c in enumerate(marks):
        if not c:
            continue
        value[i] += 1
        if c == previous_color:
            value[lca(previous_position, i)] -= 1
            run_ends[-1] = i
        else:
            run_colors.append(c)
            run_starts.append(i)
            run_ends.append(i)
        previous_position = i
        previous_color = c

    for i in range(len(run_colors) - 2):
        if run_colors[i] == run_colors[i + 2]:
            value[lca(run_ends[i], run_starts[i + 2])] += 2

    order = []
    stack = [root]
    while stack:
        v = stack.pop()
        order.append(v)
        if left[v] != -1:
            stack.append(left[v])
            stack.append(right[v])

    size = [1] * total
    heavy = [-1] * total
    for v in reversed(order):
        a = left[v]
        if a != -1:
            b = right[v]
            size[v] += size[a] + size[b]
            heavy[v] = a if size[a] >= size[b] else b
        p = parent[v]
        if p != -1:
            value[p] += value[v]

    head = [0] * total
    position = [0] * total
    linear = [0] * total
    stack = [(root, root)]
    timer = 0
    while stack:
        v, chain_head = stack.pop()
        while v != -1:
            head[v] = chain_head
            position[v] = timer
            linear[timer] = v
            timer += 1
            a = left[v]
            if a != -1:
                light = right[v] if heavy[v] == a else a
                stack.append((light, light))
            v = heavy[v]

    tree = [(0, 0, 0, 0, 0)] * (4 * total)
    lazy = [0] * (4 * total)

    def build(t, lo, hi):
        if hi - lo == 1:
            v = linear[lo]
            p = parent[v]
            weight = depth[v] - (depth[p] if p != -1 else 0)
            counts = [0] * 5
            counts[value[v] % 5] = weight
            tree[t] = tuple(counts)
            return
        mid = (lo + hi) >> 1
        build(t << 1, lo, mid)
        build(t << 1 | 1, mid, hi)
        a = tree[t << 1]
        b = tree[t << 1 | 1]
        tree[t] = (
            a[0] + b[0], a[1] + b[1], a[2] + b[2],
            a[3] + b[3], a[4] + b[4]
        )

    build(1, 0, total)

    def update(t, lo, hi, qlo, qhi, delta):
        if qlo <= lo and hi <= qhi:
            a = tree[t]
            tree[t] = a[-delta:] + a[:-delta]
            lazy[t] = (lazy[t] + delta) % 5
            return

        lc = t << 1
        rc = lc | 1
        pending = lazy[t]
        if pending:
            a = tree[lc]
            tree[lc] = a[-pending:] + a[:-pending]
            a = tree[rc]
            tree[rc] = a[-pending:] + a[:-pending]
            lazy[lc] = (lazy[lc] + pending) % 5
            lazy[rc] = (lazy[rc] + pending) % 5
            lazy[t] = 0

        mid = (lo + hi) >> 1
        if qlo < mid:
            update(lc, lo, mid, qlo, qhi, delta)
        if qhi > mid:
            update(rc, mid, hi, qlo, qhi, delta)

        a = tree[lc]
        b = tree[rc]
        tree[t] = (
            a[0] + b[0], a[1] + b[1], a[2] + b[2],
            a[3] + b[3], a[4] + b[4]
        )

    def collect_events(sequence, sign, events):
        colors = []
        starts = []
        ends = []
        last_position = -1
        last_color = 0

        for p, c in sequence:
            if c == last_color:
                key = (last_position << shift) | p
                events[key] = events.get(key, 0) - sign
                ends[-1] = p
            else:
                colors.append(c)
                starts.append(p)
                ends.append(p)
            last_position = p
            last_color = c

        for j in range(len(colors) - 2):
            if colors[j] == colors[j + 2]:
                key = (ends[j] << shift) | starts[j + 2]
                events[key] = events.get(key, 0) + 2 * sign

    output = []
    token = 4
    for _ in range(q):
        p = inverse[int(data[token]) - 1]
        c = int(data[token + 1])
        token += 2
        old = marks[p]

        if old == c:
            output.append(str(tree[1][1]))
            continue

        bit = 1 << p
        before = active & (bit - 1)
        after = active >> (p + 1)

        left_context = []
        if before:
            a = before.bit_length() - 1
            ca = marks[a]
            different = before & ~bits[ca]
            if different:
                b = different.bit_length() - 1
                left_context.append((b, marks[b]))
            left_context.append((a, ca))

        right_context = []
        if after:
            a = p + (after & -after).bit_length()
            ca = marks[a]
            right_context.append((a, ca))
            different = (active ^ bits[ca]) >> (p + 1)
            if different:
                b = p + (different & -different).bit_length()
                right_context.append((b, marks[b]))

        events = {}
        old_sequence = left_context + ([(p, old)] if old else []) + right_context
        new_sequence = left_context + ([(p, c)] if c else []) + right_context
        collect_events(old_sequence, -1, events)
        collect_events(new_sequence, 1, events)

        node_changes = {}
        if bool(old) != bool(c):
            node_changes[p] = 1 if c else -1

        for key, delta in events.items():
            if delta:
                a = key >> shift
                b = key & index_mask
                v = lca(a, b)
                node_changes[v] = node_changes.get(v, 0) + delta

        if old:
            bits[old] ^= bit
        if c:
            bits[c] |= bit
        if not old:
            active |= bit
        elif not c:
            active ^= bit
        marks[p] = c

        # Combine overlapping heavy-chain updates before touching the tree.
        endpoints = {}
        for v, delta in node_changes.items():
            delta %= 5
            if not delta:
                continue
            while v != -1:
                chain_head = head[v]
                a = position[chain_head]
                b = position[v] + 1
                endpoints[a] = endpoints.get(a, 0) + delta
                endpoints[b] = endpoints.get(b, 0) - delta
                v = parent[chain_head]

        changes = sorted(
            (p, delta % 5)
            for p, delta in endpoints.items()
            if delta % 5
        )
        running = 0
        previous = 0
        for boundary, delta in changes:
            if running and previous < boundary:
                update(1, 0, total, previous, boundary, running)
            running = (running + delta) % 5
            previous = boundary

        output.append(str(tree[1][1]))

    sys.stdout.write("\n".join(output))


if __name__ == "__main__":
    main()
