import sys
from math import atan2


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    x0 = int(data[1])
    y0 = int(data[2])
    vectors = []
    total_x = 0
    total_y = 0
    for i in range(n):
        x = int(data[3 + 2 * i])
        y = int(data[4 + 2 * i])
        total_x += x
        total_y += y
        if x != 0 or y != 0:
            vectors.append((x, y))
    m = len(vectors)
    if m == 0:
        print(0)
        return
    end_x = x0 + total_x
    end_y = y0 + total_y
    vectors.sort(key=lambda v: atan2(v[1], v[0]))
    ux = [v[0] for v in vectors] * 2
    uy = [v[1] for v in vectors] * 2
    size = 2 * m
    px = [0] * (size + 1)
    py = [0] * (size + 1)
    area = [0] * (size + 1)
    running = 0
    for i in range(size):
        area[i] = running + end_x * py[i] - end_y * px[i]
        running += px[i] * uy[i] - py[i] * ux[i]
        px[i + 1] = px[i] + ux[i]
        py[i + 1] = py[i] + uy[i]
    area[size] = running + end_x * py[size] - end_y * px[size]

    reach = [0] * m
    r = 1
    for l in range(m):
        if r < l + 1:
            r = l + 1
        lx = ux[l]
        ly = uy[l]
        limit = l + m
        while r < limit and lx * uy[r] - ly * ux[r] >= 0:
            r += 1
        reach[l] = r

    best = 0
    ptr = m - 1
    for l in range(m - 1, -1, -1):
        h = reach[l]
        pxl = px[l]
        pyl = py[l]
        al = area[l]
        if end_x * uy[l] - end_y * ux[l] <= 0:
            stop = l
        else:
            r = ptr if ptr < h else h
            if r < l + 1:
                r = l + 1
            while r < h and (end_x + px[r] - pxl) * uy[r] - (end_y + py[r] - pyl) * ux[r] > 0:
                r += 1
            stop = r
        ptr = stop
        value = area[stop] - al + px[stop] * pyl - py[stop] * pxl
        if value > best:
            best = value
        value = area[h] - al + px[h] * pyl - py[h] * pxl
        if value > best:
            best = value
    print(best)


main()
