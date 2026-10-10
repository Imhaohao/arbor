import sys
from heapq import heappush, heappop

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    data = list(map(int, input_data))
    n = data[0]
    m = data[1]
    k = data[2]

    if k == 1:
        sys.stdout.write("-1\n")
        return

    idx = 3
    c = [0] + data[idx:idx + n]
    idx += n

    depots = data[idx:idx + k]
    idx += k

    adj = [[] for _ in range(n + 1)]
    for _ in range(m):
        u = data[idx]
        v = data[idx + 1]
        w = data[idx + 2]
        adj[u].append((v, w))
        adj[v].append((u, w))
        idx += 3

    p1 = [0] * (n + 1)
    d1 = [0] * (n + 1)
    p2 = [0] * (n + 1)
    d2 = [0] * (n + 1)

    heap = []
    push = heappush
    pop = heappop

    for d in depots:
        push(heap, (0, d, d))

    remaining_p2 = n
    while heap:
        d, u, s = pop(heap)
        if p1[u] == 0:
            p1[u] = s
            d1[u] = d
        elif p1[u] == s:
            continue
        elif p2[u] == 0:
            p2[u] = s
            d2[u] = d
            remaining_p2 -= 1
            if remaining_p2 == 0:
                break
        else:
            continue

        for v, w in adj[u]:
            if p2[v]:
                continue
            if p1[v] == s:
                continue
            push(heap, (d + w, v, s))

    base_cost = 0
    for v in range(1, n + 1):
        base_cost += c[v] * d1[v]

    cost_if_closed = [base_cost] * (n + 1)
    for v in range(1, n + 1):
        cost_if_closed[p1[v]] += c[v] * (d2[v] - d1[v])

    ans = [str(cost_if_closed[d]) for d in depots]
    sys.stdout.write(" ".join(ans) + "\n")

if __name__ == '__main__':
    main()
