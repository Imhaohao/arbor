import sys
import heapq


def z_function(s):
    n = len(s)
    z = [0] * n
    l = r = 0
    for i in range(1, n):
        k = 0
        if i < r:
            k = min(r - i, z[i - l])
        while i + k < n and s[k] == s[i + k]:
            k += 1
        z[i] = k
        if i + k > r:
            l, r = i, i + k
    return z


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    u = (int(data[1]), int(data[2]))
    s = data[3]
    rows = data[4:]
    z = z_function(s)
    inf = 1 << 60
    heaps = ([], [])
    buckets = [None] * (n + 2)
    prev = [0, inf]
    cur = prev
    for j in range(n + 1):
        if j > 0:
            a = int(rows[4 * (j - 1)])
            pending = buckets[j]
            if pending:
                for p, c, end in pending:
                    heapq.heappush(heaps[p], (c, end))
            cur = [inf, inf]
            for q in (0, 1):
                best = prev[q] + a if prev[q] < inf else inf
                src = 1 - q
                h = heaps[src]
                while h and h[0][1] < j:
                    heapq.heappop(h)
                if h:
                    cand = h[0][0] + u[src] * j
                    if cand < best:
                        best = cand
                cur[q] = best
        if j < n:
            base = 4 * j
            m = int(rows[base + 1])
            limit = min(z[j], j)
            if m <= limit:
                start = j + m
                end = j + limit
                for p in (0, 1):
                    if cur[p] < inf:
                        b = int(rows[base + 2 + p])
                        c = cur[p] + b - u[p] * j
                        if buckets[start] is None:
                            buckets[start] = []
                        buckets[start].append((p, c, end))
        prev = cur
    print(min(prev))


main()
