import sys


def scc_reachability(num, adj):
    index = [-1] * num
    low = [0] * num
    on_stack = [False] * num
    comp = [-1] * num
    reach = [0] * num
    stack = []
    counter = 0
    comp_count = 0
    for root in range(num):
        if index[root] != -1:
            continue
        index[root] = low[root] = counter
        counter += 1
        stack.append(root)
        on_stack[root] = True
        frames = [(root, 0)]
        while frames:
            v, i = frames[-1]
            if i < len(adj[v]):
                frames[-1] = (v, i + 1)
                w = adj[v][i]
                if index[w] == -1:
                    index[w] = low[w] = counter
                    counter += 1
                    stack.append(w)
                    on_stack[w] = True
                    frames.append((w, 0))
                elif on_stack[w] and index[w] < low[v]:
                    low[v] = index[w]
                continue
            frames.pop()
            if frames:
                parent_v = frames[-1][0]
                if low[v] < low[parent_v]:
                    low[parent_v] = low[v]
            if low[v] == index[v]:
                members = []
                while True:
                    w = stack.pop()
                    on_stack[w] = False
                    comp[w] = comp_count
                    members.append(w)
                    if w == v:
                        break
                bits = 0
                for w in members:
                    bits |= 1 << w
                for w in members:
                    for x in adj[w]:
                        if comp[x] != comp_count:
                            bits |= reach[x]
                for w in members:
                    reach[w] = bits
                comp_count += 1
    return reach, comp


def add_edge(reach, a, b):
    target = reach[b]
    bit = 1 << a
    return [r | target if r & bit else r for r in reach]


def main():
    data = sys.stdin.buffer.read().split()
    n, m, q = int(data[0]), int(data[1]), int(data[2])
    num = 2 * n
    adj = [[] for _ in range(num)]
    pos = 3
    for _ in range(m):
        a = int(data[pos]) - 1
        va = int(data[pos + 1])
        b = int(data[pos + 2]) - 1
        vb = int(data[pos + 3])
        pos += 4
        adj[2 * a + va].append(2 * b + 1 - vb)
        adj[2 * b + vb].append(2 * a + 1 - va)
    observations = []
    for _ in range(q):
        observations.append((int(data[pos]) - 1, int(data[pos + 1]) - 1))
        pos += 2

    reach, comp = scc_reachability(num, adj)
    for x in range(n):
        if comp[2 * x] == comp[2 * x + 1]:
            print(-1)
            return

    even_mask = 0
    for x in range(n):
        even_mask |= 1 << (2 * x)

    def consistent(s):
        return ((s & even_mask) & ((s >> 1) & even_mask)) == 0

    parent = list(range(n))
    parity = [0] * n
    rank = [1] * n

    def find(x):
        p = 0
        while parent[x] != x:
            p ^= parity[x]
            x = parent[x]
        return x, p

    out = []
    for u, v in observations:
        ru, pu = find(u)
        rv, pv = find(v)
        if ru == rv:
            out.append(pu ^ pv)
            continue
        equal_ones = reach[2 * u + 1] | reach[2 * v + 1]
        equal_zeros = reach[2 * u] | reach[2 * v]
        c = 0 if (consistent(equal_ones) or consistent(equal_zeros)) else 1
        for a in (0, 1):
            reach = add_edge(reach, 2 * u + a, 2 * v + (a ^ c))
            reach = add_edge(reach, 2 * v + a, 2 * u + (a ^ c))
        if rank[ru] > rank[rv]:
            ru, rv = rv, ru
        parent[ru] = rv
        parity[ru] = c ^ pu ^ pv
        if rank[ru] == rank[rv]:
            rank[rv] += 1
        out.append(c)

    sys.stdout.write(''.join(map(str, out)) + "\n")


main()
