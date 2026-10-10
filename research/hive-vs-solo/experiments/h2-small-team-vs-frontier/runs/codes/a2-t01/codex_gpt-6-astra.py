import sys
from heapq import heapify, heappop, heappush


def main():
    data = map(int, sys.stdin.buffer.read().split())
    n = next(data)
    m = next(data)
    k = next(data)

    if k == 1:
        print(-1)
        return

    demand = [next(data) for _ in range(n)]
    depots = [next(data) - 1 for _ in range(k)]

    graph = [[] for _ in range(n)]
    for _ in range(m):
        u = next(data) - 1
        v = next(data) - 1
        w = next(data)
        graph[u].append((v, w))
        graph[v].append((u, w))

    inf = 10**18
    distance = [inf] * n
    owner = [-1] * n
    heap = []

    for depot_id, city in enumerate(depots):
        distance[city] = 0
        owner[city] = depot_id
        heap.append((0, city))
    heapify(heap)

    # Find one nearest depot for every city.
    while heap:
        current, u = heappop(heap)
        if current != distance[u]:
            continue

        region = owner[u]
        for v, weight in graph[u]:
            candidate = current + weight
            if candidate < distance[v]:
                distance[v] = candidate
                owner[v] = region
                heappush(heap, (candidate, v))

    # A route to a different depot must cross the boundary of its region.
    alternative = [inf] * n
    base_cost = 0
    heap = []

    for u in range(n):
        base_cost += demand[u] * distance[u]
        region = owner[u]
        best = inf

        for v, weight in graph[u]:
            if owner[v] != region:
                candidate = distance[v] + weight
                if candidate < best:
                    best = candidate

        if best != inf:
            alternative[u] = best
            heap.append((best, u))

    heapify(heap)

    # Propagate boundary routes inside each nearest-depot region.
    while heap:
        current, u = heappop(heap)
        if current != alternative[u]:
            continue

        region = owner[u]
        for v, weight in graph[u]:
            candidate = current + weight
            if candidate < alternative[v] and owner[v] == region:
                alternative[v] = candidate
                heappush(heap, (candidate, v))

    answers = [base_cost] * k
    for u in range(n):
        answers[owner[u]] += demand[u] * (alternative[u] - distance[u])

    sys.stdout.write(" ".join(map(str, answers)) + "\n")


if __name__ == "__main__":
    main()
