import sys
from itertools import accumulate


def build_channel(n, x, y, p):
    PA = [0] * (n + 1)
    PB = [0] * (n + 1)
    for t in range(n):
        PA[t + 1] = PA[t] + x[t]
        PB[t + 1] = PB[t] + y[t]
    D = [PA[t] - PB[t] for t in range(n + 1)]
    f = [0] * (n + 1)
    for t in range(1, n + 1):
        f[t] = 2 * D[t] + p[t - 1]
    st = [f]
    level = 1
    while (1 << level) <= n + 1:
        prev = st[-1]
        half = 1 << (level - 1)
        st.append([a if a < b else b for a, b in zip(prev, prev[half:])])
        level += 1
    return PA, PB, D, f, st, PA[::-1], PB[::-1], f[::-1]


def run_channel(n, channel, dp_prev, k, jmax):
    PA, PB, D, f, st, RPA, RPB, Rf = channel
    Rg = [u - v for u, v in zip(dp_prev, D)]
    Rg.reverse()
    res = [0] * (n + 1)
    hi0 = 0 if k == 1 else jmax - 1
    stack = [(k, jmax, k - 1, hi0)]
    while stack:
        jl, jr, lo, hi = stack.pop()
        if lo == hi:
            g0 = Rg[n - lo]
            pa0 = PA[lo]
            pb0 = PB[lo]
            runmins = list(accumulate(f[lo + 1:jr + 1], min))
            for j in range(jl, jr + 1):
                res[j] = g0 + (PA[j] - pa0) * (PB[j] - pb0) + runmins[j - lo - 1] - D[j]
            continue
        mid = (jl + jr) >> 1
        h = hi if hi < mid else mid - 1
        s = n - h
        e = n - lo + 1
        lev = (mid - h).bit_length() - 1
        row = st[lev]
        a = row[h + 1]
        b = row[mid - (1 << lev) + 1]
        base = a if a < b else b
        pa = PA[mid]
        pb = PB[mid]
        vals = [gi + (pa - x) * (pb - y) + m
                for gi, x, y, m in zip(Rg[s:e], RPA[s:e], RPB[s:e],
                                       accumulate(Rf[s:e - 1], min, initial=base))]
        best = min(vals)
        opt = h - vals.index(best)
        res[mid] = best - D[mid]
        if jl < mid:
            stack.append((jl, mid - 1, lo, opt))
        if mid < jr:
            stack.append((mid + 1, jr, opt, hi))
    return res


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    K = int(data[1])
    vals = list(map(int, data[2:2 + 6 * n]))
    a = vals[0::6]
    b = vals[1::6]
    c = vals[2::6]
    d = vals[3::6]
    p = vals[4::6]
    q = vals[5::6]
    ch1 = build_channel(n, a, b, p)
    ch2 = build_channel(n, c, d, q)
    dp = [0] * (n + 1)
    for k in range(1, K + 1):
        jmax = n - (K - k)
        r1 = run_channel(n, ch1, dp, k, jmax)
        r2 = run_channel(n, ch2, dp, k, jmax)
        dp = [u if u < v else v for u, v in zip(r1, r2)]
    print(2 * dp[n])


main()
