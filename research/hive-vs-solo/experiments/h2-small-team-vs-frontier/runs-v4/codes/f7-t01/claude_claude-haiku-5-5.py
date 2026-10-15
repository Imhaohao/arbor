import sys
from bisect import bisect_left, bisect_right, insort


def build_suffix_array(s, n):
    rank = [ord(c) - 96 for c in s]
    sa = list(range(n))
    mult = n + 30
    k = 1
    while True:
        key = [rank[i] * mult + (rank[i + k] if i + k < n else 0) for i in range(n)]
        sa.sort(key=key.__getitem__)
        new_rank = [0] * n
        cur = 1
        new_rank[sa[0]] = 1
        for idx in range(1, n):
            if key[sa[idx]] != key[sa[idx - 1]]:
                cur += 1
            new_rank[sa[idx]] = cur
        rank = new_rank
        if cur == n:
            return sa
        k <<= 1


def lcp_array(s, n, sa):
    rk = [0] * n
    for i, p in enumerate(sa):
        rk[p] = i
    lcp = [0] * n
    h = 0
    for i in range(n):
        r = rk[i]
        if r == 0:
            h = 0
            continue
        j = sa[r - 1]
        while i + h < n and j + h < n and s[i + h] == s[j + h]:
            h += 1
        lcp[r] = h
        if h:
            h -= 1
    return lcp


def retarget(pieces, nxt, start, y, new_q, t):
    old = nxt[y]
    if old != -1 and start[y] > t:
        pieces[y].append((old, t, start[y]))
    nxt[y] = new_q
    start[y] = t


def compute_pieces(n, sa, lcp):
    buckets = [[] for _ in range(n + 1)]
    for i in range(1, n):
        if lcp[i]:
            buckets[lcp[i]].append(i)
    comp = list(range(n))
    members = [[p] for p in range(n)]
    nxt = [-1] * n
    start = [0] * n
    pieces = [[] for _ in range(n)]
    for t in range(n, 0, -1):
        for i in buckets[t]:
            cu = comp[sa[i - 1]]
            cv = comp[sa[i]]
            if len(members[cu]) <= len(members[cv]):
                sid, lid = cu, cv
            else:
                sid, lid = cv, cu
            small = members[sid]
            large = members[lid]
            big_len = len(large)
            last_y = -1
            for x in small:
                j = bisect_right(large, x)
                if j < big_len:
                    sl = large[j]
                    cur = nxt[x]
                    if cur == -1 or sl < cur:
                        retarget(pieces, nxt, start, x, sl, t)
                if j:
                    y = large[j - 1]
                    if y != last_y:
                        last_y = y
                        cur = nxt[y]
                        if cur == -1 or x < cur:
                            retarget(pieces, nxt, start, y, x, t)
            for x in small:
                comp[x] = lid
                insort(large, x)
            members[sid] = None
    for p in range(n):
        if nxt[p] != -1:
            pieces[p].append((nxt[p], 0, start[p]))
    return pieces


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    q = int(data[1])
    s = data[2].decode()

    sa = build_suffix_array(s, n)
    lcp = lcp_array(s, n, sa)
    pieces = compute_pieces(n, sa, lcp)

    shapes = {}
    for p1 in range(n):
        for q1, lo1, hi1 in pieces[p1]:
            d1 = q1 - p1
            if lo1 < d1:
                lo1 = d1
            if lo1 >= hi1:
                continue
            for q2, lo2, hi2 in pieces[q1]:
                d2 = q2 - q1
                X = lo1 if lo1 > lo2 else lo2
                if d2 > X:
                    X = d2
                Y = hi1 if hi1 < hi2 else hi2
                if d1 + d2 < Y:
                    Y = d1 + d2
                if X < Y:
                    key = (X + 1, Y, d1 if d1 > d2 else d2, d1 + d2)
                    shapes.setdefault(key, []).append(p1)

    items = []
    for (a, c, D, S), plist in shapes.items():
        plist.sort()
        pref = [0]
        acc = 0
        for p in plist:
            acc += p
            pref.append(acc)
        items.append((c - D, a, c, D, S, plist, pref))
    items.sort(key=lambda it: -it[0])

    out = []
    idx = 3
    for _ in range(q):
        l0 = int(data[idx]) - 1
        r0 = int(data[idx + 1]) - 1
        b = int(data[idx + 2])
        idx += 3
        total = 0
        for cmd, a, c, D, S, P, pref in items:
            if cmd < b:
                break
            L = b + D
            if L < a:
                L = a
            t = r0 - S + 1
            i0 = bisect_left(P, l0)
            iA = bisect_right(P, t - c)
            iB = bisect_right(P, t - L)
            nA = iA - i0
            if nA > 0:
                total += nA * (c - L + 1)
            sB = i0 if i0 > iA else iA
            nB = iB - sB
            if nB > 0:
                total += nB * (t - L + 1) - (pref[iB] - pref[sB])
        out.append(total)

    sys.stdout.write("\n".join(map(str, out)) + "\n")


main()
