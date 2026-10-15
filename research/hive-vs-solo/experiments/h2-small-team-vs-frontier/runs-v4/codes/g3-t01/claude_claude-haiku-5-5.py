import sys
from bisect import bisect_left, insort
from operator import itemgetter

SH = 8


def suffix_array(s, n):
    rank = [ord(ch) for ch in s]
    sa = list(range(n))
    mult = max(n, 256) + 2
    k = 1
    while True:
        second = rank[k:] + [-1] * k
        key = [a * mult + b + 1 for a, b in zip(rank, second)]
        sa.sort(key=key.__getitem__)
        rank = dense_ranks(sa, key, n)
        if rank[sa[-1]] == n - 1:
            return sa, rank
        k <<= 1


def dense_ranks(sa, key, n):
    new_rank = [0] * n
    r = 0
    prev = key[sa[0]]
    for i in sa:
        kv = key[i]
        if kv != prev:
            r += 1
            prev = kv
        new_rank[i] = r
    return new_rank


def lcp_array(s, n, sa, rank):
    lcp = [0] * (n + 1)
    h = 0
    for i in range(n):
        r = rank[i]
        if r == 0:
            h = 0
            continue
        j = sa[r - 1]
        while i + h < n and j + h < n and s[i + h] == s[j + h]:
            h += 1
        lcp[r] = h
        if h:
            h -= 1
    return lcp


def lcp_intervals(n, lcp):
    stack = [[0, 0, n - 1, [], None]]
    nodes = []
    for i in range(1, n + 1):
        h = lcp[i]
        lb = i - 1
        last = None
        while h < stack[-1][0]:
            node = stack.pop()
            node[2] = i - 1
            lb = node[1]
            nodes.append(node)
            last = node
            if h <= stack[-1][0]:
                stack[-1][3].append(node)
                last = None
        if h > stack[-1][0]:
            stack.append([h, lb, -1, [last] if last is not None else [], None])
    return nodes


def encode(u, v, d, n):
    return (u * n + v) * (n + 1) + d


def node_groups(node, sa):
    lb, rb, children = node[1], node[2], node[3]
    children.sort(key=itemgetter(1))
    groups = []
    pos = lb
    for ch in children:
        groups.extend([sa[r]] for r in range(pos, ch[1]))
        groups.append(ch[4])
        pos = ch[2] + 1
    groups.extend([sa[r]] for r in range(pos, rb + 1))
    big = max(range(len(groups)), key=lambda g: len(groups[g]))
    return groups, big


def light_members(groups, big, grp):
    Y = []
    for g, members in enumerate(groups):
        if g != big:
            for y in members:
                grp[y] = g
            Y.extend(members)
    Y.sort()
    return Y


def cross_pairs(d, B, Y, grp, n):
    out = []
    nb = len(B)
    m = len(Y)
    prev_y = -1
    prev_i = -1
    for j, y in enumerate(Y):
        i = bisect_left(B, y)
        if i and (j == 0 or Y[j - 1] < B[i - 1]):
            out.append(encode(B[i - 1], y, d, n))
        if i < nb and (j == m - 1 or Y[j + 1] > B[i]):
            out.append(encode(y, B[i], d, n))
        if j and prev_i == i and grp[prev_y] != grp[y]:
            out.append(encode(prev_y, y, d, n))
        prev_y = y
        prev_i = i
    return out


def absorb(B, Y):
    if len(Y) <= 32:
        for y in Y:
            insort(B, y)
    else:
        B.extend(Y)
        B.sort()


def collect_codes(nodes, sa, n):
    grp = [0] * n
    codes = []
    for node in nodes:
        groups, big = node_groups(node, sa)
        B = groups[big]
        Y = light_members(groups, big, grp)
        codes.extend(cross_pairs(node[0], B, Y, grp, n))
        absorb(B, Y)
        node[4] = B
    codes.sort()
    return codes


def ramp_starts(codes, n):
    stride = n + 1
    starts = [[] for _ in range(n)]
    prev_x = -1
    prev_a = 0
    for code in codes:
        t, a = divmod(code, stride)
        x, p = divmod(t, n)
        M = prev_a if x == prev_x else 0
        prev_x, prev_a = x, a
        c = p - x
        mn = min(a, c)
        st = p + M
        if mn > M and st < n:
            starts[st].append((x, c, p + mn - 1))
    return starts


def advance(active, T, V, bm):
    keep = []
    for item in active:
        x, c, end = item
        v = V[x] + c
        V[x] = v
        b = x >> SH
        if v > bm[b]:
            bm[b] = v
        if end > T:
            keep.append(item)
    return keep


def range_max(V, bm, L, R):
    bl = L >> SH
    br = R >> SH
    if bl == br:
        return max(V[L:R + 1])
    res = max(max(V[L:(bl + 1) << SH]), max(V[br << SH:R + 1]))
    if br - bl > 1:
        res = max(res, max(bm[bl + 1:br]))
    return res


def answer_queries(n, q, starts, qs):
    V = [0] * n
    bm = [0] * ((n >> SH) + 1)
    ans = [0] * q
    active = []
    for T in range(n):
        if starts[T]:
            active.extend(starts[T])
        if active:
            active = advance(active, T, V, bm)
        for L, i in qs[T]:
            ans[i] = range_max(V, bm, L, T)
    return ans


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    q = int(data[1])
    s = data[2].decode()
    sa, rank = suffix_array(s, n)
    lcp = lcp_array(s, n, sa, rank)
    nodes = lcp_intervals(n, lcp)
    codes = collect_codes(nodes, sa, n)
    starts = ramp_starts(codes, n)
    qs = [[] for _ in range(n)]
    for i in range(q):
        qs[int(data[4 + 2 * i]) - 1].append((int(data[3 + 2 * i]) - 1, i))
    ans = answer_queries(n, q, starts, qs)
    sys.stdout.write("\n".join(map(str, ans)) + "\n")


main()
