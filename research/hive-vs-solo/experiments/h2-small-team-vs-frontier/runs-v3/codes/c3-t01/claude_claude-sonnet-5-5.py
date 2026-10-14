import sys
from heapq import heappush, heappop


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    k = int(data[1])
    A = []
    D = []
    B = []
    C = []
    DL = []
    W = []
    P = []
    pos = 2
    for _ in range(n):
        a = int(data[pos])
        dl = int(data[pos + 1])
        b = int(data[pos + 2])
        c = int(data[pos + 3])
        d = int(data[pos + 4])
        w = int(data[pos + 5])
        pos += 6
        P.append(a + c)
        DL.append(dl)
        W.append(w)
        D.append(d - b + c)
    rng = range(n)

    def feasible(T):
        E = [D[i] + T // W[i] for i in rng]
        order = sorted(rng, key=E.__getitem__)
        s = 0
        used = 0
        heap = []
        for i in order:
            s += P[i]
            dl = DL[i]
            if dl:
                heappush(heap, -dl)
            e = E[i]
            while s > e:
                if used == k or not heap:
                    return False
                s += heappop(heap)
                used += 1
        return True

    lo = -10**15
    hi = 10**15
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if feasible(mid):
            hi = mid
        else:
            lo = mid
    print(hi)


main()
