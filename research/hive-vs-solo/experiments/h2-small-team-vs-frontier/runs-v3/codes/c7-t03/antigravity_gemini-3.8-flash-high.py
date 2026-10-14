import sys

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    
    n = int(input_data[0])
    r = [0] + [int(x) for x in input_data[1:n + 1]]
    
    adj = [[] for _ in range(n + 1)]
    idx = n + 1
    for _ in range(n - 1):
        u = int(input_data[idx])
        v = int(input_data[idx + 1])
        idx += 2
        adj[u].append(v)
        adj[v].append(u)
        
    if n == 1:
        sys.stdout.write("0\n")
        return

    removed = [False] * (n + 1)
    sz = [0] * (n + 1)
    parent_bfs = [0] * (n + 1)
    vis = [0] * (n + 1)
    d = [0] * (n + 1)
    M = [0] * (n + 1)
    ans = [0] * (n + 1)
    
    events = [[] for _ in range(n + 5)]
    bit_cnt = [0] * (n + 5)
    bit_sum = [0] * (n + 5)
    
    def process_sweep(nodes, sign, S):
        points = [u for u in nodes if M[u] >= 0]
        queries = [u for u in nodes if M[u] >= 0]
        if not points or not queries:
            return

        points.sort(key=lambda u: d[u])
        queries.sort(key=lambda u: M[u] if M[u] < S else S)

        max_idx = S + 2
        p_idx = 0
        n_pts = len(points)
        tot_cnt = 0
        tot_sd = 0

        for v in queries:
            mv = M[v]
            if mv > S:
                mv = S
            while p_idx < n_pts and d[points[p_idx]] <= mv:
                u = points[p_idx]
                mu = M[u]
                if mu > S:
                    mu = S
                idx_b = mu + 1
                du = d[u]
                tot_cnt += 1
                tot_sd += du
                i = idx_b
                while i <= max_idx:
                    bit_cnt[i] += 1
                    bit_sum[i] += du
                    i += i & (-i)
                p_idx += 1

            dv = d[v]
            c = 0
            s = 0
            i = dv
            while i > 0:
                c += bit_cnt[i]
                s += bit_sum[i]
                i -= i & (-i)

            cnt = tot_cnt - c
            sd = tot_sd - s
            ans[v] += sign * (cnt * dv + sd)

        for k in range(p_idx):
            u = points[k]
            mu = M[u]
            if mu > S:
                mu = S
            idx_b = mu + 1
            du = d[u]
            i = idx_b
            while i <= max_idx:
                bit_cnt[i] -= 1
                bit_sum[i] -= du
                i += i & (-i)

    token = 0
    todo = [1]
    
    while todo:
        entry = todo.pop()
        if removed[entry]:
            continue
        
        token += 1
        comp = [entry]
        vis[entry] = token
        parent_bfs[entry] = 0
        
        for u in comp:
            for v in adj[u]:
                if not removed[v] and vis[v] != token:
                    vis[v] = token
                    parent_bfs[v] = u
                    comp.append(v)
                    
        S = len(comp)
        if S == 1:
            removed[comp[0]] = True
            continue

        for u in comp:
            sz[u] = 1

        for u in reversed(comp):
            p = parent_bfs[u]
            if p != 0:
                sz[p] += sz[u]

        C = comp[0]
        while True:
            heavy = 0
            for v in adj[C]:
                if not removed[v] and parent_bfs[v] == C:
                    if sz[v] > S // 2:
                        heavy = v
                        break
            if heavy != 0:
                C = heavy
            else:
                break

        d[C] = 0
        M[C] = 10**9
        comp_nodes = [C]
        sub_lists = []

        act_C = r[C] + 1
        pushed_C = False
        if act_C < S:
            events[act_C].append(r[C])
            pushed_C = True

        for nbr in adj[C]:
            if removed[nbr]:
                continue
            sub_list = []
            stack = [(nbr, C, 1, 0, False)]
            while stack:
                u, p, depth, state, pushed = stack.pop()
                if state == 0:
                    sub_list.append(u)
                    d[u] = depth
                    cur_min = M[p]
                    if events[depth]:
                        m = min(events[depth])
                        if m < cur_min:
                            cur_min = m
                    M[u] = cur_min

                    act_d = depth + r[u] + 1
                    pushed_u = False
                    if act_d < S:
                        events[act_d].append(r[u] - depth)
                        pushed_u = True

                    stack.append((u, p, depth, 1, pushed_u))
                    for v in adj[u]:
                        if v != p and not removed[v]:
                            stack.append((v, u, depth + 1, 0, False))
                else:
                    if pushed:
                        events[depth + r[u] + 1].pop()

            sub_lists.append(sub_list)
            comp_nodes.extend(sub_list)

        if pushed_C:
            events[act_C].pop()

        process_sweep(comp_nodes, 1, S)
        for sub_list in sub_lists:
            process_sweep(sub_list, -1, S)

        removed[C] = True
        for nbr in adj[C]:
            if not removed[nbr]:
                todo.append(nbr)

    sys.stdout.write(" ".join(map(str, ans[1:n + 1])) + "\n")

if __name__ == '__main__':
    main()
