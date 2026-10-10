import sys


def main():
    data = sys.stdin.read().split()
    M = int(data[0])
    b = [0] * 14
    for i in range(6):
        b[i] = int(data[1 + i])
        b[7 + i] = int(data[7 + i])

    # Cycle order of positions for each player (13 entries, opponent store skipped).
    CYC = (
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        [7, 8, 9, 10, 11, 12, 13, 0, 1, 2, 3, 4, 5],
    )
    IDX = ([0] * 14, [0] * 14)
    for p in range(2):
        for t, x in enumerate(CYC[p]):
            IDX[p][x] = t
    BASE = (0, 7)
    STORE = (6, 13)

    def ended():
        return not any(b[0:6]) or not any(b[7:13])

    moves = 0
    p = 0
    status = "CAP"
    if ended():
        status = "END"
    else:
        while True:
            cyc = CYC[p]
            idx = IDX[p]
            base = BASE[p]
            bestk = None
            best = None
            for i in range(6):
                pos = base + i
                n = b[pos]
                if not n:
                    continue
                q, rem = divmod(n, 13)
                L = i + rem
                if L > 12:
                    L -= 13
                g = q + (rem >= 6 - i)
                if L < 6 and ((rem == 0 and q == 1) or (q == 0 and b[cyc[L]] == 0)):
                    op = 12 - cyc[L]
                    of = b[op] + q + (1 if (idx[op] - i) % 13 <= rem else 0)
                    if of:
                        g += of + 1
                k = (g, L == 6, n, -pos)
                if bestk is None or k > bestk:
                    bestk = k
                    best = (pos, q, rem, L)

            pos, q, rem, L = best
            i = pos - base
            st = STORE[p]
            b[pos] = 0
            if q:
                for x in cyc:
                    b[x] += q
            t = i
            for _ in range(rem):
                t = t + 1 if t < 12 else 0
                b[cyc[t]] += 1
            if L < 6:
                lp = cyc[L]
                op = 12 - lp
                if b[lp] == 1 and b[op]:
                    b[st] += b[op] + 1
                    b[op] = 0
                    b[lp] = 0
            if L != 6:
                p ^= 1
            moves += 1
            if ended():
                status = "END"
                break
            if moves == M:
                status = "CAP"
                break

    if status == "END":
        b[6] += sum(b[0:6])
        b[13] += sum(b[7:13])
        for i in range(6):
            b[i] = 0
            b[7 + i] = 0

    sys.stdout.write(
        f"{status} {moves} {b[6]} {b[13]}\n"
        + " ".join(map(str, b[0:6] + b[7:13]))
        + "\n"
    )


main()
