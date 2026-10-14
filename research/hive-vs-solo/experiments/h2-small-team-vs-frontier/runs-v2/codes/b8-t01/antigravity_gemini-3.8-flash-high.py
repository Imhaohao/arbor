import sys
from bisect import bisect_left, bisect_right


def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    tokens = list(map(int, input_data))
    n = tokens[0]
    m = tokens[1]

    L0_arr = [0] * (n + 1)
    L1_arr = [0] * (n + 1)

    idx = 2
    for i in range(1, n + 1):
        L0_arr[i] = tokens[idx]
        L1_arr[i] = tokens[idx + 1]
        idx += 2

    token_cnt0 = [0] * (n + 1)
    token_cnt1 = [0] * (n + 1)
    for _ in range(m):
        p = tokens[idx]
        c = tokens[idx + 1]
        if c == 0:
            token_cnt0[p] += 1
        else:
            token_cnt1[p] += 1
        idx += 2

    K = 131072
    tree0 = [-1] * (2 * K)
    tree1 = [-1] * (2 * K)

    g0 = [0] * (n + 1)
    g1 = [0] * (n + 1)
    pos0 = [[] for _ in range(n + 1)]
    pos1 = [[] for _ in range(n + 1)]

    pos0[0].append(0)
    pos1[0].append(0)

    node = K
    tree0[node] = 0
    node >>= 1
    while node:
        lv = tree0[node << 1]
        rv = tree0[(node << 1) | 1]
        nv = lv if lv < rv else rv
        if tree0[node] == nv:
            break
        tree0[node] = nv
        node >>= 1

    node = K
    tree1[node] = 0
    node >>= 1
    while node:
        lv = tree1[node << 1]
        rv = tree1[(node << 1) | 1]
        nv = lv if lv < rv else rv
        if tree1[node] == nv:
            break
        tree1[node] = nv
        node >>= 1

    for i in range(1, n + 1):
        L0 = L0_arr[i]
        if L0 == i:
            v0 = 0
        else:
            node = 1
            while node < K:
                node <<= 1
                if tree1[node] >= L0:
                    node |= 1
            v0 = node - K

        L1 = L1_arr[i]
        if L1 == i:
            v1 = 0
        else:
            node = 1
            while node < K:
                node <<= 1
                if tree0[node] >= L1:
                    node |= 1
            v1 = node - K

        g0[i] = v0
        g1[i] = v1
        pos0[v0].append(i)
        pos1[v1].append(i)

        node = K + v0
        tree0[node] = i
        node >>= 1
        while node:
            lv = tree0[node << 1]
            rv = tree0[(node << 1) | 1]
            nv = lv if lv < rv else rv
            if tree0[node] == nv:
                break
            tree0[node] = nv
            node >>= 1

        node = K + v1
        tree1[node] = i
        node >>= 1
        while node:
            lv = tree1[node << 1]
            rv = tree1[(node << 1) | 1]
            nv = lv if lv < rv else rv
            if tree1[node] == nv:
                break
            tree1[node] = nv
            node >>= 1

    G = 0
    for p in range(1, n + 1):
        if token_cnt0[p] & 1:
            G ^= g0[p]
        if token_cnt1[p] & 1:
            G ^= g1[p]

    if G == 0:
        print(0)
        return

    ans = 0
    for p in range(1, n + 1):
        c0 = token_cnt0[p]
        if c0:
            L = L0_arr[p]
            if L < p:
                target = G ^ g0[p]
                if target <= n:
                    arr = pos1[target]
                    cnt = bisect_right(arr, p - 1) - bisect_left(arr, L)
                    ans += cnt * c0

        c1 = token_cnt1[p]
        if c1:
            L = L1_arr[p]
            if L < p:
                target = G ^ g1[p]
                if target <= n:
                    arr = pos0[target]
                    cnt = bisect_right(arr, p - 1) - bisect_left(arr, L)
                    ans += cnt * c1

    print(ans)


if __name__ == '__main__':
    main()
