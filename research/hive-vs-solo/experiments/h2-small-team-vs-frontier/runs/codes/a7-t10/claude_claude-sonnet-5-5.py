import sys

def main():
    data = sys.stdin.read().split()
    M = int(data[0])
    v = list(map(int, data[1:13]))
    a = [0] * 14
    for i in range(6):
        a[i] = v[i]
        a[7 + i] = v[6 + i]
    cyc = [list(range(13)), list(range(7, 14)) + list(range(0, 6))]
    idx = []
    for p in range(2):
        d = [-1] * 14
        for i, pos in enumerate(cyc[p]):
            d[pos] = i
        idx.append(d)
    stores = (6, 13)
    pits = (range(0, 6), range(7, 13))
    moves = 0
    p = 0
    status = None
    while True:
        s0 = sum(a[0:6])
        s1 = sum(a[7:13])
        if s0 == 0 or s1 == 0:
            a[6] += s0
            a[13] += s1
            for i in range(6):
                a[i] = 0
                a[7 + i] = 0
            status = "END"
            break
        if moves == M:
            status = "CAP"
            break
        st = stores[p]
        ix = idx[p]
        cy = cyc[p]
        sidx = ix[st]
        lo = 0 if p == 0 else 7
        best = None
        bs = -1
        for s in pits[p]:
            n = a[s]
            if n == 0:
                continue
            k = ix[s]
            full, rem = divmod(n, 13)
            L = cy[(k + n) % 13]
            so = (sidx - k) % 13
            gain = full + (1 if 1 <= so <= rem else 0)
            extra = 0
            if L == st:
                extra = 1
            elif lo <= L < lo + 6:
                cnt = (a[L] if L != s else 0) + full + (1 if rem > 0 else 0)
                if cnt == 1:
                    o = 12 - L
                    oc = a[o] + full + (1 if 1 <= (ix[o] - k) % 13 <= rem else 0)
                    if oc > 0:
                        gain += oc + 1
            key = (gain, extra, n, -s)
            if best is None or key > best:
                best = key
                bs = s
        s = bs
        n = a[s]
        k = ix[s]
        full, rem = divmod(n, 13)
        a[s] = 0
        if full:
            for pos in cy:
                a[pos] += full
        for j in range(1, rem + 1):
            a[cy[(k + j) % 13]] += 1
        L = cy[(k + n) % 13]
        moves += 1
        if L == st:
            pass
        else:
            if lo <= L < lo + 6 and a[L] == 1 and a[12 - L] > 0:
                o = 12 - L
                a[st] += a[o] + 1
                a[o] = 0
                a[L] = 0
            p = 1 - p
    out = [a[i] for i in range(6)] + [a[7 + i] for i in range(6)]
    print(status, moves, a[6], a[13])
    print(*out)

main()
