import sys
from math import atan2


def main():
    data = list(map(int, sys.stdin.buffer.read().split()))
    n, x0, y0 = data[0], data[1], data[2]

    vectors = []
    vx = vy = 0
    for i in range(3, 3 + 2 * n, 2):
        x, y = data[i], data[i + 1]
        vx += x
        vy += y
        if x or y:
            vectors.append((x, y))
    del data

    if not vectors:
        print(0)
        return

    tx, ty = x0 + vx, y0 + vy

    # Negative-cross vectors come first, in counterclockwise order.
    if tx or ty:
        vectors.sort(
            key=lambda v: atan2(
                tx * v[1] - ty * v[0],
                tx * v[0] + ty * v[1]
            )
        )
    else:
        vectors.sort(key=lambda v: atan2(v[1], v[0]))

    px = [0]
    py = [0]
    pq = [0]

    sx = sy = area = 0
    best_rotation = 0

    for x, y in vectors:
        area += sx * y - sy * x
        sx += x
        sy += y

        rotation = vx * sy - vy * sx
        if rotation > best_rotation:
            best_rotation = rotation

        if tx * y - ty * x < 0:
            px.append(sx)
            py.append(sy)
            pq.append(area)

    base = area + tx * vy - ty * vx
    answer = max(0, base + 2 * best_rotation)
    m = len(px) - 1

    if m == 0 or m == len(vectors):
        print(answer)
        return

    # An optimum with omitted vectors omits one interval [a, b)
    # of the negative-cross block. Its score is
    # base + left[a] + right[b] + prefix[a] x prefix[b].
    left = [0] * (m + 1)
    right = [0] * (m + 1)

    ax, ay = vx + tx, vy + ty
    bx, by = vx - tx, vy - ty

    for i in range(m + 1):
        x, y, q = px[i], py[i], pq[i]
        left[i] = q + ax * y - ay * x
        right[i] = -q + bx * y - by * x

    del pq, vectors

    # This triangular score matrix is Monge for maximization,
    # so its rightmost row maxima have nondecreasing columns.
    def solve(lo, hi, opt_lo, opt_hi):
        nonlocal answer
        if lo > hi:
            return

        mid = (lo + hi) // 2
        start = max(mid, opt_lo)
        x, y = px[mid], py[mid]

        best_j = start
        best_value = right[start] + x * py[start] - y * px[start]

        for j in range(start + 1, opt_hi + 1):
            value = right[j] + x * py[j] - y * px[j]
            if value >= best_value:
                best_value = value
                best_j = j

        score = base + left[mid] + best_value
        if score > answer:
            answer = score

        solve(lo, mid - 1, opt_lo, best_j)
        solve(mid + 1, hi, best_j, opt_hi)

    solve(0, m, 0, m)
    print(answer)


if __name__ == "__main__":
    main()
