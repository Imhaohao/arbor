import sys
from bisect import bisect_left, bisect_right, insort


def main():
    data = sys.stdin.buffer.read().split()
    q = int(data[1])
    s = data[2]
    n = len(s)
    QL = [0] * q
    QR = [0] * q
    QB = [0] * q
    for i in range(q):
        QL[i] = int(data[3 + 3 * i])
        QR[i] = int(data[4 + 3 * i])
        QB[i] = int(data[5 + 3 * i])

    rank = list(s)
    sa = list(range(n))
    MUL = max(n, 256) + 2
    k = 1
    while True:
        key = [rank[i] * MUL + (rank[i + k] + 1 if i + k < n else 0) for i in range(n)]
        sa.sort(key=key.__getitem__)
        newrank = [0] * n
        r = 0
        prev = key[sa[0]]
        for idx in range(1, n):
            kk = key[sa[idx]]
            if kk != prev:
                r += 1
                prev = kk
            newrank[sa[idx]] = r
        rank = newrank
        if r == n - 1:
            break
        k <<= 1

    lcp = [0] * n
    h = 0
    for i in range(n):
        ri = rank[i]
        if ri > 0:
            j = sa[ri - 1]
            while i + h < n and j + h < n and s[i + h] == s[j + h]:
                h += 1
            lcp[ri] = h
            if h > 0:
                h -= 1
        else:
            h = 0

    recs = []

    def emit(a, b, c, A, Hc):
        g1 = b - a
        g2 = c - b
        G = g1 if g1 > g2 else g2
        lo = A + 1
        if lo < G + 1:
            lo = G + 1
        hi = c - a
        if Hc < hi:
            hi = Hc
        if lo <= hi:
            recs.append((a + 1, c + 1, G, lo, hi))

    def add(big, small):
        if len(small) * 16 > len(big):
            big.extend(small)
            big.sort()
        else:
            for x in small:
                insort(big, x)

    def merge(N, C):
        Nl = N[1]
        if not Nl:
            N[1] = C[1]
            N[2] = C[2]
            N[3] = []
            return
        Cl = C[1]
        if len(Nl) >= len(Cl):
            N[2].update(C[2])
            N[3].extend(Cl)
            add(Nl, Cl)
        else:
            C[2].update(N[2])
            N[3] = Nl
            add(Cl, Nl)
            N[1] = Cl
            N[2] = C[2]

    def finalize(N):
        d = N[0]
        lst = N[1]
        ins = N[3]
        L = len(lst)
        if L < 3 or not ins:
            return
        alive = N[2]
        if len(ins) == 1:
            j = bisect_left(lst, ins[0])
            cand = (j - 1, j, j + 1)
        else:
            cand = set()
            for x in ins:
                j = bisect_left(lst, x)
                cand.add(j - 1)
                cand.add(j)
                cand.add(j + 1)
        last = L - 2
        for j in cand:
            if j < 1 or j > last:
                continue
            b = lst[j]
            a = lst[j - 1]
            c = lst[j + 1]
            old = alive.get(b)
            if old is not None:
                if old[0] == a and old[1] == c:
                    continue
                emit(old[0], b, old[1], d, old[2])
                del alive[b]
            g1 = b - a
            g2 = c - b
            G = g1 if g1 > g2 else g2
            if G < d:
                alive[b] = (a, c, d)

    root = [0, [], {}, []]
    stack = [root]
    for i in range(n):
        p = sa[i]
        h = lcp[i] if i else 0
        while stack[-1][0] > h:
            node = stack.pop()
            finalize(node)
            top = stack[-1]
            if top[0] >= h:
                merge(top, node)
            else:
                nn = [h, [], {}, []]
                merge(nn, node)
                stack.append(nn)
        stack.append([n - p, [p], {}, [p]])
    while len(stack) > 1:
        node = stack.pop()
        finalize(node)
        merge(stack[-1], node)
    finalize(root)
    for b, (a, c, Hc) in root[2].items():
        emit(a, b, c, 0, Hc)

    Aa = []
    Yy = []
    Be = []
    Sg = []
    for (a, c, G, lo, hi) in recs:
        y = c + G
        Aa.append(a)
        Yy.append(y)
        Be.append(hi - G)
        Sg.append(0)
        b2 = lo - 1 - G
        if b2 >= 1:
            Aa.append(a)
            Yy.append(y)
            Be.append(b2)
            Sg.append(1)
    K = len(Aa)
    if K == 0:
        sys.stdout.write("\n".join(["0"] * q) + "\n")
        return

    order = sorted(range(K), key=lambda i: -Aa[i])
    A = [Aa[i] for i in order]
    Y = [Yy[i] for i in order]
    BE = [Be[i] for i in order]
    SG = [Sg[i] for i in order]
    U2 = [Y[i] + BE[i] - 1 for i in range(K)]
    negA = [-v for v in A]
    nch = 2 if any(SG) else 1
    sgn = [1 if v == 0 else -1 for v in SG]
    nbytes = (K + 7) >> 3
    SGM = None
    if nch == 2:
        SGM = []
        for ch in (0, 1):
            SGM.append(int(''.join('1' if SG[i] == ch else '0' for i in range(K - 1, -1, -1)), 2))

    border = sorted(range(K), key=lambda i: -BE[i])
    negbeta = [-BE[i] for i in border]
    JA = [bisect_right(negA, -QL[i]) for i in range(q)]
    JB = [bisect_right(negbeta, -QB[i]) for i in range(q)]

    R = max(16, K // 1200 + 1)
    ba2 = bytearray(nbytes)
    BMc = [0]
    for pos in range(K):
        i = border[pos]
        ba2[i >> 3] |= 1 << (i & 7)
        if (pos + 1) % R == 0:
            BMc.append(int.from_bytes(ba2, 'little'))

    def build_planes(W, nb):
        fmt = '0%db' % nb
        strs = [format(W[i], fmt) for i in range(K - 1, -1, -1)]
        cols = list(zip(*strs))
        base = [0] * nb
        for pp in range(nb):
            base[nb - 1 - pp] = int(''.join(cols[pp]), 2)
        return base

    def weighted_pass(qkeys, W):
        nb = max(W).bit_length()
        base = build_planes(W, nb)
        if nch == 2:
            planes = [[pl & SGM[ch] for pl in base] for ch in (0, 1)]
        else:
            planes = [base]
        order_w = sorted(range(K), key=W.__getitem__)
        wsorted = [W[i] for i in order_w]
        qorder = sorted(range(q), key=qkeys.__getitem__)
        ba = bytearray(nbytes)
        INS = 0
        p = 0
        dirty = False
        res = [0] * q
        rngnb = range(nb)
        for qi in qorder:
            key = qkeys[qi]
            while p < K and wsorted[p] < key:
                i = order_w[p]
                ba[i >> 3] |= 1 << (i & 7)
                p += 1
                dirty = True
            ja = JA[qi]
            jb = JB[qi]
            if ja == 0 or jb == 0:
                continue
            if dirty:
                INS = int.from_bytes(ba, 'little')
                dirty = False
            kb = jb // R
            total = 0
            if kb and INS:
                M = (((1 << ja) - 1) & INS) & BMc[kb]
                if M:
                    if nch == 1:
                        cnt = M.bit_count()
                        pl = planes[0]
                        sw = 0
                        for t in rngnb:
                            sw += (M & pl[t]).bit_count() << t
                        total = key * cnt - sw
                    else:
                        for ch in (0, 1):
                            Mc = M & SGM[ch]
                            if Mc:
                                cnt = Mc.bit_count()
                                pl = planes[ch]
                                sw = 0
                                for t in rngnb:
                                    sw += (Mc & pl[t]).bit_count() << t
                                val = key * cnt - sw
                                total += val if ch == 0 else -val
            for pos in range(kb * R, jb):
                i = border[pos]
                if i < ja:
                    w = W[i]
                    if w < key:
                        total += sgn[i] * (key - w)
            res[qi] = total
        return res

    X = [QR[i] - QB[i] + 2 for i in range(q)]
    res1 = weighted_pass(X, Y)
    res2 = weighted_pass(QR, U2)
    out = [str(res1[i] - res2[i]) for i in range(q)]
    sys.stdout.write("\n".join(out) + "\n")


main()
