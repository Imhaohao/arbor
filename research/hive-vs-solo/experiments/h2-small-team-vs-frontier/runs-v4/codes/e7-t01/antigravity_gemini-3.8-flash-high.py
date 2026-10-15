import sys

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    
    n = int(input_data[0])
    a = [0] * (n + 1)
    for i in range(1, n + 1):
        a[i] = int(input_data[i])
    
    if n == 1:
        print(a[1])
        return

    adj = [[] for _ in range(n + 1)]
    idx = n + 1
    for i in range(n - 1):
        u = int(input_data[idx])
        v = int(input_data[idx + 1])
        idx += 2
        # Directed edge IDs:
        # u -> v: 2 * i
        # v -> u: 2 * i + 1
        adj[u].append((v, 2 * i, 2 * i + 1))
        adj[v].append((u, 2 * i + 1, 2 * i))
    
    # BFS to establish tree structure rooted at 1
    order = []
    parent = [0] * (n + 1)
    parent_edge = [0] * (n + 1)  # Directed edge ID from v to parent[v]
    visited = [False] * (n + 1)
    visited[1] = True
    queue = [1]
    head = 0
    while head < len(queue):
        u = queue[head]
        head += 1
        order.append(u)
        for v, to_v, from_v in adj[u]:
            if not visited[v]:
                visited[v] = True
                parent[v] = u
                parent_edge[v] = from_v  # v -> u
                queue.append(v)
    
    num_directed_edges = 2 * (n - 1)
    dp_s = [0] * num_directed_edges
    dp_max = [0] * num_directed_edges
    dp_min = [0] * num_directed_edges

    def combine(a_u, children):
        # children is a list of (s_c, max_c, min_c)
        Z = []
        sum_max_O = 0
        sum_min_O = 0
        sum_V_O = 0
        for s_c, max_c, min_c in children:
            if s_c == 0:
                Z.append((max_c + min_c, max_c, min_c))
            else:
                sum_max_O += max_c
                sum_min_O += min_c
                sum_V_O += max(max_c, -min_c)
        
        k = len(Z)
        if k == 0:
            return (0, a_u + sum_max_O, a_u + sum_min_O)
        if k == 1:
            delta_z, max_z, min_z = Z[0]
            return (1, max_z - a_u - sum_min_O, min_z - a_u - sum_max_O)
        
        Z.sort(key=lambda item: item[0], reverse=True)
        cnt_pos = (k + 1) // 2
        sign_a = a_u if (k % 2 == 0) else -a_u
        
        sum_delta_top = sum(item[0] for item in Z[:cnt_pos])
        total_min_Z = sum(item[2] for item in Z)
        max_u = sign_a + sum_V_O - total_min_Z + sum_delta_top
        
        sum_delta_bot = sum(item[0] for item in Z[k - cnt_pos:])
        total_max_Z = sum(item[1] for item in Z)
        min_u = sign_a - sum_V_O - total_max_Z + sum_delta_bot
        
        return (1, max_u, min_u)

    # Pass 1: Bottom-up (reversed BFS order)
    for u in reversed(order):
        if u == 1:
            continue
        children_data = []
        for v, to_v, from_v in adj[u]:
            if v != parent[u]:
                children_data.append((dp_s[from_v], dp_max[from_v], dp_min[from_v]))
        
        res = combine(a[u], children_data)
        p_edge = parent_edge[u]
        dp_s[p_edge] = res[0]
        dp_max[p_edge] = res[1]
        dp_min[p_edge] = res[2]

    ans = [0] * (n + 1)

    # Pass 2: Top-down (BFS order)
    for u in order:
        a_u = a[u]
        Z_all = []
        total_max_O = 0
        total_min_O = 0
        total_V_O = 0

        for v, to_v, from_v in adj[u]:
            s_c = dp_s[from_v]
            max_c = dp_max[from_v]
            min_c = dp_min[from_v]
            if s_c == 0:
                Z_all.append((v, to_v, max_c + min_c, max_c, min_c))
            else:
                total_max_O += max_c
                total_min_O += min_c
                total_V_O += max(max_c, -min_c)

        Z_all.sort(key=lambda item: item[2], reverse=True)
        N_Z = len(Z_all)

        pref_delta = [0] * (N_Z + 1)
        pref_max = [0] * (N_Z + 1)
        pref_min = [0] * (N_Z + 1)
        for i in range(N_Z):
            pref_delta[i + 1] = pref_delta[i] + Z_all[i][2]
            pref_max[i + 1] = pref_max[i] + Z_all[i][3]
            pref_min[i + 1] = pref_min[i] + Z_all[i][4]

        total_max_Z = pref_max[N_Z]
        total_min_Z = pref_min[N_Z]

        pos_in_Z = {}
        for i in range(N_Z):
            pos_in_Z[Z_all[i][0]] = i

        def query(ex_v, ex_max, ex_min, is_in_Z):
            if is_in_Z:
                k = N_Z - 1
                sum_max_O = total_max_O
                sum_min_O = total_min_O
                sum_V_O = total_V_O

                cur_total_max_Z = total_max_Z - ex_max
                cur_total_min_Z = total_min_Z - ex_min

                if k == 0:
                    return (0, a_u + sum_max_O, a_u + sum_min_O)
                elif k == 1:
                    p = pos_in_Z[ex_v]
                    rem = Z_all[1] if p == 0 else Z_all[0]
                    return (1, rem[3] - a_u - sum_min_O, rem[4] - a_u - sum_max_O)
                else:
                    cnt_pos = (k + 1) // 2
                    sign_a = a_u if (k % 2 == 0) else -a_u
                    p = pos_in_Z[ex_v]
                    ex_delta = ex_max + ex_min

                    if p >= cnt_pos:
                        sum_top = pref_delta[cnt_pos]
                    else:
                        sum_top = pref_delta[cnt_pos + 1] - ex_delta

                    if p < N_Z - cnt_pos:
                        sum_bot = pref_delta[N_Z] - pref_delta[N_Z - cnt_pos]
                    else:
                        sum_bot = pref_delta[N_Z] - pref_delta[N_Z - cnt_pos - 1] - ex_delta

                    max_res = sign_a + sum_V_O - cur_total_min_Z + sum_top
                    min_res = sign_a - sum_V_O - cur_total_max_Z + sum_bot
                    return (1, max_res, min_res)
            else:
                k = N_Z
                if ex_v is None:
                    sum_max_O = total_max_O
                    sum_min_O = total_min_O
                    sum_V_O = total_V_O
                else:
                    sum_max_O = total_max_O - ex_max
                    sum_min_O = total_min_O - ex_min
                    sum_V_O = total_V_O - max(ex_max, -ex_min)

                cur_total_max_Z = total_max_Z
                cur_total_min_Z = total_min_Z

                if k == 0:
                    return (0, a_u + sum_max_O, a_u + sum_min_O)
                elif k == 1:
                    rem = Z_all[0]
                    return (1, rem[3] - a_u - sum_min_O, rem[4] - a_u - sum_max_O)
                else:
                    cnt_pos = (k + 1) // 2
                    sign_a = a_u if (k % 2 == 0) else -a_u
                    sum_top = pref_delta[cnt_pos]
                    sum_bot = pref_delta[N_Z] - pref_delta[N_Z - cnt_pos]
                    max_res = sign_a + sum_V_O - cur_total_min_Z + sum_top
                    min_res = sign_a - sum_V_O - cur_total_max_Z + sum_bot
                    return (1, max_res, min_res)

        # Compute answer for root u
        ans[u] = query(None, 0, 0, False)[1]

        # Compute outgoing values for all tree children
        for v, to_v, from_v in adj[u]:
            if v == parent[u]:
                continue
            is_in_Z = (dp_s[from_v] == 0)
            res = query(v, dp_max[from_v], dp_min[from_v], is_in_Z)
            dp_s[to_v] = res[0]
            dp_max[to_v] = res[1]
            dp_min[to_v] = res[2]

    sys.stdout.write(" ".join(map(str, ans[1:])) + "\n")

if __name__ == '__main__':
    main()
