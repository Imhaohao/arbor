import sys


def main():
    data = sys.stdin.buffer.read().split()
    it = map(int, data)
    n = next(it)
    V = next(it)
    q = next(it)

    c = [0] * (V + 1)
    for i in range(1, V + 1):
        c[i] = next(it)

    pos = [[] for _ in range(V + 1)]
    for i in range(1, n + 1):
        pos[next(it)].append(i)

    # A type v is satisfied on [l, r] iff some window of c_v consecutive
    # occurrences lies entirely inside [l, r]. Those windows are segments
    # [L, R]. Then v fails iff every such segment has Rmin > r, where Rmin
    # is the smallest R among segments with L >= l.
    segs = [[] for _ in range(n + 1)]
    for v in range(1, V + 1):
        p = pos[v]
        cv = c[v]
        m = len(p) - cv + 1
        if m <= 0:
            continue
        for i in range(m):
            segs[p[i]].append((p[i + cv - 1], v))

    qs = [[] for _ in range(n + 1)]
    for qi in range(q):
        l = next(it)
        r = next(it)
        qs[l].append((r, qi))

    # Rmin[v] over v = 1..V+1. Sentinel V+1 stays at INF and always fails.
    N = V + 1
    size = 1
    while size < N:
        size <<= 1
    INF = n + 1
    tree = [INF] * (size << 1)

    ans = [0] * q
    for l in range(n, 0, -1):
        for R, v in segs[l]:
            i = size + v - 1
            if tree[i] <= R:
                continue
            tree[i] = R
            i >>= 1
            while i:
                left = tree[i << 1]
                right = tree[(i << 1) | 1]
                tree[i] = left if left > right else right
                i >>= 1
        for r, qi in qs[l]:
            # Leftmost v whose Rmin is strictly greater than r.
            i = 1
            while i < size:
                if tree[i << 1] > r:
                    i <<= 1
                else:
                    i = (i << 1) | 1
            ans[qi] = i - size + 1

    sys.stdout.write("\n".join(map(str, ans)))
    sys.stdout.write("\n")


main()
