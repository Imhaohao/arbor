import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    xs = [0] * n
    params = [None] * n
    pos = 1
    for i in range(n):
        x = int(data[pos])
        p = int(data[pos + 1])
        q = int(data[pos + 2])
        c = int(data[pos + 3])
        pos += 4
        xs[i] = x
        params[i] = (x, p, q, c)

    size = 4 * n + 4
    line_slope = [0] * size
    line_icpt = [0] * size
    line_set = [False] * size

    def tree_insert(slope, icpt):
        node, lo, hi = 1, 0, n - 1
        while True:
            if not line_set[node]:
                line_set[node] = True
                line_slope[node] = slope
                line_icpt[node] = icpt
                return
            mid = (lo + hi) // 2
            xm = xs[mid]
            if slope * xm + icpt < line_slope[node] * xm + line_icpt[node]:
                line_slope[node], slope = slope, line_slope[node]
                line_icpt[node], icpt = icpt, line_icpt[node]
            if lo == hi:
                return
            xl = xs[lo]
            if slope * xl + icpt < line_slope[node] * xl + line_icpt[node]:
                node, hi = 2 * node, mid
                continue
            xh = xs[hi]
            if slope * xh + icpt < line_slope[node] * xh + line_icpt[node]:
                node, lo = 2 * node + 1, mid + 1
                continue
            return

    def tree_query(i):
        x = xs[i]
        node, lo, hi = 1, 0, n - 1
        best = None
        while True:
            if line_set[node]:
                v = line_slope[node] * x + line_icpt[node]
                if best is None or v < best:
                    best = v
            if lo == hi:
                return best
            mid = (lo + hi) // 2
            if i <= mid:
                node, hi = 2 * node, mid
            else:
                node, lo = 2 * node + 1, mid + 1

    hull_x = []
    hull_y = []

    def hull_add(x, y):
        while len(hull_x) >= 2:
            ox, oy = hull_x[-2], hull_y[-2]
            ax, ay = hull_x[-1], hull_y[-1]
            if (ax - ox) * (y - oy) - (ay - oy) * (x - ox) > 0:
                break
            hull_x.pop()
            hull_y.pop()
        hull_x.append(x)
        hull_y.append(y)

    def hull_min(a):
        lo, hi = 0, len(hull_x) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            if hull_y[mid + 1] + a * hull_x[mid + 1] >= hull_y[mid] + a * hull_x[mid]:
                hi = mid
            else:
                lo = mid + 1
        return hull_y[lo] + a * hull_x[lo]

    dp = 0
    for i in range(n):
        x, p, q, c = params[i]
        if i == 0:
            dp = 0
        else:
            dp = 2 * x * x + tree_query(i)
        hull_add(x, dp + 2 * x * x)
        g = 4 * x * x + 2 * q * x + c
        a = -4 * x - p - q
        b = -4 * x + p - q
        tree_insert(b, g + hull_min(a))

    print(dp)


main()
