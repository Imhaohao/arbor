import sys

SIGNS = (1, -1)


def contribution(f0, f1, i):
    j = 1 - i
    return max(0, f0[j]), max(0, f1[j], f0[i])


def push_top(top1, top2, arg1, node, value, child):
    if value > top1[node]:
        top2[node] = top1[node]
        top1[node] = value
        arg1[node] = child
    elif value > top2[node]:
        top2[node] = value


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [0] * (n + 1)
    for i in range(n):
        a[i + 1] = int(data[1 + i])
    adj = [[] for _ in range(n + 1)]
    pos = n + 1
    for _ in range(n - 1):
        u = int(data[pos])
        v = int(data[pos + 1])
        pos += 2
        adj[u].append(v)
        adj[v].append(u)

    parent = [0] * (n + 1)
    seen = [False] * (n + 1)
    seen[1] = True
    order = [1]
    for v in order:
        for u in adj[v]:
            if not seen[u]:
                seen[u] = True
                parent[u] = v
                order.append(u)

    S = [[0] * (n + 1) for _ in range(2)]
    T1 = [[0] * (n + 1) for _ in range(2)]
    T2 = [[0] * (n + 1) for _ in range(2)]
    I1 = [[0] * (n + 1) for _ in range(2)]
    DG0 = [[0] * (n + 1) for _ in range(2)]
    DG1 = [[0] * (n + 1) for _ in range(2)]

    for v in reversed(order):
        if v == 1:
            continue
        pv = parent[v]
        f0 = [SIGNS[k] * a[v] + S[k][v] for k in range(2)]
        f1 = [f0[k] + T1[k][v] for k in range(2)]
        for i in range(2):
            g0, g1 = contribution(f0, f1, i)
            DG0[i][v] = g0
            DG1[i][v] = g1
            S[i][pv] += g0
            push_top(T1[i], T2[i], I1[i], pv, g1 - g0, v)

    UP0 = [[0] * (n + 1) for _ in range(2)]
    UP1 = [[0] * (n + 1) for _ in range(2)]
    ans = [0] * (n + 1)
    for x in order:
        px = parent[x]
        ax = a[x]
        fs = [0, 0]
        m1 = [0, 0]
        m2 = [0, 0]
        who = [0, 0]
        for k in range(2):
            total = S[k][x]
            best1 = T1[k][x]
            best2 = T2[k][x]
            arg = I1[k][x]
            if px:
                total += UP0[k][x]
                d = UP1[k][x] - UP0[k][x]
                if d > best1:
                    best2 = best1
                    best1 = d
                    arg = px
                elif d > best2:
                    best2 = d
            fs[k] = total
            m1[k] = best1
            m2[k] = best2
            who[k] = arg
        ans[x] = ax + fs[0] + m1[0]
        for c in adj[x]:
            if c == px:
                continue
            f0 = [SIGNS[k] * ax + fs[k] - DG0[k][c] for k in range(2)]
            f1 = [f0[k] + (m2[k] if who[k] == c else m1[k]) for k in range(2)]
            for i in range(2):
                UP0[i][c], UP1[i][c] = contribution(f0, f1, i)

    sys.stdout.write(' '.join(map(str, ans[1:])) + '\n')


main()
