import sys

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:n + 1]]
    adj = [[] for _ in range(n)]
    idx = n + 1
    for _ in range(n - 1):
        u = int(data[idx]) - 1
        w = int(data[idx + 1]) - 1
        idx += 2
        adj[u].append(w)
        adj[w].append(u)

    par = [-1] * n
    col = [0] * n
    visited = [False] * n
    visited[0] = True
    order = [0]
    i = 0
    while i < len(order):
        v = order[i]
        i += 1
        for c in adj[v]:
            if not visited[c]:
                visited[c] = True
                par[c] = v
                col[c] = col[v] ^ 1
                order.append(c)

    b = [a[v] if col[v] == 0 else -a[v] for v in range(n)]

    sumA = [0] * n
    sumB = [0] * n
    bestD = [0] * n
    bestE = [0] * n
    A0d = [0] * n
    B0d = [0] * n
    dDc = [0] * n
    dEc = [0] * n

    for v in reversed(order):
        A = b[v] + sumA[v]
        B = -b[v] + sumB[v]
        D = A + bestD[v]
        E = B + bestE[v]
        A0d[v] = A
        B0d[v] = B
        pa = A if A > 0 else 0
        pb = B if B > 0 else 0
        dd = (D if D > B else B) - pa
        de = (E if E > A else A) - pb
        dDc[v] = dd
        dEc[v] = de
        p = par[v]
        if p >= 0:
            sumA[p] += pa
            sumB[p] += pb
            if dd > bestD[p]:
                bestD[p] = dd
            if de > bestE[p]:
                bestE[p] = de

    upA = [0] * n
    upB = [0] * n
    updD = [0] * n
    updE = [0] * n
    ans = [0] * n

    for v in order:
        bv = b[v]
        SA = bv + sumA[v]
        SB = -bv + sumB[v]
        m1D = 0
        m2D = 0
        i1D = -1
        m1E = 0
        m2E = 0
        i1E = -1
        pv = par[v]
        if pv >= 0:
            x = upA[v]
            if x > 0:
                SA += x
            x = upB[v]
            if x > 0:
                SB += x
            dd = updD[v]
            if dd > m1D:
                m1D = dd
                i1D = -2
            de = updE[v]
            if de > m1E:
                m1E = de
                i1E = -2
        children = [c for c in adj[v] if c != pv]
        for c in children:
            dd = dDc[c]
            if dd > m1D:
                m2D = m1D
                m1D = dd
                i1D = c
            elif dd > m2D:
                m2D = dd
            de = dEc[c]
            if de > m1E:
                m2E = m1E
                m1E = de
                i1E = c
            elif de > m2E:
                m2E = de
        if col[v] == 0:
            ans[v] = SA + m1D
        else:
            ans[v] = SB + m1E
        for c in children:
            x = A0d[c]
            Au = SA - (x if x > 0 else 0)
            x = B0d[c]
            Bu = SB - (x if x > 0 else 0)
            xd = m2D if i1D == c else m1D
            xe = m2E if i1E == c else m1E
            Du = Au + xd
            Eu = Bu + xe
            upA[c] = Au
            upB[c] = Bu
            pa = Au if Au > 0 else 0
            pb = Bu if Bu > 0 else 0
            updD[c] = (Du if Du > Bu else Bu) - pa
            updE[c] = (Eu if Eu > Au else Au) - pb

    sys.stdout.write(" ".join(map(str, ans)) + "\n")

main()
