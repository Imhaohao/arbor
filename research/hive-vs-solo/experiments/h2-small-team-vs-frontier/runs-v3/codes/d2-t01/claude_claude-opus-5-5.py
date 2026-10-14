import sys, heapq

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); m = int(data[1])
    p = [0] * (n + 1)
    for i in range(n):
        p[i + 1] = int(data[2 + i])
    head = [0] * (2 * m); tail = [0] * (2 * m); W = [0] * (2 * m)
    outs = [[] for _ in range(n + 1)]
    sumO = [0] * (n + 1)
    idx = 2 + n
    for i in range(m):
        u = int(data[idx]); v = int(data[idx + 1])
        W[2 * i] = int(data[idx + 2]); W[2 * i + 1] = int(data[idx + 3])
        idx += 4
        head[2 * i] = v; tail[2 * i] = u
        head[2 * i + 1] = u; tail[2 * i + 1] = v
        outs[u].append(2 * i); outs[v].append(2 * i + 1)
        sumO[u] += 2 * i; sumO[v] += 2 * i + 1
    deg = [len(o) for o in outs]

    D = [-1] * (4 * m)
    Dnone = [-1] * (n + 1)
    inGA = bytearray(4 * m); inGB = bytearray(4 * m)
    S = 2 * (n + 1)
    cntA = [0] * S; kB = [0] * S; sumB = [0] * S
    ga1 = [-1] * S; ga2 = [-1] * S
    bulk = bytearray(S)
    heap = []
    push = heapq.heappush; pop = heapq.heappop

    def finalize(st, t):
        D[st] = t
        h = st >> 1; c = st & 1
        u = tail[h]
        if u == n:
            return
        e = h >> 1
        push(heap, (t + W[2 * e + c], ((h << 1) | c) << 1))
        push(heap, (t + W[2 * e + 1 - c] + p[u], (((h << 1) | (1 - c)) << 1) | 1))

    def sat(v, c, vc, o):
        if o >= 0:
            s = (o << 1) | c
            la = cntA[vc] - inGA[s]
        else:
            la = cntA[vc]
        if la >= 2:
            return True
        if la == 1:
            f = ga1[vc]
            if f == o:
                f = ga2[vc]
            return inGB[(f << 1) | c] == 1
        if o >= 0:
            legal = deg[v] - 1
            if legal == 0:
                return False
            return kB[vc] - inGB[s] == legal
        legal = deg[v]
        return legal > 0 and kB[vc] == legal

    def try_state(v, c, vc, o, t):
        st = ((o ^ 1) << 1) | c
        if D[st] < 0 and sat(v, c, vc, o):
            finalize(st, t)

    def check(v, c, t):
        vc = 2 * v + c
        if not bulk[vc]:
            if sat(v, c, vc, -1):
                bulk[vc] = 1
                if c == 0:
                    Dnone[v] = t
                for o in outs[v]:
                    try_state(v, c, vc, o, t)
                return
        g = ga1[vc]
        if g >= 0:
            try_state(v, c, vc, g, t)
            g = ga2[vc]
            if g >= 0:
                try_state(v, c, vc, g, t)
        if cntA[vc] == 0 and deg[v] >= 2 and kB[vc] == deg[v] - 1:
            try_state(v, c, vc, sumO[v] - sumB[vc], t)

    for o in outs[n]:
        h = o ^ 1
        for c in (0, 1):
            finalize((h << 1) | c, 0)

    while heap:
        t, code = pop(heap)
        s = code >> 1
        o = s >> 1; c = s & 1
        v = tail[o]
        vc = 2 * v + c
        if code & 1:
            inGB[s] = 1
            kB[vc] += 1
            sumB[vc] += o
        else:
            inGA[s] = 1
            k = cntA[vc] + 1
            cntA[vc] = k
            if k == 1:
                ga1[vc] = o
            elif k == 2:
                ga2[vc] = o
        check(v, c, t)

    sys.stdout.write(" ".join(str(Dnone[s]) for s in range(1, n)) + "\n")

main()
