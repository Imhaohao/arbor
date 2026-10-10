import sys

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); V = int(data[1]); q = int(data[2])
    c = [0] + [int(x) for x in data[3:3 + V]]
    pos = 3 + V
    a = data[pos:pos + n]
    pos += n
    a = [int(x) for x in a]
    buckets = [[] for _ in range(n + 1)]
    qs = data[pos:pos + 2 * q]
    for i in range(q):
        l = int(qs[2 * i]); r = int(qs[2 * i + 1])
        buckets[r].append((l, i))
    size = 1
    while size < V:
        size *= 2
    INF = 1 << 30
    t = [0] * (2 * size)
    for i in range(size + V, 2 * size):
        t[i] = INF
    for i in range(size - 1, 0, -1):
        x = t[2 * i]; y = t[2 * i + 1]
        t[i] = x if x < y else y
    occ = [[] for _ in range(V + 1)]
    ans = [0] * q
    Vp1 = V + 1
    for r in range(1, n + 1):
        v = a[r - 1]
        lst = occ[v]
        lst.append(r)
        k = len(lst)
        cv = c[v]
        if k >= cv:
            p = lst[k - cv]
            i = size + v - 1
            t[i] = p
            i >>= 1
            while i:
                x = t[2 * i]; y = t[2 * i + 1]
                m = x if x < y else y
                if t[i] == m:
                    break
                t[i] = m
                i >>= 1
        b = buckets[r]
        if b:
            for l, idx in b:
                if t[1] >= l:
                    ans[idx] = Vp1
                else:
                    node = 1
                    while node < size:
                        node <<= 1
                        if t[node] >= l:
                            node += 1
                    ans[idx] = node - size + 1
    sys.stdout.write("\n".join(map(str, ans)) + "\n")

main()
