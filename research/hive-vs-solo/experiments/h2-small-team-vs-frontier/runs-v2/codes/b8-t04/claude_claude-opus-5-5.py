import sys

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    xs = [0] * (n + 1)
    ys = [0] * (n + 1)
    ts = [0] * (n + 1)
    pos = 1
    for i in range(1, n + 1):
        xs[i] = int(data[pos]); ys[i] = int(data[pos + 1]); ts[i] = int(data[pos + 2])
        pos += 3
    ds = [xs[i] - ys[i] for i in range(n + 1)]
    vals = sorted(set(ds))
    rank = {v: i + 1 for i, v in enumerate(vals)}
    K = len(vals)
    XM = [[] for _ in range(K + 1)]
    XB = [[] for _ in range(K + 1)]
    XH = [0] * (K + 1)
    YM = [[] for _ in range(K + 1)]
    YB = [[] for _ in range(K + 1)]
    YH = [0] * (K + 1)
    INF = 1 << 200

    def insert(Ms, Bs, Hs, k, m, b):
        while k <= K:
            M = Ms[k]; B = Bs[k]; h = Hs[k]; L = len(M)
            ok = True
            if L > h and M[-1] == m:
                if B[-1] <= b:
                    ok = False
                else:
                    M.pop(); B.pop(); L -= 1
            if ok:
                while L - h >= 2:
                    m1 = M[-2]; b1 = B[-2]; m2 = M[-1]; b2 = B[-1]
                    if (b - b1) * (m1 - m2) <= (b2 - b1) * (m1 - m):
                        M.pop(); B.pop(); L -= 1
                    else:
                        break
                M.append(m); B.append(b)
            k += k & -k

    def query(Ms, Bs, Hs, k, q):
        best = INF
        while k:
            M = Ms[k]
            L = len(M)
            if L:
                B = Bs[k]; h = Hs[k]
                v = M[h] * q + B[h]
                while h + 1 < L:
                    w = M[h + 1] * q + B[h + 1]
                    if w <= v:
                        v = w; h += 1
                    else:
                        break
                Hs[k] = h
                if v < best:
                    best = v
            k &= k - 1
        return best

    p0 = rank[ds[0]]
    insert(XM, XB, XH, p0, 0, 0)
    insert(YM, YB, YH, K + 1 - p0, 0, 0)
    dpj = 0
    for j in range(1, n + 1):
        xj = xs[j]; yj = ys[j]
        p = rank[ds[j]]
        bx = query(XM, XB, XH, p, xj)
        by = query(YM, YB, YH, K + 1 - p, yj)
        c = INF
        if bx < INF:
            c = bx + xj * xj
        if by < INF:
            v = by + yj * yj
            if v < c:
                c = v
        dpj = c + ts[j]
        if j < n:
            insert(XM, XB, XH, p, -2 * xj, dpj + xj * xj)
            insert(YM, YB, YH, K + 1 - p, -2 * yj, dpj + yj * yj)
    sys.stdout.write(str(dpj) + "\n")

main()
