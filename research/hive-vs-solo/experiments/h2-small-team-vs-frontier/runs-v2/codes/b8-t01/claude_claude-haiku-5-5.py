import sys
from bisect import bisect_left


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    m = int(data[1])
    L = [[0] * (n + 1), [0] * (n + 1)]
    idx = 2
    for i in range(1, n + 1):
        L[0][i] = int(data[idx])
        L[1][i] = int(data[idx + 1])
        idx += 2

    size = 1
    while size < n + 2:
        size <<= 1

    def insert(tree, value, position):
        p = size + value
        tree[p] = position
        p >>= 1
        while p:
            a = tree[2 * p]
            b = tree[2 * p + 1]
            best = a if a < b else b
            if tree[p] == best:
                break
            tree[p] = best
            p >>= 1

    def mex_from(tree, start):
        p = 1
        while p < size:
            p <<= 1
            if tree[p] >= start:
                p |= 1
        return p - size

    trees = ([-1] * (2 * size), [-1] * (2 * size))
    g = ([0] * (n + 1), [0] * (n + 1))
    insert(trees[0], 0, 0)
    insert(trees[1], 0, 0)
    for i in range(1, n + 1):
        v0 = mex_from(trees[1], L[0][i])
        v1 = mex_from(trees[0], L[1][i])
        g[0][i] = v0
        g[1][i] = v1
        insert(trees[0], v0, i)
        insert(trees[1], v1, i)

    pos = ({}, {})
    for c in (0, 1):
        table = pos[c]
        for j, v in enumerate(g[c]):
            lst = table.get(v)
            if lst is None:
                table[v] = [j]
            else:
                lst.append(j)

    X = 0
    tokens = []
    for _ in range(m):
        p = int(data[idx])
        c = int(data[idx + 1])
        idx += 2
        tokens.append((p, c))
        X ^= g[c][p]

    ans = 0
    for p, c in tokens:
        if p == 0:
            continue
        lst = pos[1 - c].get(X ^ g[c][p])
        if lst:
            ans += bisect_left(lst, p) - bisect_left(lst, L[c][p])
    print(ans)


main()
