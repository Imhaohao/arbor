import sys
from heapq import heappush, heappop


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    m = int(data[1])
    p = [int(x) for x in data[2:2 + n]]
    pos = 2 + n
    vert = [0] * (2 * m)
    w0 = [0] * m
    w1 = [0] * m
    inc = [[] for _ in range(n)]
    sum_inc = [0] * n
    for e in range(m):
        u = int(data[pos]) - 1
        v = int(data[pos + 1]) - 1
        w0[e] = int(data[pos + 2])
        w1[e] = int(data[pos + 3])
        pos += 4
        vert[2 * e] = u
        vert[2 * e + 1] = v
        inc[u].append(2 * e)
        inc[v].append(2 * e + 1)
        sum_inc[u] += 2 * e
        sum_inc[v] += 2 * e + 1
    W = (w0, w1)
    target = n - 1
    INF = -1
    ans = [INF] * n
    fin_arr = bytearray(4 * m)
    in_b = bytearray(4 * m)
    nodes = 2 * n
    cnt_a = [0] * nodes
    cnt_b = [0] * nodes
    sum_b = [0] * nodes
    first_a = [0] * nodes
    second_a = [0] * nodes
    none_fin = bytearray(nodes)
    flag1 = bytearray(nodes)
    flag2 = bytearray(nodes)
    all_done = bytearray(nodes)
    heap = []
    SH = 21

    def finalize(u, c, d, t):
        if d < 0:
            node = 2 * u + c
            if not none_fin[node]:
                none_fin[node] = 1
                if c == 0:
                    ans[u] = t
            return
        idx = d * 2 + c
        if fin_arr[idx]:
            return
        fin_arr[idx] = 1
        e = d >> 1
        x = vert[d ^ 1]
        if x == target:
            return
        dx = d ^ 1
        key_a = t + W[c][e]
        heappush(heap, (key_a << SH) | (((dx << 1) | c) << 1))
        cc = 1 - c
        key_b = t + W[cc][e] + p[x]
        heappush(heap, (key_b << SH) | (((dx << 1) | cc) << 1) | 1)

    def bulk(u, c, t, skip1, skip2):
        finalize(u, c, -1, t)
        if len(inc[u]) < 2:
            return
        for d in inc[u]:
            if d != skip1 and d != skip2:
                finalize(u, c, d, t)

    def check(u, c, t):
        node = 2 * u + c
        ca = cnt_a[node]
        deg = len(inc[u])
        if ca >= 3:
            bulk(u, c, t, -2, -2)
            all_done[node] = 1
            return
        if ca == 2:
            a1 = first_a[node]
            a2 = second_a[node]
            if not flag2[node]:
                flag2[node] = 1
                bulk(u, c, t, a1, a2)
            if in_b[a2 * 2 + c]:
                finalize(u, c, a1, t)
            if in_b[a1 * 2 + c]:
                finalize(u, c, a2, t)
            return
        if ca == 1:
            a1 = first_a[node]
            has_b = in_b[a1 * 2 + c]
            if has_b and not flag1[node]:
                flag1[node] = 1
                bulk(u, c, t, a1, -2)
            if deg >= 2 and cnt_b[node] - has_b == deg - 1:
                finalize(u, c, a1, t)
            return
        k = cnt_b[node]
        if k == deg:
            bulk(u, c, t, -2, -2)
            all_done[node] = 1
        elif k == deg - 1 and deg >= 2:
            finalize(u, c, sum_inc[u] - sum_b[node], t)

    for d in inc[target]:
        for c in (0, 1):
            finalize(target, c, d, 0)

    mask = (1 << SH) - 1
    while heap:
        item = heappop(heap)
        t = item >> SH
        payload = item & mask
        kind = payload & 1
        cc = (payload >> 1) & 1
        dx = payload >> 2
        u = vert[dx]
        node = 2 * u + cc
        if kind == 0:
            cnt_a[node] += 1
            if cnt_a[node] == 1:
                first_a[node] = dx
            elif cnt_a[node] == 2:
                second_a[node] = dx
        else:
            in_b[dx * 2 + cc] = 1
            cnt_b[node] += 1
            sum_b[node] += dx
        if not all_done[node]:
            check(u, cc, t)

    sys.stdout.write(" ".join(str(ans[s]) for s in range(n - 1)) + "\n")


main()
