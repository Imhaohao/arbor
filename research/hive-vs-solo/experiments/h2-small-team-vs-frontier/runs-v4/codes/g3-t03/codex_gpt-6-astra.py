import sys


def right_limits(s):
    n = len(s)
    if n == 1:
        return [0]

    rank = list(s)
    sa = list(range(n))
    step = 1
    classes = max(rank) + 1

    while True:
        base = classes + 1
        padded = rank + [-1] * step
        keys = [
            rank[i] * base + padded[i + step] + 1
            for i in range(n)
        ]
        sa.sort(key=keys.__getitem__)

        new_rank = [0] * n
        cls = 0
        previous = keys[sa[0]]
        for p in range(1, n):
            i = sa[p]
            key = keys[i]
            if key != previous:
                cls += 1
                previous = key
            new_rank[i] = cls

        rank = new_rank
        classes = cls + 1
        if classes == n:
            break
        step <<= 1

    # lcp[p] = LCP(sa[p - 1], sa[p]).
    lcp = [0] * n
    length = 0
    for i in range(n):
        p = rank[i]
        if p == 0:
            length = 0
            continue
        j = sa[p - 1]
        while i + length < n and j + length < n:
            if s[i + length] != s[j + length]:
                break
            length += 1
        lcp[p] = length
        if length:
            length -= 1

    sparse = [lcp]
    half = 1
    while (half << 1) <= n:
        previous = sparse[-1]
        size = n - (half << 1) + 1
        row = [0] * size
        for i in range(size):
            a = previous[i]
            b = previous[i + half]
            row[i] = a if a < b else b
        sparse.append(row)
        half <<= 1

    result = [n - 1] * n
    stack = []

    # The nearest greater suffix gives the earliest possible
    # endpoint at which forward dominance fails.
    for i in range(n - 1, -1, -1):
        ri = rank[i]
        while stack and rank[stack[-1]] < ri:
            stack.pop()

        if stack:
            j = stack[-1]
            rj = rank[j]
            power = (rj - ri).bit_length() - 1
            row = sparse[power]
            a = row[ri + 1]
            b = row[rj - (1 << power) + 1]
            common = a if a < b else b
            result[i] = j + common - 1

        stack.append(i)

    return result


def main():
    data = sys.stdin.buffer
    n, q = map(int, data.readline().split())
    s = data.readline().strip()
    weights = list(map(int, data.readline().split()))

    right = right_limits(s)
    reverse_right = right_limits(s[::-1])
    left = [n - 1 - reverse_right[n - 1 - i] for i in range(n)]
    del reverse_right

    queries = [[] for _ in range(n)]
    for index in range(q):
        l, r = map(int, data.readline().split())
        queries[r - 1].append((l - 1, index))

    # Position i contributes on the rectangle
    # left[i] <= l <= i <= r <= right[i].
    expires = [[] for _ in range(n)]
    for i in range(n):
        if right[i] + 1 < n and weights[i]:
            expires[right[i] + 1].append(i)
    del right

    neg_inf = -(10 ** 30)
    size = 4 * n + 8
    current = [neg_inf] * size
    historical = [neg_inf] * size
    lazy_add = [0] * size
    lazy_peak = [0] * size

    def push(node):
        addition = lazy_add[node]
        peak = lazy_peak[node]
        if addition == 0 and peak == 0:
            return

        child = node << 1
        candidate = current[child] + peak
        if candidate > historical[child]:
            historical[child] = candidate
        candidate = lazy_add[child] + peak
        if candidate > lazy_peak[child]:
            lazy_peak[child] = candidate
        current[child] += addition
        lazy_add[child] += addition

        child += 1
        candidate = current[child] + peak
        if candidate > historical[child]:
            historical[child] = candidate
        candidate = lazy_add[child] + peak
        if candidate > lazy_peak[child]:
            lazy_peak[child] = candidate
        current[child] += addition
        lazy_add[child] += addition

        lazy_add[node] = 0
        lazy_peak[node] = 0

    def add(node, lo, hi, ql, qr, value):
        if ql <= lo and hi <= qr:
            updated = current[node] + value
            current[node] = updated
            if updated > historical[node]:
                historical[node] = updated
            accumulated = lazy_add[node] + value
            lazy_add[node] = accumulated
            if accumulated > lazy_peak[node]:
                lazy_peak[node] = accumulated
            return

        push(node)
        mid = (lo + hi) >> 1
        child = node << 1
        if ql <= mid:
            add(child, lo, mid, ql, qr, value)
        if qr > mid:
            add(child + 1, mid + 1, hi, ql, qr, value)

        a = current[child]
        b = current[child + 1]
        current[node] = a if a > b else b
        a = historical[child]
        b = historical[child + 1]
        historical[node] = a if a > b else b

    def insert(node, lo, hi, ql, position, value):
        # Add to [ql, position - 1], and activate position with value.
        if ql <= lo and hi < position:
            updated = current[node] + value
            current[node] = updated
            if updated > historical[node]:
                historical[node] = updated
            accumulated = lazy_add[node] + value
            lazy_add[node] = accumulated
            if accumulated > lazy_peak[node]:
                lazy_peak[node] = accumulated
            return

        if lo == hi:
            current[node] = value
            historical[node] = value
            lazy_add[node] = 0
            lazy_peak[node] = 0
            return

        push(node)
        mid = (lo + hi) >> 1
        child = node << 1
        if ql <= mid:
            insert(child, lo, mid, ql, position, value)
        if position > mid:
            insert(child + 1, mid + 1, hi, ql, position, value)

        a = current[child]
        b = current[child + 1]
        current[node] = a if a > b else b
        a = historical[child]
        b = historical[child + 1]
        historical[node] = a if a > b else b

    def suffix_max(start):
        node = 1
        lo = 0
        hi = n - 1
        inherited_peak = 0
        answer = neg_inf

        while lo < hi:
            if start <= lo:
                candidate = historical[node]
                if candidate > answer:
                    answer = candidate
                candidate = current[node] + inherited_peak
                if candidate > answer:
                    answer = candidate
                return answer

            candidate = lazy_add[node] + inherited_peak
            peak = lazy_peak[node]
            inherited_peak = candidate if candidate > peak else peak

            mid = (lo + hi) >> 1
            child = node << 1
            if start <= mid:
                other = child + 1
                candidate = historical[other]
                if candidate > answer:
                    answer = candidate
                candidate = current[other] + inherited_peak
                if candidate > answer:
                    answer = candidate
                node = child
                hi = mid
            else:
                node = child + 1
                lo = mid + 1

        candidate = historical[node]
        if candidate > answer:
            answer = candidate
        candidate = current[node] + inherited_peak
        if candidate > answer:
            answer = candidate
        return answer

    answers = [0] * q
    end = n - 1

    for r in range(n):
        events = expires[r]

        # Negative changes precede positive changes, so intermediate
        # states cannot introduce an invalid historical maximum.
        for i in events:
            value = weights[i]
            if value > 0:
                add(1, 0, end, left[i], i, -value)

        value = weights[r]
        if value < 0:
            insert(1, 0, end, left[r], r, value)

        for i in events:
            old_value = weights[i]
            if old_value < 0:
                add(1, 0, end, left[i], i, -old_value)

        if value >= 0:
            insert(1, 0, end, left[r], r, value)

        for l, index in queries[r]:
            answers[index] = suffix_max(l)

    sys.stdout.write("\n".join(map(str, answers)))


if __name__ == "__main__":
    main()
