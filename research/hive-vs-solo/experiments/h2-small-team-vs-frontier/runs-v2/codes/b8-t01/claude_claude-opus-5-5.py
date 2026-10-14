import sys
from bisect import bisect_left

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); m = int(data[1])
    L0 = [0] * (n + 1)
    L1 = [0] * (n + 1)
    idx = 2
    for i in range(1, n + 1):
        L0[i] = int(data[idx]); L1[i] = int(data[idx + 1])
        idx += 2

    S = 1
    while S < n + 2:
        S *= 2
    # tree0 indexes values of g(.,0), tree1 values of g(.,1); stores last occurrence
    tree0 = [-1] * (2 * S)
    tree1 = [-1] * (2 * S)

    g0 = [0] * (n + 1)
    g1 = [0] * (n + 1)

    def update(tree, v, pos):
        p = v + S
        tree[p] = pos
        p >>= 1
        while p:
            a = tree[2 * p]; b = tree[2 * p + 1]
            nv = a if a < b else b
            if tree[p] == nv:
                break
            tree[p] = nv
            p >>= 1

    update(tree0, 0, 0)
    update(tree1, 0, 0)

    for i in range(1, n + 1):
        lo = L0[i]
        node = 1
        t = tree1
        while node < S:
            node <<= 1
            if t[node] >= lo:
                node += 1
        a = node - S
        lo = L1[i]
        node = 1
        t = tree0
        while node < S:
            node <<= 1
            if t[node] >= lo:
                node += 1
        b = node - S
        g0[i] = a
        g1[i] = b
        update(tree0, a, i)
        update(tree1, b, i)

    tokens = []
    X = 0
    for _ in range(m):
        p = int(data[idx]); c = int(data[idx + 1])
        idx += 2
        tokens.append((p, c))
        X ^= g1[p] if c else g0[p]

    if X == 0:
        print(0)
        return

    pos0 = {}
    pos1 = {}
    for j in range(n + 1):
        v = g0[j]
        lst = pos0.get(v)
        if lst is None:
            pos0[v] = [j]
        else:
            lst.append(j)
        v = g1[j]
        lst = pos1.get(v)
        if lst is None:
            pos1[v] = [j]
        else:
            lst.append(j)

    total = 0
    for p, c in tokens:
        if p == 0:
            continue
        if c:
            gv = g1[p]; lo = L1[p]; positions = pos0
        else:
            gv = g0[p]; lo = L0[p]; positions = pos1
        if lo >= p:
            continue
        target = X ^ gv
        lst = positions.get(target)
        if lst is None:
            continue
        total += bisect_left(lst, p) - bisect_left(lst, lo)

    print(total)

main()
