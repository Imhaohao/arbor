import sys
from bisect import bisect_right

def main():
    data = sys.stdin.buffer.read().split()
    W = int(data[0]); H = int(data[1]); n = int(data[2])
    M = 2 * 10**12
    offs = (0, W, W + H, 2 * W + H)
    offM = tuple(o * M for o in offs)
    segs = []
    p = 3
    for _ in range(n):
        a = int(data[p]); b = int(data[p + 1]); c = int(data[p + 2]); p += 3
        aW = a * W
        bH = b * H
        f0 = -c
        f1 = aW - c
        f2 = aW + bH - c
        f3 = bH - c
        if not (min(f0, f1, f2, f3) < 0 < max(f0, f1, f2, f3)):
            continue
        f = (f0, f1, f2, f3)
        deltas = (-a, -b, a, b)
        pts = []
        for k in range(4):
            fp = f[k]
            if fp == 0:
                pts.append(offM[k])
            else:
                fq = f[(k + 1) & 3]
                if fp * fq < 0:
                    d = deltas[k]
                    num = offs[k] * d + fp
                    if d < 0:
                        d = -d
                        num = -num
                    pts.append((num * M) // d)
        x, y = pts[0], pts[1]
        if x > y:
            x, y = y, x
        segs.append((x, y))
    m = len(segs)
    if m < 2:
        print(0)
        return
    sR = sorted(s[1] for s in segs)
    total2 = 0
    for l, r in segs:
        total2 += bisect_right(sR, l)
    # rank of r
    rank = {}
    for v in sR:
        if v not in rank:
            rank[v] = len(rank) + 1
    K = len(rank)
    tree = [0] * (K + 1)
    segs.sort(key=lambda s: (s[0], -s[1]))
    total1 = 0
    for l, r in segs:
        rk = rank[r]
        i = rk - 1
        s = 0
        while i > 0:
            s += tree[i]
            i &= i - 1
        total1 += s
        i = rk
        while i <= K:
            tree[i] += 1
            i += i & -i
    print(total1 - total2)

main()
