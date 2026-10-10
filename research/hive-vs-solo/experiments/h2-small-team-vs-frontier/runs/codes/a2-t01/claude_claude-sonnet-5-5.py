import sys
from heapq import heappush, heappop

def main():
    data = sys.stdin.buffer.read().split()
    n, m, k = int(data[0]), int(data[1]), int(data[2])
    c = [0] + [int(x) for x in data[3:3 + n]]
    depots = [int(x) for x in data[3 + n:3 + n + k]]
    if k == 1:
        print(-1)
        return
    adj = [[] for _ in range(n + 1)]
    p = 3 + n + k
    for _ in range(m):
        u = int(data[p]); v = int(data[p + 1]); w = int(data[p + 2])
        p += 3
        adj[u].append((v, w))
        adj[v].append((u, w))
    M = (1 << 17) - 1
    cnt = [0] * (n + 1)
    s1 = [0] * (n + 1)
    d1 = [0] * (n + 1)
    d2 = [0] * (n + 1)
    heap = [(dep << 17) | dep for dep in depots]
    heap.sort()
    while heap:
        x = heappop(heap)
        s = x & M
        v = (x >> 17) & M
        d = x >> 34
        cv = cnt[v]
        if cv == 2 or (cv == 1 and s1[v] == s):
            continue
        if cv == 0:
            s1[v] = s
            d1[v] = d
        else:
            d2[v] = d
        cnt[v] = cv + 1
        for u, w in adj[v]:
            cu = cnt[u]
            if cu < 2 and not (cu == 1 and s1[u] == s):
                heappush(heap, ((d + w) << 34) | (u << 17) | s)
    base = 0
    a = [0] * (n + 1)
    b = [0] * (n + 1)
    for v in range(1, n + 1):
        cd = c[v] * d1[v]
        base += cd
        o = s1[v]
        a[o] += cd
        b[o] += c[v] * d2[v]
    print(" ".join(str(base - a[d] + b[d]) for d in depots))

main()
