import sys
def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); V = int(data[1]); q = int(data[2])
    c = data[3:3 + V]
    c = [int(x) for x in c]
    a = data[3 + V:3 + V + n]
    base = 3 + V + n
    byr = [[] for _ in range(n + 1)]
    ls = [0] * q
    for j in range(q):
        l = int(data[base + 2 * j]); r = int(data[base + 2 * j + 1])
        ls[j] = l
        byr[r].append(j)
    N = 1
    while N <= V:
        N <<= 1
    t = [0] * (2 * N)
    pos = [[] for _ in range(V + 1)]
    ans = [0] * q
    for r in range(1, n + 1):
        v = int(a[r - 1])
        pl = pos[v]
        pl.append(r)
        cv = c[v - 1]
        if len(pl) >= cv:
            p = pl[-cv]
            i = N + v - 1
            t[i] = p
            i >>= 1
            while i:
                x = t[2 * i]
                y = t[2 * i + 1]
                m = x if x < y else y
                if t[i] == m:
                    break
                t[i] = m
                i >>= 1
        for j in byr[r]:
            l = ls[j]
            i = 1
            while i < N:
                i <<= 1
                if t[i] >= l:
                    i += 1
            ans[j] = i - N + 1
    sys.stdout.write("\n".join(map(str, ans)) + "\n")
main()
