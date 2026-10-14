import sys
from math import atan2


def cross(ax, ay, bx, by):
    return ax * by - ay * bx


def max_area(edges):
    edges = sorted(edges, key=lambda e: atan2(e[1], e[0]))
    sx = sy = 0
    total = 0
    for ex, ey in edges:
        total += cross(sx, sy, ex, ey)
        sx += ex
        sy += ey
    return total


def max_reach(vectors):
    shift_x = shift_y = 0
    halves = []
    for vx, vy in vectors:
        if vy > 0 or (vy == 0 and vx > 0):
            halves.append((vx, vy))
        else:
            halves.append((-vx, -vy))
            shift_x += vx
            shift_y += vy
    halves.sort(key=lambda w: atan2(w[1], w[0]))
    total_x = sum(w[0] for w in halves)
    total_y = sum(w[1] for w in halves)
    best = 0
    px = py = 0
    for k in range(len(halves) + 1):
        if k:
            px += halves[k - 1][0]
            py += halves[k - 1][1]
        candidates = (
            (shift_x + px, shift_y + py),
            (shift_x + total_x - px, shift_y + total_y - py),
        )
        for qx, qy in candidates:
            best = max(best, qx * qx + qy * qy)
    return best


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    pts = [(0, 0)] + [(int(data[2 * k - 1]), int(data[2 * k])) for k in range(1, n + 1)]
    vectors = []
    for k in range(1, n + 1):
        sx = pts[k - 1][0] + pts[k][0]
        sy = pts[k - 1][1] + pts[k][1]
        if k % 2 == 0:
            sx, sy = -sx, -sy
        vectors.append((sx, sy))
    tx = sum(v[0] for v in vectors)
    ty = sum(v[1] for v in vectors)
    area = max_area(vectors + [(-tx, -ty)])
    reach = max_reach(vectors)
    print(area, reach)


main()
