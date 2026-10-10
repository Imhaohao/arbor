import sys

def main():
    raw = sys.stdin.buffer.read().split()
    M = int(raw[0])
    b = [0] * 14
    for i in range(6):
        b[i] = int(raw[1 + i])
        b[7 + i] = int(raw[7 + i])

    C = (
        (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
        (0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13),
    )
    SEQ = [[None] * 6 for _ in range(2)]
    ST = [[0] * 6 for _ in range(2)]
    PIDX = [[[0] * 14 for _ in range(6)] for _ in range(2)]
    STORE = (6, 13)
    for p in range(2):
        cyc = C[p]
        for i in range(6):
            s = i if p == 0 else 7 + i
            si = 0
            while cyc[si] != s:
                si += 1
            seq = [cyc[(si + 1 + k) % 13] for k in range(13)]
            SEQ[p][i] = seq
            pidx = PIDX[p][i]
            for j, pos in enumerate(seq):
                pidx[pos] = j
            ST[p][i] = pidx[STORE[p]]

    def alive():
        if (b[0] | b[1] | b[2] | b[3] | b[4] | b[5]) == 0:
            return False
        if (b[7] | b[8] | b[9] | b[10] | b[11] | b[12]) == 0:
            return False
        return True

    def sweep():
        b[6] += b[0] + b[1] + b[2] + b[3] + b[4] + b[5]
        b[13] += b[7] + b[8] + b[9] + b[10] + b[11] + b[12]
        b[0] = b[1] = b[2] = b[3] = b[4] = b[5] = 0
        b[7] = b[8] = b[9] = b[10] = b[11] = b[12] = 0

    moves = 0
    if alive():
        status = "CAP"
        p = 0
        while moves < M:
            store = STORE[p]
            base = 0 if p == 0 else 7
            seqs = SEQ[p]
            sts = ST[p]
            pidxs = PIDX[p]
            best_key = (-1, False, -1, 1)
            best_s = 0
            best_i = 0
            best_n = 0
            for i in range(6):
                s = base + i
                n = b[s]
                if n == 0:
                    continue
                full, rem = divmod(n, 13)
                seq = seqs[i]
                if rem:
                    sown = full + (sts[i] < rem)
                    last = seq[rem - 1]
                    final_last = b[last] + full + 1
                else:
                    sown = full
                    last = s
                    final_last = full
                extra = last == store
                captured = 0
                if (not extra) and final_last == 1 and (last < 6 if p == 0 else last > 6):
                    opp = 12 - last
                    oi = pidxs[i][opp]
                    opp_final = b[opp] + full + (rem > 0 and oi < rem)
                    if opp_final:
                        captured = opp_final + 1
                key = (sown + captured, extra, n, -s)
                if key > best_key:
                    best_key = key
                    best_s = s
                    best_i = i
                    best_n = n

            n = best_n
            b[best_s] = 0
            seq = seqs[best_i]
            full, rem = divmod(n, 13)
            if full:
                for pos in seq:
                    b[pos] += full
            if rem:
                for k in range(rem):
                    b[seq[k]] += 1
                last = seq[rem - 1]
            else:
                last = best_s
            if last != store:
                if (last < 6 if p == 0 else last > 6) and b[last] == 1:
                    opp = 12 - last
                    ov = b[opp]
                    if ov:
                        b[store] += ov + 1
                        b[last] = 0
                        b[opp] = 0
                p ^= 1
            moves += 1
            if not alive():
                sweep()
                status = "END"
                break
    else:
        status = "END"
        sweep()

    sys.stdout.write(
        f"{status} {moves} {b[6]} {b[13]}\n"
        f"{b[0]} {b[1]} {b[2]} {b[3]} {b[4]} {b[5]} "
        f"{b[7]} {b[8]} {b[9]} {b[10]} {b[11]} {b[12]}\n"
    )

main()
