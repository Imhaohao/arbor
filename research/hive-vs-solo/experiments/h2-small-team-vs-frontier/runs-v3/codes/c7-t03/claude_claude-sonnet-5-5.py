import sys
from itertools import accumulate


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    r = [0] * (n + 1)
    for i in range(n):
        r[i + 1] = int(data[1 + i])
    if n == 1:
        print(0)
        return
    adj = [[] for _ in range(n + 1)]
    idx = n + 1
    for _ in range(n - 1):
        u = int(data[idx])
        v = int(data[idx + 1])
        idx += 2
        adj[u].append(v)
        adj[v].append(u)

    INF = 1 << 30
    ans = [0] * (n + 1)
    par = [0] * (n + 1)
    dep = [0] * (n + 1)
    cap = [INF] * (n + 1)
    sz = [1] * (n + 1)
    removed = bytearray(n + 1)
    best = [INF] * (2 * n + 5)
    sk = [0] * (n + 2)
    so = [0] * (n + 2)

    def find_centroid(v, total):
        while True:
            pv = par[v]
            for w in adj[v]:
                if w != pv and not removed[w] and sz[w] * 2 > total:
                    v = w
                    break
            else:
                return v

    def agg(V, P, C, sign):
        D = max(P)
        gcnt = [0] * (D + 1)
        bcnt = [0] * (D + 2)
        bsq = [0] * (D + 2)
        for p, cp in zip(P, C):
            if cp == INF:
                gcnt[p] += 1
            else:
                cp += 1
                bcnt[cp] += 1
                bsq[cp] += p
        PCs = [0]
        PCs += accumulate(gcnt)
        PSs = [0]
        PSs += accumulate(q * g for q, g in enumerate(gcnt))
        G = PCs[D + 1]
        GS = PSs[D + 1]
        SC = list(accumulate(reversed(bcnt)))
        SC.reverse()
        SQ = list(accumulate(reversed(bsq)))
        SQ.reverse()
        goodres = [(G + SC[p + 1]) * p + GS + SQ[p + 1] for p in range(D + 1)]
        if sign < 0:
            goodres = [-x for x in goodres]
            PCs = [-x for x in PCs]
            PSs = [-x for x in PSs]
        for v, p, cp in zip(V, P, C):
            if cp == INF:
                ans[v] += goodres[p]
            else:
                cp += 1
                ans[v] += PCs[cp] * p + PSs[cp]

    order = [1]
    par[1] = 0
    for v in order:
        pv = par[v]
        for w in adj[v]:
            if w != pv:
                par[w] = v
                order.append(w)
    for i in range(n - 1, 0, -1):
        v = order[i]
        sz[par[v]] += sz[v]

    work = [(find_centroid(1, n), n)]
    dep_get = dep.__getitem__
    cap_get = cap.__getitem__
    while work:
        c, total = work.pop()
        if total == 1:
            removed[c] = 1
            continue
        if total == 2:
            for w in adj[c]:
                if not removed[w]:
                    ans[c] += 1
                    ans[w] += 1
            removed[c] = 1
            continue

        order = []
        stack = [c]
        par[c] = 0
        dep[c] = 0
        cap[c] = INF
        top = 0
        while stack:
            v = stack.pop()
            s = dep[v]
            while top > s:
                top -= 1
                best[sk[top]] = so[top]
            if s:
                cp = cap[par[v]]
                b = best[s - 1]
                cap[v] = cp if cp < b else b
            k = r[v] + s
            bk = best[k]
            sk[s] = k
            so[s] = bk
            top = s + 1
            val = r[v] - s
            if val < 0:
                val = -1
            if val < bk:
                best[k] = val
            order.append(v)
            sz[v] = 1
            pv = par[v]
            s1 = s + 1
            for w in adj[v]:
                if w != pv and not removed[w]:
                    par[w] = v
                    dep[w] = s1
                    stack.append(w)
        while top:
            top -= 1
            best[sk[top]] = so[top]

        for i in range(len(order) - 1, 0, -1):
            v = order[i]
            sz[par[v]] += sz[v]

        P = list(map(dep_get, order))
        C = list(map(cap_get, order))
        agg(order, P, C, 1)
        children = [w for w in adj[c] if not removed[w]]
        a = 1
        for w in reversed(children):
            b = a + sz[w]
            if b - a > 1:
                agg(order[a:b], P[a:b], C[a:b], -1)
            else:
                # single node subtree: its own self-pair cancels; nothing to subtract
                # except the formula value for the lone node, handle uniformly
                agg(order[a:b], P[a:b], C[a:b], -1)
            a = b
        removed[c] = 1
        for w in children:
            sw = sz[w]
            if sw > 1:
                work.append((find_centroid(w, sw), sw))

    sys.stdout.write(' '.join(map(str, ans[1:])) + '\n')


main()
