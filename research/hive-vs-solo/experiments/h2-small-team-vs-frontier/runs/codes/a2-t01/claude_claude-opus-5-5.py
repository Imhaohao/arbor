import sys
from heapq import heappush, heappop

def main():
    data = sys.stdin.buffer.read().split()
    pos = 0
    n = int(data[0]); m = int(data[1]); k = int(data[2]); pos = 3
    c = [0] * (n + 1)
    for i in range(1, n + 1):
        c[i] = int(data[pos]); pos += 1
    depots = [int(x) for x in data[pos:pos + k]]; pos += k
    if k == 1:
        print(-1)
        return
    adj = [[] for _ in range(n + 1)]
    for _ in range(m):
        u = int(data[pos]); v = int(data[pos + 1]); w = int(data[pos + 2]); pos += 3
        adj[u].append((v, w))
        adj[v].append((u, w))

    SHIFT_V = 17
    SHIFT_D = 34
    MASK = (1 << 17) - 1
    cnt = [0] * (n + 1)
    src1 = [-1] * (n + 1)
    d1 = [0] * (n + 1)
    d2 = [0] * (n + 1)
    heap = []
    for idx, dv in enumerate(depots):
        heap.append((dv << SHIFT_V) | idx)
    heap.sort()
    push = heappush
    pop = heappop
    while heap:
        key = pop(heap)
        s = key & MASK
        v = (key >> SHIFT_V) & MASK
        d = key >> SHIFT_D
        cv = cnt[v]
        if cv == 0:
            cnt[v] = 1
            src1[v] = s
            d1[v] = d
        elif cv == 1 and src1[v] != s:
            cnt[v] = 2
            d2[v] = d
        else:
            continue
        for u, w in adj[v]:
            if cnt[u] < 2 and src1[u] != s:
                push(heap, ((d + w) << SHIFT_D) | (u << SHIFT_V) | s)

    base = 0
    delta = [0] * k
    for v in range(1, n + 1):
        cv = c[v]
        if cv:
            base += cv * d1[v]
            delta[src1[v]] += cv * (d2[v] - d1[v])
    sys.stdout.write(" ".join(str(base + x) for x in delta) + "\n")

main()
