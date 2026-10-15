import sys
from collections import deque

def main():
    data = sys.stdin.buffer.read().split()
    idx = 0
    n = int(data[idx]); idx += 1
    m = int(data[idx]); idx += 1
    N = 4 * n + 2
    S = 4 * n
    T = 4 * n + 1
    INF = 10 ** 18
    H = 10 ** 13

    to = []
    cap = []
    adj = [[] for _ in range(N)]

    def add(u, v, c):
        adj[u].append(len(to)); to.append(v); cap.append(c)
        adj[v].append(len(to)); to.append(u); cap.append(0)

    def nid(v, a):
        return 4 * v + (a - 1)

    const = 0
    for v in range(n):
        a0, k0, b0, c0, a1, k1, b1, c1 = (int(x) for x in data[idx:idx + 8])
        idx += 8
        cost = [c0, c1, min(c0 - a0 + k0, c1 - a1 + k1), c1 - a1 + b1, c0 - a0 + b0]
        const += cost[0]
        for a in range(1, 5):
            d = cost[a] - cost[a - 1]
            if d > 0:
                add(nid(v, a), T, d)
            elif d < 0:
                const += d
                add(S, nid(v, a), -d)
        for a in range(1, 4):
            add(nid(v, a + 1), nid(v, a), INF)

    for _ in range(m):
        vals = [int(x) for x in data[idx:idx + 10]]
        idx += 10
        u = vals[0] - 1
        v = vals[1] - 1
        C00, C01, C10, C11 = vals[2], vals[3], vals[4], vals[5]
        P0, P1, Q0, Q1 = vals[6], vals[7], vals[8], vals[9]
        if C11 == -1:
            C11 = H
        if C10 == -1:
            C10 = 2 * H
        if C01 == -1:
            C01 = 2 * H
        if C00 == -1:
            C00 = 4 * H
        pairs = (
            (2, 1, P0 - P1),
            (2, 2, P1),
            (3, 1, C10 - C11 - P0 + P1),
            (3, 2, C11 - P1 - Q1),
            (3, 3, Q1),
            (4, 1, C00 + C11 - C01 - C10),
            (4, 2, C01 - C11 - Q0 + Q1),
            (4, 3, Q0 - Q1),
        )
        for a, b, c in pairs:
            if c > 0:
                add(nid(u, a), nid(v, b), c)

    total = 0
    while True:
        level = [-1] * N
        level[S] = 0
        dq = deque([S])
        while dq:
            x = dq.popleft()
            lx = level[x] + 1
            for e in adj[x]:
                if cap[e] > 0:
                    w = to[e]
                    if level[w] < 0:
                        level[w] = lx
                        dq.append(w)
        if level[T] < 0:
            break
        it = [0] * N
        stack = []
        x = S
        while True:
            if x == T:
                f = min(cap[e] for e in stack)
                for e in stack:
                    cap[e] -= f
                    cap[e ^ 1] += f
                total += f
                stack = []
                x = S
                continue
            ax = adj[x]
            i = it[x]
            lx = level[x] + 1
            found = -1
            while i < len(ax):
                e = ax[i]
                if cap[e] > 0 and level[to[e]] == lx:
                    found = e
                    break
                i += 1
            it[x] = i
            if found >= 0:
                stack.append(found)
                x = to[found]
            else:
                if x == S:
                    break
                level[x] = -1
                e = stack.pop()
                x = to[e ^ 1]
                it[x] += 1

    print(-(const + total))

main()
