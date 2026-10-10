import sys
from math import gcd

def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    W = int(input_data[0])
    H = int(input_data[1])
    n = int(input_data[2])

    class FracItem:
        __slots__ = ('p', 'q', 'eid', 'val')

        def __init__(self, p, q, eid):
            self.p = p
            self.q = q
            self.eid = eid
            self.val = p / q

        def __lt__(self, other):
            if self.val != other.val:
                return self.val < other.val
            return self.p * other.q < other.p * self.q

    sections = [[] for _ in range(8)]
    M = 0

    idx = 3
    for _ in range(n):
        a = int(input_data[idx])
        b = int(input_data[idx + 1])
        c = int(input_data[idx + 2])
        idx += 3

        v1 = -c
        v2 = a * W - c
        v3 = v2 + b * H
        v4 = b * H - c

        mn = v1
        if v2 < mn:
            mn = v2
        if v3 < mn:
            mn = v3
        if v4 < mn:
            mn = v4

        mx = v1
        if v2 > mx:
            mx = v2
        if v3 > mx:
            mx = v3
        if v4 > mx:
            mx = v4

        if mn >= 0 or mx <= 0:
            continue

        eid0 = 2 * M
        eid1 = 2 * M + 1
        cur_eid = eid0

        if v1 == 0:
            sections[0].append((0, 0, cur_eid))
            cur_eid = eid1
        elif (v1 > 0 and v2 < 0) or (v1 < 0 and v2 > 0):
            p = c
            q = a
            if q < 0:
                p = -p
                q = -q
            g = gcd(p, q)
            sections[1].append((p // g, q // g, cur_eid))
            cur_eid = eid1

        if v2 == 0:
            sections[2].append((0, 0, cur_eid))
            cur_eid = eid1
        elif (v2 > 0 and v3 < 0) or (v2 < 0 and v3 > 0):
            p = c - a * W
            q = b
            if q < 0:
                p = -p
                q = -q
            g = gcd(p, q)
            sections[3].append((p // g, q // g, cur_eid))
            cur_eid = eid1

        if v3 == 0:
            sections[4].append((0, 0, cur_eid))
            cur_eid = eid1
        elif (v3 > 0 and v4 < 0) or (v3 < 0 and v4 > 0):
            p = b * H - c
            q = a
            if q < 0:
                p = -p
                q = -q
            g = gcd(p, q)
            sections[5].append((p // g, q // g, cur_eid))
            cur_eid = eid1

        if v4 == 0:
            sections[6].append((0, 0, cur_eid))
            cur_eid = eid1
        elif (v4 > 0 and v1 < 0) or (v4 < 0 and v1 > 0):
            p = -c
            q = b
            if q < 0:
                p = -p
                q = -q
            g = gcd(p, q)
            sections[7].append((p // g, q // g, cur_eid))
            cur_eid = eid1

        M += 1

    if M == 0:
        print(0)
        return

    rank_of_endpoint = [0] * (2 * M)
    current_rank = 0

    for sec in range(8):
        sec_list = sections[sec]
        if not sec_list:
            continue
        if sec % 2 == 0:
            for _, _, eid in sec_list:
                rank_of_endpoint[eid] = current_rank
            current_rank += 1
        else:
            items = [FracItem(p, q, eid) for p, q, eid in sec_list]
            items.sort()
            rank_of_endpoint[items[0].eid] = current_rank
            prev_p = items[0].p
            prev_q = items[0].q
            for j in range(1, len(items)):
                it = items[j]
                if it.p != prev_p or it.q != prev_q:
                    current_rank += 1
                    prev_p = it.p
                    prev_q = it.q
                rank_of_endpoint[it.eid] = current_rank
            current_rank += 1

    chords = []
    for i in range(M):
        r1 = rank_of_endpoint[2 * i]
        r2 = rank_of_endpoint[2 * i + 1]
        if r1 < r2:
            chords.append((r1, r2))
        else:
            chords.append((r2, r1))

    chords.sort(key=lambda c: c[0])

    K = current_rank
    bit = [0] * (K + 1)

    def add(idx):
        while idx <= K:
            bit[idx] += 1
            idx += idx & (-idx)

    def query(idx):
        s = 0
        while idx > 0:
            s += bit[idx]
            idx -= idx & (-idx)
        return s

    ans = 0
    n_chords = len(chords)
    i = 0
    while i < n_chords:
        next_i = i
        u_val = chords[i][0]
        while next_i < n_chords and chords[next_i][0] == u_val:
            next_i += 1

        for j in range(i, next_i):
            v_val = chords[j][1]
            if v_val > u_val + 1:
                ans += query(v_val) - query(u_val + 1)

        for j in range(i, next_i):
            add(chords[j][1] + 1)

        i = next_i

    print(ans)

if __name__ == '__main__':
    solve()
