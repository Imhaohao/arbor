import sys

def main():
    data = sys.stdin.read().split()
    a, c, m, x0, G = int(data[0]), int(data[1]), int(data[2]), int(data[3]), int(data[4])
    S = [k // 6 for k in range(24)]
    R = [k % 6 for k in range(24)]
    deal_cache = {}

    def get_deal(x):
        r = deal_cache.get(x)
        if r is not None:
            return r
        D = list(range(24))
        for i in range(23, 0, -1):
            x = (a * x + c) % m
            j = x % (i + 1)
            D[i], D[j] = D[j], D[i]
        r = (D, x)
        deal_cache[x if False else None] = None
        return r

    def play(D, leader):
        T = S[D[23]]
        hands = [D[6 * s:6 * s + 6] for s in range(4)]
        tricks = [0, 0, 0, 0]
        last = leader
        for t in range(6):
            h = hands[leader]
            bestc = -1
            bk = -1
            for cc in h:
                if S[cc] != T:
                    k = R[cc] * 4 + (3 - S[cc])
                    if k > bk:
                        bk = k
                        bestc = cc
            if bestc < 0:
                bestc = min(h)
            h.remove(bestc)
            led = S[bestc]
            best = bestc
            winner = leader
            for d in (1, 2, 3):
                p = (leader + d) & 3
                h = hands[p]
                bt = S[best] == T
                choice = -1
                ledc = [cc for cc in h if S[cc] == led]
                if ledc:
                    beat = -1
                    for cc in ledc:
                        if S[best] == led and cc > best and (beat < 0 or cc < beat):
                            beat = cc
                    if beat < 0 and led == T:
                        pass
                    if beat < 0 and not bt and led != S[best]:
                        pass
                    choice = beat if beat >= 0 else min(ledc)
                else:
                    tb = -1
                    for cc in h:
                        if S[cc] == T:
                            if (not bt) or cc > best:
                                if tb < 0 or cc < tb:
                                    tb = cc
                    if tb >= 0:
                        choice = tb
                    else:
                        lk = 100
                        for cc in h:
                            if S[cc] != T:
                                k = R[cc] * 4 + S[cc]
                                if k < lk:
                                    lk = k
                                    choice = cc
                        if choice < 0:
                            choice = min(h)
                h.remove(choice)
                # update best
                cs = S[choice]
                if (cs == T and S[best] != T) or (cs == S[best] and choice > best):
                    best = choice
                    winner = p
            tricks[winner] += 1
            leader = winner
            last = winner
        for s in range(4):
            if tricks[s] == 6:
                res = [0, 0, 0, 0, 1]
                res[s] = 20
                return res
        res = []
        for s in range(4):
            v = tricks[s]
            if s == last:
                v += 2
            if tricks[s] == 0:
                v -= 2
            res.append(v)
        res.append(0)
        return res

    dcache = {}
    seen = {}
    xs = []
    pref = [[0, 0, 0, 0, 0]]
    x = x0
    g = 0
    while True:
        if g == G:
            p = pref[g]
            print(p[0], p[1], p[2], p[3], p[4], x)
            return
        key = x * 4 + (g & 3)
        if key in seen:
            s = seen[key]
            Lc = g - s
            rem = G - g
            q, r = divmod(rem, Lc)
            pg = pref[g]
            ps = pref[s]
            psr = pref[s + r]
            out = [pg[i] + q * (pg[i] - ps[i]) + (psr[i] - ps[i]) for i in range(5)]
            xs.append(x)
            fx = xs[s + (G - s) % Lc]
            print(out[0], out[1], out[2], out[3], out[4], fx)
            return
        seen[key] = g
        xs.append(x)
        dd = dcache.get(x)
        if dd is None:
            D = list(range(24))
            y = x
            for i in range(23, 0, -1):
                y = (a * y + c) % m
                j = y % (i + 1)
                D[i], D[j] = D[j], D[i]
            dd = (D, y)
            dcache[x] = dd
        D, nx = dd
        res = play(D, g & 3)
        p = pref[g]
        pref.append([p[0] + res[0], p[1] + res[1], p[2] + res[2], p[3] + res[3], p[4] + res[4]])
        x = nx
        g += 1

main()
