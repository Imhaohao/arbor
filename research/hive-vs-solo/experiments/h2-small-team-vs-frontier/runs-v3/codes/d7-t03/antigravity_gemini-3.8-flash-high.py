import collections
import sys

# Increase recursion depth just in case, though all operations are iterative
sys.setrecursionlimit(300000)


def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    it = iter(input_data)
    n = int(next(it))
    q = int(next(it))

    r = [0] * (n + 1)
    for i in range(1, n + 1):
        r[i] = int(next(it))

    adj = [[] for _ in range(n + 1)]
    for _ in range(n - 1):
        u = int(next(it))
        v = int(next(it))
        w = int(next(it))
        adj[u].append((v, w))
        adj[v].append((u, w))

    K = 17  # 2^16 = 65536 > 50000

    depth_edges = [0] * (n + 1)
    dist_root = [0] * (n + 1)
    up_tree = [[0] * (n + 1) for _ in range(K)]

    # BFS from root = 1 to compute tree structure
    queue = collections.deque([1])
    visited = [False] * (n + 1)
    visited[1] = True
    order = []

    while queue:
        u = queue.popleft()
        order.append(u)
        for v, w in adj[u]:
            if not visited[v]:
                visited[v] = True
                up_tree[0][v] = u
                depth_edges[v] = depth_edges[u] + 1
                dist_root[v] = dist_root[u] + w
                queue.append(v)

    # Build binary lifting table for tree ancestors
    for p in range(1, K):
        prev = up_tree[p - 1]
        curr = up_tree[p]
        for u in range(1, n + 1):
            curr[u] = prev[prev[u]]

    INF = 10**18
    val = [INF] * (n + 1)
    for u in range(1, n + 1):
        val[u] = dist_root[u] - r[u]

    # RMQ tables along ancestor paths
    rmq_val = [[INF] * (n + 1) for _ in range(K)]
    rmq_node = [[0] * (n + 1) for _ in range(K)]

    for u in range(1, n + 1):
        rmq_val[0][u] = val[u]
        rmq_node[0][u] = u

    for p in range(1, K):
        prev_val = rmq_val[p - 1]
        prev_node = rmq_node[p - 1]
        curr_val = rmq_val[p]
        curr_node = rmq_node[p]
        prev_anc = up_tree[p - 1]
        for u in range(1, n + 1):
            anc = prev_anc[u]
            v1 = prev_val[u]
            v2 = prev_val[anc]
            if v1 <= v2:
                curr_val[u] = v1
                curr_node[u] = prev_node[u]
            else:
                curr_val[u] = v2
                curr_node[u] = prev_node[anc]

    # Precompute best[u]: ancestor b of u within distance r[u] minimizing val(b)
    best = [0] * (n + 1)
    for u in range(1, n + 1):
        # Find highest ancestor within distance r[u]
        curr = u
        for p in range(K - 1, -1, -1):
            anc = up_tree[p][curr]
            if anc != 0 and dist_root[u] - dist_root[anc] <= r[u]:
                curr = anc
        top = curr

        # Find argmin of val in path [u, top]
        curr = u
        best_v = INF
        best_n = u
        for p in range(K - 1, -1, -1):
            if depth_edges[curr] - (1 << p) >= depth_edges[top] - 1:
                if rmq_val[p][curr] < best_v:
                    best_v = rmq_val[p][curr]
                    best_n = rmq_node[p][curr]
                curr = up_tree[p][curr]
        best[u] = best_n

    # Binary lifting on best
    up_best = [[0] * (n + 1) for _ in range(K)]
    for u in range(1, n + 1):
        if best[u] != u:
            up_best[0][u] = best[u]

    for p in range(1, K):
        prev_best = up_best[p - 1]
        curr_best = up_best[p]
        for u in range(1, n + 1):
            curr_best[u] = prev_best[prev_best[u]]

    def get_lca(u, v):
        if depth_edges[u] < depth_edges[v]:
            u, v = v, u
        diff = depth_edges[u] - depth_edges[v]
        for p in range(K - 1, -1, -1):
            if (diff >> p) & 1:
                u = up_tree[p][u]
        if u == v:
            return u
        for p in range(K - 1, -1, -1):
            if up_tree[p][u] != up_tree[p][v]:
                u = up_tree[p][u]
                v = up_tree[p][v]
        return up_tree[0][u]

    def get_d(u, L):
        if u == L:
            return 0, 0
        if dist_root[u] - dist_root[L] <= r[u]:
            return 1, u

        curr = u
        hops = 0
        for p in range(K - 1, -1, -1):
            nxt = up_best[p][curr]
            if nxt != 0 and dist_root[nxt] - dist_root[L] > r[nxt]:
                hops += 1 << p
                curr = nxt

        P = curr
        A = up_best[0][P]
        if A == 0 or dist_root[A] - dist_root[L] > r[A]:
            return -1, 0
        return hops + 2, P

    def can_cross(P_from, d_from, M_other, L):
        if d_from == 1:
            return (dist_root[P_from] - dist_root[L]) <= M_other

        max_d = dist_root[P_from] if dist_root[P_from] < dist_root[L] + M_other else dist_root[L] + M_other
        min_d = dist_root[P_from] - r[P_from]
        if min_d < dist_root[L] + 1:
            min_d = dist_root[L] + 1
        if min_d > max_d:
            return False

        curr = P_from
        if dist_root[curr] > max_d:
            for p in range(K - 1, -1, -1):
                anc = up_tree[p][curr]
                if anc != 0 and dist_root[anc] > max_d:
                    curr = anc
            curr = up_tree[0][curr]

        bot = curr
        if bot == 0 or depth_edges[bot] <= depth_edges[L] or dist_root[bot] < min_d:
            return False

        curr = bot
        for p in range(K - 1, -1, -1):
            anc = up_tree[p][curr]
            if anc != 0 and dist_root[anc] >= min_d and depth_edges[anc] > depth_edges[L]:
                curr = anc
        top = curr

        curr = bot
        for p in range(K - 1, -1, -1):
            if depth_edges[curr] - (1 << p) >= depth_edges[top] - 1:
                if rmq_val[p][curr] <= dist_root[L]:
                    return True
                curr = up_tree[p][curr]
        return False

    out = []
    for _ in range(q):
        u = int(next(it))
        v = int(next(it))

        if u == v:
            out.append(0)
            continue

        L = get_lca(u, v)
        d1, Pu = get_d(u, L)
        d2, Pv = get_d(v, L)

        if d1 == -1 or d2 == -1:
            out.append(-1)
            continue

        if u == L:
            out.append(d2)
            continue
        if v == L:
            out.append(d1)
            continue

        # Both u != L and v != L
        if d1 == 1:
            Mu = r[u] - (dist_root[u] - dist_root[L])
        else:
            Au = up_best[0][Pu]
            Mu = r[Au] - (dist_root[Au] - dist_root[L])

        if d2 == 1:
            Mv = r[v] - (dist_root[v] - dist_root[L])
        else:
            Av = up_best[0][Pv]
            Mv = r[Av] - (dist_root[Av] - dist_root[L])

        if can_cross(Pv, d2, Mu, L) or can_cross(Pu, d1, Mv, L):
            out.append(d1 + d2 - 1)
        else:
            out.append(d1 + d2)

    sys.stdout.write('\n'.join(map(str, out)) + '\n')


if __name__ == '__main__':
    solve()
