import sys
import heapq


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    u = (int(data[1]), int(data[2]))
    s = data[3]
    a = [0] * n
    m = [0] * n
    b0 = [0] * n
    b1 = [0] * n
    t = 4
    for i in range(n):
        a[i] = int(data[t])
        m[i] = int(data[t + 1])
        b0[i] = int(data[t + 2])
        b1[i] = int(data[t + 3])
        t += 4
    b = (b0, b1)

    z = [0] * n
    l = r = 0
    for i in range(1, n):
        if i < r:
            z[i] = z[i - l] if z[i - l] < r - i else r - i
        while i + z[i] < n and s[z[i]] == s[i + z[i]]:
            z[i] += 1
        if i + z[i] > r:
            l = i
            r = i + z[i]

    INF = 10**18
    dp = [[INF, INF] for _ in range(n + 1)]
    dp[0][0] = 0
    events = [[] for _ in range(n + 1)]
    heaps = [[], []]

    for i in range(n + 1):
        for A, R, src in events[i]:
            heapq.heappush(heaps[src], (A, R))
        for src in (0, 1):
            h = heaps[src]
            while h and h[0][1] < i:
                heapq.heappop(h)
            if h:
                cand = h[0][0] + u[src] * i
                dst = 1 - src
                if cand < dp[i][dst]:
                    dp[i][dst] = cand
        if i == n:
            break
        ai = a[i]
        mi = m[i]
        max_d = min(i, z[i], n - i)
        for src in (0, 1):
            cost = dp[i][src]
            if cost >= INF:
                continue
            nxt = cost + ai
            if nxt < dp[i + 1][src]:
                dp[i + 1][src] = nxt
            if mi <= max_d:
                A = cost + b[src][i] - u[src] * i
                events[i + mi].append((A, i + max_d, src))

    ans = dp[n][0] if dp[n][0] < dp[n][1] else dp[n][1]
    sys.stdout.write(str(ans))


if __name__ == "__main__":
    main()
