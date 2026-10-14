import sys
from heapq import heappush, heappop

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); k = int(data[1])
    A = []; DL = []; B = []; Cc = []; D = []; W = []
    pos = 2
    for _ in range(n):
        a = int(data[pos]); dl = int(data[pos+1]); b = int(data[pos+2])
        c = int(data[pos+3]); d = int(data[pos+4]); w = int(data[pos+5])
        pos += 6
        A.append(a); DL.append(dl); B.append(b); Cc.append(c); D.append(d); W.append(w)

    P = [A[i] + Cc[i] for i in range(n)]
    base = [D[i] - B[i] + Cc[i] for i in range(n)]
    total = sum(P)

    lo = max(W[i] * (A[i] - DL[i] + B[i] - D[i]) for i in range(n)) - 1
    hi = max(W[i] * (total + B[i] - D[i]) for i in range(n))
    if hi <= lo:
        hi = lo + 1

    rng = range(n)

    def feasible(X):
        E = [base[i] + X // W[i] for i in rng]
        order = sorted(rng, key=E.__getitem__)
        h = []
        s = 0
        cnt = 0
        for idx in order:
            s += P[idx]
            dl = DL[idx]
            if dl:
                heappush(h, -dl)
            e = E[idx]
            while s > e:
                if cnt >= k or not h:
                    return False
                s += heappop(h)
                cnt += 1
        return True

    # lo infeasible, hi feasible
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if feasible(mid):
            hi = mid
        else:
            lo = mid
    print(hi)

main()
