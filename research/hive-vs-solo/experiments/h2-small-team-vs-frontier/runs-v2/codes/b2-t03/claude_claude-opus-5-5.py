import sys

def main():
    data = sys.stdin.buffer.read().split()
    pos = 0
    n = int(data[0]); m = int(data[1]); q = int(data[2]); pos = 3
    N = 2 * n
    adj = [[] for _ in range(N)]
    for _ in range(m):
        a = int(data[pos]) - 1; va = int(data[pos + 1]); b = int(data[pos + 2]) - 1; vb = int(data[pos + 3])
        pos += 4
        la = 2 * a + va
        lb = 2 * b + vb
        adj[la].append(lb ^ 1)
        adj[lb].append(la ^ 1)
    obs = []
    for _ in range(q):
        u = int(data[pos]) - 1; v = int(data[pos + 1]) - 1
        pos += 2
        obs.append((u, v))

    index = [-1] * N
    low = [0] * N
    onstack = [False] * N
    comp = [-1] * N
    stack = []
    comps = []
    counter = 0
    for s in range(N):
        if index[s] != -1:
            continue
        work = [(s, 0)]
        index[s] = low[s] = counter; counter += 1
        stack.append(s); onstack[s] = True
        while work:
            v, i = work[-1]
            nbrs = adj[v]
            if i < len(nbrs):
                work[-1] = (v, i + 1)
                w = nbrs[i]
                if index[w] == -1:
                    index[w] = low[w] = counter; counter += 1
                    stack.append(w); onstack[w] = True
                    work.append((w, 0))
                elif onstack[w]:
                    if index[w] < low[v]:
                        low[v] = index[w]
                continue
            work.pop()
            if work:
                p = work[-1][0]
                if low[v] < low[p]:
                    low[p] = low[v]
            if low[v] == index[v]:
                cid = len(comps)
                members = []
                while True:
                    w = stack.pop()
                    onstack[w] = False
                    comp[w] = cid
                    members.append(w)
                    if w == v:
                        break
                comps.append(members)

    for i in range(n):
        if comp[2 * i] == comp[2 * i + 1]:
            sys.stdout.write("-1\n")
            return

    compR = [0] * len(comps)
    for cid, members in enumerate(comps):
        r = 0
        for v in members:
            r |= 1 << v
        for v in members:
            for w in adj[v]:
                cw = comp[w]
                if cw != cid:
                    r |= compR[cw]
        compR[cid] = r
    R = [compR[comp[v]] for v in range(N)]

    def feasible(l1, l2):
        r1 = R[l1]
        if (r1 >> (l1 ^ 1)) & 1:
            return False
        if (R[l2] >> (l2 ^ 1)) & 1:
            return False
        if (r1 >> (l2 ^ 1)) & 1:
            return False
        return True

    def merge(a, b):
        nonlocal R
        S = R[a] | R[b]
        M = (1 << a) | (1 << b)
        R = [r | S if r & M else r for r in R]

    out = []
    for u, v in obs:
        if u == v:
            out.append('0')
            continue
        if feasible(2 * u, 2 * v) or feasible(2 * u + 1, 2 * v + 1):
            out.append('0')
            merge(2 * u, 2 * v)
            merge(2 * u + 1, 2 * v + 1)
        else:
            out.append('1')
            merge(2 * u, 2 * v + 1)
            merge(2 * u + 1, 2 * v)
    sys.stdout.write(''.join(out) + "\n")

main()
