import sys


def contribution(E, H, K, flexible):
    useful = H if H < K else K
    spare = 1 if (flexible and K > H) else 0
    return useful, K, E + H - useful, useful + K, spare


def summarize(sum_useful, sum_cap, sum_stuck, best_pair, spare_count, own, slots, cap):
    dominance = best_pair - sum_cap
    if dominance < 0:
        dominance = 0
    if dominance > 0:
        leftover = dominance
    elif spare_count > 0:
        leftover = 0
    else:
        leftover = sum_useful & 1
    hurt = leftover + own - slots
    if hurt < 0:
        hurt = 0
    flexible = slots >= 1 or spare_count > 0
    reach = sum_cap + own
    if cap < reach:
        reach = cap
    if not flexible and reach > hurt and (reach - hurt) & 1:
        reach -= 1
    return sum_stuck, hurt, reach, flexible


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]
    b = [int(x) for x in data[1 + n:1 + 2 * n]]
    adj = [[] for _ in range(n)]
    idx = 1 + 2 * n
    for _ in range(n - 1):
        u = int(data[idx]) - 1
        v = int(data[idx + 1]) - 1
        c = int(data[idx + 2])
        idx += 3
        adj[u].append((v, c))
        adj[v].append((u, c))

    parent = [-1] * n
    parent_cap = [0] * n
    order = [0]
    seen = [False] * n
    seen[0] = True
    for v in order:
        for u, c in adj[v]:
            if not seen[u]:
                seen[u] = True
                parent[u] = v
                parent_cap[u] = c
                order.append(u)

    sum_u = [0] * n
    sum_k = [0] * n
    sum_ep = [0] * n
    top1 = [-1] * n
    top2 = [-1] * n
    sum_ff = [0] * n

    def add(v, useful, cap, stuck, pair_key, spare):
        sum_u[v] += useful
        sum_k[v] += cap
        sum_ep[v] += stuck
        if pair_key > top1[v]:
            top2[v] = top1[v]
            top1[v] = pair_key
        elif pair_key > top2[v]:
            top2[v] = pair_key
        sum_ff[v] += spare

    down = [None] * n
    for v in reversed(order):
        if v == 0:
            continue
        E, H, K, fl = summarize(sum_u[v], sum_k[v], sum_ep[v], top1[v],
                                sum_ff[v], a[v], b[v], parent_cap[v])
        down[v] = contribution(E, H, K, fl)
        add(parent[v], *down[v])

    total_packets = sum(a)
    answers = [0] * n
    up = [None] * n
    for v in order:
        if v != 0:
            add(v, *up[v])
        E, H, _, _ = summarize(sum_u[v], sum_k[v], sum_ep[v], top1[v],
                               sum_ff[v], a[v], b[v], 0)
        answers[v] = total_packets - (E + H)
        for c, edge_cap in adj[v]:
            if c == parent[v]:
                continue
            useful, cap, stuck, pair_key, spare = down[c]
            best = top2[v] if pair_key == top1[v] else top1[v]
            E2, H2, K2, fl2 = summarize(sum_u[v] - useful, sum_k[v] - cap,
                                        sum_ep[v] - stuck, best,
                                        sum_ff[v] - spare, a[v], b[v], edge_cap)
            up[c] = contribution(E2, H2, K2, fl2)

    print(' '.join(map(str, answers)))


main()
