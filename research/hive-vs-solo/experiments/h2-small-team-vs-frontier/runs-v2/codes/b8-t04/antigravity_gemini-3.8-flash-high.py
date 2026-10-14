import sys

# Increase recursion depth for CDQ divide-and-conquer
sys.setrecursionlimit(300000)

def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    n = int(input_data[0])
    x = [0] * (n + 1)
    y = [0] * (n + 1)
    t = [0] * (n + 1)

    idx = 1
    for i in range(1, n + 1):
        x[i] = int(input_data[idx])
        y[i] = int(input_data[idx + 1])
        t[i] = int(input_data[idx + 2])
        idx += 3

    # Coordinate compress z[i] = x[i] - y[i]
    z = [x[i] - y[i] for i in range(n + 1)]
    unique_z = sorted(set(z))
    z_to_rk = {val: i for i, val in enumerate(unique_z)}
    rk = [z_to_rk[val] for val in z]

    INF = 10**30
    dp = [INF] * (n + 1)
    dp[0] = 0

    def cht_x(S, Q):
        hull_m = []
        hull_c = []
        crit_x = []

        for i in S:
            m = -2 * x[i]
            c = dp[i] + x[i] * x[i]

            if hull_m and hull_m[-1] == m:
                if c >= hull_c[-1]:
                    continue
                hull_m.pop()
                hull_c.pop()
                if crit_x:
                    crit_x.pop()

            while crit_x:
                denom = hull_m[-1] - m
                numer = c - hull_c[-1]
                crit = -((-numer) // denom)
                if crit_x[-1] >= crit:
                    hull_m.pop()
                    hull_c.pop()
                    crit_x.pop()
                else:
                    break

            if hull_m:
                denom = hull_m[-1] - m
                numer = c - hull_c[-1]
                crit_x.append(-((-numer) // denom))

            hull_m.append(m)
            hull_c.append(c)

        ptr = 0
        num_crit = len(crit_x)
        for j in Q:
            xj = x[j]
            while ptr < num_crit and xj >= crit_x[ptr]:
                ptr += 1
            val = hull_m[ptr] * xj + hull_c[ptr] + xj * xj + t[j]
            if val < dp[j]:
                dp[j] = val

    def cht_y(S, Q):
        hull_m = []
        hull_c = []
        crit_x = []

        for i in S:
            m = -2 * y[i]
            c = dp[i] + y[i] * y[i]

            if hull_m and hull_m[-1] == m:
                if c >= hull_c[-1]:
                    continue
                hull_m.pop()
                hull_c.pop()
                if crit_x:
                    crit_x.pop()

            while crit_x:
                denom = hull_m[-1] - m
                numer = c - hull_c[-1]
                crit = -((-numer) // denom)
                if crit_x[-1] >= crit:
                    hull_m.pop()
                    hull_c.pop()
                    crit_x.pop()
                else:
                    break

            if hull_m:
                denom = hull_m[-1] - m
                numer = c - hull_c[-1]
                crit_x.append(-((-numer) // denom))

            hull_m.append(m)
            hull_c.append(c)

        ptr = 0
        num_crit = len(crit_x)
        for j in Q:
            yj = y[j]
            while ptr < num_crit and yj >= crit_x[ptr]:
                ptr += 1
            val = hull_m[ptr] * yj + hull_c[ptr] + yj * yj + t[j]
            if val < dp[j]:
                dp[j] = val

    def dnc_z(S, Q):
        len_S = len(S)
        len_Q = len(Q)
        if len_S == 0 or len_Q == 0:
            return

        if len_S <= 4 or len_Q <= 4 or len_S * len_Q <= 64:
            for j in Q:
                xj = x[j]
                yj = y[j]
                tj = t[j]
                best = dp[j]
                for i in S:
                    dx = xj - x[i]
                    dy = yj - y[i]
                    c = dx * dx if dx >= dy else dy * dy
                    val = dp[i] + c + tj
                    if val < best:
                        best = val
                dp[j] = best
            return

        min_rk = rk[S[0]]
        max_rk = min_rk
        for i in S:
            r = rk[i]
            if r < min_rk:
                min_rk = r
            elif r > max_rk:
                max_rk = r
        for j in Q:
            r = rk[j]
            if r < min_rk:
                min_rk = r
            elif r > max_rk:
                max_rk = r

        if min_rk == max_rk:
            cht_x(S, Q)
            return

        mid_z = (min_rk + max_rk) // 2

        S_left = []
        S_right = []
        for i in S:
            if rk[i] <= mid_z:
                S_left.append(i)
            else:
                S_right.append(i)

        Q_left = []
        Q_right = []
        for j in Q:
            if rk[j] <= mid_z:
                Q_left.append(j)
            else:
                Q_right.append(j)

        if S_left and Q_right:
            cht_x(S_left, Q_right)
        if S_right and Q_left:
            cht_y(S_right, Q_left)

        if S_left and Q_left:
            dnc_z(S_left, Q_left)
        if S_right and Q_right:
            dnc_z(S_right, Q_right)

    def cdq(L, R):
        if L >= R:
            return
        mid = (L + R) // 2
        cdq(L, mid)

        S = list(range(L, mid + 1))
        Q = list(range(mid + 1, R + 1))
        dnc_z(S, Q)

        cdq(mid + 1, R)

    cdq(0, n)
    print(dp[n])

if __name__ == '__main__':
    solve()
