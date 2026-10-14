import sys
def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [0] + [int(x) for x in data[1:n + 1]]
    adj = [[] for _ in range(n + 1)]
    p = n + 1
    for _ in range(n - 1):
        u = int(data[p]); v = int(data[p + 1]); p += 2
        adj[u].append(v); adj[v].append(u)
    par = [0] * (n + 1)
    order = [1]
    par[1] = -1
    for v in order:
        for c in adj[v]:
            if c != par[v]:
                par[c] = v
                order.append(c)
    Pd = [0] * (n + 1); Md = [0] * (n + 1)
    P1d = [0] * (n + 1); M1d = [0] * (n + 1)
    for v in reversed(order):
        sM = sP = 0
        bP = bM = 0
        pv = par[v]
        for c in adj[v]:
            if c == pv:
                continue
            m = Md[c]; q = Pd[c]
            if m > 0:
                sM += m
            if q > 0:
                sP += q
            g = max(M1d[c], q) - (m if m > 0 else 0)
            if g > bP:
                bP = g
            g = max(P1d[c], m) - (q if q > 0 else 0)
            if g > bM:
                bM = g
        Pd[v] = a[v] + sM
        Md[v] = -a[v] + sP
        P1d[v] = Pd[v] + bP
        M1d[v] = Md[v] + bM
    Pu = [0] * (n + 1); Mu = [0] * (n + 1)
    P1u = [0] * (n + 1); M1u = [0] * (n + 1)
    ans = [0] * (n + 1)
    for v in order:
        pv = par[v]
        sM = sP = 0
        b1P = b2P = b1M = b2M = 0
        i1P = i1M = -1
        for w in adj[v]:
            if w == pv:
                P, M, P1, M1 = Pu[v], Mu[v], P1u[v], M1u[v]
            else:
                P, M, P1, M1 = Pd[w], Md[w], P1d[w], M1d[w]
            mp = M if M > 0 else 0
            pp = P if P > 0 else 0
            sM += mp
            sP += pp
            g = max(M1, P) - mp
            if g > b1P:
                b2P = b1P; b1P = g; i1P = w
            elif g > b2P:
                b2P = g
            g = max(P1, M) - pp
            if g > b1M:
                b2M = b1M; b1M = g; i1M = w
            elif g > b2M:
                b2M = g
        ans[v] = a[v] + sM + b1P
        for c in adj[v]:
            if c == pv:
                continue
            mc = Md[c]; qc = Pd[c]
            pu = a[v] + sM - (mc if mc > 0 else 0)
            mu = -a[v] + sP - (qc if qc > 0 else 0)
            Pu[c] = pu
            Mu[c] = mu
            P1u[c] = pu + (b2P if i1P == c else b1P)
            M1u[c] = mu + (b2M if i1M == c else b1M)
    print(" ".join(map(str, ans[1:])))
main()
