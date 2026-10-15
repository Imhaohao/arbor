import sys

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); q = int(data[1]); s = data[2].decode()

    length = [0]; link = [-1]; trans = [{}]
    last = 0
    prefstate = [0] * (n + 1)
    for i, ch in enumerate(s):
        cur = len(length)
        length.append(length[last] + 1); link.append(0); trans.append({})
        p = last
        while p != -1 and ch not in trans[p]:
            trans[p][ch] = cur
            p = link[p]
        if p == -1:
            link[cur] = 0
        else:
            qq = trans[p][ch]
            if length[p] + 1 == length[qq]:
                link[cur] = qq
            else:
                clone = len(length)
                length.append(length[p] + 1); link.append(link[qq]); trans.append(trans[qq].copy())
                while p != -1 and trans[p].get(ch) == qq:
                    trans[p][ch] = clone
                    p = link[p]
                link[qq] = clone
                link[cur] = clone
        last = cur
        prefstate[i + 1] = cur

    sz = len(length)
    order = sorted(range(sz), key=length.__getitem__)
    size = [1] * sz
    for v in reversed(order):
        if v:
            size[link[v]] += size[v]
    heavy = [-1] * sz
    for v in range(1, sz):
        p = link[v]
        if heavy[p] == -1 or size[v] > size[heavy[p]]:
            heavy[p] = v

    head = [0] * sz
    idx = [0] * sz
    Bs = [None] * sz
    stk = [None] * sz
    for v in order:
        if v == 0:
            Bs[0] = [0, 0]
            stk[0] = []
            continue
        p = link[v]
        if heavy[p] == v:
            h = head[p]
            head[v] = h
            idx[v] = idx[p] + 1
            Bs[h].append(length[v])
        else:
            head[v] = v
            idx[v] = 0
            Bs[v] = [length[p], length[v]]
            stk[v] = []

    N = 1
    while N <= n:
        N *= 2
    t = [0] * (2 * N)
    d = [0] * (2 * N)

    def apply(B, s0, t0, e, y):
        dd = y - e
        lo = B[s0] + 1
        hi = B[t0 + 1]
        if hi > dd:
            hi = dd
        if lo > hi:
            return
        x1 = e - hi + 1
        x2 = e - lo + 1
        if x1 == x2:
            i = x1 + N
            t[i] += dd
            i >>= 1
            while i:
                a = t[2 * i]; b = t[2 * i + 1]
                t[i] = (a if a > b else b) + d[i]
                i >>= 1
            return
        l = x1 + N
        r = x2 + N + 1
        l0 = l
        r0 = r - 1
        while l < r:
            if l & 1:
                t[l] += dd; d[l] += dd; l += 1
            if r & 1:
                r -= 1; t[r] += dd; d[r] += dd
            l >>= 1; r >>= 1
        i = l0 >> 1
        j = r0 >> 1
        while i:
            a = t[2 * i]; b = t[2 * i + 1]
            t[i] = (a if a > b else b) + d[i]
            if j != i:
                a = t[2 * j]; b = t[2 * j + 1]
                t[j] = (a if a > b else b) + d[j]
            i >>= 1; j >>= 1

    byR = [[] for _ in range(n + 1)]
    pos = 3
    for qi in range(q):
        L = int(data[pos]); R = int(data[pos + 1]); pos += 2
        byR[R].append((L, qi))
    ans = [0] * q

    for y in range(1, n + 1):
        v = prefstate[y]
        while v != -1:
            h = head[v]
            p = idx[v]
            st = stk[h]
            B = Bs[h]
            s0 = 0
            while st:
                end, e = st[-1]
                if end <= p:
                    st.pop()
                    apply(B, s0, end, e, y)
                    s0 = end + 1
                    if end == p:
                        break
                else:
                    if s0 <= p:
                        apply(B, s0, p, e, y)
                    break
            st.append((p, y))
            v = link[h]
        for L, qi in byR[y]:
            p = L + N
            res = t[p]
            while p > 1:
                if not p & 1:
                    o = t[p + 1]
                    if o > res:
                        res = o
                p >>= 1
                res += d[p]
            ans[qi] = res

    sys.stdout.write("\n".join(map(str, ans)) + "\n")

main()
