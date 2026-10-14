import sys
from bisect import bisect_left

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); m = int(data[1])
    L = [(0, 0)] * (n + 1)
    idx = 2
    for i in range(1, n + 1):
        L[i] = (int(data[idx]), int(data[idx + 1]))
        idx += 2
    size = 1
    while size < n + 3:
        size *= 2
    trees = [[-1] * (2 * size), [-1] * (2 * size)]
    G = [[0] * (n + 1), [0] * (n + 1)]
    pos = [[[] for _ in range(size)], [[] for _ in range(size)]]

    def update(tree, v, p):
        k = v + size
        tree[k] = p
        k >>= 1
        while k:
            a = tree[2 * k]
            b = tree[2 * k + 1]
            tree[k] = a if a < b else b
            k >>= 1

    for c in range(2):
        update(trees[c], 0, 0)
        pos[c][0].append(0)

    for i in range(1, n + 1):
        vals = [0, 0]
        for c in range(2):
            tree = trees[1 - c]
            lo = L[i][c]
            node = 1
            while node < size:
                if tree[2 * node] < lo:
                    node = 2 * node
                else:
                    node = 2 * node + 1
            vals[c] = node - size
        for c in range(2):
            G[c][i] = vals[c]
            update(trees[c], vals[c], i)
            pos[c][vals[c]].append(i)

    tokens = []
    X = 0
    for _ in range(m):
        p = int(data[idx]); c = int(data[idx + 1])
        idx += 2
        tokens.append((p, c))
        X ^= G[c][p]

    ans = 0
    for p, c in tokens:
        if p == 0:
            continue
        lo = L[p][c]
        if lo >= p:
            continue
        target = X ^ G[c][p]
        if target >= size:
            continue
        lst = pos[1 - c][target]
        ans += bisect_left(lst, p) - bisect_left(lst, lo)
    print(ans)

main()
