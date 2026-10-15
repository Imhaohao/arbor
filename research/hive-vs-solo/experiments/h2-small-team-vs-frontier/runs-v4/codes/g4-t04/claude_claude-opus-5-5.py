import sys, math, heapq

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); x0 = int(data[1]); y0 = int(data[2])
    vs = []
    sx = sy = 0
    idx = 3
    for _ in range(n):
        x = int(data[idx]); y = int(data[idx + 1]); idx += 2
        sx += x; sy += y
        if x or y:
            vs.append((math.atan2(y, x), x, y))
    Qx = x0 + sx; Qy = y0 + sy
    if not vs:
        print(0)
        return
    vs.sort()
    m = len(vs)
    PI = math.pi
    EPS = 1e-12
    th = [v[0] for v in vs]
    th2 = th + [t + 2 * PI for t in th]
    ux = [v[1] for v in vs] * 2
    uy = [v[2] for v in vs] * 2
    M2 = 2 * m
    Vx = [0] * (M2 + 1); Vy = [0] * (M2 + 1); C = [0] * (M2 + 1)
    cx = cy = cc = 0
    for i in range(M2):
        a = ux[i]; b = uy[i]
        cc += cx * b - cy * a
        cx += a; cy += b
        Vx[i + 1] = cx; Vy[i + 1] = cy; C[i + 1] = cc

    lo = [0] * m
    r = 1
    for l in range(m):
        if r < l + 1:
            r = l + 1
        tl = th2[l] + PI - EPS
        while th2[r] <= tl:
            r += 1
        lo[l] = r

    buckets = [[] for _ in range(m)]
    lbp = 0
    for r in range(M2):
        while lbp < m and lo[lbp] <= r:
            lbp += 1
        if lbp >= m:
            break
        a = lbp
        b = r if r < m - 1 else m - 1
        if a > b:
            continue
        uxr = ux[r]; uyr = uy[r]
        if Qx * uyr - Qy * uxr >= 0:
            continue
        thr = (Qx + Vx[r]) * uyr - (Qy + Vy[r]) * uxr
        if Vx[b] * uyr - Vy[b] * uxr <= thr:
            continue
        lo_ = a; hi_ = b
        while lo_ < hi_:
            mid = (lo_ + hi_) >> 1
            if Vx[mid] * uyr - Vy[mid] * uxr > thr:
                hi_ = mid
            else:
                lo_ = mid + 1
        buckets[lo_].append(r)

    def F(l, R):
        vxl = Vx[l]; vyl = Vy[l]; vxr = Vx[R]; vyr = Vy[R]
        return (C[R] - C[l] - (vxl * vyr - vyl * vxr)
                + Qx * (vyr - vyl) - Qy * (vxr - vxl))

    best = 0
    heap = []
    p = 0
    for l in range(m):
        for rr in buckets[l]:
            heapq.heappush(heap, rr)
        while heap and heap[0] < l:
            heapq.heappop(heap)
        if heap:
            v = F(l, heap[0])
            if v > best:
                best = v
        if p < lo[l]:
            p = lo[l]
        end = l + m
        bx = Qx - Vx[l]; by = Qy - Vy[l]
        while p < end and (bx + Vx[p]) * uy[p] - (by + Vy[p]) * ux[p] >= 0:
            p += 1
        v = F(l, p)
        if v > best:
            best = v
        v = F(l, end)
        if v > best:
            best = v
    print(best)

main()
