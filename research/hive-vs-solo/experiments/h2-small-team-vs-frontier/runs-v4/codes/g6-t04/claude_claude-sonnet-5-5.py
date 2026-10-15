import sys
from collections import deque


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    m = int(data[1])
    pos = 2
    INF = 10 ** 15
    BIG = 10 ** 15
    S, T = 0, 1
    cap_map = {}

    def add(a, b, c):
        if c > 0:
            key = (a, b)
            cap_map[key] = cap_map.get(key, 0) + c

    def node_id(v, i):
        return 2 + v * 5 + (i - 1)

    labels = [(0, 0), (0, 1), (1, 0), (1, 1), (2, 1), (2, 0)]
    const = 0
    for v in range(n):
        vals = [int(x) for x in data[pos:pos + 8]]
        pos += 8
        regimes = [vals[0:4], vals[4:8]]
        unary = []
        for level, s in labels:
            a, k, b, c = regimes[s]
            if level == 0:
                unary.append(b - a + c)
            elif level == 1:
                unary.append(k - a + c)
            else:
                unary.append(c)
        const += unary[0]
        for i in range(1, 6):
            lam = unary[i] - unary[i - 1]
            if lam > 0:
                add(S, node_id(v, i), lam)
            elif lam < 0:
                const += lam
                add(node_id(v, i), T, -lam)
        for i in range(1, 5):
            add(node_id(v, i), node_id(v, i + 1), INF)

    for _ in range(m):
        u = int(data[pos]) - 1
        v = int(data[pos + 1]) - 1
        raw = [int(x) for x in data[pos + 2:pos + 6]]
        P = [int(data[pos + 6]), int(data[pos + 7])]
        Q = [int(data[pos + 8]), int(data[pos + 9])]
        pos += 10
        C = [[BIG if raw[0] == -1 else raw[0], BIG if raw[1] == -1 else raw[1]],
             [BIG if raw[2] == -1 else raw[2], BIG if raw[3] == -1 else raw[3]]]

        def cost(p, q):
            lp, sp = labels[p]
            lq, sq = labels[q]
            if lp == 0 and lq == 1:
                return Q[sp]
            if lp == 0 and lq == 2:
                return C[sp][sq]
            if lp == 1 and lq == 2:
                return P[sq]
            return 0

        for j in range(2, 6):
            suffix = [0] * 7
            for p in range(5, -1, -1):
                inc = cost(p, j) - cost(p, j - 1)
                suffix[p] = max(inc, suffix[p + 1])
            for i in range(5):
                w = suffix[i] - suffix[i + 1]
                if w > 0:
                    add(node_id(u, i + 1), node_id(v, j), w)

    N = 2 + 5 * n
    adj = [[] for _ in range(N)]
    to = []
    cap = []
    for (a, b), c in cap_map.items():
        adj[a].append(len(to))
        to.append(b)
        cap.append(c)
        adj[b].append(len(to))
        to.append(a)
        cap.append(0)

    flow = 0
    while True:
        level = [-1] * N
        level[S] = 0
        dq = deque([S])
        while dq:
            x = dq.popleft()
            for e in adj[x]:
                if cap[e] > 0 and level[to[e]] < 0:
                    level[to[e]] = level[x] + 1
                    dq.append(to[e])
        if level[T] < 0:
            break
        it = [0] * N
        path = []
        u = S
        while True:
            if u == T:
                f = min(cap[e] for e in path)
                for e in path:
                    cap[e] -= f
                    cap[e ^ 1] += f
                flow += f
                path = []
                u = S
                continue
            advanced = False
            au = adj[u]
            while it[u] < len(au):
                e = au[it[u]]
                if cap[e] > 0 and level[to[e]] == level[u] + 1:
                    path.append(e)
                    u = to[e]
                    advanced = True
                    break
                it[u] += 1
            if not advanced:
                if u == S:
                    break
                level[u] = -1
                e = path.pop()
                u = to[e ^ 1]
                it[u] += 1

    print(-(const + flow))


main()
