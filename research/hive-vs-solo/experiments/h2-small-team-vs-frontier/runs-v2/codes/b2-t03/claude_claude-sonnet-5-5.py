import sys

def main():
    data = sys.stdin.buffer.read().split()
    n, m, q = int(data[0]), int(data[1]), int(data[2])
    N = 2 * n
    reach = [1 << i for i in range(N)]
    pos = 3
    for _ in range(m):
        a = int(data[pos]) - 1
        va = int(data[pos + 1])
        b = int(data[pos + 2]) - 1
        vb = int(data[pos + 3])
        pos += 4
        la = 2 * a + (1 - va)
        lb = 2 * b + (1 - vb)
        reach[la] |= 1 << (lb ^ 1)
        reach[lb] |= 1 << (la ^ 1)
    for k in range(N):
        rk = reach[k]
        for i in range(N):
            if (reach[i] >> k) & 1:
                reach[i] |= rk
        # rk may be stale after updates to reach[k] itself; reach[k] updated only by itself
    for i in range(n):
        if (reach[2 * i] >> (2 * i + 1)) & 1 and (reach[2 * i + 1] >> (2 * i)) & 1:
            print(-1)
            return

    even_mask = 0
    for i in range(n):
        even_mask |= 1 << (2 * i)

    def consistent(s):
        negated = ((s & even_mask) << 1) | ((s >> 1) & even_mask)
        return (s & negated) == 0

    def add_edge(p, t):
        if (reach[p] >> t) & 1:
            return
        rt = reach[t]
        for s in range(N):
            if (reach[s] >> p) & 1:
                reach[s] |= rt

    def tie(p, t):
        add_edge(p, t)
        add_edge(t, p)
        add_edge(p ^ 1, t ^ 1)
        add_edge(t ^ 1, p ^ 1)

    out = []
    for _ in range(q):
        u = int(data[pos]) - 1
        v = int(data[pos + 1]) - 1
        pos += 2
        if u == v:
            out.append('0')
            continue
        u1, v1 = 2 * u, 2 * v
        u0, v0 = u1 + 1, v1 + 1
        if (reach[u1] >> v1) & 1 and (reach[v1] >> u1) & 1:
            out.append('0')
            continue
        if (reach[u1] >> v0) & 1 and (reach[v0] >> u1) & 1:
            out.append('1')
            continue
        if consistent(reach[u1] | reach[v1]) or consistent(reach[u0] | reach[v0]):
            out.append('0')
            tie(u1, v1)
        else:
            out.append('1')
            tie(u1, v0)
    print(''.join(out))

main()
