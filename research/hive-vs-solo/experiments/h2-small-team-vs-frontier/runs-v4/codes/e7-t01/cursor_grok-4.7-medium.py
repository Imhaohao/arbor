import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    A = [int(data[i]) for i in range(1, n + 1)]
    adj = [[] for _ in range(n)]
    p = n + 1
    for _ in range(n - 1):
        u = int(data[p]) - 1
        v = int(data[p + 1]) - 1
        p += 2
        adj[u].append(v)
        adj[v].append(u)

    parent = [-1] * n
    children = [[] for _ in range(n)]
    order = []
    vis = [False] * n
    vis[0] = True
    stack = [0]
    while stack:
        u = stack.pop()
        order.append(u)
        for v in adj[u]:
            if not vis[v]:
                vis[v] = True
                parent[v] = u
                children[u].append(v)
                stack.append(v)

    down_s = [0] * n
    down_mx = [0] * n
    down_mn = [0] * n

    for u in reversed(order):
        items = [(down_s[v], down_mx[v], down_mn[v], None) for v in children[u]]
        s, mx, mn, _ = solve(A[u], items)
        down_s[u] = s
        down_mx[u] = mx
        down_mn[u] = mn

    up_s = [0] * n
    up_mx = [0] * n
    up_mn = [0] * n
    ans = [0] * n

    for u in order:
        items = []
        if parent[u] != -1:
            items.append((up_s[u], up_mx[u], up_mn[u], None))
        for v in children[u]:
            items.append((down_s[v], down_mx[v], down_mn[v], v))
        _, mx, _, updates = solve(A[u], items)
        ans[u] = mx
        for nid, s, umx, umn in updates:
            up_s[nid] = s
            up_mx[nid] = umx
            up_mn[nid] = umn

    sys.stdout.write(" ".join(map(str, ans)))


def solve(a, items):
    """Combine child components (s, mx, mn, nid).

    Polarity of a reduced component is invariant: s = 0 iff it absorbed
    no polarity-0 child. Final charge is a signed sum; order only changes
    signs. For t polarity-0 children:
      t = 0: every polarity-1 child is added
      t = 1: that child is added, every polarity-1 child is subtracted, root negated
      t >= 2: polarity-1 children may take either sign; polarity-0 children
              get ceil(t/2) pluses and floor(t/2) minuses, last one positive.
    """
    Z = []
    sum_max_o = 0
    sum_min_o = 0
    sum_best_o = 0
    sum_worst_o = 0
    sum_max_z = 0
    sum_min_z = 0
    O = []

    for s, mx, mn, nid in items:
        if s == 0:
            delta = -(mx + mn)
            Z.append((delta, mx, mn, nid))
            sum_max_z += mx
            sum_min_z += mn
        else:
            if mx >= -mn:
                best = mx
            else:
                best = -mn
            if mn <= -mx:
                worst = mn
            else:
                worst = -mx
            sum_max_o += mx
            sum_min_o += mn
            sum_best_o += best
            sum_worst_o += worst
            O.append((mx, mn, best, worst, nid))

    Z.sort(key=lambda z: z[0], reverse=True)
    t = len(Z)
    pref = [0] * (t + 1)
    for i in range(t):
        pref[i + 1] = pref[i] + Z[i][0]
    suf = [0] * (t + 1)
    for i in range(t - 1, -1, -1):
        suf[i] = suf[i + 1] + Z[i][0]

    def full_from(tt, smax_o, smin_o, sbest_o, sworst_o, smax_z, smin_z, top, small, zmx, zmn):
        if tt == 0:
            return 0, a + smax_o, a + smin_o
        if tt == 1:
            return 1, -a + zmx - smin_o, -a + zmn - smax_o
        root = a if tt % 2 == 0 else -a
        return 1, root + smax_z + top + sbest_o, root + smin_z + small + sworst_o

    if t == 0:
        full = (0, a + sum_max_o, a + sum_min_o)
    elif t == 1:
        full = (1, -a + Z[0][1] - sum_min_o, -a + Z[0][2] - sum_max_o)
    else:
        neg = t // 2
        root = a if t % 2 == 0 else -a
        top = pref[neg]
        small = suf[t - neg]
        full = (1, root + sum_max_z + top + sum_best_o, root + sum_min_z + small + sum_worst_o)

    updates = []

    for idx in range(t):
        delta, mx, mn, nid = Z[idx]
        if nid is None:
            continue
        tp = t - 1
        if tp == 0:
            updates.append((nid, 0, a + sum_max_o, a + sum_min_o))
            continue
        if tp == 1:
            rmx = sum_max_z - mx
            rmn = sum_min_z - mn
            updates.append((nid, 1, -a + rmx - sum_min_o, -a + rmn - sum_max_o))
            continue
        m = tp // 2
        if idx >= m:
            top = pref[m]
        else:
            top = pref[m + 1] - delta
        if idx >= t - m:
            small = suf[t - m - 1] - delta
        else:
            small = suf[t - m]
        root = a if tp % 2 == 0 else -a
        umx = root + (sum_max_z - mx) + top + sum_best_o
        umn = root + (sum_min_z - mn) + small + sum_worst_o
        updates.append((nid, 1, umx, umn))

    for mx, mn, best, worst, nid in O:
        if nid is None:
            continue
        smax_o = sum_max_o - mx
        smin_o = sum_min_o - mn
        sbest_o = sum_best_o - best
        sworst_o = sum_worst_o - worst
        if t == 0:
            updates.append((nid, 0, a + smax_o, a + smin_o))
        elif t == 1:
            updates.append((nid, 1, -a + Z[0][1] - smin_o, -a + Z[0][2] - smax_o))
        else:
            neg = t // 2
            root = a if t % 2 == 0 else -a
            top = pref[neg]
            small = suf[t - neg]
            updates.append(
                (
                    nid,
                    1,
                    root + sum_max_z + top + sbest_o,
                    root + sum_min_z + small + sworst_o,
                )
            )

    return full[0], full[1], full[2], updates


if __name__ == "__main__":
    main()
