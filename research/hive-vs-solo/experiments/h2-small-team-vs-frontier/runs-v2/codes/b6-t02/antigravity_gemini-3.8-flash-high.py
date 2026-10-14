import sys

# Increase recursion depth for CDQ divide and conquer
sys.setrecursionlimit(200000)


def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    it = iter(input_data)
    n = int(next(it))
    q = int(next(it))

    h = [int(next(it)) for _ in range(n)]

    # Queries: l, r, x
    queries_l = [0] * q
    queries_r = [0] * q
    queries_x = [0] * q
    for qid in range(q):
        queries_l[qid] = int(next(it))
        queries_r[qid] = int(next(it))
        queries_x[qid] = int(next(it))

    # Step 1: Compute p2[i] for all i in 1..n using a doubly linked list
    # p2[i] is the second index j < i with h[j] >= h[i]. If < 2 such indices, p2[i] = 0.
    prev = list(range(n + 2))
    nxt = list(range(n + 2))
    for i in range(n + 2):
        prev[i] = i - 1
        nxt[i] = i + 1
    prev[0] = 0
    nxt[n + 1] = n + 1

    by_height = {}
    for i in range(1, n + 1):
        by_height.setdefault(h[i - 1], []).append(i)

    p2 = [0] * (n + 1)
    sorted_heights = sorted(by_height.keys())

    for H in sorted_heights:
        indices = by_height[H]
        # Query predecessors for all elements of height H
        for i in indices:
            p1 = prev[i]
            p2[i] = prev[p1]
        # Delete elements of height H from the doubly linked list
        for i in indices:
            pr = prev[i]
            nx = nxt[i]
            nxt[pr] = nx
            prev[nx] = pr

    # Step 2: Compute Term 1 for all queries
    # Term 1: sum over i in [l, r] with h[i] > x of (i - l + 1)
    #       = sum(i) - (l - 1) * count(1)
    term1 = [0] * q

    # Events for Term 1 sweep-line:
    # Points: (h[i], 0, i) for i in 1..n
    # Queries: (x, 1, l, r, qid) for qid in 0..q-1
    events1 = []
    for i in range(1, n + 1):
        events1.append((h[i - 1], 0, i, 0, 0))
    for qid in range(q):
        events1.append((queries_x[qid], 1, queries_l[qid], queries_r[qid], qid))

    # Sort descending: points with h come before queries with x when h > x.
    # When h == x, query (type 1) comes before point (type 0) in descending order,
    # so point is not yet added, which correctly enforces h > x.
    events1.sort(key=lambda ev: (ev[0], ev[1]), reverse=True)

    bit1_i = [0] * (n + 1)
    bit1_cnt = [0] * (n + 1)

    for ev in events1:
        if ev[1] == 0:
            # Add point i
            idx = ev[2]
            val = idx
            while idx <= n:
                bit1_i[idx] += val
                bit1_cnt[idx] += 1
                idx += idx & -idx
        else:
            # Query range [l, r]
            l = ev[2]
            r = ev[3]
            qid = ev[4]

            s_r = 0
            c_r = 0
            idx = r
            while idx > 0:
                s_r += bit1_i[idx]
                c_r += bit1_cnt[idx]
                idx &= idx - 1

            s_l = 0
            c_l = 0
            idx = l - 1
            while idx > 0:
                s_l += bit1_i[idx]
                c_l += bit1_cnt[idx]
                idx &= idx - 1

            sum_i = s_r - s_l
            cnt = c_r - c_l
            term1[qid] = sum_i - (l - 1) * cnt

    # Step 3: Compute Term 2 using CDQ divide and conquer
    # Term 2: sum over i <= r, p2[i] >= l, h[i] > x of (p2[i] - l + 1)
    #       = sum(p2[i]) - (l - 1) * count(1)
    # Since p2[i] >= l >= 1, we only need points with p2[i] >= 1.
    # Condition p2[i] >= l is equivalent to (n - p2[i] + 1) <= (n - l + 1).
    initial_events2 = []
    for i in range(1, n + 1):
        if p2[i] >= 1:
            H = h[i - 1]
            X = i
            Y = n - p2[i] + 1
            W = p2[i]
            # Point tuple: key = (-H, 0), event = (X, 0, Y, W, 0)
            initial_events2.append(((-H, 0), (X, 0, Y, W, 0)))

    for qid in range(q):
        H = queries_x[qid] + 1
        X = queries_r[qid]
        Y = n - queries_l[qid] + 1
        # Query tuple: key = (-H, 1), event = (X, 1, Y, 0, qid)
        initial_events2.append(((-H, 1), (X, 1, Y, 0, qid)))

    # Sort initially by H descending (with points before queries on tie)
    initial_events2.sort(key=lambda item: item[0])
    events2 = [item[1] for item in initial_events2]

    term2_sum = [0] * q
    term2_cnt = [0] * q

    bit2_sum = [0] * (n + 1)
    bit2_cnt = [0] * (n + 1)

    def cdq(L, R):
        if L >= R:
            return
        mid = (L + R) // 2
        cdq(L, mid)
        cdq(mid + 1, R)

        p = L
        for k in range(mid + 1, R + 1):
            ev_k = events2[k]
            if ev_k[1] == 1:  # is_query
                X_k = ev_k[0]
                while p <= mid and events2[p][0] <= X_k:
                    if events2[p][1] == 0:  # is_point
                        Y = events2[p][2]
                        W = events2[p][3]
                        while Y <= n:
                            bit2_sum[Y] += W
                            bit2_cnt[Y] += 1
                            Y += Y & -Y
                    p += 1

                Y = ev_k[2]
                s = 0
                c = 0
                while Y > 0:
                    s += bit2_sum[Y]
                    c += bit2_cnt[Y]
                    Y &= Y - 1

                qid = ev_k[4]
                term2_sum[qid] += s
                term2_cnt[qid] += c

        # Rollback Fenwick tree
        for i in range(L, p):
            if events2[i][1] == 0:
                Y = events2[i][2]
                W = events2[i][3]
                while Y <= n:
                    bit2_sum[Y] -= W
                    bit2_cnt[Y] -= 1
                    Y += Y & -Y

        # Merge the two sorted halves by (X, is_query, ...)
        events2[L : R + 1] = sorted(events2[L : R + 1])

    if events2:
        cdq(0, len(events2) - 1)

    # Step 4: Combine Term 1 and Term 2 to produce final answers
    ans = [0] * q
    for qid in range(q):
        term2_val = term2_sum[qid] - (queries_l[qid] - 1) * term2_cnt[qid]
        ans[qid] = term1[qid] - term2_val

    sys.stdout.write("\n".join(map(str, ans)) + "\n")


if __name__ == "__main__":
    main()
