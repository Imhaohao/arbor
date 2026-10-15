import sys


def merge_child(states, child_table):
    merged = {}
    for (total, biggest), value in states.items():
        for k, child_value in enumerate(child_table):
            if child_value is None:
                continue
            key = (total + k, max(biggest, k))
            candidate = value + child_value
            if merged.get(key, -1) < candidate:
                merged[key] = candidate
    return merged


def exit_table(states, own, slots, cap):
    table = [None] * (cap + 1)
    for (total, biggest), value in states.items():
        for pairs in range(min(total // 2, total - biggest) + 1):
            pool = total - 2 * pairs + own
            base = value + 2 * pairs
            for out in range(min(cap, pool) + 1):
                candidate = base + min(slots, pool - out)
                if table[out] is None or candidate > table[out]:
                    table[out] = candidate
    return table


def solve_root(root, n, a, b, adj):
    parent = [0] * (n + 1)
    parent_cap = [0] * (n + 1)
    parent[root] = -1
    order = []
    stack = [root]
    visited = [False] * (n + 1)
    visited[root] = True
    while stack:
        v = stack.pop()
        order.append(v)
        for u, c in adj[v]:
            if not visited[u]:
                visited[u] = True
                parent[u] = v
                parent_cap[u] = c
                stack.append(u)
    tables = [None] * (n + 1)
    for v in reversed(order):
        states = {(0, 0): 0}
        for u, _ in adj[v]:
            if u != parent[v]:
                states = merge_child(states, tables[u])
        cap = parent_cap[v] if v != root else 0
        tables[v] = exit_table(states, a[v], b[v], cap)
    return tables[root][0]


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [0] + [int(x) for x in data[1:1 + n]]
    b = [0] + [int(x) for x in data[1 + n:1 + 2 * n]]
    adj = [[] for _ in range(n + 1)]
    idx = 1 + 2 * n
    for _ in range(n - 1):
        u = int(data[idx])
        v = int(data[idx + 1])
        c = int(data[idx + 2])
        idx += 3
        adj[u].append((v, c))
        adj[v].append((u, c))
    answers = [solve_root(r, n, a, b, adj) for r in range(1, n + 1)]
    print(' '.join(map(str, answers)))


main()
