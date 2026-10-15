import sys
from math import atan2


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    x0 = int(data[1])
    y0 = int(data[2])
    xs = list(map(int, data[3:3 + 2 * n:2]))
    ys = list(map(int, data[4:4 + 2 * n:2]))
    vecs = sorted(zip(xs, ys), key=lambda v: atan2(v[1], v[0]))
    Wx = [v[0] for v in vecs] * 2
    Wy = [v[1] for v in vecs] * 2
    m = 2 * n
    Px = [0] * (m + 1)
    Py = [0] * (m + 1)
    D = [0] * m
    C = [0] * (m + 1)
    for t in range(m):
        px = Px[t]
        py = Py[t]
        wx = Wx[t]
        wy = Wy[t]
        Px[t + 1] = px + wx
        Py[t + 1] = py + wy
        d = px * wy - py * wx
        D[t] = d
        C[t + 1] = C[t] + d
    Yx = x0 + Px[n]
    Yy = y0 + Py[n]

    def score(a, b):
        return (C[b] - C[a] + (Yx - Px[a]) * (Py[b] - Py[a])
                - (Yy - Py[a]) * (Px[b] - Px[a]))

    def boundary(L, R, x, ox, oy, want_start):
        if x > R - 1:
            x = R - 1
        if x < L:
            x = L
        if want_start:
            if D[x] - ox * Wy[x] + oy * Wx[x] > 0:
                while x > L and D[x - 1] - ox * Wy[x - 1] + oy * Wx[x - 1] > 0:
                    x -= 1
                if x > L:
                    return x
                while x < R and D[x] - ox * Wy[x] + oy * Wx[x] > 0:
                    x += 1
                while x < R and D[x] - ox * Wy[x] + oy * Wx[x] <= 0:
                    x += 1
                return x if x < R else -1
            while x < R and D[x] - ox * Wy[x] + oy * Wx[x] <= 0:
                x += 1
            if x < R:
                return x
            while x > L and D[x - 1] - ox * Wy[x - 1] + oy * Wx[x - 1] <= 0:
                x -= 1
            while x > L and D[x - 1] - ox * Wy[x - 1] + oy * Wx[x - 1] > 0:
                x -= 1
            return x if x > L else -1
        if D[x] - ox * Wy[x] + oy * Wx[x] > 0:
            while x < R and D[x] - ox * Wy[x] + oy * Wx[x] > 0:
                x += 1
            if x < R:
                return x
            while x > L and D[x - 1] - ox * Wy[x - 1] + oy * Wx[x - 1] > 0:
                x -= 1
            while x > L and D[x - 1] - ox * Wy[x - 1] + oy * Wx[x - 1] <= 0:
                x -= 1
            return x if x > L else -1
        while x > L and D[x - 1] - ox * Wy[x - 1] + oy * Wx[x - 1] <= 0:
            x -= 1
        if x > L:
            return x
        while x < R and D[x] - ox * Wy[x] + oy * Wx[x] <= 0:
            x += 1
        while x < R and D[x] - ox * Wy[x] + oy * Wx[x] > 0:
            x += 1
        return x if x < R else -1

    best = 0
    for a in range(n):
        v = score(a, a + n)
        if v > best:
            best = v

    xb = 0
    for b in range(n, m):
        ox = Px[b] - Yx
        oy = Py[b] - Yy
        r = boundary(b - n, b, xb, ox, oy, True)
        if r >= 0:
            xb = r
            v = score(r, b)
            if v > best:
                best = v

    xa = 0
    for a in range(n):
        ox = Px[a] - Yx
        oy = Py[a] - Yy
        r = boundary(a, a + n, xa, ox, oy, False)
        if r >= 0:
            xa = r
            v = score(a, r)
            if v > best:
                best = v

    print(best)


main()
