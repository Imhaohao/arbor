import sys


def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    it = iter(input_data)
    n = int(next(it))

    a = [0] * (n + 1)
    for i in range(1, n + 1):
        a[i] = int(next(it))

    b = [0] * (n + 1)
    for i in range(1, n + 1):
        b[i] = int(next(it))

    total_a = sum(a)

    if n == 1:
        ans = min(a[1], b[1])
        sys.stdout.write(f"{ans}\n")
        return

    adj = [[] for _ in range(n + 1)]
    # Each edge has an index from 0 to n - 2
    # Directed edge u -> v stored as (v, cap, edge_idx, dir_flag)
    # dir_flag: 0 for u < v, 1 for u > v
    edge_cap = [0] * (n - 1)
    for i in range(n - 1):
        u = int(next(it))
        v = int(next(it))
        c = int(next(it))
        edge_cap[i] = c
        adj[u].append((v, c, i, 0))
        adj[v].append((u, c, i, 1))

    # BFS to establish parent-child relationships and topological order
    order = []
    parent = [0] * (n + 1)
    edge_to_parent = [-1] * (n + 1)
    dir_to_parent = [0] * (n + 1)
    cap_to_parent = [0] * (n + 1)
    children = [[] for _ in range(n + 1)]

    visited = [False] * (n + 1)
    queue = [1]
    visited[1] = True
    head = 0

    while head < len(queue):
        u = queue[head]
        head += 1
        order.append(u)
        for v, cap, e_idx, d_flag in adj[u]:
            if not visited[v]:
                visited[v] = True
                parent[v] = u
                edge_to_parent[v] = e_idx
                dir_to_parent[v] = d_flag
                cap_to_parent[v] = cap
                children[u].append((v, cap, e_idx, 1 - d_flag))
                queue.append(v)

    # dp_val[e_idx][d_flag]: flow along directed edge
    # trapped_val[e_idx][d_flag]: trapped flow on that directed edge
    dp_val = [[0, 0] for _ in range(n - 1)]
    trapped_val = [[0, 0] for _ in range(n - 1)]

    # 1. Bottom-up DP: compute dp for v -> parent[v]
    for u in reversed(order):
        if u == 1:
            continue
        p = parent[u]
        e_idx = edge_to_parent[u]
        d_flag = dir_to_parent[u]
        cap = cap_to_parent[u]

        S = 0
        M = 0
        for v, c_v, e_v, d_v in children[u]:
            # incoming to u from child v is directed edge v -> u, which is (e_v, 1 - d_v)
            val = dp_val[e_v][1 - d_v]
            S += val
            if val > M:
                M = val

        if 2 * M > S:
            unpaired_children = 2 * M - S
        else:
            unpaired_children = S % 2

        unpaired = a[u] + unpaired_children
        unabsorbed = unpaired - b[u]
        if unabsorbed < 0:
            unabsorbed = 0

        flow = cap if cap < unabsorbed else unabsorbed
        trapped = unabsorbed - flow

        dp_val[e_idx][d_flag] = flow
        trapped_val[e_idx][d_flag] = trapped

    # 2. Top-down DP: compute dp for u -> child v
    for u in order:
        # Collect incoming flows from all neighbors of u
        # Neighbors include children and parent (if u != 1)
        # Store (neighbor, flow, edge_idx, dir_flag)
        deg = len(adj[u])
        if deg <= 1 and u != 1:
            # Leaf node: children list is empty, only parent exists, no u -> child to compute
            continue

        S = 0
        # Find top 2 values among all neighbors
        m1_val, m1_v = -1, -1
        m2_val = -1

        for v, cap, e_idx, d_flag in adj[u]:
            # incoming from v to u is in direction v -> u
            # d_flag is the direction of u -> v, so v -> u has direction 1 - d_flag
            val = dp_val[e_idx][1 - d_flag]
            S += val
            if val > m1_val:
                m2_val = m1_val
                m1_val = val
                m1_v = v
            elif val > m2_val:
                m2_val = val

        for v, cap, e_idx, d_flag in children[u]:
            val_v = dp_val[e_idx][1 - d_flag]
            S_sub = S - val_v
            M_sub = m2_val if v == m1_v else m1_val
            if M_sub < 0:
                M_sub = 0

            if 2 * M_sub > S_sub:
                unpaired_children = 2 * M_sub - S_sub
            else:
                unpaired_children = S_sub % 2

            unpaired = a[u] + unpaired_children
            unabsorbed = unpaired - b[u]
            if unabsorbed < 0:
                unabsorbed = 0

            flow = cap if cap < unabsorbed else unabsorbed
            trapped = unabsorbed - flow

            dp_val[e_idx][d_flag] = flow
            trapped_val[e_idx][d_flag] = trapped

    # 3. Compute total trapped for root = 1
    total_trapped = [0] * (n + 1)
    base_trapped = 0
    for u in range(2, n + 1):
        e_idx = edge_to_parent[u]
        d_flag = dir_to_parent[u]
        base_trapped += trapped_val[e_idx][d_flag]
    total_trapped[1] = base_trapped

    # 4. Rerooting to propagate total_trapped
    for u in order:
        for v, cap, e_idx, d_flag in children[u]:
            # In T_u, edge between u and v was directed v -> u (d_parent = 1 - d_flag)
            # In T_v, edge becomes u -> v (d_child = d_flag)
            total_trapped[v] = (
                total_trapped[u]
                - trapped_val[e_idx][1 - d_flag]
                + trapped_val[e_idx][d_flag]
            )

    # 5. Compute answers for each root r
    ans = [0] * (n + 1)
    for r in range(1, n + 1):
        S = 0
        M = 0
        for v, cap, e_idx, d_flag in adj[r]:
            val = dp_val[e_idx][1 - d_flag]
            S += val
            if val > M:
                M = val

        if 2 * M > S:
            unpaired_children = 2 * M - S
        else:
            unpaired_children = S % 2

        unpaired = a[r] + unpaired_children
        unabsorbed = unpaired - b[r]
        if unabsorbed < 0:
            unabsorbed = 0

        ans[r] = total_a - total_trapped[r] - unabsorbed

    sys.stdout.write(" ".join(str(ans[i]) for i in range(1, n + 1)) + "\n")


if __name__ == "__main__":
    solve()
