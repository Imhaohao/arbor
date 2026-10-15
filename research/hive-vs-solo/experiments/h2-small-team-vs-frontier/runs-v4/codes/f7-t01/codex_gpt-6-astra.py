import sys
from bisect import bisect_left


def main():
    data = sys.stdin.buffer
    n, q = map(int, data.readline().split())
    s = data.readline().strip()

    answers = [0] * q
    queries = []
    for qi in range(q):
        l, r, b = map(int, data.readline().split())
        if r - l + 1 >= 4 * b:
            queries.append((l - 1, r - 1, b, r - 1 - b, qi))

    if not queries:
        sys.stdout.write("\n".join(map(str, answers)))
        return

    min_b = min(x[2] for x in queries)
    min_l = min(x[0] for x in queries)
    max_z = max(x[3] for x in queries)

    # Suffix array.
    ranks = list(s)
    base = max(n + 1, 128)
    step = 1
    while True:
        keys = [
            ranks[i] * base + (ranks[i + step] + 1 if i + step < n else 0)
            for i in range(n)
        ]
        sa = sorted(range(n), key=keys.__getitem__)
        new_ranks = [0] * n
        previous = -1
        classes = -1
        for pos in sa:
            key = keys[pos]
            if key != previous:
                classes += 1
                previous = key
            new_ranks[pos] = classes
        ranks = new_ranks
        if classes == n - 1:
            break
        step <<= 1

    # LCP edges, processed from longest common prefix to shortest.
    edges = []
    common = 0
    minimum_depth = 2 * min_b
    for pos in range(n):
        rank = ranks[pos]
        if rank == 0:
            common = 0
            continue
        other = sa[rank - 1]
        while pos + common < n and other + common < n:
            if s[pos + common] != s[other + common]:
                break
            common += 1
        if common >= minimum_depth:
            edges.append(common * n + rank)
        if common:
            common -= 1
    edges.sort(reverse=True)

    parent = list(range(n))
    positions = [[pos] for pos in sa]
    upper = [0] * n
    coefficients = {}

    def close_triple(a, middle, last, depth):
        top = upper[a]
        if top <= depth:
            return
        span = last - a
        if top > span:
            top = span
        if top <= depth:
            return
        gap = middle - a
        other_gap = last - middle
        if other_gap > gap:
            gap = other_gap
        value = top - gap
        if value < min_b or a < min_l:
            return
        coordinate = last + gap - 2
        if coordinate >= max_z:
            return

        key = (a, value, coordinate)
        coefficients[key] = coefficients.get(key, 0) + 1

        value = depth - gap
        if value >= min_b:
            key = (a, value, coordinate)
            coefficients[key] = coefficients.get(key, 0) - 1

    for edge in edges:
        depth, index = divmod(edge, n)
        left = index - 1
        right = index
        while parent[left] != left:
            parent[left] = parent[parent[left]]
            left = parent[left]
        while parent[right] != right:
            parent[right] = parent[parent[right]]
            right = parent[right]
        if left == right:
            continue

        if len(positions[left]) < len(positions[right]):
            left, right = right, left

        large = positions[left]
        small = positions[right]

        for j in range(len(small) - 2):
            close_triple(small[j], small[j + 1], small[j + 2], depth)

        for pos in small:
            index = bisect_left(large, pos)
            length = len(large)

            if index >= 2 and index < length:
                close_triple(
                    large[index - 2], large[index - 1], large[index], depth
                )
            if index >= 1 and index + 1 < length:
                close_triple(
                    large[index - 1], large[index], large[index + 1], depth
                )

            large.insert(index, pos)

            if index >= 2:
                upper[large[index - 2]] = depth
            if index >= 1 and index < length:
                upper[large[index - 1]] = depth
            if index + 1 < length:
                upper[pos] = depth

        parent[right] = left
        positions[right] = None

    for group in positions:
        if group is not None:
            for j in range(len(group) - 2):
                close_triple(group[j], group[j + 1], group[j + 2], 0)

    events = [
        (a, value, coordinate, weight)
        for (a, value, coordinate), weight in coefficients.items()
        if weight
    ]
    del coefficients, positions, parent, upper, edges, ranks, sa, keys

    if not events:
        sys.stdout.write("\n".join(map(str, answers)))
        return

    events.sort(reverse=True)
    queries.sort(reverse=True)
    b_values = sorted({query[2] for query in queries})

    SHIFT = 40
    BASE = 1 << SHIFT
    HALF = BASE >> 1

    def brute(points, requests):
        for l, r, b, z, qi in requests:
            total = 0
            for p, v, c, weight in points:
                if p < l:
                    break
                if v >= b and c < z:
                    amount = z - c
                    cap = v - b + 1
                    if amount > cap:
                        amount = cap
                    total += weight * amount
            answers[qi] += total

    def sweep(points, requests, fixed_b=None):
        if not points or not requests:
            return

        ep = len(points)
        eq = len(requests)
        if ep * eq <= 32 * (ep + eq):
            brute(points, requests)
            return

        limit_r = max(request[1] for request in requests)

        if fixed_b is not None:
            bit = [0] * (limit_r + 1)
            at = 0

            for l, r, b, z, qi in requests:
                while at < ep and points[at][0] >= l:
                    p, v, c, weight = points[at]
                    at += 1

                    start = c + fixed_b
                    finish = c + v + 1
                    i = start + 1
                    j = finish + 1
                    add_start = weight * (BASE - start)
                    add_finish = -weight * (BASE - finish)

                    # The two Fenwick update paths eventually coincide.
                    while i != j and (i <= limit_r or j <= limit_r):
                        if i < j:
                            bit[i] += add_start
                            i += i & -i
                        else:
                            bit[j] += add_finish
                            j += j & -j

                    if i == j:
                        add_common = weight * (finish - start)
                        while i <= limit_r:
                            bit[i] += add_common
                            i += i & -i

                packed = 0
                i = r
                while i:
                    packed += bit[i]
                    i &= i - 1

                count = (packed + HALF) >> SHIFT
                answers[qi] += packed - count * (BASE - r)
            return

        limit_z = max(request[3] for request in requests)
        first = [0] * (limit_z + 1)
        second = [0] * (limit_r + 1)
        at = 0

        for l, r, b, z, qi in requests:
            while at < ep and points[at][0] >= l:
                p, v, c, weight = points[at]
                at += 1

                i = c + 1
                delta = weight * (BASE - c)
                while i <= limit_z:
                    first[i] += delta
                    i += i & -i

                endpoint = c + v + 1
                i = endpoint + 1
                delta = -weight * (BASE - endpoint)
                while i <= limit_r:
                    second[i] += delta
                    i += i & -i

            packed_first = 0
            i = z
            while i:
                packed_first += first[i]
                i &= i - 1

            packed = packed_first
            i = r
            while i:
                packed += second[i]
                i &= i - 1

            count_first = (packed_first + HALF) >> SHIFT
            count_total = (packed + HALF) >> SHIFT
            answers[qi] += (
                packed - count_total * (BASE - r) - count_first * b
            )

    def solve(points, requests, lo, hi):
        if not points or not requests:
            return

        ep = len(points)
        eq = len(requests)
        if ep * eq <= 32 * (ep + eq):
            brute(points, requests)
            return

        if lo == hi:
            sweep(points, requests, b_values[lo])
            return

        highest_b = b_values[hi]
        all_qualify = True
        for point in points:
            if point[1] < highest_b:
                all_qualify = False
                break
        if all_qualify:
            sweep(points, requests)
            return

        mid = (lo + hi + 1) >> 1
        pivot = b_values[mid]

        low_points = []
        high_points = []
        for point in points:
            if point[1] < pivot:
                low_points.append(point)
            else:
                high_points.append(point)

        low_requests = []
        high_requests = []
        for request in requests:
            if request[2] < pivot:
                low_requests.append(request)
            else:
                high_requests.append(request)

        fixed = b_values[lo] if mid == lo + 1 else None
        sweep(high_points, low_requests, fixed)
        solve(low_points, low_requests, lo, mid - 1)
        solve(high_points, high_requests, mid, hi)

    solve(events, queries, 0, len(b_values) - 1)
    sys.stdout.write("\n".join(map(str, answers)))


if __name__ == "__main__":
    main()
