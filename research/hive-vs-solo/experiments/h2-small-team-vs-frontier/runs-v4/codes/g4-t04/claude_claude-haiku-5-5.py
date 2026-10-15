import sys
from functools import cmp_to_key


def half(v):
    x, y = v
    return 0 if y > 0 or (y == 0 and x > 0) else 1


def compare_angle(a, b):
    ha, hb = half(a), half(b)
    if ha != hb:
        return ha - hb
    c = a[0] * b[1] - a[1] * b[0]
    return -1 if c > 0 else (1 if c < 0 else 0)


def cross(p, q):
    return p[0] * q[1] - p[1] * q[0]


def best_score(p0, vectors):
    n = len(vectors)
    tx = sum(v[0] for v in vectors)
    ty = sum(v[1] for v in vectors)
    y_vec = (p0[0] + tx, p0[1] + ty)
    pref = [(0, 0)]
    for v in vectors + vectors:
        px, py = pref[-1]
        pref.append((px + v[0], py + v[1]))
    C = [0] * (2 * n + 1)
    for t in range(2 * n):
        C[t + 1] = C[t] + cross(pref[t], pref[t + 1])
    best = 0
    for a in range(n):
        pa = pref[a]
        rel = (y_vec[0] - pa[0], y_vec[1] - pa[1])
        for b in range(a, a + n + 1):
            pb = pref[b]
            val = C[b] - C[a] + cross(rel, (pb[0] - pa[0], pb[1] - pa[1]))
            if val > best:
                best = val
    return best


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    p0 = (int(data[1]), int(data[2]))
    vectors = [(int(data[3 + 2 * i]), int(data[4 + 2 * i])) for i in range(n)]
    vectors.sort(key=cmp_to_key(compare_angle))
    print(best_score(p0, vectors))


main()
