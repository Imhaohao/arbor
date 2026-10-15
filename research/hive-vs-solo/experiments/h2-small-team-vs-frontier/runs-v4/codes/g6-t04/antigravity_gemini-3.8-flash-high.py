import sys
from collections import deque

def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    it = iter(input_data)
    n = int(next(it))
    m = int(next(it))

    nodes = []
    for _ in range(n):
        a0 = int(next(it))
        k0 = int(next(it))
        b0 = int(next(it))
        c0 = int(next(it))
        a1 = int(next(it))
        k1 = int(next(it))
        b1 = int(next(it))
        c1 = int(next(it))
        nodes.append((a0, k0, b0, c0, a1, k1, b1, c1))

    links = []
    for _ in range(m):
        u = int(next(it)) - 1
        v = int(next(it)) - 1
        c00 = int(next(it))
        c01 = int(next(it))
        c10 = int(next(it))
        c11 = int(next(it))
        p0 = int(next(it))
        p1 = int(next(it))
        q0 = int(next(it))
        q1 = int(next(it))
        links.append((u, v, c00, c01, c10, c11, p0, p1, q0, q1))

    # Graph construction
    # Vertices for each node v (0-indexed):
    # V_IN(v): input stage (x_v)
    # V_OUT(v): output stage (y_v)
    # V_REG(v): regime selection (z_v)
    # AUX1(v): bonus for z_v and x_v
    # AUX2(v): bonus for z_v and y_v
    
    num_nodes = 5 * n + 2
    S = 5 * n
    T = 5 * n + 1

    def V_IN(v): return 5 * v
    def V_OUT(v): return 5 * v + 1
    def V_REG(v): return 5 * v + 2
    def AUX1(v): return 5 * v + 3
    def AUX2(v): return 5 * v + 4

    INF = 10**18

    head = [-1] * num_nodes
    to = []
    nxt = []
    cap = []

    def add_edge(u_node, v_node, w):
        if w < 0:
            return
        to.append(v_node)
        cap.append(w)
        nxt.append(head[u_node])
        head[u_node] = len(to) - 1

        to.append(u_node)
        cap.append(0)
        nxt.append(head[v_node])
        head[v_node] = len(to) - 1

    base = 0

    for v in range(n):
        a0, k0, b0, c0, a1, k1, b1, c1 = nodes[v]
        da = a1 - a0
        dk = k0 - k1
        db = b0 - b1
        dc = c1 - c0

        base += -c0

        # Linear terms:
        # On z_v: -dc
        # On x_v: a0 - k0
        # On y_v: k0 - b0
        # Project selection helper for linear term:
        # If weight > 0: base += weight, add edge S -> var with weight
        # If weight < 0: add edge var -> T with -weight
        
        # Linear on z_v: -dc <= 0
        if dc > 0:
            add_edge(V_REG(v), T, dc)

        # Linear on x_v: a0 - k0
        wx = a0 - k0
        if wx > 0:
            base += wx
            add_edge(S, V_IN(v), wx)
        elif wx < 0:
            add_edge(V_IN(v), T, -wx)

        # Linear on y_v: k0 - b0
        wy = k0 - b0
        if wy > 0:
            base += wy
            add_edge(S, V_OUT(v), wy)
        elif wy < 0:
            add_edge(V_OUT(v), T, -wy)

        # Constraint: x_v >= y_v  <=>  y_v -> x_v has capacity INF
        add_edge(V_OUT(v), V_IN(v), INF)

        # Pairwise bonus: (da + dk) * z_v * x_v
        w_bonus1 = da + dk
        if w_bonus1 > 0:
            base += w_bonus1
            add_edge(S, AUX1(v), w_bonus1)
            add_edge(AUX1(v), V_REG(v), INF)
            add_edge(AUX1(v), V_IN(v), INF)

        # Pairwise bonus: (db - dk) * z_v * y_v
        w_bonus2 = db - dk
        if w_bonus2 > 0:
            base += w_bonus2
            add_edge(S, AUX2(v), w_bonus2)
            add_edge(AUX2(v), V_REG(v), INF)
            add_edge(AUX2(v), V_OUT(v), INF)

    for (u, v, c00, c01, c10, c11, p0, p1, q0, q1) in links:
        dp = p0 - p1
        dq = q0 - q1

        # P sub-channel:
        # Base penalty p1 on x_u (1 - x_v)
        add_edge(V_IN(u), V_IN(v), p1)
        # Extra penalty dp on x_u (1 - z_v)
        if dp > 0:
            add_edge(V_IN(u), V_REG(v), dp)

        # Q sub-channel:
        # Base penalty q1 on y_u (1 - y_v)
        add_edge(V_OUT(u), V_OUT(v), q1)
        # Extra penalty dq on y_u (1 - z_u)
        if dq > 0:
            add_edge(V_OUT(u), V_REG(u), dq)

        # C sub-channel:
        if c11 == -1:
            add_edge(V_OUT(u), V_IN(v), INF)
        else:
            base_c = max(0, c11 - p1 - q1)
            add_edge(V_OUT(u), V_IN(v), base_c)

            extra_u = max(0, c01 - c11)
            if extra_u > 0:
                add_edge(V_OUT(u), V_REG(u), extra_u)

            extra_v = max(0, c10 - c11)
            if extra_v > 0:
                add_edge(V_OUT(u), V_REG(v), extra_v)

    # Dinic's Algorithm
    level = [-1] * num_nodes
    ptr = [-1] * num_nodes

    def bfs():
        for i in range(num_nodes):
            level[i] = -1
        level[S] = 0
        q = deque([S])
        while q:
            cur = q.popleft()
            e = head[cur]
            while e != -1:
                nxt_node = to[e]
                if cap[e] > 0 and level[nxt_node] < 0:
                    level[nxt_node] = level[cur] + 1
                    q.append(nxt_node)
                e = nxt[e]
        return level[T] != -1

    def dfs(cur, pushed):
        if pushed == 0 or cur == T:
            return pushed
        e = ptr[cur]
        while e != -1:
            nxt_node = to[e]
            if level[nxt_node] == level[cur] + 1 and cap[e] > 0:
                tr = dfs(nxt_node, min(pushed, cap[e]))
                if tr > 0:
                    cap[e] -= tr
                    cap[e ^ 1] += tr
                    return tr
            e = nxt[e]
            ptr[cur] = e
        return 0

    max_flow = 0
    while bfs():
        for i in range(num_nodes):
            ptr[i] = head[i]
        while True:
            pushed = dfs(S, INF)
            if pushed == 0:
                break
            max_flow += pushed

    print(base - max_flow)

if __name__ == '__main__':
    solve()
