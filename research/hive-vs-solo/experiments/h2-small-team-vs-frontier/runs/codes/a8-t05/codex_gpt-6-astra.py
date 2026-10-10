import sys


def main():
    data = sys.stdin.buffer
    W, H, n = map(int, data.readline().split())

    # Boundary coordinates have denominators at most 10^6.
    # Scaling by 2^40 and flooring preserves their exact order and equality.
    SCALE_BITS = 40
    right_offset = W << SCALE_BITS
    top_offset = (W + H) << SCALE_BITS
    left_offset = (2 * W + H) << SCALE_BITS

    END = 1 << 18
    ID_MASK = END - 1
    EVENT_BITS = 19

    events = []
    append_event = events.append
    m = 0

    for _ in range(n):
        a, b, c = map(int, data.readline().split())
        if a < 0:
            a, b, c = -a, -b, -c

        aw = a * W
        bh = b * H

        minimum = bh if bh < 0 else 0
        maximum = aw + (bh if bh > 0 else 0)

        # Discard lines that do not intersect the open rectangle.
        if not minimum < c < maximum:
            continue

        points = []

        # Each side includes its first corner and excludes its last corner
        # when traversing the boundary counterclockwise.
        if 0 <= c < aw:
            points.append((c << SCALE_BITS) // a)

        if b > 0:
            d = c - aw
            if 0 <= d < bh:
                points.append(right_offset + (d << SCALE_BITS) // b)
        elif b < 0:
            d = aw - c
            if 0 <= d < -bh:
                points.append(right_offset + (d << SCALE_BITS) // (-b))

        d = aw + bh - c
        if 0 <= d < aw:
            points.append(top_offset + (d << SCALE_BITS) // a)

        if b > 0:
            d = bh - c
            if 0 <= d < bh:
                points.append(left_offset + (d << SCALE_BITS) // b)
        elif b < 0:
            d = c - bh
            if 0 <= d < -bh:
                points.append(left_offset + (d << SCALE_BITS) // (-b))

        first, last = points
        if first > last:
            first, last = last, first

        append_event((first << EVENT_BITS) | m)
        append_event((last << EVENT_BITS) | END | m)
        m += 1

    if m < 2:
        print(0)
        return

    events.sort()

    start_rank = [0] * m
    bit = [0] * (m + 1)

    opened = 0
    closed = 0
    answer = 0
    i = 0
    event_count = len(events)

    while i < event_count:
        coordinate = events[i] >> EVENT_BITS
        j = i + 1
        while j < event_count and events[j] >> EVENT_BITS == coordinate:
            j += 1

        # Opening events precede closing events within this boundary point.
        k = i
        while k < j and not (events[k] & END):
            k += 1

        # Close the entire group first, excluding shared boundary endpoints.
        for t in range(k, j):
            rank = start_rank[events[t] & ID_MASK]
            while rank <= m:
                bit[rank] += 1
                rank += rank & -rank

        closed += j - k
        active = opened - closed

        for t in range(k, j):
            rank = start_rank[events[t] & ID_MASK]
            contribution = active - rank

            # Number of closed chords whose start rank is at most rank.
            while rank:
                contribution += bit[rank]
                rank -= rank & -rank

            answer += contribution

        # Equal opening endpoints receive the same rank, excluding their pairs.
        opened += k - i
        for t in range(i, k):
            start_rank[events[t] & ID_MASK] = opened

        i = j

    print(answer)


if __name__ == "__main__":
    main()
