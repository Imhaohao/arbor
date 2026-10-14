import sys
from bisect import bisect_left, bisect_right

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); q = int(data[1])
    r = [0] * (n + 1)
    for i in range(n):
        r[i + 1] = int(data[2 + i])
    pos = 2 + n
    adj = [[] for _ in range(n + 1)]
    for _ in range(n - 1):
        a = int(data[pos]); b = int(data[pos + 1]); w = int(data[pos + 2]); pos += 3
        adj[a].append((b, w)); adj[b].append((a, w))

    par = [0] * (n + 1); par[1] = 1
    dep = [0] * (n + 1); D = [0] * (n + 1)
    tin = [0] * (n + 1); order = []
    TD = [0] * (n + 1); top = [0] * (n + 1); jB = [0] * (n + 1); wB = [0] * (n + 1)
    pathV = [0] * (n + 1); pathD = [0] * (n + 1)
    depthTin = [[] for _ in range(n)]; depthV = [[] for _ in range(n)]
    visited = [False] * (n + 1); visited[1] = True
    stack = [1]
    while stack:
        x = stack.pop()
        d = dep[x]; dx = D[x]
        t_in = len(order)
        tin[x] = t_in; order.append(x)
        depthTin[d].append(t_in); depthV[d].append(x)
        pathV[d] = x; pathD[d] = dx
        i = bisect_left(pathD, dx - r[x], 0, d + 1)
        top[x] = pathV[i]; TD[x] = i
        j = (d - i + 1).bit_length() - 1
        jB[x] = j; wB[x] = pathV[i + (1 << j) - 1]
        for y, w in adj[x]:
            if not visited[y]:
                visited[y] = True; par[y] = x; dep[y] = d + 1; D[y] = dx + w
                stack.append(y)

    LOG = max(1, n.bit_length())
    up = [par]
    for j in range(1, LOG):
        p = up[-1]
        up.append([p[a] for a in p])

    OFF = 1000000
    key = [1 << 62] * (n + 1)
    for x in range(1, n + 1):
        key[x] = ((D[x] - r[x] + OFF) << 16) | x
    C = [key]
    for j in range(1, LOG):
        Cp = C[-1]; upp = up[j - 1]
        C.append([a if a < b else b for a, b in zip(Cp, map(Cp.__getitem__, upp))])

    B = [0] * (n + 1)
    for x in range(1, n + 1):
        Cj = C[jB[x]]
        a = Cj[x]; b = Cj[wB[x]]
        B[x] = (a if a < b else b) & 0xFFFF
    Bup = [B]
    for j in range(1, LOG):
        bp = Bup[-1]
        Bup.append([bp[a] for a in bp])

    val = [0] * n
    for i in range(1, n):
        p = par[order[i]]
        val[i] = (dep[p] << 16) | p
    S = [val]
    j = 1
    while (1 << j) <= n:
        prev = S[-1]; h = 1 << (j - 1)
        S.append([a if a < b else b for a, b in zip(prev, prev[h:])])
        j += 1

    def lca(u, v):
        a = tin[u]; b = tin[v]
        if a > b:
            a, b = b, a
        a += 1
        j = (b - a + 1).bit_length() - 1
        Sj = S[j]
        x = Sj[a]; y = Sj[b - (1 << j) + 1]
        return (x if x < y else y) & 0xFFFF

    def min_key(u, x):
        ln = dep[u] - dep[x] + 1
        j = ln.bit_length() - 1
        Cj = C[j]
        a = Cj[u]
        if (1 << j) == ln:
            return a
        d = dep[x] + (1 << j) - 1
        w = depthV[d][bisect_right(depthTin[d], tin[u]) - 1]
        b = Cj[w]
        return a if a < b else b

    def climb(u, L):
        dL = dep[L]
        if TD[u] <= dL:
            return 1, u
        s = u; cnt = 0
        for j in range((dep[u] - dL).bit_length() - 1, -1, -1):
            t = Bup[j][s]
            if TD[t] > dL:
                s = t; cnt += 1 << j
        if TD[B[s]] > dL:
            return 0, 0
        return cnt + 2, top[s]

    def side_has_target(v, xv, thr, DL):
        if D[xv] > thr:
            return False
        if D[v] <= thr:
            y = v
        else:
            b = v
            for j in range((dep[v] - dep[xv]).bit_length() - 1, -1, -1):
                w = up[j][b]
                if D[w] > thr:
                    b = w
            y = par[b]
        return (min_key(y, xv) >> 16) - OFF <= DL

    out = []
    for _ in range(q):
        u = int(data[pos]); v = int(data[pos + 1]); pos += 2
        if u == v:
            out.append(0); continue
        L = lca(u, v)
        if u == L or v == L:
            k, _x = climb(v if u == L else u, L)
            out.append(k if k else -1)
            continue
        ku, xu = climb(u, L)
        if not ku:
            out.append(-1); continue
        kv, xv = climb(v, L)
        if not kv:
            out.append(-1); continue
        ans = ku + kv
        DL = D[L]
        minA = (min_key(u, xu) >> 16) - OFF
        minB = (min_key(v, xv) >> 16) - OFF
        if side_has_target(v, xv, 2 * DL - minA, DL) or side_has_target(u, xu, 2 * DL - minB, DL):
            ans -= 1
        out.append(ans)

    sys.stdout.write("\n".join(map(str, out)) + "\n")

main()
