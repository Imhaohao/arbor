import sys

def main():
    data = sys.stdin.buffer.read().split()
    n, V, q = int(data[0]), int(data[1]), int(data[2])
    c = [0] + [int(x) for x in data[3:3 + V]]
    p = 3 + V
    a = [int(x) for x in data[p:p + n]]
    p += n
    byr = [[] for _ in range(n + 1)]
    for i in range(q):
        l = int(data[p])
        r = int(data[p + 1])
        p += 2
        byr[r].append((l, i))

    S = 1
    while S < V:
        S *= 2
    tree = [0] * (2 * S)
    pos = [[] for _ in range(V + 1)]
    out = [0] * q

    for r in range(1, n + 1):
        u = a[r - 1]
        lst = pos[u]
        lst.append(r)
        k = len(lst)
        cu = c[u]
        val = lst[k - cu] if k >= cu else 0
        i = S + u - 1
        if tree[i] != val:
            tree[i] = val
            i >>= 1
            while i:
                x = tree[2 * i]
                y = tree[2 * i + 1]
                m = x if x < y else y
                if tree[i] == m:
                    break
                tree[i] = m
                i >>= 1

        for l, idx in byr[r]:
            if tree[1] >= l:
                out[idx] = V + 1
            else:
                j = 1
                while j < S:
                    j <<= 1
                    if tree[j] >= l:
                        j += 1
                out[idx] = j - S + 1

    sys.stdout.write("\n".join(map(str, out)) + "\n")

main()
