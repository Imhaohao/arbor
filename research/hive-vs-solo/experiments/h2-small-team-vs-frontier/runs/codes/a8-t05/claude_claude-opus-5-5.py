import sys

def main():
    data = sys.stdin.buffer.read().split()
    W = int(data[0]); H = int(data[1]); n = int(data[2])
    D = 1 << 41
    W2H = 2 * W + H
    P = 2 * W + 2 * H
    kW = W * D
    kWH = (W + H) * D
    kW2H = W2H * D
    Ls = []
    Rs = []
    idx = 3
    for _ in range(n):
        a = int(data[idx]); b = int(data[idx + 1]); c = int(data[idx + 2])
        idx += 3
        s0 = -c
        s1 = a * W - c
        s3 = b * H - c
        s2 = s1 + b * H
        pos = (s0 > 0) or (s1 > 0) or (s2 > 0) or (s3 > 0)
        neg = (s0 < 0) or (s1 < 0) or (s2 < 0) or (s3 < 0)
        if not (pos and neg):
            continue
        pts = []
        if s0 == 0:
            pts.append(0)
        if s1 == 0:
            pts.append(kW)
        if s2 == 0:
            pts.append(kWH)
        if s3 == 0:
            pts.append(kW2H)
        # bottom edge
        if (s0 > 0 and s1 < 0) or (s0 < 0 and s1 > 0):
            num = c; den = a
            if den < 0:
                num = -num; den = -den
            pts.append(num * D // den)
        # right edge
        if (s1 > 0 and s2 < 0) or (s1 < 0 and s2 > 0):
            num = c - a * W; den = b
            if den < 0:
                num = -num; den = -den
            pts.append((W * den + num) * D // den)
        # top edge
        if (s2 > 0 and s3 < 0) or (s2 < 0 and s3 > 0):
            num = c - b * H; den = a
            if den < 0:
                num = -num; den = -den
            pts.append((W2H * den - num) * D // den)
        # left edge
        if (s3 > 0 and s0 < 0) or (s3 < 0 and s0 > 0):
            num = c; den = b
            if den < 0:
                num = -num; den = -den
            pts.append((P * den - num) * D // den)
        if len(pts) != 2:
            continue
        p, q = pts
        if p == q:
            continue
        if p < q:
            Ls.append(p); Rs.append(q)
        else:
            Ls.append(q); Rs.append(p)
    k = len(Ls)
    if k < 2:
        print(0)
        return
    allk = sorted(set(Ls) | set(Rs))
    rank = {v: i + 1 for i, v in enumerate(allk)}
    m = len(allk)
    Lr = [rank[v] for v in Ls]
    Rr = [rank[v] for v in Rs]
    order = sorted(range(k), key=Lr.__getitem__)
    tree = [0] * (m + 1)
    total = 0
    i = 0
    while i < k:
        lv = Lr[order[i]]
        j = i
        while j < k and Lr[order[j]] == lv:
            j += 1
        for t in range(i, j):
            r = Rr[order[t]]
            # prefix(r-1) - prefix(lv)
            s = 0
            x = r - 1
            while x > 0:
                s += tree[x]
                x &= x - 1
            x = lv
            while x > 0:
                s -= tree[x]
                x &= x - 1
            total += s
        for t in range(i, j):
            x = Rr[order[t]]
            while x <= m:
                tree[x] += 1
                x += x & (-x)
        i = j
    print(total)

main()
