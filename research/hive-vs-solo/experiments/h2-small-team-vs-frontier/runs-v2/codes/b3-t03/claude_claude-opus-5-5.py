import sys
from bisect import bisect_right

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); k = int(data[1])
    s = [0]*n; e = [0]*n; a = [0]*n; b = [0]*n
    p = 2
    for i in range(n):
        s[i] = int(data[p]); e[i] = int(data[p+1]); a[i] = int(data[p+2]); b[i] = int(data[p+3])
        p += 4

    E = sorted(set(e))
    m = len(E)
    rank = {v: i + 1 for i, v in enumerate(E)}
    erank = [rank[v] for v in e]
    order_s = sorted(range(n), key=s.__getitem__)

    def feasible(X):
        tree = [0] * (m + 1)
        R = [e[i] + (a[i] - X if a[i] > X else 0) for i in range(n)]
        act = sorted(range(n), key=R.__getitem__)
        dp = [0] * n
        ptr = 0
        for j in order_s:
            sj = s[j]
            while ptr < n and R[act[ptr]] <= sj:
                i = act[ptr]
                v = dp[i]
                idx = erank[i]
                while idx <= m:
                    if tree[idx] >= v:
                        break
                    tree[idx] = v
                    idx += idx & -idx
                ptr += 1
            bj = b[j]
            q = sj - (bj - X if bj > X else 0)
            idx = bisect_right(E, q)
            best = 0
            while idx > 0:
                t = tree[idx]
                if t > best:
                    best = t
                idx &= idx - 1
            best += 1
            if best >= k:
                return True
            dp[j] = best
        return False

    hi = max(max(a), max(b))
    if not feasible(hi):
        print(-1)
        return
    lo = 0
    while lo < hi:
        mid = (lo + hi) // 2
        if feasible(mid):
            hi = mid
        else:
            lo = mid + 1
    print(lo)

main()
