import sys


def build_suffix_array(codes):
    n = len(codes)
    rank = codes[:]
    width = max(n, 26) + 2
    step = 1
    while True:
        key = [rank[i] * width + (rank[i + step] + 1 if i + step < n else 0) for i in range(n)]
        sa = sorted(range(n), key=key.__getitem__)
        new_rank = [0] * n
        r = 0
        prev = key[sa[0]]
        for i in sa:
            cur = key[i]
            if cur != prev:
                r += 1
                prev = cur
            new_rank[i] = r
        rank = new_rank
        if r == n - 1:
            return sa, rank
        step <<= 1


def build_lcp(codes, sa, rank):
    n = len(codes)
    lcp = [0] * n
    h = 0
    for i in range(n):
        r = rank[i]
        if r == 0:
            h = 0
            continue
        j = sa[r - 1]
        while i + h < n and j + h < n and codes[i + h] == codes[j + h]:
            h += 1
        lcp[r] = h
        if h:
            h -= 1
    return lcp


def compute_dend(codes):
    n = len(codes)
    sa, rank = build_suffix_array(codes)
    lcp = build_lcp(codes, sa, rank)
    nxt_smaller = [n] * n
    stack = []
    for t in range(n - 1, 0, -1):
        while stack and lcp[stack[-1]] >= lcp[t]:
            stack.pop()
        nxt_smaller[t] = stack[-1] if stack else n
        stack.append(t)
    size = 1
    while size < n:
        size <<= 1
    INF = n + 10
    tree = [INF] * (2 * size)
    dend = [n] * n
    for k in range(n - 1, -1, -1):
        if k + 1 < n:
            idx = rank[k + 1] + size
            val = k + 1
            while idx and tree[idx] > val:
                tree[idx] = val
                idx >>= 1
        best = n
        t = rank[k] + 1
        while t < n:
            c = lcp[t]
            e = nxt_smaller[t]
            m = INF
            lo_i = t + size
            hi_i = e + size
            while lo_i < hi_i:
                if lo_i & 1:
                    if tree[lo_i] < m:
                        m = tree[lo_i]
                    lo_i += 1
                if hi_i & 1:
                    hi_i -= 1
                    if tree[hi_i] < m:
                        m = tree[hi_i]
                lo_i >>= 1
                hi_i >>= 1
            if m < INF and m + c < best:
                best = m + c
            t = e
        dend[k] = best
    return dend


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    q = int(data[1])
    S = data[2]
    v = [int(x) for x in data[3:3 + n]]
    codes = [c - 97 for c in S]
    base = 3 + n
    qs = [(int(data[base + 2 * i]) - 1, int(data[base + 2 * i + 1]) - 1) for i in range(q)]

    dend = compute_dend(codes)
    dend_rev = compute_dend(codes[::-1])
    lo = [n - dend_rev[n - 1 - k] for k in range(n)]

    removals = [[] for _ in range(n + 1)]
    for k in range(n):
        if dend[k] < n:
            removals[dend[k]].append(k)
    by_R = [[] for _ in range(n)]
    for idx, (L, R) in enumerate(qs):
        by_R[R].append((L, idx))

    BIG = 1 << 60
    NEG = -(1 << 62)
    HALF = -(1 << 61)
    sz = 4 * n
    mx = [-BIG] * sz
    hm = [-BIG] * sz
    la = [0] * sz
    lh = [NEG] * sz

    def apply(x, a, h):
        cand = mx[x] + h
        if cand > hm[x]:
            hm[x] = cand
        cand = la[x] + h
        if cand > lh[x]:
            lh[x] = cand
        mx[x] += a
        la[x] += a

    def push(x):
        a = la[x]
        h = lh[x]
        if a or h > HALF:
            apply(2 * x, a, h)
            apply(2 * x + 1, a, h)
            la[x] = 0
            lh[x] = NEG

    def update(x, nl, nr, l, r, a):
        if r < nl or nr < l:
            return
        if l <= nl and nr <= r:
            apply(x, a, NEG)
            return
        push(x)
        mid = (nl + nr) >> 1
        update(2 * x, nl, mid, l, r, a)
        update(2 * x + 1, mid + 1, nr, l, r, a)
        mx[x] = max(mx[2 * x], mx[2 * x + 1])
        hm[x] = max(hm[2 * x], hm[2 * x + 1])

    def query(x, nl, nr, l, r):
        if r < nl or nr < l:
            return NEG
        if l <= nl and nr <= r:
            return hm[x]
        push(x)
        mid = (nl + nr) >> 1
        a1 = query(2 * x, nl, mid, l, r)
        a2 = query(2 * x + 1, mid + 1, nr, l, r)
        return a1 if a1 > a2 else a2

    ans = [0] * q
    last = n - 1
    for r in range(n):
        for k in removals[r]:
            update(1, 0, last, lo[k], k, -v[k])
        update(1, 0, last, r, r, BIG)
        update(1, 0, last, lo[r], r, v[r])
        apply(1, 0, 0)
        for L, idx in by_R[r]:
            ans[idx] = query(1, 0, last, L, r)

    sys.stdout.write("\n".join(map(str, ans)) + "\n")


main()
