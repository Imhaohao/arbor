import sys
from collections import deque

def main():
    data = sys.stdin.buffer.read().split()
    pos = 0
    n = int(data[pos]); pos += 1
    a = [int(x) for x in data[pos:pos + n]]; pos += n
    b = [int(x) for x in data[pos:pos + n]]; pos += n
    adj = [[] for _ in range(n)]
    for _ in range(n - 1):
        u = int(data[pos]) - 1
        v = int(data[pos + 1]) - 1
        c = int(data[pos + 2])
        pos += 3
        adj[u].append((v, c))
        adj[v].append((u, c))

    parent = [-1] * n
    pcap = [0] * n
    order = []
    seen = [False] * n
    seen[0] = True
    dq = deque([0])
    while dq:
        v = dq.popleft()
        order.append(v)
        for w, c in adj[v]:
            if not seen[w]:
                seen[w] = True
                parent[w] = v
                pcap[w] = c
                dq.append(w)

    tot_child = [0] * n
    m1 = [0] * n
    i1 = [-1] * n
    m2 = [0] * n
    arr_up = [0] * n
    fpar = [0] * n

    for idx in range(n - 1, -1, -1):
        v = order[idx]
        S = tot_child[v]
        mx = m1[v]
        P = min(S >> 1, S - mx)
        r = S - 2 * P + a[v]
        bv = b[v]
        ab = bv if bv < r else r
        fpar[v] = 2 * P + ab
        left = r - ab
        p = parent[v]
        if p >= 0:
            c = pcap[v]
            val = c if c < left else left
            arr_up[v] = val
            tot_child[p] += val
            if val > m1[p]:
                m2[p] = m1[p]
                m1[p] = val
                i1[p] = v
            elif val > m2[p]:
                m2[p] = val

    arr_down = [0] * n
    fnone = [0] * n
    fdown = [0] * n

    for v in order:
        p = parent[v]
        tot = tot_child[v]
        t1 = m1[v]; ti = i1[v]; t2 = m2[v]
        if p >= 0:
            val = arr_down[v]
            tot += val
            if val > t1:
                t2 = t1
                t1 = val
                ti = p
            elif val > t2:
                t2 = val
        av = a[v]
        bv = b[v]
        S = tot
        P = min(S >> 1, S - t1)
        r = S - 2 * P + av
        ab = bv if bv < r else r
        fnone[v] = 2 * P + ab
        for w, c in adj[v]:
            if w == p:
                continue
            S = tot - arr_up[w]
            mx = t2 if ti == w else t1
            P = min(S >> 1, S - mx)
            r = S - 2 * P + av
            ab = bv if bv < r else r
            fdown[w] = 2 * P + ab
            left = r - ab
            arr_down[w] = c if c < left else left

    ans = [0] * n
    ans[0] = fnone[0] + sum(fpar) - fpar[0]
    for v in order:
        p = parent[v]
        if p < 0:
            continue
        ans[v] = ans[p] - fnone[p] + fdown[v] - fpar[v] + fnone[v]

    sys.stdout.write(" ".join(map(str, ans)) + "\n")

main()
