import sys

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); K = int(data[1])
    A = [0]*(n+1); B = [0]*(n+1); Cc = [0]*(n+1); D = [0]*(n+1)
    PE = [0]*(n+1); PF = [0]*(n+1)
    G = [0]*(n+1); H = [0]*(n+1)
    idx = 2
    for i in range(1, n+1):
        a = int(data[idx]); b = int(data[idx+1]); c = int(data[idx+2]); d = int(data[idx+3])
        p = int(data[idx+4]); q = int(data[idx+5])
        idx += 6
        A[i] = A[i-1] + a; B[i] = B[i-1] + b
        Cc[i] = Cc[i-1] + c; D[i] = D[i-1] + d
        PE[i] = PE[i-1] + a - b; PF[i] = PF[i-1] + c - d
        G[i] = 2*PE[i] + p
        H[i] = 2*PF[i] + q

    lg = [0]*(n+2)
    for i in range(2, n+2):
        lg[i] = lg[i >> 1] + 1

    def build_sparse(arr):
        sp = [arr[:]]
        j = 1
        while (1 << j) <= n:
            prev = sp[-1]
            half = 1 << (j-1)
            cur = prev[:]
            for i in range(1, n - (1 << j) + 2):
                x = prev[i]; y = prev[i+half]
                cur[i] = x if x < y else y
            sp.append(cur)
            j += 1
        return sp

    spG = build_sparse(G)
    spH = build_sparse(H)

    INF = 1 << 100

    def run_channel(prev, k, X, Y, P, Garr, sp):
        base = [INF]*(n+1)
        for j in range(n+1):
            pv = prev[j]
            if pv < INF:
                base[j] = pv + X[j]*Y[j] - P[j]
        res = [INF]*(n+1)
        rhi = n - (K - k)
        stack = [(k, rhi, k, rhi)]
        while stack:
            lo, hi, ol, orr = stack.pop()
            if lo > hi:
                continue
            mid = (lo + hi) >> 1
            top = mid if mid < orr else orr
            ln = mid - top + 1
            j = lg[ln]
            row = sp[j]
            x1 = row[top]; x2 = row[mid - (1 << j) + 1]
            cur = x1 if x1 < x2 else x2
            Xr = X[mid]; Yr = Y[mid]
            best = INF; bl = top
            for l in range(top, ol - 1, -1):
                g = Garr[l]
                if g < cur:
                    cur = g
                jj = l - 1
                v = base[jj] - Xr*Y[jj] - Yr*X[jj] + cur
                if v < best:
                    best = v; bl = l
            res[mid] = best + Xr*Yr - P[mid]
            stack.append((lo, mid - 1, ol, bl))
            stack.append((mid + 1, hi, bl, orr))
        return res

    dp = [INF]*(n+1)
    dp[0] = 0
    for k in range(1, K+1):
        r1 = run_channel(dp, k, A, B, PE, G, spG)
        r2 = run_channel(dp, k, Cc, D, PF, H, spH)
        dp = [x if x < y else y for x, y in zip(r1, r2)]
    print(2 * dp[n])

main()
