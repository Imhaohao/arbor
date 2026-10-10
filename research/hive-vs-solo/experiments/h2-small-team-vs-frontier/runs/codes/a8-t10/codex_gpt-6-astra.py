import sys


def distance(n, m):
    if n == m:
        return 0

    # Coefficients for the two Stern-sequence values.
    p, q = 1, 0
    r, s = 1, 0

    # Coefficients for intersections at offsets (0,0), (0,1),
    # (1,0), and (1,1) from the current pair of indices.
    a, b, c, d = 1, 0, 0, 0

    while n or m:
        if n & 1:
            q += p
            if m & 1:
                s += r
                d += a + b + c
                b = c = 0
            else:
                r += s
                a, b, c, d = b, 0, a + c, b + d
        else:
            p += q
            if m & 1:
                s += r
                a, b, c, d = c, a + b, 0, c + d
            else:
                r += s
                a += d

        n >>= 1
        m >>= 1

    return q + s - (d << 1)


def main():
    data = list(map(int, sys.stdin.buffer.read().split()))
    answers = [
        str(distance(data[i], data[i + 1]))
        for i in range(1, 2 * data[0] + 1, 2)
    ]
    sys.stdout.write("\n".join(answers))


if __name__ == "__main__":
    main()
