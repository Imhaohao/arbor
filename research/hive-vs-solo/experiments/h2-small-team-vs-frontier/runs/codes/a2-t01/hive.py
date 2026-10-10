import sys
from heapq import heappush, heappop, heapify


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    m = int(data[1])
    k = int(data[2])
    pos = 3
    c = [int(x) for x in data[pos:pos + n]]
    pos += n
    depots = [int(x) - 1 for x in data[pos:pos + k]]
    pos += k

    adj = [[] for _ in range(n)]
    for _ in range(m):
        u = int(data[pos]) - 1
        v = int(data[pos + 1]) - 1
        w = int(data[pos + 2])
        pos += 3
        adj[u].append((v, w))
        adj[v].append((u, w))

    if k == 1:
        print(-1)
        return

    SHIFT_V = 17
    SHIFT_D = 34
    MASK = (1 << 17) - 1

    cnt = [0] * n
    first_src = [-1] * n
    first_d = [0] * n
    second_d = [0] * n

    heap = [(city << SHIFT_V) | i for i, city in enumerate(depots)]
    heapify(heap)

    while heap:
        code = heappop(heap)
        v = (code >> SHIFT_V) & MASK
        s = code & MASK
        cv = cnt[v]
        if cv == 2 or (cv == 1 and first_src[v] == s):
            continue
        dist = code >> SHIFT_D
        if cv == 0:
            first_src[v] = s
            first_d[v] = dist
        else:
            second_d[v] = dist
        cnt[v] = cv + 1
        for u, w in adj[v]:
            cu = cnt[u]
            if cu == 2 or (cu == 1 and first_src[u] == s):
                continue
            heappush(heap, ((dist + w) << SHIFT_D) | (u << SHIFT_V) | s)

    total = 0
    delta = [0] * k
    for v in range(n):
        cv = c[v]
        total += cv * first_d[v]
        delta[first_src[v]] += cv * (second_d[v] - first_d[v])

    print(' '.join(str(total + delta[i]) for i in range(k)))


main()
