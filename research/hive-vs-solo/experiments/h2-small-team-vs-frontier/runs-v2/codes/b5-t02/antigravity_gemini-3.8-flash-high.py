import sys
from heapq import heappush, heappop

def compute_z(s):
    n = len(s)
    z = [0] * n
    l, r = 0, 0
    for i in range(1, n):
        if i <= r:
            z[i] = min(r - i + 1, z[i - l])
        while i + z[i] < n and s[z[i]] == s[i + z[i]]:
            z[i] += 1
        if i + z[i] - 1 > r:
            l = i
            r = i + z[i] - 1
    return z

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    n = int(input_data[0])
    u0 = int(input_data[1])
    u1 = int(input_data[2])
    s = input_data[3]

    vals = list(map(int, input_data[4:]))

    z = compute_z(s)

    INF = 10**18
    dp0 = [INF] * (n + 1)
    dp1 = [INF] * (n + 1)
    dp0[0] = 0

    events0 = [[] for _ in range(n + 1)]
    events1 = [[] for _ in range(n + 1)]

    heap0 = []
    heap1 = []

    for i in range(n + 1):
        if i > 0:
            if events0[i]:
                for item in events0[i]:
                    heappush(heap0, item)
            if events1[i]:
                for item in events1[i]:
                    heappush(heap1, item)

            while heap0 and heap0[0][1] < i:
                heappop(heap0)
            while heap1 and heap1[0][1] < i:
                heappop(heap1)

            if heap0:
                c = heap0[0][0] + u1 * i
                if c < dp0[i]:
                    dp0[i] = c
            if heap1:
                c = heap1[0][0] + u0 * i
                if c < dp1[i]:
                    dp1[i] = c

        if i == n:
            break

        idx = 4 * i
        a = vals[idx]
        m = vals[idx + 1]
        b0 = vals[idx + 2]
        b1 = vals[idx + 3]

        # Type operation to i + 1
        if dp0[i] < INF:
            c = dp0[i] + a
            if c < dp0[i + 1]:
                dp0[i + 1] = c
        if dp1[i] < INF:
            c = dp1[i] + a
            if c < dp1[i + 1]:
                dp1[i + 1] = c

        # Carbon operation from i
        max_d = i if i < z[i] else z[i]
        L = i + m
        R = i + max_d
        if L <= R:
            if dp0[i] < INF:
                val0 = dp0[i] + b0 - u0 * i
                events1[L].append((val0, R))
            if dp1[i] < INF:
                val1 = dp1[i] + b1 - u1 * i
                events0[L].append((val1, R))

    print(min(dp0[n], dp1[n]))

if __name__ == '__main__':
    main()
