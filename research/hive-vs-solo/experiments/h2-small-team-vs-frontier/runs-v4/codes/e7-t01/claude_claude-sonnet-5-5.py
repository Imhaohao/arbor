import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    A = [int(x) for x in data[1:1 + n]]
    adj = [[] for _ in range(n)]
    p = 1 + n
    for _ in range(n - 1):
        u = int(data[p]) - 1
        v = int(data[p + 1]) - 1
        p += 2
        adj[u].append(v)
        adj[v].append(u)

    par = [-1] * n
    order = [0]
    for u in order:
        for v in adj[u]:
            if v != par[u]:
                par[v] = u
                order.append(v)

    def value(a, k, sbmax, sbmin, top, bottom, o):
        if k == 0:
            return a + o[0], a + o[1]
        sa = a if k % 2 == 0 else -a
        if k == 1:
            return sa + sbmax + top + o[2], sa + sbmin + bottom + o[3]
        return sa + sbmax + top + o[4], sa + sbmin + bottom + o[5]

    def top_excluding(pref, i, h):
        if h == 0:
            return 0
        if i < h:
            return pref[h + 1] - (pref[i + 1] - pref[i]) if False else pref[h + 1] - (pref[i + 1] - pref[i])
        return pref[h]

    def contribution(Mv, mv):
        return (Mv, mv, -mv, -Mv, max(Mv, -mv), min(mv, -Mv))

    M = [0] * n
    m = [0] * n
    s = [0] * n

    for u in reversed(order):
        pu = par[u]
        zl = []
        sbmax = 0
        sbmin = 0
        o = [0, 0, 0, 0, 0, 0]
        for c in adj[u]:
            if c == pu:
                continue
            if s[c] == 0:
                zl.append(M[c] + m[c])
                sbmax -= m[c]
                sbmin -= M[c]
            else:
                cc = contribution(M[c], m[c])
                for j in range(6):
                    o[j] += cc[j]
        k = len(zl)
        if k:
            zl.sort(reverse=True)
            h = (k + 1) // 2
            top = sum(zl[:h])
            bottom = sum(zl[k - h:])
            s[u] = 1
        else:
            top = bottom = 0
        M[u], m[u] = value(A[u], k, sbmax, sbmin, top, bottom, o)

    UM = [0] * n
    Um = [0] * n
    Us = [0] * n
    pos = [0] * n
    ans = [0] * n

    for u in order:
        a = A[u]
        pu = par[u]
        zl = []
        sbmax = 0
        sbmin = 0
        o = [0, 0, 0, 0, 0, 0]
        for v in adj[u]:
            if v == pu:
                Mv, mv, sv = UM[u], Um[u], Us[u]
            else:
                Mv, mv, sv = M[v], m[v], s[v]
            if sv == 0:
                zl.append((Mv + mv, v))
                sbmax -= mv
                sbmin -= Mv
            else:
                cc = contribution(Mv, mv)
                for j in range(6):
                    o[j] += cc[j]
        K = len(zl)
        zl.sort(reverse=True)
        pref = [0] * (K + 1)
        for idx in range(K):
            pref[idx + 1] = pref[idx] + zl[idx][0]
            pos[zl[idx][1]] = idx
        h = (K + 1) // 2
        top = pref[h]
        bottom = pref[K] - pref[K - h]
        ans[u] = value(a, K, sbmax, sbmin, top, bottom, o)[0]

        for c in adj[u]:
            if c == pu:
                continue
            if s[c] == 0:
                kk = K - 1
                i = pos[c]
                hh = (kk + 1) // 2
                t = top_excluding(pref, i, hh)
                rest = pref[K] - (pref[i + 1] - pref[i])
                b = rest - top_excluding(pref, i, kk - hh)
                nm, nn = value(a, kk, sbmax + m[c], sbmin + M[c], t, b, o)
            else:
                cc = contribution(M[c], m[c])
                o2 = [o[j] - cc[j] for j in range(6)]
                kk = K
                nm, nn = value(a, kk, sbmax, sbmin, top, bottom, o2)
            UM[c] = nm
            Um[c] = nn
            Us[c] = 1 if kk > 0 else 0

    print(" ".join(map(str, ans)))


main()
