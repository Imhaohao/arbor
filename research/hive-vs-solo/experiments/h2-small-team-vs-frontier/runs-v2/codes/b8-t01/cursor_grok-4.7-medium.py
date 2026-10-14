import sys
from bisect import bisect_left, bisect_right


def main():
    data = sys.stdin.buffer.read().split()
    it = iter(data)
    n = int(next(it))
    m = int(next(it))

    L0 = [0] * (n + 1)
    L1 = [0] * (n + 1)
    for i in range(1, n + 1):
        L0[i] = int(next(it))
        L1[i] = int(next(it))

    size = 1
    while size < n + 1:
        size <<= 1
    mn0 = [-1] * (2 * size)
    mn1 = [-1] * (2 * size)

    def update(mn, idx, val):
        i = idx + size
        mn[i] = val
        i >>= 1
        while i:
            left = mn[i << 1]
            right = mn[(i << 1) | 1]
            mn[i] = left if left < right else right
            i >>= 1

    def mex(mn, bound):
        i = 1
        while i < size:
            if mn[i << 1] < bound:
                i <<= 1
            else:
                i = (i << 1) | 1
        return i - size

    update(mn0, 0, 0)
    update(mn1, 0, 0)

    G0 = [0] * (n + 1)
    G1 = [0] * (n + 1)
    pos0 = [[] for _ in range(n + 1)]
    pos1 = [[] for _ in range(n + 1)]
    pos0[0].append(0)
    pos1[0].append(0)

    for i in range(1, n + 1):
        g0 = mex(mn1, L0[i])
        g1 = mex(mn0, L1[i])
        G0[i] = g0
        G1[i] = g1
        update(mn0, g0, i)
        update(mn1, g1, i)
        pos0[g0].append(i)
        pos1[g1].append(i)

    ps = [0] * m
    cs = [0] * m
    gs = [0] * m
    xor = 0
    for k in range(m):
        p = int(next(it))
        c = int(next(it))
        ps[k] = p
        cs[k] = c
        g = G0[p] if c == 0 else G1[p]
        gs[k] = g
        xor ^= g

    ans = 0
    for k in range(m):
        p = ps[k]
        if p == 0:
            continue
        g = gs[k]
        if cs[k] == 0:
            left = L0[p]
            arrs = pos1
        else:
            left = L1[p]
            arrs = pos0
        if left >= p:
            continue
        target = xor ^ g
        if target > n:
            continue
        arr = arrs[target]
        ans += bisect_right(arr, p - 1) - bisect_left(arr, left)

    sys.stdout.write(str(ans))


main()
