import sys

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    xs = [0] * (n + 1)
    ys = [0] * (n + 1)
    ts = [0] * (n + 1)
    for i in range(1, n + 1):
        b = 3 * (i - 1) + 1
        xs[i] = int(data[b])
        ys[i] = int(data[b + 1])
        ts[i] = int(data[b + 2])
    ds = [xs[i] - ys[i] for i in range(n + 1)]
    uniq = sorted(set(ds))
    R = len(uniq)
    rank_of = {v: k + 1 for k, v in enumerate(uniq)}
    ranks = [rank_of[v] for v in ds]

    MA = [[] for _ in range(R + 1)]
    CA = [[] for _ in range(R + 1)]
    PA = [0] * (R + 1)
    MB = [[] for _ in range(R + 1)]
    CB = [[] for _ in range(R + 1)]
    PB = [0] * (R + 1)

    def ins(Ms, Cs, Ps, k, m, c):
        M = Ms[k]
        C = Cs[k]
        L = len(M)
        if L and M[-1] == m:
            if c >= C[-1]:
                return
            M.pop()
            C.pop()
            L -= 1
        while L >= 2:
            m1 = M[L - 2]
            c1 = C[L - 2]
            if (c - c1) * (m1 - M[L - 1]) <= (C[L - 1] - c1) * (m1 - m):
                M.pop()
                C.pop()
                L -= 1
            else:
                break
        if Ps[k] >= L:
            Ps[k] = L - 1 if L > 0 else 0
        M.append(m)
        C.append(c)

    def insert_point(i, dpi):
        r = ranks[i]
        xi = xs[i]
        yi = ys[i]
        k = r
        m = -2 * xi
        c = dpi + xi * xi
        while k <= R:
            ins(MA, CA, PA, k, m, c)
            k += k & -k
        k = R + 1 - r
        m = -2 * yi
        c = dpi + yi * yi
        while k <= R:
            ins(MB, CB, PB, k, m, c)
            k += k & -k

    insert_point(0, 0)
    dpj = 0
    for j in range(1, n + 1):
        X = xs[j]
        Y = ys[j]
        r = ranks[j]
        bestA = None
        k = r
        while k > 0:
            M = MA[k]
            if M:
                C = CA[k]
                p = PA[k]
                last = len(M) - 1
                cur = M[p] * X + C[p]
                while p < last:
                    nv = M[p + 1] * X + C[p + 1]
                    if nv <= cur:
                        cur = nv
                        p += 1
                    else:
                        break
                PA[k] = p
                if bestA is None or cur < bestA:
                    bestA = cur
            k -= k & -k
        bestB = None
        k = R - r
        while k > 0:
            M = MB[k]
            if M:
                C = CB[k]
                p = PB[k]
                last = len(M) - 1
                cur = M[p] * Y + C[p]
                while p < last:
                    nv = M[p + 1] * Y + C[p + 1]
                    if nv <= cur:
                        cur = nv
                        p += 1
                    else:
                        break
                PB[k] = p
                if bestB is None or cur < bestB:
                    bestB = cur
            k -= k & -k
        best = None
        if bestA is not None:
            best = bestA + X * X
        if bestB is not None:
            v = bestB + Y * Y
            if best is None or v < best:
                best = v
        dpj = best + ts[j]
        if j < n:
            insert_point(j, dpj)
    print(dpj)

main()
