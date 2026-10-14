import sys
from itertools import accumulate

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    r = [0] + list(map(int, data[1:n + 1]))
    adj = [[] for _ in range(n + 1)]
    base = n + 1
    for i in range(n - 1):
        u = int(data[base + 2 * i]); v = int(data[base + 2 * i + 1])
        adj[u].append(v); adj[v].append(u)
    if n == 1:
        print(0)
        return
    INF = 1 << 60
    removed = [False] * (n + 1)
    par = [0] * (n + 1)
    sz = [1] * (n + 1)
    depth = [0] * (n + 1)
    Mv = [INF] * (n + 1)
    saved = [0] * (n + 1)
    ans = [0] * (n + 1)

    order = [1]
    for v in order:
        pv = par[v]
        for w in adj[v]:
            if w != pv:
                par[w] = v
                order.append(w)
    for i in range(n - 1, 0, -1):
        v = order[i]
        sz[par[v]] += sz[v]

    tasks = [(1, n)]
    while tasks:
        root, tot = tasks.pop()
        c = root
        while True:
            pc = par[c]
            for w in adj[c]:
                if w != pc and not removed[w] and sz[w] * 2 > tot:
                    c = w
                    break
            else:
                break
        removed[c] = True
        if tot == 1:
            continue
        pc = par[c]
        szc = sz[c]
        children = []
        for w in adj[c]:
            if not removed[w]:
                if w == pc:
                    children.append((w, tot - szc))
                else:
                    children.append((w, sz[w]))

        P = [INF] * (tot + 1)
        rc = r[c]
        if rc < tot:
            P[rc] = rc
        Mv[c] = INF
        Wpc = [0] * (tot + 1); Wps = [0] * (tot + 1)
        Wbc = [0] * (tot + 1); Wbs = [0] * (tot + 1)
        Wpc[0] = 1
        wmax = 0
        groups = []
        for ch, s in children:
            par[ch] = c
            depth[ch] = 1
            L = s + 1
            spc = [0] * L; sps = [0] * L; sbc = [0] * L; sbs = [0] * L
            grp = []
            st = [ch]
            maxd = 1
            while st:
                v = st.pop()
                if v < 0:
                    v = ~v
                    P[depth[v] + r[v]] = saved[v]
                    continue
                d = depth[v]
                pv = par[v]
                m = Mv[pv]
                p = P[d - 1]
                if p < m:
                    m = p
                Mv[v] = m
                grp.append(v)
                sz[v] = 1
                if m == INF:
                    spc[d] += 1; sps[d] += d
                elif m >= 0:
                    sbc[m] += 1; sbs[m] += d
                rv = r[v]
                t = d + rv
                if t < tot:
                    nv = rv - d
                    old = P[t]
                    if nv < old:
                        saved[v] = old
                        P[t] = nv
                        st.append(~v)
                d1 = d + 1
                for w in adj[v]:
                    if w != pv and not removed[w]:
                        par[w] = v
                        depth[w] = d1
                        st.append(w)
                if d > maxd:
                    maxd = d
            L = maxd + 1
            for i in range(L):
                Wpc[i] += spc[i]; Wps[i] += sps[i]
                Wbc[i] += sbc[i]; Wbs[i] += sbs[i]
            spc = list(accumulate(spc[:L]))
            sps = list(accumulate(sps[:L]))
            sbc = list(accumulate(reversed(sbc[:L])))[::-1]
            sbs = list(accumulate(reversed(sbs[:L])))[::-1]
            if maxd > wmax:
                wmax = maxd
            groups.append((ch, grp, spc, sps, sbc, sbs, L))

        WL = wmax + 1
        Wpc = list(accumulate(Wpc[:WL]))
        Wps = list(accumulate(Wps[:WL]))
        Wbc = list(accumulate(reversed(Wbc[:WL])))[::-1]
        Wbs = list(accumulate(reversed(Wbs[:WL])))[::-1]
        WG = Wpc[wmax]
        WS = Wps[wmax]
        ans[c] += WS + Wbs[0]

        for ch, grp, spc, sps, sbc, sbs, L in groups:
            sG = spc[L - 1]
            sS = sps[L - 1]
            for idx in range(len(grp) - 1, -1, -1):
                v = grp[idx]
                d = depth[v]
                m = Mv[v]
                if m == INF:
                    ans[v] += (WG - sG) * d + WS - sS + (Wbc[d] - sbc[d]) * d + Wbs[d] - sbs[d]
                elif m >= 0:
                    ans[v] += (Wpc[m] - spc[m]) * d + Wps[m] - sps[m]
                sz[par[v]] += sz[v]
            tasks.append((ch, len(grp)))

    sys.stdout.write(' '.join(map(str, ans[1:])) + '\n')

main()
