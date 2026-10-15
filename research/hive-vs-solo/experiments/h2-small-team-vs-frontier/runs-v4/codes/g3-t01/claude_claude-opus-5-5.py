import sys
from bisect import bisect_left

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); q = int(data[1]); s = data[2]
    qs_by_L = [[] for _ in range(n)]
    pos = 3
    for qi in range(q):
        L = int(data[pos]) - 1; R = int(data[pos + 1]) - 1
        pos += 2
        qs_by_L[L].append((R, qi))

    rank = [c - 97 for c in s]
    M = max(n, 26) + 2
    k = 1
    while True:
        pad = [-1] * min(k, n)
        key = [a * M + b for a, b in zip(rank, rank[k:] + pad)]
        uniq = sorted(set(key))
        rank = list(map(dict(zip(uniq, range(len(uniq)))).__getitem__, key))
        if len(uniq) == n:
            break
        k <<= 1
    sa = [0] * n
    for i in range(n):
        sa[rank[i]] = i

    s2 = s + b'\x00'
    lcp = [0] * n
    h = 0
    for i in range(n):
        r = rank[i]
        if r:
            j = sa[r - 1]
            while s2[i + h] == s2[j + h]:
                h += 1
            lcp[r] = h
            if h:
                h -= 1
        else:
            h = 0

    formb = [0] * n
    groups = [[] for _ in range(n)]

    def merge(A, B, h):
        if len(A) < len(B):
            A, B = B, A
        la = len(A); nb = len(B)
        if B[0] > A[-1]:
            formb[A[-1]] = h
            A.extend(B)
            return A
        if B[-1] < A[0]:
            formb[B[-1]] = h
            A[:0] = B
            return A
        idxs = [bisect_left(A, b) for b in B]
        prev = -1
        for j in range(nb):
            ij = idxs[j]
            if ij != prev:
                if j:
                    pb = B[j - 1]
                    b0 = formb[pb]
                    if b0 > h:
                        dd = B[j] - pb
                        hi = b0 if b0 < dd else dd
                        if hi > h:
                            groups[pb].append((dd, h, hi))
                    formb[pb] = h
                if ij:
                    qq = A[ij - 1]
                    if ij < la:
                        b0 = formb[qq]
                        if b0 > h:
                            dd = A[ij] - qq
                            hi = b0 if b0 < dd else dd
                            if hi > h:
                                groups[qq].append((dd, h, hi))
                    formb[qq] = h
                prev = ij
        if prev < la:
            formb[B[-1]] = h
        if nb < 8:
            for j in range(nb - 1, -1, -1):
                A.insert(idxs[j], B[j])
        else:
            A.extend(B)
            A.sort()
        return A

    stk_h = []; stk_s = []
    last = [sa[0]]
    for i in range(1, n):
        h = lcp[i]
        while stk_h and stk_h[-1] > h:
            last = merge(stk_s.pop(), last, stk_h.pop())
        if stk_h and stk_h[-1] == h:
            stk_s[-1] = merge(stk_s[-1], last, h)
        else:
            stk_h.append(h); stk_s.append(last)
        last = [sa[i]]
    while stk_h:
        last = merge(stk_s.pop(), last, stk_h.pop())
    P = last
    for i in range(len(P) - 1):
        x = P[i]; b0 = formb[x]
        if b0 > 0:
            dd = P[i + 1] - x
            hi = b0 if b0 < dd else dd
            if hi > 0:
                groups[x].append((dd, 0, hi))

    N = 1
    while N < n:
        N <<= 1
    LK = [0] * (2 * N)
    LM = [-1] * (2 * N)

    def node_insert(node, k, m):
        bl = node.bit_length() - 1
        size = N >> bl
        lo = (node - (1 << bl)) * size
        while True:
            ck = LK[node]; cm = LM[node]
            if size == 1:
                if k * lo + m > ck * lo + cm:
                    LK[node] = k; LM[node] = m
                return
            half = size >> 1
            p = lo + half - 1
            if k * p + m > ck * p + cm:
                LK[node] = k; LM[node] = m
                k, ck = ck, k
                m, cm = cm, m
            if k * lo + m > ck * lo + cm:
                node <<= 1
                size = half
            else:
                e = lo + size - 1
                if k * e + m > ck * e + cm:
                    node = (node << 1) | 1
                    lo += half
                    size = half
                else:
                    return

    def seg_insert(l, r, k0, m0):
        l += N; r += N + 1
        while l < r:
            if l & 1:
                node_insert(l, k0, m0); l += 1
            if r & 1:
                r -= 1; node_insert(r, k0, m0)
            l >>= 1; r >>= 1

    fw = [0] * (n + 1)
    K = 12
    ans = [0] * q
    for x in range(n - 1, -1, -1):
        g = groups[x]
        if g:
            if len(g) > 1:
                g.sort()
            C = 0
            for d, lo, hi in g:
                ln = hi - lo
                t1 = x + d + lo
                if ln <= K:
                    v = C
                    i0 = t1 + 1
                    for kk in range(ln):
                        v += d
                        i = i0 + kk
                        while i <= n:
                            if fw[i] >= v:
                                break
                            fw[i] = v
                            i += i & -i
                else:
                    t2 = t1 + ln - 1
                    seg_insert(t1, t2 - 1, d, C + d * (1 - t1))
                    v = C + d * ln
                    i = t2 + 1
                    while i <= n:
                        if fw[i] >= v:
                            break
                        fw[i] = v
                        i += i & -i
                C += d * ln
        for R, qi in qs_by_L[x]:
            best = 0
            i = R + 1
            while i:
                if fw[i] > best:
                    best = fw[i]
                i &= i - 1
            node = R + N
            while node:
                v = LK[node] * R + LM[node]
                if v > best:
                    best = v
                node >>= 1
            ans[qi] = best
    sys.stdout.write("\n".join(map(str, ans)) + "\n")

main()
