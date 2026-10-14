import sys

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    
    n = int(input_data[0])
    
    X = [0] * n
    P = [0] * n
    Q = [0] * n
    C = [0] * n
    
    idx = 1
    for i in range(n):
        X[i] = int(input_data[idx])
        P[i] = int(input_data[idx + 1])
        Q[i] = int(input_data[idx + 2])
        C[i] = int(input_data[idx + 3])
        idx += 4

    INF = 10**30

    # Li Chao Tree over indices 0...n-1 corresponding to X[0...n-1]
    size = 1 << 18
    tk = [0] * size
    tb = [INF] * size

    def lc_add(k, b):
        node = 1
        l = 0
        r = n - 1
        while True:
            mid = (l + r) // 2
            cur_k = tk[node]
            cur_b = tb[node]

            if k * X[mid] + b < cur_k * X[mid] + cur_b:
                tk[node] = k
                tb[node] = b
                k = cur_k
                b = cur_b

            if l == r:
                break

            cur_k = tk[node]
            cur_b = tb[node]
            if k * X[l] + b < cur_k * X[l] + cur_b:
                node = 2 * node
                r = mid
            elif k * X[r] + b < cur_k * X[r] + cur_b:
                node = 2 * node + 1
                l = mid + 1
            else:
                break

    def lc_query(q_idx):
        node = 1
        l = 0
        r = n - 1
        x_val = X[q_idx]
        ans = INF
        while True:
            val = tk[node] * x_val + tb[node]
            if val < ans:
                ans = val
            if l == r:
                break
            mid = (l + r) // 2
            if q_idx <= mid:
                node = 2 * node
                r = mid
            else:
                node = 2 * node + 1
                l = mid + 1
        return ans

    # Convex Hull Trick for lines with strictly decreasing slopes
    cht = []

    def cht_add(k, b):
        while len(cht) >= 2:
            k1, b1 = cht[-2]
            k2, b2 = cht[-1]
            if (b - b2) * (k1 - k2) <= (b2 - b1) * (k2 - k):
                cht.pop()
            else:
                break
        cht.append((k, b))

    def cht_query(X_val):
        low = 0
        high = len(cht) - 1
        while low < high:
            mid = (low + high) // 2
            k1, b1 = cht[mid]
            k2, b2 = cht[mid + 1]
            if k2 * X_val + b2 <= k1 * X_val + b1:
                low = mid + 1
            else:
                high = mid
        return cht[low][0] * X_val + cht[low][1]

    # Station 0 (1-based: station 1)
    dp = 0
    cht_add(-X[0], dp + 2 * X[0] * X[0])
    e0 = cht_query(4 * X[0] + P[0] + Q[0])
    v0 = e0 + 4 * X[0] * X[0] + 2 * Q[0] * X[0] + C[0]
    lc_add(-(4 * X[0] - P[0] + Q[0]), v0)

    for i in range(1, n - 1):
        dp = 2 * X[i] * X[i] + lc_query(i)
        cht_add(-X[i], dp + 2 * X[i] * X[i])
        e = cht_query(4 * X[i] + P[i] + Q[i])
        v = e + 4 * X[i] * X[i] + 2 * Q[i] * X[i] + C[i]
        lc_add(-(4 * X[i] - P[i] + Q[i]), v)

    ans = 2 * X[n - 1] * X[n - 1] + lc_query(n - 1)
    sys.stdout.write(str(ans) + '\n')

if __name__ == '__main__':
    main()
