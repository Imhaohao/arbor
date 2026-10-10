import sys
from bisect import bisect_left, bisect_right
from itertools import repeat


def count_ge(seq):
    cur = seq
    n = len(seq)
    total = 0
    w = 1
    while w < n:
        step = 2 * w
        nxt = []
        for lo in range(0, n, step):
            L = cur[lo:lo + w]
            R = cur[lo + w:lo + step]
            if R:
                total += len(L) * len(R) - sum(map(bisect_left, repeat(L), R))
                nxt += sorted(L + R)
            else:
                nxt += L
        cur = nxt
        w = step
    return total


def main():
    data = sys.stdin.buffer.read().split()
    W = int(data[0])
    H = int(data[1])
    n = int(data[2])
    vals = list(map(int, data[3:3 + 3 * n]))
    M = 1 << 40
    WH = 2 * W + H
    PER = 2 * W + 2 * H
    Ps = []
    Qs = []
    for a, b, c in zip(vals[0::3], vals[1::3], vals[2::3]):
        f0 = -c
        f1 = a * W - c
        f2 = f1 + b * H
        f3 = b * H - c
        if not (min(f0, f1, f2, f3) < 0 < max(f0, f1, f2, f3)):
            continue
        keys = set()
        if a:
            if a > 0:
                d = a; u = c; v = c - b * H
            else:
                d = -a; u = -c; v = b * H - c
            if 0 <= u <= W * d:
                keys.add(u * M // d)
            if 0 <= v <= W * d:
                keys.add((WH * d - v) * M // d)
        if b:
            if b > 0:
                d = b; u = c - a * W; v = c
            else:
                d = -b; u = a * W - c; v = -c
            if 0 <= u <= H * d:
                keys.add((W * d + u) * M // d)
            if 0 <= v <= H * d:
                keys.add((PER * d - v) * M // d if v else 0)
        if len(keys) != 2:
            continue
        p, q = sorted(keys)
        Ps.append(p)
        Qs.append(q)

    m = len(Ps)
    if m < 2:
        print(0)
        return

    K = 1 << 63
    comb = [p * K - q for p, q in zip(Ps, Qs)]
    comb.sort()
    Qseq = [-((-x) // K) * K - x for x in comb]
    Inc = m * (m - 1) // 2 - count_ge(Qseq)
    Qsorted = sorted(Qs)
    D = sum(map(bisect_right, repeat(Qsorted), Ps))
    print(Inc - D)


main()
