import sys
from functools import cmp_to_key


def half(v):
    return 0 if (v[1] > 0 or (v[1] == 0 and v[0] > 0)) else 1


def compare_angle(a, b):
    ha, hb = half(a), half(b)
    if ha != hb:
        return ha - hb
    c = a[0] * b[1] - a[1] * b[0]
    return -1 if c > 0 else (1 if c < 0 else 0)


def max_chain_area(vectors, total):
    running_x = running_y = 0
    area = 0
    for x, y in vectors:
        area += running_x * y - running_y * x
        running_x += x
        running_y += y
    best = area
    tx, ty = total
    for x, y in vectors:
        area -= 2 * (x * ty - y * tx)
        if area > best:
            best = area
    return best


def merge_same_direction(vectors):
    groups = []
    for x, y in vectors:
        if groups:
            gx, gy = groups[-1]
            if gx * y - gy * x == 0 and gx * x + gy * y > 0:
                groups[-1] = (gx + x, gy + y)
                continue
        groups.append((x, y))
    return groups


def best_window_norm(groups):
    m = len(groups)
    if m == 0:
        return 0
    doubled = groups + groups
    prefix_x = [0]
    prefix_y = [0]
    for x, y in doubled:
        prefix_x.append(prefix_x[-1] + x)
        prefix_y.append(prefix_y[-1] + y)
    best = 0
    end = 0
    for g in range(m):
        if end < g:
            end = g
        gx, gy = doubled[g]
        while end + 1 < g + m:
            nx, ny = doubled[end + 1]
            if gx * ny - gy * nx > 0:
                end += 1
            else:
                break
        sx = prefix_x[end + 1] - prefix_x[g]
        sy = prefix_y[end + 1] - prefix_y[g]
        ox = oy = 0
        if end + 1 < g + m:
            nx, ny = doubled[end + 1]
            if gx * ny - gy * nx == 0:
                ox, oy = nx, ny
        tx = prefix_x[end + 1] - prefix_x[g + 1] + ox
        ty = prefix_y[end + 1] - prefix_y[g + 1] + oy
        for cx, cy in ((sx, sy), (sx + ox, sy + oy), (tx, ty)):
            norm = cx * cx + cy * cy
            if norm > best:
                best = norm
    return best


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    px = [0] * (n + 1)
    py = [0] * (n + 1)
    for k in range(1, n + 1):
        px[k] = int(data[2 * k - 1])
        py[k] = int(data[2 * k])
    vectors = []
    for k in range(1, n + 1):
        sign = -1 if k % 2 else 1
        dx = sign * (px[k] + px[k - 1])
        dy = sign * (py[k] + py[k - 1])
        if dx or dy:
            vectors.append((dx, dy))
    if not vectors:
        print(0, 0)
        return
    vectors.sort(key=cmp_to_key(compare_angle))
    total = (sum(v[0] for v in vectors), sum(v[1] for v in vectors))
    area = max_chain_area(vectors, total)
    groups = merge_same_direction(vectors)
    mirrored = [(x, -y) for x, y in reversed(groups)]
    reach = max(best_window_norm(groups), best_window_norm(mirrored))
    print(area, reach)


main()
