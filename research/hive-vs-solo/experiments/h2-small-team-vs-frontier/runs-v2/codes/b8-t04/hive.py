import sys

INF = 1 << 200


def add_line(M, B, P, pos, size, m, b):
    while pos <= size:
        ms = M[pos]
        bs = B[pos]
        length = len(ms)
        if length and ms[-1] == m:
            if bs[-1] <= b:
                pos += pos & -pos
                continue
            ms.pop()
            bs.pop()
            length -= 1
        while length >= 2 and (b - bs[-2]) * (ms[-2] - ms[-1]) <= (bs[-1] - bs[-2]) * (ms[-2] - m):
            ms.pop()
            bs.pop()
            length -= 1
        if P[pos] >= length:
            P[pos] = max(length - 1, 0)
        ms.append(m)
        bs.append(b)
        pos += pos & -pos


def query_min(M, B, P, pos, x):
    best = INF
    while pos > 0:
        ms = M[pos]
        if ms:
            bs = B[pos]
            p = P[pos]
            last = len(ms) - 1
            value = ms[p] * x + bs[p]
            while p < last:
                nxt = ms[p + 1] * x + bs[p + 1]
                if nxt > value:
                    break
                value = nxt
                p += 1
            P[pos] = p
            if value < best:
                best = value
        pos -= pos & -pos
    return best


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    X = [0] * (n + 1)
    Y = [0] * (n + 1)
    T = [0] * (n + 1)
    for i in range(1, n + 1):
        k = 3 * i - 2
        X[i] = int(data[k])
        Y[i] = int(data[k + 1])
        T[i] = int(data[k + 2])

    D = [X[i] - Y[i] for i in range(n + 1)]
    uniq = sorted(set(D))
    rank = {v: k + 1 for k, v in enumerate(uniq)}
    U = len(uniq)
    R = [rank[d] for d in D]

    AM = [[] for _ in range(U + 1)]
    AB = [[] for _ in range(U + 1)]
    AP = [0] * (U + 1)
    BM = [[] for _ in range(U + 1)]
    BB = [[] for _ in range(U + 1)]
    BP = [0] * (U + 1)

    add_line(AM, AB, AP, R[0], U, 0, 0)
    add_line(BM, BB, BP, U + 1 - R[0], U, 0, 0)

    answer = 0
    for j in range(1, n + 1):
        xj, yj, r = X[j], Y[j], R[j]
        via_x = query_min(AM, AB, AP, r, xj) + xj * xj
        via_y = query_min(BM, BB, BP, U - r, yj) + yj * yj
        dp = min(via_x, via_y) + T[j]
        if j == n:
            answer = dp
        else:
            add_line(AM, AB, AP, r, U, -2 * xj, dp + xj * xj)
            add_line(BM, BB, BP, U + 1 - r, U, -2 * yj, dp + yj * yj)

    print(answer)


main()
