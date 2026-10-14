import sys

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    n = int(input_data[0])
    a = [0] + [int(x) for x in input_data[1 : n + 1]]

    if n == 1:
        sys.stdout.write(str(a[1]) + "\n")
        return

    adj = [[] for _ in range(n + 1)]
    edges = input_data[n + 1 :]
    for i in range(0, 2 * (n - 1), 2):
        u = int(edges[i])
        v = int(edges[i + 1])
        adj[u].append(v)
        adj[v].append(u)

    # BFS from vertex 1 to establish parents, children, coloring, and topological order
    order = [1]
    parent = [0] * (n + 1)
    color = [0] * (n + 1)
    children = [[] for _ in range(n + 1)]

    for u in order:
        c_next = color[u] ^ 1
        p = parent[u]
        for v in adj[u]:
            if v != p:
                parent[v] = u
                color[v] = c_next
                children[u].append(v)
                order.append(v)

    del adj

    rev_order = order[::-1]
    INF = 10**18

    def solve_tree(W):
        H_down = [0] * (n + 1)
        dp0_down = [0] * (n + 1)
        dp1_down = [0] * (n + 1)
        delta_down = [0] * (n + 1)

        # Bottom-up pass
        for u in rev_order:
            sum_pos_H = 0
            sum_pos_dp0 = 0
            max_delta = -INF
            for v in children[u]:
                h_v = H_down[v]
                if h_v > 0:
                    sum_pos_H += h_v
                dp0_v = dp0_down[v]
                if dp0_v > 0:
                    sum_pos_dp0 += dp0_v
                d_v = delta_down[v]
                if d_v > max_delta:
                    max_delta = d_v

            H_down[u] = -W[u] + sum_pos_H
            dp0_down[u] = W[u] + sum_pos_dp0
            if max_delta == -INF:
                dp1_down[u] = -INF
            else:
                dp1_down[u] = dp0_down[u] + max_delta

            pos_dp0 = dp0_down[u] if dp0_down[u] > 0 else 0
            m = H_down[u] if H_down[u] > dp1_down[u] else dp1_down[u]
            delta_down[u] = m - pos_dp0

        total_dp0 = [0] * (n + 1)
        total_H = [0] * (n + 1)
        dp0_up = [0] * (n + 1)
        H_up = [0] * (n + 1)
        dp1_up = [0] * (n + 1)
        delta_up = [0] * (n + 1)
        ans = [0] * (n + 1)

        # Top-down pass
        for u in order:
            if u == 1:
                total_dp0[1] = dp0_down[1]
                total_H[1] = H_down[1]
            else:
                pos_up_dp0 = dp0_up[u] if dp0_up[u] > 0 else 0
                total_dp0[u] = dp0_down[u] + pos_up_dp0
                pos_up_H = H_up[u] if H_up[u] > 0 else 0
                total_H[u] = H_down[u] + pos_up_H

            # Find top 2 delta candidates among neighbors
            max1_val = -INF
            max1_id = -2
            max2_val = -INF

            if u != 1:
                max1_val = delta_up[u]
                max1_id = -1

            for v in children[u]:
                val = delta_down[v]
                if val > max1_val:
                    max2_val = max1_val
                    max1_val = val
                    max1_id = v
                elif val > max2_val:
                    max2_val = val

            # Compute answer for root u
            if max1_val == -INF:
                dp1_u = -INF
            else:
                dp1_u = total_dp0[u] + max1_val
            ans[u] = total_dp0[u] if total_dp0[u] > dp1_u else dp1_u

            # Push values to children
            t_dp0 = total_dp0[u]
            t_H = total_H[u]
            for v in children[u]:
                pos_v_dp0 = dp0_down[v] if dp0_down[v] > 0 else 0
                dp0_up[v] = t_dp0 - pos_v_dp0

                pos_v_H = H_down[v] if H_down[v] > 0 else 0
                H_up[v] = t_H - pos_v_H

                best = max2_val if v == max1_id else max1_val
                if best == -INF:
                    dp1_up[v] = -INF
                else:
                    dp1_up[v] = dp0_up[v] + best

                pos_up_v_dp0 = dp0_up[v] if dp0_up[v] > 0 else 0
                m_v = H_up[v] if H_up[v] > dp1_up[v] else dp1_up[v]
                delta_up[v] = m_v - pos_up_v_dp0

        return ans

    # A[v] = tau(v) * a[v] where tau(v) = +1 if color[v] == 0 else -1
    A = [0] + [(a[v] if color[v] == 0 else -a[v]) for v in range(1, n + 1)]
    neg_A = [0] + [-A[v] for v in range(1, n + 1)]

    ans0 = solve_tree(A)
    ans1 = solve_tree(neg_A)

    final_ans = [0] * (n + 1)
    for v in range(1, n + 1):
        final_ans[v] = ans0[v] if color[v] == 0 else ans1[v]

    sys.stdout.write(" ".join(map(str, final_ans[1:])) + "\n")

if __name__ == "__main__":
    main()
