import sys, heapq

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); q = int(data[1])
    sb = data[2]
    ms = data[3].decode()

    # suffix array
    rank = [c - 96 for c in sb]
    sa = list(range(n))
    if n == 1:
        rank = [0]
    else:
        M = n + 30
        k = 1
        while True:
            key = [a * M + b + 1 for a, b in zip(rank, rank[k:])] + [a * M for a in rank[n - k:]]
            sa.sort(key=key.__getitem__)
            nr = [0] * n
            c = 0
            prev = key[sa[0]]
            for i in sa:
                kk = key[i]
                if kk != prev:
                    c += 1
                    prev = kk
                nr[i] = c
            rank = nr
            if c == n - 1:
                break
            k <<= 1
    rk = rank

    lcp = [0] * n
    h = 0
    for i in range(n):
        r = rk[i]
        if r > 0:
            j = sa[r - 1]
            while i + h < n and j + h < n and sb[i + h] == sb[j + h]:
                h += 1
            lcp[r] = h
            if h:
                h -= 1
        else:
            h = 0

    # internal node tree
    depthN = [0]; par = [-1]; stack = [0]; nodeof = [0] * n
    for i in range(1, n):
        h = lcp[i]; last = -1
        while depthN[stack[-1]] > h:
            last = stack.pop()
            if depthN[stack[-1]] >= h:
                par[last] = stack[-1]
        if depthN[stack[-1]] < h:
            v = len(depthN); depthN.append(h); par.append(-1); stack.append(v)
            if last >= 0:
                par[last] = v
        nodeof[i] = stack[-1]
    while len(stack) > 1:
        last = stack.pop(); par[last] = stack[-1]
    N = len(depthN)
    lenN = [0] * N
    children = [[] for _ in range(N)]
    for v in range(1, N):
        lenN[v] = depthN[v] - depthN[par[v]]
        children[par[v]].append(v)
    order = [0]
    for v in order:
        order.extend(children[v])
    size = [1] * N
    heavy = [-1] * N
    for v in reversed(order):
        best = 0
        for ch in children[v]:
            size[v] += size[ch]
            if size[ch] > best:
                best = size[ch]; heavy[v] = ch

    F = 32
    LOW = (1 << F) - 1
    MASK = (1 << (5 * F)) - 1
    SH1 = [0, F, 2 * F, 3 * F, 4 * F]
    SH2 = [0, 4 * F, 3 * F, 2 * F, F]

    # sparse table
    MK = N + 1
    t0 = [lcp[i] * MK + nodeof[i] for i in range(n)]
    sp = [t0]
    j = 1
    while (1 << j) <= n:
        prev = sp[-1]; hh = 1 << (j - 1)
        sp.append(list(map(min, prev[:len(prev) - hh], prev[hh:])))
        j += 1

    def qkey(u, v):
        l = u + 1
        jj = (v - l + 1).bit_length() - 1
        row = sp[jj]
        a = row[l]; b = row[v - (1 << jj) + 1]
        return a if a < b else b

    mk = [0] * n
    for pos in range(n):
        mk[rk[pos]] = ord(ms[pos]) - 48

    leafLen = 0
    for i in range(n):
        d = n - sa[i]
        left = lcp[i] if i >= 1 else 0
        right = lcp[i + 1] if i + 1 < n else 0
        leafLen += d - (left if left > right else right)
    totalDistinct = n * (n + 1) // 2 - sum(lcp[1:])

    actives = [r for r in range(n) if mk[r]]
    Sv = [0] * N
    tlist = []; tpred = []
    for jx in range(1, len(actives)):
        a0 = actives[jx - 1]; a1 = actives[jx]
        if mk[a0] != mk[a1]:
            tlist.append(a1); tpred.append(a0)
            Sv[qkey(a0, a1) % MK] += 1
    for jx in range(len(tlist) - 1):
        if mk[tpred[jx]] == mk[tlist[jx + 1]]:
            Sv[qkey(tpred[jx], tlist[jx + 1]) % MK] += 2
    for v in reversed(order):
        if par[v] >= 0:
            Sv[par[v]] += Sv[v]

    U = 0
    for r in actives:
        U += n - sa[r]
    for jx in range(1, len(actives)):
        U -= qkey(actives[jx - 1], actives[jx]) // MK

    act = 0
    if actives:
        bits = ['0'] * n
        for r in actives:
            bits[r] = '1'
        act = int(''.join(bits)[::-1], 2)
    tr = 0
    if tlist:
        bits = ['0'] * n
        for r in tlist:
            bits[r] = '1'
        tr = int(''.join(bits)[::-1], 2)

    # HLD chains
    chain_of = [0] * N; cpos = [0] * N
    cbase = []; csz = []; hpar = []; hdepth = []
    total = 0
    V = []
    for v in order:
        if v == 0 or heavy[par[v]] != v:
            c = len(cbase)
            nodes = []
            u = v; jj = 0
            while u != -1:
                chain_of[u] = c; cpos[u] = jj; jj += 1; nodes.append(u); u = heavy[u]
            sz = 1
            while sz < jj:
                sz <<= 1
            cbase.append(total); csz.append(sz); hpar.append(par[v]); hdepth.append(depthN[v])
            seg = [0] * (2 * sz)
            for idx, u in enumerate(nodes):
                seg[sz + idx] = lenN[u] << (F * (Sv[u] % 5))
            for kk in range(sz - 1, 0, -1):
                seg[kk] = seg[2 * kk] + seg[2 * kk + 1]
            V.extend(seg)
            total += 2 * sz
    Tg = [0] * total
    Z = 0
    for c in range(len(cbase)):
        Z += V[cbase[c] + 1] & LOW

    def pred(bs, x):
        return (bs & ((1 << x) - 1)).bit_length() - 1

    def succ(bs, x):
        m = bs >> (x + 1)
        if not m:
            return -1
        return x + (m & -m).bit_length()

    def wev(r, P, S, a, pa, b):
        ev = []
        lst = []; prs = []
        if a >= 0:
            lst.append(a); prs.append(pa)
        mr = mk[r]
        if mr and P >= 0 and mk[P] != mr:
            ev.append((P, r, 1)); lst.append(r); prs.append(P)
        if S >= 0:
            ps = r if mr else P
            if ps >= 0 and mk[ps] != mk[S]:
                ev.append((ps, S, 1)); lst.append(S); prs.append(ps)
        if b >= 0:
            lst.append(b); prs.append(-1)
        for jx in range(len(lst) - 1):
            pp = prs[jx]; t2 = lst[jx + 1]
            if mk[pp] == mk[t2]:
                ev.append((pp, t2, 2))
        return ev

    heappush = heapq.heappush; heappop = heapq.heappop
    out = []
    idx = 4
    for _ in range(q):
        p = int(data[idx]) - 1; cnew = int(data[idx + 1]); idx += 2
        r = rk[p]
        oldm = mk[r]
        P = pred(act, r); S = succ(act, r)
        a = pred(tr, r)
        pa = pred(act, a) if a >= 0 else -1
        b = succ(tr, S) if S >= 0 else -1
        old_ev = wev(r, P, S, a, pa, b)
        oldTr_r = 1 if (oldm and P >= 0 and mk[P] != oldm) else 0
        oldTr_S = 0
        if S >= 0:
            ps = r if oldm else P
            oldTr_S = 1 if (ps >= 0 and mk[ps] != mk[S]) else 0
        mk[r] = cnew
        wasact = oldm != 0; nowact = cnew != 0
        if wasact != nowact:
            act ^= 1 << r
            dU = n - sa[r]
            if P >= 0:
                dU -= qkey(P, r) // MK
            if S >= 0:
                dU -= qkey(r, S) // MK
            if P >= 0 and S >= 0:
                dU += qkey(P, S) // MK
            if nowact:
                U += dU
            else:
                U -= dU
        newTr_r = 1 if (cnew and P >= 0 and mk[P] != cnew) else 0
        if newTr_r != oldTr_r:
            tr ^= 1 << r
        if S >= 0:
            ps = r if cnew else P
            newTr_S = 1 if (ps >= 0 and mk[ps] != mk[S]) else 0
            if newTr_S != oldTr_S:
                tr ^= 1 << S
        new_ev = wev(r, P, S, a, pa, b)
        dd = {}
        for u, v, w in old_ev:
            nd = qkey(u, v) % MK
            dd[nd] = dd.get(nd, 0) - w
        for u, v, w in new_ev:
            nd = qkey(u, v) % MK
            dd[nd] = dd.get(nd, 0) + w
        pend = {}
        heap = []
        for node, d in dd.items():
            d %= 5
            if d == 0:
                continue
            c = chain_of[node]
            pc = pend.get(c)
            if pc is None:
                pc = {}; pend[c] = pc; heappush(heap, (-hdepth[c], c))
            pos = cpos[node]
            pc[pos] = (pc.get(pos, 0) + d) % 5
        while heap:
            _, c = heappop(heap)
            pc = pend.pop(c)
            base = cbase[c]; sz = csz[c]
            root = base + 1
            oldlow = V[root] & LOW
            tot = 0
            for pos, d in pc.items():
                if d == 0:
                    continue
                tot += d
                s1 = SH1[d]; s2 = SH2[d]
                if sz == 1:
                    x = V[root]
                    V[root] = ((x << s1) & MASK) | (x >> s2)
                    continue
                l = sz; rr = sz + pos + 1
                while l < rr:
                    if l & 1:
                        i = base + l; x = V[i]
                        V[i] = ((x << s1) & MASK) | (x >> s2)
                        Tg[i] = (Tg[i] + d) % 5
                        l += 1
                    if rr & 1:
                        rr -= 1
                        i = base + rr; x = V[i]
                        V[i] = ((x << s1) & MASK) | (x >> s2)
                        Tg[i] = (Tg[i] + d) % 5
                    l >>= 1; rr >>= 1
                kk = (sz + pos) >> 1
                while kk:
                    i = base + kk
                    x = V[base + 2 * kk] + V[base + 2 * kk + 1]
                    t = Tg[i]
                    if t:
                        x = ((x << SH1[t]) & MASK) | (x >> SH2[t])
                    V[i] = x
                    kk >>= 1
            Z += (V[root] & LOW) - oldlow
            tot %= 5
            if tot:
                u = hpar[c]
                if u >= 0:
                    c2 = chain_of[u]
                    pc2 = pend.get(c2)
                    if pc2 is None:
                        pc2 = {}; pend[c2] = pc2; heappush(heap, (-hdepth[c2], c2))
                    pos2 = cpos[u]
                    pc2[pos2] = (pc2.get(pos2, 0) + tot) % 5
        out.append(Z + leafLen - (totalDistinct - U))
    sys.stdout.write('\n'.join(map(str, out)) + ('\n' if out else ''))

main()
