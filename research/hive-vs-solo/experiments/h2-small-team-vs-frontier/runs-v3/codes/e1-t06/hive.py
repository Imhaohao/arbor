import sys

BIG = 1 << 100
SENTINEL = 1 << 200


def build_sparse_table(values):
    table = [values]
    span = 1
    while 2 * span <= len(values):
        prev = table[-1]
        table.append([min(prev[t], prev[t + span]) for t in range(len(values) - 2 * span + 1)])
        span *= 2
    return table


def range_min(table, lo, hi):
    k = (hi - lo + 1).bit_length() - 1
    row = table[k]
    return min(row[lo], row[hi - (1 << k) + 1])


def make_channel(prefix_a, prefix_b, offsets):
    size = len(prefix_a)
    constant = [prefix_a[j] * prefix_b[j] - prefix_a[j] + prefix_b[j] for j in range(size)]
    diff = [prefix_a[i] - prefix_b[i] for i in range(size)]
    linear = [prefix_a[i] * prefix_b[i] + prefix_a[i] - prefix_b[i] - 2 * diff[i] for i in range(size)]
    minima = [0] + [2 * diff[m] + offsets[m] for m in range(1, size)]
    return prefix_a, prefix_b, constant, linear, minima, build_sparse_table(minima)


def channel_costs(prev, k, n, channel):
    prefix_a, prefix_b, constant, linear, minima, table = channel
    P = [prev[i] + linear[i] for i in range(n)]
    result = [BIG] * (n + 1)
    stack = [(k, n, k - 1, n - 1)]
    while stack:
        jl, jr, il, ir = stack.pop()
        if jl > jr:
            continue
        mid = (jl + jr) >> 1
        hi = min(ir, mid - 1)
        xj = prefix_a[mid]
        yj = prefix_b[mid]
        cur = range_min(table, hi + 1, mid)
        best = SENTINEL
        arg = il
        for i in range(hi, il - 1, -1):
            val = P[i] - xj * prefix_b[i] - yj * prefix_a[i] + cur
            if val <= best:
                best = val
                arg = i
            if minima[i] < cur:
                cur = minima[i]
        result[mid] = best + constant[mid]
        stack.append((jl, mid - 1, il, arg))
        stack.append((mid + 1, jr, arg, ir))
    return result


def main():
    data = sys.stdin.buffer.read().split()
    n, K = int(data[0]), int(data[1])
    a_pre = [0] * (n + 1)
    b_pre = [0] * (n + 1)
    c_pre = [0] * (n + 1)
    d_pre = [0] * (n + 1)
    p = [0] * (n + 1)
    q = [0] * (n + 1)
    for m in range(1, n + 1):
        base = 2 + 6 * (m - 1)
        a, b, c, d, p[m], q[m] = map(int, data[base:base + 6])
        a_pre[m] = a_pre[m - 1] + a
        b_pre[m] = b_pre[m - 1] + b
        c_pre[m] = c_pre[m - 1] + c
        d_pre[m] = d_pre[m - 1] + d
    upper = make_channel(a_pre, b_pre, p)
    lower = make_channel(c_pre, d_pre, q)
    dp = [BIG] * (n + 1)
    dp[0] = 0
    for k in range(1, K + 1):
        from_upper = channel_costs(dp, k, n, upper)
        from_lower = channel_costs(dp, k, n, lower)
        dp = [min(x, y) for x, y in zip(from_upper, from_lower)]
    print(2 * dp[n])


main()
