import sys
from itertools import accumulate


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    r = [0] + [int(x) for x in data[1:n + 1]]
    adj = [[] for _ in range(n + 1)]
    pos = n + 1
    for _ in range(n - 1):
        u = int(data[pos])
        v = int(data[pos + 1])
        pos += 2
        adj[u].append(v)
        adj[v].append(u)

    INF = 1 << 30
    removed = [False] * (n + 1)
    par = [0] * (n + 1)
    dep = [0] * (n + 1)
    sz = [1] * (n + 1)
    Q = [INF] * (n + 1)
    saved = [INF] * (n + 1)
    pend = [INF] * (n + 2)
    ans = [0] * (n + 1)

    order = [1]
    for v in order:
        for w in adj[v]:
            if w != par[v]:
                par[w] = v
                order.append(w)
    for v in reversed(order):
        if par[v]:
            sz[par[v]] += sz[v]

    def find_centroid(s, total):
        half = total // 2
        c = s
        while True:
            pc = par[c]
            for w in adj[c]:
                if w != pc and not removed[w] and sz[w] > half:
                    c = w
                    break
            else:
                return c

    def explore(root):
        members = []
        st = [root]
        while st:
            v = st.pop()
            if v > 0:
                p = par[v]
                d = dep[v]
                pd = pend[d]
                q = Q[p]
                Q[v] = q if q < pd else pd
                sz[v] = 1
                members.append(v)
                slot = d + r[v] + 1
                if slot <= n:
                    saved[v] = pend[slot]
                    g = r[v] - d
                    if g < pend[slot]:
                        pend[slot] = g
                st.append(-v)
                nd = d + 1
                for x in adj[v]:
                    if x != p and not removed[x]:
                        par[x] = v
                        dep[x] = nd
                        st.append(x)
            else:
                v = -v
                sz[par[v]] += sz[v]
                slot = dep[v] + r[v] + 1
                if slot <= n:
                    pend[slot] = saved[v]
        return members

    def tally(members, sign):
        md = max(dep[v] for v in members)
        inf_slot = md + 1
        size = md + 2
        hit_c = [0] * size
        hit_s = [0] * size
        inf_c = [0] * size
        inf_s = [0] * size
        for y in members:
            q = Q[y]
            b = dep[y]
            if q == INF:
                hit_c[inf_slot] += 1
                hit_s[inf_slot] += b
                inf_c[b] += 1
                inf_s[b] += b
            elif q >= 0:
                hit_c[q] += 1
                hit_s[q] += b
        suf_c = list(accumulate(reversed(hit_c)))[::-1]
        suf_s = list(accumulate(reversed(hit_s)))[::-1]
        pre_c = list(accumulate(inf_c))
        pre_s = list(accumulate(inf_s))
        for x in members:
            a = dep[x]
            q = Q[x]
            if q == INF:
                ans[x] += sign * (a * suf_c[a] + suf_s[a])
            elif q >= 0:
                ans[x] += sign * (a * pre_c[q] + pre_s[q])

    stack = [1]
    while stack:
        s = stack.pop()
        total = sz[s]
        if total == 1:
            removed[s] = True
            continue
        c = find_centroid(s, total)
        removed[c] = True
        dep[c] = 0
        Q[c] = INF
        rc = r[c]
        slot = rc + 1
        has_slot = slot <= n
        if has_slot:
            saved_c = pend[slot]
            if rc < saved_c:
                pend[slot] = rc
        groups = []
        for w in adj[c]:
            if not removed[w]:
                par[w] = c
                dep[w] = 1
                groups.append(explore(w))
        if has_slot:
            pend[slot] = saved_c
        members = [c]
        for g in groups:
            members.extend(g)
        tally(members, 1)
        for g in groups:
            tally(g, -1)
        for w in adj[c]:
            if not removed[w]:
                stack.append(w)

    sys.stdout.write(' '.join(map(str, ans[1:])) + '\n')


main()
