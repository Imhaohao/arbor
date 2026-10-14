import sys
from heapq import heappush, heappop


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    k = int(data[1])
    vals = list(map(int, data[2:2 + 6 * n]))
    A = vals[0::6]
    Dl = vals[1::6]
    B = vals[2::6]
    C = vals[3::6]
    Dd = vals[4::6]
    W = vals[5::6]

    q = [A[i] + C[i] for i in range(n)]
    base = [Dd[i] - B[i] + C[i] for i in range(n)]
    negD = [-x for x in Dl]
    total = sum(q)

    lo = max(W[i] * (A[i] - Dl[i] + B[i] - Dd[i]) for i in range(n)) - 1
    hi = max(W[i] * (total + B[i] - Dd[i]) for i in range(n))

    def feasible(T):
        keys = [x + T // w for x, w in zip(base, W)]
        order = sorted(range(n), key=keys.__getitem__)
        ks = [keys[i] for i in order]
        qs = [q[i] for i in order]
        ds = [negD[i] for i in order]
        heap = []
        load = 0
        red = 0
        used = 0
        for key, qq, dneg in zip(ks, qs, ds):
            load += qq
            heappush(heap, dneg)
            need = load - key
            while red < need:
                if used == k or not heap:
                    return False
                red -= heappop(heap)
                used += 1
        return True

    while hi - lo > 1:
        mid = (lo + hi) // 2
        if feasible(mid):
            hi = mid
        else:
            lo = mid
    print(hi)


main()
