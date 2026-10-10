import sys


def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    data = list(map(int, input_data))

    n = data[0]
    V = data[1]
    q = data[2]

    c = [0] + data[3 : 3 + V]
    a = data[3 + V : 3 + V + n]

    queries_by_r = [[] for _ in range(n + 1)]
    idx = 3 + V + n
    for q_idx in range(q):
        l = data[idx]
        r = data[idx + 1]
        queries_by_r[r].append((l, q_idx))
        idx += 2

    size = 1
    while size <= V:
        size <<= 1

    INF = 10**9
    tree = [INF] * (2 * size)
    for v in range(1, V + 1):
        tree[size + v] = 0

    for i in range(size - 1, 0, -1):
        left = tree[i << 1]
        right = tree[(i << 1) | 1]
        tree[i] = left if left < right else right

    pos = [[] for _ in range(V + 1)]
    ans = [0] * q

    for r in range(1, n + 1):
        v = a[r - 1]
        pos_v = pos[v]
        pos_v.append(r)
        req = c[v]
        if len(pos_v) >= req:
            val = pos_v[-req]
            p = size + v
            tree[p] = val
            p >>= 1
            while p:
                left = tree[p << 1]
                right = tree[(p << 1) | 1]
                new_val = left if left < right else right
                if tree[p] == new_val:
                    break
                tree[p] = new_val
                p >>= 1

        q_list = queries_by_r[r]
        if q_list:
            for l, q_idx in q_list:
                if tree[1] >= l:
                    ans[q_idx] = V + 1
                else:
                    node = 1
                    while node < size:
                        node <<= 1
                        if tree[node] >= l:
                            node += 1
                    ans[q_idx] = node - size

    sys.stdout.write('\n'.join(map(str, ans)) + '\n')


if __name__ == '__main__':
    solve()
