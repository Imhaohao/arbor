import sys

# Increase recursion depth just in case
sys.setrecursionlimit(200000)


def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    iterator = iter(input_data)
    n = int(next(iterator))
    q = int(next(iterator))
    S = next(iterator)

    v = [0] * (n + 1)
    for i in range(1, n + 1):
        v[i] = int(next(iterator))

    queries = []
    for i in range(q):
        L = int(next(iterator))
        R = int(next(iterator))
        queries.append((L, R, i))

    # Rolling hash for O(log n) LCP queries
    P = (1 << 61) - 1
    B = 313

    pw = [1] * (n + 1)
    for i in range(1, n + 1):
        pw[i] = (pw[i - 1] * B) % P

    def get_hashes(s):
        h = [0] * (n + 1)
        for i in range(n):
            h[i + 1] = (h[i] * B + ord(s[i])) % P
        return h

    H_fwd = get_hashes(S)
    H_rev = get_hashes(S[::-1])

    def make_lcp_func(h):
        def lcp(x, y):
            low = 0
            high = n - (x if x > y else y)
            while low < high:
                mid = (low + high + 1) >> 1
                h1 = (h[x + mid] - h[x] * pw[mid]) % P
                h2 = (h[y + mid] - h[y] * pw[mid]) % P
                if h1 == h2:
                    low = mid
                else:
                    high = mid - 1
            return low

        return lcp

    lcp_fwd = make_lcp_func(H_fwd)
    lcp_rev = make_lcp_func(H_rev)

    def compute_R_max(s, lcp):
        r_max = [0] * n
        next_ge = [[n] * (n + 1) for _ in range(26)]
        for c in range(26):
            nxt = n
            for j in range(n - 1, -1, -1):
                if ord(s[j]) - 97 >= c:
                    nxt = j
                next_ge[c][j] = nxt

        for k in range(n):
            c = ord(s[k]) - 97
            t = 1
            j = k + 1
            while j < n:
                if j - t == k and ord(s[j]) - 97 < c:
                    j = next_ge[c][j]
                    t = j - k
                    if j >= n:
                        break
                l = lcp(j - t, j)
                j += l
                if j >= n:
                    break
                if s[j] < s[j - t]:
                    j += 1
                    t = j - k
                else:
                    break
            r_max[k] = j - 1
        return r_max

    r_max_0 = compute_R_max(S, lcp_fwd)
    r_max_rev_0 = compute_R_max(S[::-1], lcp_rev)

    R_max = [0] * (n + 1)
    L_min = [0] * (n + 1)

    for k in range(n):
        R_max[k + 1] = r_max_0[k] + 1
        k_rev = n - 1 - k
        L_min[k + 1] = n - 1 - r_max_rev_0[k_rev] + 1

    # Segment Tree with Historic Maximum
    # Coordinates of l are in [1, n]
    M = 1
    while M <= n + 2:
        M <<= 1

    H_tree = M.bit_length() - 1
    INF = 10**18

    max_v = [-INF] * (2 * M)
    hist_m = [-INF] * (2 * M)
    lazy_add = [0] * (2 * M)
    lazy_hist = [0] * (2 * M)

    def apply(u, a, b):
        if max_v[u] != -INF:
            new_hist = max_v[u] + b
            if new_hist > hist_m[u]:
                hist_m[u] = new_hist
            max_v[u] += a
        new_hadd = lazy_add[u] + b
        if new_hadd > lazy_hist[u]:
            lazy_hist[u] = new_hadd
        lazy_add[u] += a

    def push(u):
        a = lazy_add[u]
        b = lazy_hist[u]
        if a != 0 or b != 0:
            c1 = 2 * u
            if max_v[c1] != -INF:
                nh1 = max_v[c1] + b
                if nh1 > hist_m[c1]:
                    hist_m[c1] = nh1
                max_v[c1] += a
            nhadd1 = lazy_add[c1] + b
            if nhadd1 > lazy_hist[c1]:
                lazy_hist[c1] = nhadd1
            lazy_add[c1] += a

            c2 = c1 + 1
            if max_v[c2] != -INF:
                nh2 = max_v[c2] + b
                if nh2 > hist_m[c2]:
                    hist_m[c2] = nh2
                max_v[c2] += a
            nhadd2 = lazy_add[c2] + b
            if nhadd2 > lazy_hist[c2]:
                lazy_hist[c2] = nhadd2
            lazy_add[c2] += a

            lazy_add[u] = 0
            lazy_hist[u] = 0

    def push_to(x):
        for s in range(H_tree, 0, -1):
            p = x >> s
            push(p)

    def pull_from(x):
        p = x >> 1
        while p > 0:
            l = 2 * p
            r = l + 1
            max_v[p] = max_v[l] if max_v[l] > max_v[r] else max_v[r]
            hist_m[p] = hist_m[l] if hist_m[l] > hist_m[r] else hist_m[r]
            p >>= 1

    def activate(idx):
        leaf = idx + M
        push_to(leaf)
        max_v[leaf] = 0
        hist_m[leaf] = -INF
        lazy_add[leaf] = 0
        lazy_hist[leaf] = 0
        pull_from(leaf)

    def range_add(L_idx, R_idx, val):
        if L_idx > R_idx:
            return
        l = L_idx + M
        r = R_idx + M
        push_to(l)
        push_to(r)
        l0, r0 = l, r
        b = val if val > 0 else 0
        while l <= r:
            if l & 1:
                apply(l, val, b)
                l += 1
            if not (r & 1):
                apply(r, val, b)
                r -= 1
            l >>= 1
            r >>= 1
        pull_from(l0)
        pull_from(r0)

    def range_query(L_idx, R_idx):
        l = L_idx + M
        r = R_idx + M
        push_to(l)
        push_to(r)
        ans = -INF
        while l <= r:
            if l & 1:
                if hist_m[l] > ans:
                    ans = hist_m[l]
                l += 1
            if not (r & 1):
                if hist_m[r] > ans:
                    ans = hist_m[r]
                r -= 1
            l >>= 1
            r >>= 1
        return ans

    # Group expirations and queries by r
    expires = [[] for _ in range(n + 1)]
    for k in range(1, n + 1):
        expires[R_max[k]].append(k)

    queries_by_R = [[] for _ in range(n + 1)]
    for L, R, q_idx in queries:
        queries_by_R[R].append((L, q_idx))

    answers = [0] * q

    # Sweep r from 1 to n
    for r in range(1, n + 1):
        # 1. Activate position r
        activate(r)

        # 2. Add rectangle r
        range_add(L_min[r], r, v[r])

        # 3. Answer queries ending at r
        for L, q_idx in queries_by_R[r]:
            answers[q_idx] = range_query(L, r)

        # 4. Expire rectangles ending at r
        for k in expires[r]:
            range_add(L_min[k], k, -v[k])

    sys.stdout.write("\n".join(str(ans) for ans in answers) + "\n")


if __name__ == "__main__":
    solve()
