import sys
from bisect import bisect_left, bisect_right


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    q = int(data[1])
    r = [0] * (n + 1)
    for i in range(n):
        r[i + 1] = int(data[2 + i])
    adj = [[] for _ in range(n + 1)]
    p = 2 + n
    for _ in range(n - 1):
        a = int(data[p])
        b = int(data[p + 1])
        w = int(data[p + 2])
        p += 3
        adj[a].append((b, w))
        adj[b].append((a, w))

    parent = [0] * (n + 1)
    dep = [0] * (n + 1)
    lvl = [0] * (n + 1)
    tin = [0] * (n + 1)
    order = []
    stack = [1]
    while stack:
        x = stack.pop()
        tin[x] = len(order)
        order.append(x)
        px = parent[x]
        dx = dep[x]
        lx = lvl[x] + 1
        for y, w in adj[x]:
            if y != px:
                parent[y] = x
                dep[y] = dx + w
                lvl[y] = lx
                stack.append(y)

    key = [dep[x] - r[x] for x in range(n + 1)]

    topl = [0] * (n + 1)
    nxt = [0] * (n + 1)
    sdep = [0] * (n + 1)
    LK = [0] * (n + 2)
    LI = [0] * (n + 2)
    LN = [0] * (n + 2)
    undo = [None] * (n + 1)
    sz = 0
    cur = -1
    for x in order:
        l = lvl[x]
        while cur >= l:
            j, ok, oi, on, osz = undo[cur]
            LK[j] = ok
            LI[j] = oi
            LN[j] = on
            sz = osz
            cur -= 1
        cur = l
        sdep[l] = dep[x]
        k = key[x]
        i = bisect_left(sdep, k, 0, l + 1)
        topl[x] = i
        j = bisect_right(LK, k, 0, sz)
        undo[l] = (j, LK[j], LI[j], LN[j], sz)
        LK[j] = k
        LI[j] = l
        LN[j] = x
        sz = j + 1
        nxt[x] = LN[bisect_left(LI, i, 0, sz)]

    M = n + 1
    base = [lvl[order[i]] * M + parent[order[i]] for i in range(n)]
    sp = [base]
    j = 1
    while (1 << j) <= n:
        prev = sp[-1]
        half = 1 << (j - 1)
        sp.append([a if a < b else b for a, b in zip(prev, prev[half:])])
        j += 1

    ev = [[] for _ in range(n + 1)]
    qu = [0] * q
    qv = [0] * q
    Ls = [0] * q
    for i in range(q):
        u = int(data[p])
        v = int(data[p + 1])
        p += 2
        qu[i] = u
        qv[i] = v
        if u == v:
            L = u
        else:
            lo = tin[u]
            hi = tin[v]
            if lo > hi:
                lo, hi = hi, lo
            jj = (hi - lo).bit_length() - 1
            row = sp[jj]
            m1 = row[lo + 1]
            m2 = row[hi - (1 << jj) + 1]
            L = (m1 if m1 < m2 else m2) % M
        Ls[i] = L
        if u != L:
            ev[u].append(2 * i)
        if v != L:
            ev[v].append(2 * i + 1)

    children = [[] for _ in range(n + 1)]
    stack = []
    for x in range(1, n + 1):
        y = nxt[x]
        if y == x:
            stack.append(x)
        else:
            children[y].append(x)

    cnt = [0] * (2 * q)
    S = [0] * (2 * q)
    topP = [0] * (2 * q)
    hl = [0] * (n + 1)
    TL = [0] * (n + 2)
    CS = [0] * (n + 2)
    while stack:
        x = stack.pop()
        h = hl[x]
        CS[h] = x
        TL[h] = topl[x]
        h1 = h + 1
        for y in children[x]:
            hl[y] = h1
            stack.append(y)
        for e in ev[x]:
            L = Ls[e >> 1]
            hh = bisect_right(TL, lvl[L], 0, h1) - 1
            if hh < 0:
                cnt[e] = -1
                continue
            jst = h - hh
            cnt[e] = jst + 1
            S[e] = dep[L] - key[CS[hh]]
            topP[e] = lvl[x] if jst == 0 else TL[hh + 1]

    ev2 = [[] for _ in range(n + 1)]
    any2 = False
    for i in range(q):
        if cnt[2 * i] > 0 and cnt[2 * i + 1] > 0:
            ev2[qu[i]].append(2 * i)
            ev2[qv[i]].append(2 * i + 1)
            any2 = True

    feas = [False] * q
    if any2:
        INF = 1 << 60
        maxlvl = max(lvl)
        K = (maxlvl + 1).bit_length() - 1
        keyz = key[:]
        keyz[0] = INF
        mn = [keyz]
        up = parent[:]
        for _ in range(K):
            pm = mn[-1]
            sh = [pm[u] for u in up]
            mn.append([a if a < b else b for a, b in zip(pm, sh)])
            up = [up[u] for u in up]
        st = [0] * (n + 1)
        for x in order:
            l = lvl[x]
            sdep[l] = dep[x]
            st[l] = x
            e2 = ev2[x]
            if not e2:
                continue
            for e in e2:
                i = e >> 1
                if feas[i]:
                    continue
                dl = dep[Ls[i]]
                D = dl + S[e ^ 1]
                cl = bisect_right(sdep, D, 0, l + 1) - 1
                lt = topP[e]
                if cl >= lt:
                    jj = (cl - lt + 1).bit_length() - 1
                    row = mn[jj]
                    if row[st[cl]] <= dl or row[st[lt + (1 << jj) - 1]] <= dl:
                        feas[i] = True

    out = []
    for i in range(q):
        L = Ls[i]
        cu = 0 if qu[i] == L else cnt[2 * i]
        cd = 0 if qv[i] == L else cnt[2 * i + 1]
        if cu < 0 or cd < 0:
            out.append(-1)
            continue
        ans = cu + cd
        if cu > 0 and cd > 0 and feas[i]:
            ans -= 1
        out.append(ans)
    sys.stdout.write("\n".join(map(str, out)) + "\n")


main()
