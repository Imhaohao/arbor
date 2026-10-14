import sys
import heapq


def z_function(s):
    n = len(s)
    z = [0] * n
    z[0] = n
    left = right = 0
    for i in range(1, n):
        k = 0
        if i < right:
            k = min(right - i, z[i - left])
        while i + k < n and s[k] == s[i + k]:
            k += 1
        z[i] = k
        if i + k > right:
            left, right = i, i + k
    return z


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    u = (int(data[1]), int(data[2]))
    s = data[3]
    rows = data[4:4 + 4 * n]
    a = [int(x) for x in rows[0::4]]
    m = [int(x) for x in rows[1::4]]
    b = ([int(x) for x in rows[2::4]], [int(x) for x in rows[3::4]])
    z = z_function(s)

    INF = 1 << 62
    dp = ([INF] * (n + 1), [INF] * (n + 1))
    dp[0][0] = 0
    buckets = [[] for _ in range(n + 1)]
    ends = [0] * n
    heaps = ([], [])

    for j in range(n + 1):
        cur = [INF, INF]
        if j > 0:
            cur[0] = dp[0][j - 1] + a[j - 1]
            cur[1] = dp[1][j - 1] + a[j - 1]
        else:
            cur[0] = 0
        for i in buckets[j]:
            for q in (0, 1):
                heapq.heappush(heaps[q], (dp[q][i] + b[q][i] - u[q] * i, ends[i]))
        for q in (0, 1):
            h = heaps[q]
            while h and h[0][1] < j:
                heapq.heappop(h)
            if h:
                cand = h[0][0] + u[q] * j
                if cand < cur[1 - q]:
                    cur[1 - q] = cand
        dp[0][j] = cur[0]
        dp[1][j] = cur[1]
        if j < n:
            hi = min(j, z[j])
            if hi >= m[j]:
                ends[j] = j + hi
                buckets[j + m[j]].append(j)

    print(min(dp[0][n], dp[1][n]))


main()
