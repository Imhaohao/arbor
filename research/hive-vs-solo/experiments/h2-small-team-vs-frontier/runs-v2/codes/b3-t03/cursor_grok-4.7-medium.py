import sys
import heapq
from bisect import bisect_right


def main():
    data = sys.stdin.buffer.read().split()
    it = iter(data)
    n = int(next(it))
    k = int(next(it))
    s = [0] * n
    e = [0] * n
    a = [0] * n
    b = [0] * n
    max_ab = 0
    for i in range(n):
        s[i] = int(next(it))
        e[i] = int(next(it))
        a[i] = int(next(it))
        b[i] = int(next(it))
        if a[i] > max_ab:
            max_ab = a[i]
        if b[i] > max_ab:
            max_ab = b[i]

    if k <= 1:
        print(0)
        return

    ends = sorted(set(e))
    m = len(ends)
    pe = [bisect_right(ends, e[i]) - 1 for i in range(n)]
    order = sorted(range(n), key=s.__getitem__)
    fen = [0] * (m + 1)
    dp = [0] * n

    def feasible(X):
        for i in range(m + 1):
            fen[i] = 0
        heap = []
        for j in order:
            sj = s[j]
            while heap and heap[0][0] <= sj:
                _, i = heapq.heappop(heap)
                val = dp[i]
                p = pe[i] + 1
                while p <= m:
                    if fen[p] >= val:
                        break
                    fen[p] = val
                    p += p & -p
            bj = b[j] - X
            if bj < 0:
                bj = 0
            idx = bisect_right(ends, sj - bj) - 1
            best = 0
            p = idx + 1
            while p > 0:
                if fen[p] > best:
                    best = fen[p]
                p -= p & -p
            cur = best + 1
            dp[j] = cur
            if cur >= k:
                return True
            aj = a[j] - X
            if aj < 0:
                aj = 0
            heapq.heappush(heap, (e[j] + aj, j))
        return False

    lo = 0
    hi = max_ab
    ans = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if feasible(mid):
            ans = mid
            hi = mid - 1
        else:
            lo = mid + 1
    print(ans)


if __name__ == "__main__":
    main()
