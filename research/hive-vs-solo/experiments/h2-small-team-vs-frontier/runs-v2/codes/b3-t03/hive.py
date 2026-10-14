import sys
from bisect import bisect_right


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    k = int(data[1])
    S = [0] * n
    E = [0] * n
    A = [0] * n
    B = [0] * n
    for i in range(n):
        base = 2 + 4 * i
        S[i] = int(data[base])
        E[i] = int(data[base + 1])
        A[i] = int(data[base + 2])
        B[i] = int(data[base + 3])

    E_sorted = sorted(set(E))
    rank = {v: r + 1 for r, v in enumerate(E_sorted)}
    E_rank = [rank[e] for e in E]
    m = len(E_sorted)
    by_start = sorted(range(n), key=S.__getitem__)

    def feasible(X):
        P = [E[i] + max(0, A[i] - X) for i in range(n)]
        Q = [S[i] - max(0, B[i] - X) for i in range(n)]
        by_p = sorted(range(n), key=P.__getitem__)
        tree = [0] * (m + 1)
        f = [0] * n
        ptr = 0
        for j in by_start:
            sj = S[j]
            while ptr < n and P[by_p[ptr]] <= sj:
                i = by_p[ptr]
                ptr += 1
                value = f[i]
                x = E_rank[i]
                while x <= m:
                    if tree[x] < value:
                        tree[x] = value
                    x += x & -x
            x = bisect_right(E_sorted, Q[j])
            best = 0
            while x > 0:
                if tree[x] > best:
                    best = tree[x]
                x -= x & -x
            f[j] = best + 1
            if best + 1 >= k:
                return True
        return False

    hi = max(max(A), max(B))
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
