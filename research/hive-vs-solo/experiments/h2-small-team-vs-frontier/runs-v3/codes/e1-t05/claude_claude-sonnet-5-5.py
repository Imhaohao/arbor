import sys

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    xs = [0] * n
    A = [0] * n
    B = [0] * n
    C = [0] * n
    for i in range(n):
        x = int(data[1 + 4 * i])
        p = int(data[2 + 4 * i])
        q = int(data[3 + 4 * i])
        c = int(data[4 + 4 * i])
        xs[i] = x
        A[i] = -4 * x - p - q
        B[i] = -4 * x + p - q
        C[i] = 4 * x * x + 2 * q * x + c

    INF = 10 ** 30

    class LiChao:
        def __init__(self, points):
            self.pts = points
            size = 4 * len(points) + 4
            self.K = [0] * size
            self.B = [INF] * size
            self.last = len(points) - 1

        def insert(self, k, b):
            pts = self.pts
            K = self.K
            Bs = self.B
            node = 1
            lo = 0
            hi = self.last
            while True:
                mid = (lo + hi) >> 1
                xm = pts[mid]
                if k * xm + b < K[node] * xm + Bs[node]:
                    K[node], k = k, K[node]
                    Bs[node], b = b, Bs[node]
                if lo == hi:
                    return
                if k * pts[lo] + b < K[node] * pts[lo] + Bs[node]:
                    node = 2 * node
                    hi = mid
                elif k * pts[hi] + b < K[node] * pts[hi] + Bs[node]:
                    node = 2 * node + 1
                    lo = mid + 1
                else:
                    return

        def query(self, pos):
            pts = self.pts
            x = pts[pos]
            K = self.K
            Bs = self.B
            node = 1
            lo = 0
            hi = self.last
            best = INF
            while True:
                v = K[node] * x + Bs[node]
                if v < best:
                    best = v
                if lo == hi:
                    return best
                mid = (lo + hi) >> 1
                if pos <= mid:
                    node = 2 * node
                    hi = mid
                else:
                    node = 2 * node + 1
                    lo = mid + 1

    sortedA = sorted(set(A))
    posA = {v: i for i, v in enumerate(sortedA)}
    stageOne = LiChao(sortedA)
    stageTwo = LiChao(xs)

    dp = 0
    for m in range(n):
        x = xs[m]
        if m > 0:
            dp = 2 * x * x + stageTwo.query(m)
        if m == n - 1:
            break
        stageOne.insert(x, dp + 2 * x * x)
        e = stageOne.query(posA[A[m]]) + C[m]
        stageTwo.insert(B[m], e)
    print(dp)

main()
