import sys
from functools import cmp_to_key

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    P = [(0, 0)]
    for k in range(n):
        P.append((int(data[1 + 2 * k]), int(data[2 + 2 * k])))
    F = []
    for k in range(1, n + 1):
        sx = P[k][0] + P[k - 1][0]
        sy = P[k][1] + P[k - 1][1]
        if k & 1:
            F.append((-sx, -sy))
        else:
            F.append((sx, sy))
    tx = sum(v[0] for v in F)
    ty = sum(v[1] for v in F)
    nonzero = [v for v in F if v[0] != 0 or v[1] != 0]

    # Area: sort CCW starting from direction u = -T
    if tx == 0 and ty == 0:
        ux, uy = 1, 0
    else:
        ux, uy = -tx, -ty

    def half_u(v):
        c = ux * v[1] - uy * v[0]
        if c > 0:
            return 0
        if c == 0 and ux * v[0] + uy * v[1] > 0:
            return 0
        return 1

    def cmp_u(a, b):
        ha = half_u(a)
        hb = half_u(b)
        if ha != hb:
            return ha - hb
        c = a[0] * b[1] - a[1] * b[0]
        if c > 0:
            return -1
        if c < 0:
            return 1
        return 0

    order = sorted(nonzero, key=cmp_to_key(cmp_u))
    A = 0
    sx = sy = 0
    for x, y in order:
        A += sx * y - sy * x
        sx += x
        sy += y

    # Reach: max norm of subset sum
    def half0(v):
        if v[1] > 0 or (v[1] == 0 and v[0] > 0):
            return 0
        return 1

    def cmp0(a, b):
        ha = half0(a)
        hb = half0(b)
        if ha != hb:
            return ha - hb
        c = a[0] * b[1] - a[1] * b[0]
        if c > 0:
            return -1
        if c < 0:
            return 1
        return 0

    srt = sorted(nonzero, key=cmp_to_key(cmp0))
    groups = []
    for v in srt:
        if groups:
            g = groups[-1]
            if g[0] * v[1] - g[1] * v[0] == 0 and g[0] * v[0] + g[1] * v[1] > 0:
                groups[-1] = (g[0] + v[0], g[1] + v[1])
                continue
        groups.append(v)
    m = len(groups)
    best = 0
    if m > 0:
        G2 = groups + groups
        px = [0] * (2 * m + 1)
        py = [0] * (2 * m + 1)
        for idx in range(2 * m):
            px[idx + 1] = px[idx] + G2[idx][0]
            py[idx + 1] = py[idx] + G2[idx][1]
        Wx = px[m]
        Wy = py[m]
        j = 0
        for i in range(m):
            gx, gy = groups[i]
            if j < i + 1:
                j = i + 1
            while j < i + m:
                hx, hy = G2[j]
                c = gx * hy - gy * hx
                if c > 0 or (c == 0 and gx * hx + gy * hy < 0):
                    j += 1
                else:
                    break
            Xx = px[j] - px[i + 1]
            Xy = py[j] - py[i + 1]
            val = Xx * Xx + Xy * Xy
            if val > best:
                best = val
            Yx = Wx - Xx
            Yy = Wy - Xy
            val = Yx * Yx + Yy * Yy
            if val > best:
                best = val
    sys.stdout.write(f"{A} {best}\n")

main()
