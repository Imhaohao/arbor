import sys
from bisect import bisect_right

def build_sa(s):
    n = len(s)
    sa = sorted(range(n), key=s.__getitem__)
    rank = [0] * n
    r = 0
    prev = s[sa[0]]
    for i in sa:
        v = s[i]
        if v != prev:
            r += 1; prev = v
        rank[i] = r
    k = 1
    N1 = n + 1
    while r < n - 1:
        rk = rank
        key = [rk[i] * N1 + rk[i + k] + 1 for i in range(n - k)]
        key += [rk[i] * N1 for i in range(n - k, n)]
        sa.sort(key=key.__getitem__)
        rank = [0] * n
        r = 0
        prev = key[sa[0]]
        for i in sa:
            v = key[i]
            if v != prev:
                r += 1; prev = v
            rank[i] = r
        k <<= 1
    return sa, rank

def build_sp(sb, sa, rank):
    n = len(sb)
    lcp = [0] * n
    h = 0
    for i in range(n):
        ri = rank[i]
        if ri:
            j = sa[ri - 1]
            while i + h < n and j + h < n and sb[i + h] == sb[j + h]:
                h += 1
            lcp[ri] = h
            if h:
                h -= 1
        else:
            h = 0
    sp = [lcp]
    j = 1
    while (1 << j) <= n:
        prev = sp[-1]
        sp.append(list(map(min, prev, prev[1 << (j - 1):])))
        j += 1
    return sp

def find_runs(S, n):
    sa, rk = build_sa(list(S)); sp = build_sp(S, sa, rk)
    SR = S[::-1]
    saR, rkR = build_sa(list(SR)); spR = build_sp(SR, saR, rkR)
    LOG = [0] * (n + 1)
    for i in range(2, n + 1):
        LOG[i] = LOG[i >> 1] + 1
    runs = {}
    for d in range(1, n // 2 + 1):
        x = 0
        while x + d < n:
            y = x + d
            a = rk[x]; c = rk[y]
            if a > c:
                a, c = c, a
            k = LOG[c - a]; t = sp[k]
            f = t[a + 1]; v = t[c - (1 << k) + 1]
            if v < f:
                f = v
            if x and f + x >= d:
                a = rkR[n - x]; c = rkR[n - y]
                if a > c:
                    a, c = c, a
                k = LOG[c - a]; t = spR[k]
                g = t[a + 1]; v = t[c - (1 << k) + 1]
                if v < g:
                    g = v
            else:
                g = 0
            if f + g >= d:
                st = x - g; en = y + f - 1
                key = st * n + en
                if key not in runs:
                    runs[key] = d
                nx = ((en - d) // d + 1) * d
                x = nx if nx > x else x + d
            else:
                x += d
    return sorted((key // n, key % n, d) for key, d in runs.items())

def build_structs(runs):
    structs = []
    for i, j, d in runs:
        Kf = j - i + 1 - 3 * d
        if Kf >= 1:
            structs.append((i, j, d, 3 * d, Kf))
    starts = [r[0] for r in runs]
    for i1, j1, d1 in runs:
        lim = j1 - d1
        if lim <= i1:
            continue
        s_idx = bisect_right(starts, i1)
        e_idx = bisect_right(starts, lim)
        for t in range(s_idx, e_idx):
            i2, j2, d2 = runs[t]
            if j2 <= j1:
                continue
            lo = i2 if i2 > i1 + d1 else i1 + d1
            hi = j1 if j1 < j2 - d2 else j2 - d2
            Mx = d1 if d1 > d2 else d2
            Kf = hi - lo + 1 - Mx
            if Kf >= 1:
                structs.append((lo - d1, hi + d2, d1 + d2 - Mx, d1 + d2 + Mx, Kf))
    return structs

def compute_full(structs, queries, q):
    maxc = 0
    for st in structs:
        c = st[2] if st[2] < st[4] else st[4]
        if c > maxc:
            maxc = c
    full = [0] * q
    subs = []
    for i, (l0, r0, b) in enumerate(queries):
        if b > maxc or r0 - l0 + 1 < 4 * b:
            continue
        subs.append((r0, i))
        if l0 > 0:
            subs.append((l0 - 1, ~i))
    subs.sort()
    sts = sorted(structs, key=lambda t: t[1])
    T0 = [0] * (maxc + 1); T1 = [0] * (maxc + 1); Tc = [0] * (maxc + 1)
    ptr = 0; ns = len(sts)
    for x, code in subs:
        while ptr < ns and sts[ptr][1] <= x:
            A, B, mn, C, Kf = sts[ptr]
            c = mn if mn < Kf else Kf
            P1 = Kf + 1
            P0 = (c + 1) * P1 - c * (c + 1) // 2
            p = maxc + 1 - c
            while p <= maxc:
                T0[p] += P0; T1[p] += P1; Tc[p] += 1
                p += p & -p
            ptr += 1
        qi = code if code >= 0 else ~code
        b = queries[qi][2]
        p = maxc + 1 - b
        s0 = s1 = sc = 0
        while p > 0:
            s0 += T0[p]; s1 += T1[p]; sc += Tc[p]
            p &= p - 1
        val = s0 - b * s1 + sc * (b * (b - 1) // 2)
        if code >= 0:
            full[qi] += val
        else:
            full[qi] -= val
    return full, maxc

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); q = int(data[1]); S = data[2]
    vals = list(map(int, data[3:3 + 3 * q]))
    queries = [(vals[3 * i] - 1, vals[3 * i + 1] - 1, vals[3 * i + 2]) for i in range(q)]
    res = [0] * q
    if n < 4:
        sys.stdout.write("\n".join(map(str, res)) + "\n")
        return
    runs = find_runs(S, n)
    structs = build_structs(runs)
    if not structs:
        sys.stdout.write("\n".join(map(str, res)) + "\n")
        return
    full, maxc = compute_full(structs, queries, q)
    cross = [[] for _ in range(n + 1)]
    for st in sorted(structs, key=lambda t: -t[2]):
        for x in range(st[0] + 1, st[1] + 1):
            cross[x].append(st)
    for i in range(q):
        l0, r0, b = queries[i]
        if b > maxc or r0 - l0 + 1 < 4 * b:
            continue
        bb = b * (b - 1)
        tot = full[i]
        if l0 > 0:
            for A, B, mn, C, Kf in cross[l0]:
                if mn < b:
                    break
                if B <= r0:
                    if Kf < b:
                        continue
                    c = Kf if Kf < mn else mn
                    tot -= (c - b + 1) * (Kf + 1) - (c * (c + 1) - bb) // 2
                    K = B - l0 + 1 - C
                else:
                    K = r0 - l0 + 1 - C
                if K >= b:
                    c = K if K < mn else mn
                    tot += (c - b + 1) * (K + 1) - (c * (c + 1) - bb) // 2
        if r0 + 1 < n:
            for A, B, mn, C, Kf in cross[r0 + 1]:
                if mn < b:
                    break
                if A >= l0:
                    K = r0 - A + 1 - C
                    if K >= b:
                        c = K if K < mn else mn
                        tot += (c - b + 1) * (K + 1) - (c * (c + 1) - bb) // 2
        res[i] = tot
    sys.stdout.write("\n".join(map(str, res)) + "\n")

main()
