import sys
from bisect import bisect_left


def main():
    a, c, m, x0, G = map(int, sys.stdin.read().split())

    # PW[T*4+Ls][card] = power of card in a trick led with suit Ls, trump suit T
    PW = [None] * 16
    for T in range(4):
        for Ls in range(4):
            row = []
            for k in range(24):
                s, r = divmod(k, 6)
                if s == T:
                    row.append(100 + r)
                elif s == Ls:
                    row.append(r)
                else:
                    row.append(-1)
            PW[T * 4 + Ls] = row

    # LKg[T]: leading key (highest rank, then smaller suit); trumps -1
    # DKg[T]: discard key (lowest rank, then smaller suit); trumps 100
    LKg = []
    DKg = []
    for T in range(4):
        lk = []
        dk = []
        for k in range(24):
            s, r = divmod(k, 6)
            if s == T:
                lk.append(-1)
                dk.append(100)
            else:
                lk.append(r * 4 + 3 - s)
                dk.append(r * 4 + s)
        LKg.append(lk.__getitem__)
        DKg.append(dk.__getitem__)

    cache = {}

    def prep(x):
        v = cache.get(x)
        if v is not None:
            return v
        D = list(range(24))
        y = x
        for i in range(23, 0, -1):
            y = (a * y + c) % m
            j = y % (i + 1)
            D[i], D[j] = D[j], D[i]
        T = D[23] // 6
        hands = tuple(sorted(D[6 * s:6 * s + 6]) for s in range(4))
        v = (hands, T, y)
        cache[x] = v
        return v

    def play(hands0, T, lead):
        hands = [hands0[0][:], hands0[1][:], hands0[2][:], hands0[3][:]]
        lkf = LKg[T]
        dkf = DKg[T]
        tbase = 6 * T
        wins = [0, 0, 0, 0]
        leader = lead
        last = lead
        for _ in range(6):
            h = hands[leader]
            c0 = max(h, key=lkf)
            h.remove(c0)
            Ls = c0 // 6
            pw = PW[T * 4 + Ls]
            pb = pw[c0]
            bs = leader
            s = leader
            for _ in range(3):
                s = (s + 1) & 3
                h = hands[s]
                lo = bisect_left(h, 6 * Ls)
                hi = bisect_left(h, 6 * Ls + 6, lo)
                if lo < hi:
                    k = lo
                    while k < hi and pw[h[k]] <= pb:
                        k += 1
                    if k == hi:
                        k = lo
                    cc = h.pop(k)
                else:
                    tlo = bisect_left(h, tbase)
                    thi = bisect_left(h, tbase + 6, tlo)
                    k = tlo
                    while k < thi and pw[h[k]] <= pb:
                        k += 1
                    if k < thi:
                        cc = h.pop(k)
                    else:
                        cc = min(h, key=dkf)
                        h.remove(cc)
                p = pw[cc]
                if p > pb:
                    pb = p
                    bs = s
            wins[bs] += 1
            leader = bs
            last = bs

        sweeper = -1
        for s in range(4):
            if wins[s] == 6:
                sweeper = s
        sc = [0, 0, 0, 0]
        if sweeper >= 0:
            sc[sweeper] = 20
            sw = 1
        else:
            sw = 0
            for s in range(4):
                v = wins[s]
                if s == last:
                    v += 2
                if wins[s] == 0:
                    v -= 2
                sc[s] = v
        return sc, sw

    # State before game g is (x, g mod 4); the future depends only on it.
    seen = {}
    cums = [(0, 0, 0, 0, 0)]
    xs = []
    x = x0
    g = 0
    while True:
        if g == G:
            res = cums[G]
            fx = x
            break
        l = g & 3
        key = x * 4 + l
        if key in seen:
            hh = seen[key]
            p = g - hh
            rem = G - hh
            full, r = divmod(rem, p)
            A = cums[hh]
            B = cums[g]
            Cc = cums[hh + r]
            res = tuple(A[i] + full * (B[i] - A[i]) + (Cc[i] - A[i]) for i in range(5))
            fx = xs[hh + r]
            break
        seen[key] = g
        xs.append(x)
        hands0, T, nx = prep(x)
        sc, sw = play(hands0, T, l)
        pr = cums[-1]
        cums.append((pr[0] + sc[0], pr[1] + sc[1], pr[2] + sc[2], pr[3] + sc[3], pr[4] + sw))
        x = nx
        g += 1

    out = [res[0], res[1], res[2], res[3], res[4], fx]
    print(' '.join(map(str, out)))


main()
