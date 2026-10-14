import sys

def build_tree(points):
    pts = sorted(set(points))
    size = len(pts)
    index_of = {v: i for i, v in enumerate(pts)}
    return pts, size, index_of, [None] * (4 * size), [0] * (4 * size)

def add_line(tree, k, b):
    pts, size, _, LK, LB = tree
    node, lo, hi = 1, 0, size - 1
    while True:
        if LK[node] is None:
            LK[node] = k
            LB[node] = b
            return
        mid = (lo + hi) >> 1
        xm = pts[mid]
        ck = LK[node]
        cb = LB[node]
        if k * xm + b < ck * xm + cb:
            LK[node], k = k, ck
            LB[node], b = b, cb
            ck = LK[node]
            cb = LB[node]
        if lo == hi:
            return
        xl = pts[lo]
        if k * xl + b < ck * xl + cb:
            node = 2 * node
            hi = mid
            continue
        xh = pts[hi]
        if k * xh + b < ck * xh + cb:
            node = 2 * node + 1
            lo = mid + 1
            continue
        return

def query(tree, value):
    pts, size, index_of, LK, LB = tree
    idx = index_of[value]
    node, lo, hi = 1, 0, size - 1
    best = None
    while True:
        k = LK[node]
        if k is None:
            return best
        v = k * value + LB[node]
        if best is None or v < best:
            best = v
        if lo == hi:
            return best
        mid = (lo + hi) >> 1
        if idx <= mid:
            node = 2 * node
            hi = mid
        else:
            node = 2 * node + 1
            lo = mid + 1

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    xs = [0] * n
    A = [0] * n
    B = [0] * n
    C = [0] * n
    for i in range(n):
        x = int(data[1 + 4 * i])
        p = int(data[2 + 4 * i])
        q = int(data[3 + 4 * i])
        c = int(data[4 + 4 * i])
        xs[i] = x
        A[i] = p + q
        B[i] = p - q
        C[i] = c
    relay_queries = [4 * xs[i] + A[i] for i in range(n)]
    start_tree = build_tree(relay_queries)
    relay_tree = build_tree(xs)
    dp_last = 0
    for i in range(n):
        x = xs[i]
        if i == 0:
            dp = 0
        else:
            dp = 2 * x * x + query(relay_tree, x)
        dp_last = dp
        add_line(start_tree, -x, dp + 2 * x * x)
        t = relay_queries[i]
        g = query(start_tree, t) + 2 * x * x + A[i] * x + C[i]
        add_line(relay_tree, B[i] - 4 * x, g + 2 * x * x - B[i] * x)
    print(dp_last)

main()
