import sys, heapq

def z_function(s, n):
    z = [0] * n
    l = r = 0
    for i in range(1, n):
        if i < r:
            zi = r - i
            if z[i - l] < zi:
                zi = z[i - l]
        else:
            zi = 0
        while i + zi < n and s[i + zi] == s[zi]:
            zi += 1
        z[i] = zi
        if i + zi > r:
            l = i
            r = i + zi
    return z

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); u0 = int(data[1]); u1 = int(data[2])
    s = data[3]
    A = list(map(int, data[4::4]))
    M = list(map(int, data[5::4]))
    B0 = list(map(int, data[6::4]))
    B1 = list(map(int, data[7::4]))
    z = z_function(s, n)

    INF = float('inf')
    bk0 = [[] for _ in range(n + 1)]
    bk1 = [[] for _ in range(n + 1)]
    h0 = []
    h1 = []
    push = heapq.heappush
    pop = heapq.heappop

    d0 = 0
    d1 = INF
    for j in range(1, n + 1):
        for item in bk0[j]:
            push(h0, item)
        for item in bk1[j]:
            push(h1, item)
        a = A[j - 1]
        nd0 = d0 + a
        nd1 = d1 + a
        while h0 and h0[0][1] < j:
            pop(h0)
        if h0:
            c = h0[0][0] + u1 * j
            if c < nd0:
                nd0 = c
        while h1 and h1[0][1] < j:
            pop(h1)
        if h1:
            c = h1[0][0] + u0 * j
            if c < nd1:
                nd1 = c
        d0 = nd0
        d1 = nd1
        if j < n:
            m = M[j]
            L = z[j]
            if j < L:
                L = j
            if m <= L:
                lo = j + m
                hi = j + L
                if d0 != INF:
                    bk1[lo].append((d0 + B0[j] - u0 * j, hi))
                if d1 != INF:
                    bk0[lo].append((d1 + B1[j] - u1 * j, hi))
    print(min(d0, d1))

main()
