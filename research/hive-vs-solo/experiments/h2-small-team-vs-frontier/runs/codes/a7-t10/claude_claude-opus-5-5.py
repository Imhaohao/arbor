import sys

def main():
    data = sys.stdin.read().split()
    M = int(data[0])
    vals = list(map(int, data[1:13]))
    b = [0]*14
    for i in range(6):
        b[i] = vals[i]
    for i in range(6):
        b[7+i] = vals[6+i]

    CYC = []
    for p in range(2):
        opp = 13 if p == 0 else 6
        CYC.append([x for x in range(14) if x != opp])
    # POS[p][s][k] = position k steps after s (k=1..13)
    # OFF[p][s][x] = offset of x from s (0 for s itself), -1 for opp store
    POS = [[None]*14 for _ in range(2)]
    OFF = [[None]*14 for _ in range(2)]
    for p in range(2):
        cyc = CYC[p]
        ci = {x: i for i, x in enumerate(cyc)}
        own = range(0, 6) if p == 0 else range(7, 13)
        for s in own:
            idx = ci[s]
            POS[p][s] = [None] + [cyc[(idx+k) % 13] for k in range(1, 14)]
            off = [-1]*14
            for x in cyc:
                off[x] = (ci[x]-idx) % 13
            OFF[p][s] = off

    def ended():
        return (b[0] == 0 and b[1] == 0 and b[2] == 0 and b[3] == 0 and b[4] == 0 and b[5] == 0) or \
               (b[7] == 0 and b[8] == 0 and b[9] == 0 and b[10] == 0 and b[11] == 0 and b[12] == 0)

    moves = 0
    status = None
    if ended():
        status = "END"
    p = 0
    while status is None:
        if moves >= M:
            status = "CAP"
            break
        if p == 0:
            lo, hi, store = 0, 6, 6
        else:
            lo, hi, store = 7, 13, 13
        best = None
        bs = -1
        for s in range(lo, hi):
            n = b[s]
            if n == 0:
                continue
            q, r = divmod(n, 13)
            off = OFF[p][s]
            gain = q + (1 if off[store] <= r else 0)
            extra = 0
            if r == 0:
                last = s
            else:
                last = POS[p][s][r]
            if last == store:
                extra = 1
            elif lo <= last < hi:
                if last == s:
                    lc = q
                else:
                    lc = b[last] + q + 1
                if lc == 1:
                    o = 12 - last
                    do = off[o]
                    oc = b[o] + q + (1 if 1 <= do <= r else 0)
                    if oc > 0:
                        gain += 1 + oc
            key = (gain, extra, n, -s)
            if best is None or key > best:
                best = key
                bs = s
        s = bs
        n = b[s]
        q, r = divmod(n, 13)
        b[s] = 0
        if q:
            for x in CYC[p]:
                b[x] += q
        pos = POS[p][s]
        for k in range(1, r+1):
            b[pos[k]] += 1
        last = s if r == 0 else pos[r]
        extra = (last == store)
        if not extra and lo <= last < hi and b[last] == 1:
            o = 12 - last
            if b[o] > 0:
                b[store] += b[o] + 1
                b[o] = 0
                b[last] = 0
        moves += 1
        if ended():
            status = "END"
            break
        if not extra:
            p ^= 1

    if status == "END":
        for i in range(6):
            b[6] += b[i]
            b[i] = 0
        for i in range(7, 13):
            b[13] += b[i]
            b[i] = 0

    out = [f"{status} {moves} {b[6]} {b[13]}",
           " ".join(str(b[i]) for i in list(range(6)) + list(range(7, 13)))]
    sys.stdout.write("\n".join(out) + "\n")

main()
