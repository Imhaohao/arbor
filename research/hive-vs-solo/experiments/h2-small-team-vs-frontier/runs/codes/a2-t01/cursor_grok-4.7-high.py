import sys
from heapq import heappush, heappop


def main():
    data = sys.stdin.buffer.read().split()
    it = iter(data)
    n = int(next(it))
    m = int(next(it))
    k = int(next(it))
    if k == 1:
        sys.stdout.write("-1\n")
        return

    c = [0] * (n + 1)
    for i in range(1, n + 1):
        c[i] = int(next(it))
    depots = [int(next(it)) for _ in range(k)]

    adj = [[] for _ in range(n + 1)]
    for _ in range(m):
        u = int(next(it))
        v = int(next(it))
        w = int(next(it))
        adj[u].append((v, w))
        adj[v].append((u, w))

    INF = 10**18
    d1 = [INF] * (n + 1)
    d2 = [INF] * (n + 1)
    p1 = [-1] * (n + 1)
    p2 = [-1] * (n + 1)
    pq = []

    for d in depots:
        d1[d] = 0
        p1[d] = d
        heappush(pq, (0, d, d))

    while pq:
        dist, v, src = heappop(pq)
        if not ((src == p1[v] and dist == d1[v]) or (src == p2[v] and dist == d2[v])):
            continue
        for to, w in adj[v]:
            nd = dist + w
            sp1 = p1[to]
            if src == sp1:
                if nd < d1[to]:
                    d1[to] = nd
                    heappush(pq, (nd, to, src))
                continue
            if src == p2[to]:
                if nd < d2[to]:
                    if nd < d1[to]:
                        d2[to] = d1[to]
                        p2[to] = sp1
                        d1[to] = nd
                        p1[to] = src
                    else:
                        d2[to] = nd
                    heappush(pq, (nd, to, src))
                continue
            if nd < d1[to]:
                d2[to] = d1[to]
                p2[to] = sp1
                d1[to] = nd
                p1[to] = src
                heappush(pq, (nd, to, src))
            elif nd < d2[to]:
                d2[to] = nd
                p2[to] = src
                heappush(pq, (nd, to, src))

    pos = [-1] * (n + 1)
    for i, d in enumerate(depots):
        pos[d] = i

    base = 0
    extra = [0] * k
    for v in range(1, n + 1):
        cv = c[v]
        if cv == 0:
            continue
        base += cv * d1[v]
        diff = d2[v] - d1[v]
        if diff:
            extra[pos[p1[v]]] += cv * diff

    sys.stdout.write(" ".join(str(base + extra[i]) for i in range(k)) + "\n")


if __name__ == "__main__":
    main()
