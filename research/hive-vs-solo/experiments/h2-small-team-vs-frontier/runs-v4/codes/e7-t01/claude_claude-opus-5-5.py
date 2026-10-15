import sys

def evalv(a, k, t1mx, t1mn, t1ax, t1an, t0mx, t0mn, top, bot):
    if k == 0:
        return 0, a + t1mx, a + t1mn
    if k == 1:
        return 1, -a + t0mx - t1mn, -a + t0mn - t1mx
    sa = a if k % 2 == 0 else -a
    return 1, sa + t1ax + t0mx + top, sa + t1an + t0mn + bot

def solve_vertex(a, S, MX, MN, excl):
    t1mx = t1mn = t1ax = t1an = 0
    t0mx = t0mn = 0
    zero_idx = []
    L = len(S)
    for i in range(L):
        if S[i] == 1:
            x = MX[i]; y = MN[i]
            t1mx += x; t1mn += y
            t1ax += x if x > -y else -y
            t1an += y if y < -x else -x
        else:
            t0mx += MX[i]; t0mn += MN[i]
            zero_idx.append(i)
    K = len(zero_idx)
    zero_idx.sort(key=lambda i: -(-MN[i] - MX[i]))
    D = [-MN[i] - MX[i] for i in zero_idx]
    P = [0] * (K + 1)
    s = 0
    pos = {}
    for j in range(K):
        s += D[j]
        P[j + 1] = s
        pos[zero_idx[j]] = j
    m = K // 2
    full = evalv(a, K, t1mx, t1mn, t1ax, t1an, t0mx, t0mn, P[m], P[K] - P[K - m])
    res = []
    for i in excl:
        x = MX[i]; y = MN[i]
        if S[i] == 1:
            ax = x if x > -y else -y
            an = y if y < -x else -x
            res.append(evalv(a, K, t1mx - x, t1mn - y, t1ax - ax, t1an - an,
                             t0mx, t0mn, P[m], P[K] - P[K - m]))
        else:
            p = pos[i]
            k = K - 1
            mm = k // 2
            if p >= mm:
                top = P[mm]
            else:
                top = P[mm + 1] - D[p]
            if p < K - mm:
                bot = P[K] - P[K - mm]
            else:
                bot = P[K] - P[K - mm - 1] - D[p]
            res.append(evalv(a, k, t1mx, t1mn, t1ax, t1an,
                             t0mx - x, t0mn - y, top, bot))
    return full, res

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = list(map(int, data[1:n + 1]))
    adj = [[] for _ in range(n)]
    ptr = n + 1
    for _ in range(n - 1):
        u = int(data[ptr]) - 1; v = int(data[ptr + 1]) - 1
        ptr += 2
        adj[u].append(v); adj[v].append(u)
    parent = [-1] * n
    visited = [False] * n
    visited[0] = True
    order = [0]
    for u in order:
        for v in adj[u]:
            if not visited[v]:
                visited[v] = True
                parent[v] = u
                order.append(v)
    dS = [0] * n; dMx = [0] * n; dMn = [0] * n
    for u in reversed(order):
        pu = parent[u]
        S = []; MX = []; MN = []
        for c in adj[u]:
            if c != pu:
                S.append(dS[c]); MX.append(dMx[c]); MN.append(dMn[c])
        full, _ = solve_vertex(a[u], S, MX, MN, [])
        dS[u], dMx[u], dMn[u] = full
    uS = [0] * n; uMx = [0] * n; uMn = [0] * n
    ans = [0] * n
    for u in order:
        pu = parent[u]
        S = []; MX = []; MN = []
        excl = []
        kids = []
        for idx, c in enumerate(adj[u]):
            if c == pu:
                S.append(uS[u]); MX.append(uMx[u]); MN.append(uMn[u])
            else:
                S.append(dS[c]); MX.append(dMx[c]); MN.append(dMn[c])
                excl.append(idx)
                kids.append(c)
        full, res = solve_vertex(a[u], S, MX, MN, excl)
        ans[u] = full[1]
        for c, r in zip(kids, res):
            uS[c], uMx[c], uMn[c] = r
    sys.stdout.write(" ".join(map(str, ans)) + "\n")

main()
