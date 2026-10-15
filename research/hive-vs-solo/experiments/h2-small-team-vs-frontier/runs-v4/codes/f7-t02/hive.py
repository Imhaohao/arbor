import sys
import numpy as np
from bisect import bisect_left, bisect_right, insort


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    q = int(data[1])
    sb = data[2]
    mstr = data[3]
    upd = data[4:4 + 2 * q]

    rank = np.frombuffer(sb, dtype=np.uint8).astype(np.int64) - 97
    base = max(n, 26) + 2
    k = 1
    while True:
        r2 = np.zeros(n, dtype=np.int64)
        if k < n:
            r2[:n - k] = rank[k:] + 1
        key = rank * base + r2
        sa_np = np.argsort(key, kind='stable')
        ks = key[sa_np]
        nr = np.zeros(n, dtype=np.int64)
        if n > 1:
            nr[1:] = np.cumsum(ks[1:] != ks[:-1])
        rank = np.empty(n, dtype=np.int64)
        rank[sa_np] = nr
        if nr[-1] == n - 1:
            break
        k <<= 1
    sa = sa_np.tolist()
    rk = rank.tolist()

    L = [0] * (n + 1)
    h = 0
    for i in range(n):
        r = rk[i]
        if r > 0:
            j = sa[r - 1]
            while i + h < n and j + h < n and sb[i + h] == sb[j + h]:
                h += 1
            L[r] = h
            if h:
                h -= 1
        else:
            h = 0

    idepth = [0]
    il = [0]
    ir = [n - 1]
    nodeOf_c = [0] * (n + 1)
    stack = [0]
    for j in range(1, n):
        cur = L[j]
        lb = j - 1
        while cur < idepth[stack[-1]]:
            top = stack.pop()
            ir[top] = j - 1
            lb = il[top]
        if cur > idepth[stack[-1]]:
            idepth.append(cur)
            il.append(lb)
            ir.append(n - 1)
            stack.append(len(idepth) - 1)
        nodeOf_c[j] = stack[-1]
    m = len(idepth)
    parc = [0] * m
    for c in range(1, m):
        l = il[c]
        r = ir[c]
        left = L[l] if l > 0 else -1
        right = L[r + 1] if r + 1 < n else -1
        if left < 0 and right < 0:
            parc[c] = 0
        elif left >= right:
            parc[c] = nodeOf_c[l]
        else:
            parc[c] = nodeOf_c[r + 1]

    order = sorted(range(m), key=idepth.__getitem__)
    newid = [0] * m
    for k_, c in enumerate(order):
        newid[c] = k_
    N = m + n
    S = N
    par = [S] * (N + 1)
    sd = [0] * N
    for c in range(m):
        v = newid[c]
        sd[v] = idepth[c]
        if c:
            par[v] = newid[parc[c]]
    for j in range(n):
        v = m + j
        sd[v] = n - sa[j]
        if n == 1:
            pc = 0
        else:
            lj = L[j] if j > 0 else -1
            rj = L[j + 1] if j + 1 < n else -1
            pc = nodeOf_c[j] if lj >= rj else nodeOf_c[j + 1]
        par[v] = newid[pc]
    nodeOf = [0] * (n + 1)
    for j in range(1, n):
        nodeOf[j] = newid[nodeOf_c[j]]
    wt = [0] * N
    for v in range(1, N):
        wt[v] = sd[v] - sd[par[v]]

    dep = [0] * (N + 1)
    for v in range(1, N):
        dep[v] = dep[par[v]] + 1
    size = [1] * (N + 1)
    for v in range(N - 1, 0, -1):
        size[par[v]] += size[v]
    heavy = [-1] * (N + 1)
    for v in range(1, N):
        p = par[v]
        hv = heavy[p]
        if hv < 0 or size[v] > size[hv]:
            heavy[p] = v
    head = [0] * (N + 1)
    pos = [0] * (N + 1)
    head[S] = S
    pos[S] = -1
    cnt = 0
    for v in range(N):
        if v == 0 or heavy[par[v]] != v:
            u = v
            while u != -1:
                head[u] = v
                pos[u] = cnt
                cnt += 1
                u = heavy[u]

    # sparse table for lca of two leaves
    key0 = np.array(L[:n], dtype=np.int64) * 65536 + np.arange(n, dtype=np.int64)
    key0[0] = 1 << 60
    levels = [key0]
    k = 1
    while (1 << k) <= n - 1:
        prev = levels[-1]
        half = 1 << (k - 1)
        levels.append(np.minimum(prev[:-half], prev[half:]))
        k += 1
    sp = [lv.tolist() for lv in levels]

    def lca(a, b):
        ln = b - a
        kk = ln.bit_length() - 1
        row = sp[kk]
        x = row[a + 1]
        y = row[b - (1 << kk) + 1]
        if y < x:
            x = y
        return nodeOf[x & 65535]

    MK = [0] * n
    for p in range(n):
        MK[rk[p]] = mstr[p] - 48
    ACT = [j for j in range(n) if MK[j]]
    rst = []
    ren = []
    rmk = []
    for e in ACT:
        mk = MK[e]
        if rmk and rmk[-1] == mk:
            ren[-1] = e
        else:
            rst.append(e)
            ren.append(e)
            rmk.append(mk)
    RS = rst[:]

    val = [0] * N
    R = len(rst)
    for t in range(R - 1):
        val[lca(ren[t], rst[t + 1])] += 1
    for t in range(R - 2):
        if rmk[t] == rmk[t + 2]:
            val[lca(ren[t], rst[t + 2])] += 2
    cntl = [0] * N
    for e in ACT:
        cntl[m + e] = 1
    for v in range(N - 1, 0, -1):
        p = par[v]
        val[p] += val[v]
        cntl[p] += cntl[v]

    st = bytearray(N)
    Wl = [0] * N
    ans = 0
    for v in range(N):
        s_ = (val[v] + (1 if cntl[v] else 0)) % 5
        st[pos[v]] = s_
        Wl[pos[v]] = wt[v]
        if s_ == 1:
            ans += wt[v]
    Wnp = np.array(Wl, dtype=np.float64)
    stnp = np.frombuffer(st, dtype=np.uint8)
    ROT = [tuple((s_ + d) % 5 for s_ in range(5)) for d in range(5)]
    TAB = [np.array(ROT[d], dtype=np.uint8) for d in range(5)]
    THR = 64

    def shift(lo, hi, d):
        nonlocal ans
        if hi - lo < THR:
            rot = ROT[d]
            for kk in range(lo, hi + 1):
                s_ = st[kk]
                ns = rot[s_]
                st[kk] = ns
                if s_ == 1:
                    ans -= Wl[kk]
                elif ns == 1:
                    ans += Wl[kk]
        else:
            seg = stnp[lo:hi + 1]
            sums = np.bincount(seg, weights=Wnp[lo:hi + 1], minlength=5)
            ans += int(sums[(1 - d) % 5]) - int(sums[1])
            seg[:] = TAB[d][seg]

    def apply_path(a, b, d):
        hb = head[b]
        while a != b:
            hh = head[a]
            if hh == hb:
                shift(pos[b] + 1, pos[a], d)
                return
            shift(pos[hh], pos[a], d)
            a = par[hh]

    def local_items(i):
        m_ = len(RS)
        u = bisect_right(RS, i) - 1
        if u < 0:
            return ()
        t0 = u - 2 if u >= 2 else 0
        t1 = u + 2 if u + 2 < m_ else m_ - 1
        sts = []
        ens = []
        mks = []
        for t in range(t0, t1 + 1):
            s0 = RS[t]
            if t + 1 < m_:
                e0 = ACT[bisect_left(ACT, RS[t + 1]) - 1]
            else:
                e0 = ACT[-1]
            sts.append(s0)
            ens.append(e0)
            mks.append(MK[s0])
        res = []
        w = len(sts)
        for j in range(w - 1):
            lo = ens[j]
            hi = sts[j + 1]
            if lo <= i <= hi:
                res.append((lca(lo, hi), 1))
        for j in range(w - 2):
            if mks[j] == mks[j + 2]:
                lo = ens[j]
                hi = sts[j + 2]
                if lo <= i <= hi:
                    res.append((lca(lo, hi), 2))
        return res

    def fix(e, pe):
        want = pe == -1 or MK[pe] != MK[e]
        idx = bisect_left(RS, e)
        present = idx < len(RS) and RS[idx] == e
        if want:
            if not present:
                RS.insert(idx, e)
        elif present:
            del RS[idx]

    def change(i, c):
        co = MK[i]
        old_items = local_items(i)
        if co == 0:
            insort(ACT, i)
        elif c == 0:
            del ACT[bisect_left(ACT, i)]
        MK[i] = c
        p = bisect_left(ACT, i)
        pred = ACT[p - 1] if p > 0 else -1
        nx = p + 1 if c else p
        succ = ACT[nx] if nx < len(ACT) else -1
        if c:
            fix(i, pred)
            if succ != -1:
                fix(succ, i)
        else:
            idx = bisect_left(RS, i)
            if idx < len(RS) and RS[idx] == i:
                del RS[idx]
            if succ != -1:
                fix(succ, pred)
        new_items = local_items(i)
        agg = {}
        for v, w in old_items:
            agg[v] = agg.get(v, 0) - w
        for v, w in new_items:
            agg[v] = agg.get(v, 0) + w
        if co == 0 or c == 0:
            sign = 1 if co == 0 else -1
            leaf = m + i
            agg[leaf] = agg.get(leaf, 0) + sign
            D = -1
            if pred != -1:
                D = lca(pred, i)
            if succ != -1:
                B = lca(i, succ)
                if D == -1 or dep[B] > dep[D]:
                    D = B
            if D != -1:
                agg[D] = agg.get(D, 0) - sign
        entries = sorted([(dep[v], v, w) for v, w in agg.items() if w % 5], reverse=True)
        ne = len(entries)
        cum = 0
        for t in range(ne):
            e = entries[t]
            cum += e[2]
            d = cum % 5
            if d:
                nxt = entries[t + 1][1] if t + 1 < ne else S
                apply_path(e[1], nxt, d)

    out = []
    for t in range(q):
        p = int(upd[2 * t]) - 1
        c = int(upd[2 * t + 1])
        i = rk[p]
        if MK[i] != c:
            change(i, c)
        out.append(ans)
    sys.stdout.write("\n".join(map(str, out)) + "\n")


main()
