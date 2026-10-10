import sys

def main():
    data = sys.stdin.read().split()
    Ns = data[0]
    D = int(data[1]); R = int(data[2])
    MOD = 998244353
    N = [ord(ch) - 48 for ch in Ns]
    L = len(N)

    def mul(A, B):
        C = [0] * D
        for i in range(D):
            a = A[i]
            if a:
                for j in range(D):
                    b = B[j]
                    if b:
                        C[(i + j) % D] += a * b
        return [v % MOD for v in C]

    def add(A, B):
        return [(A[i] + B[i]) % MOD for i in range(D)]

    def shift(A, s):
        B = [0] * D
        for i in range(D):
            B[(i + s) % D] = A[i]
        return B

    unit = [0] * D
    unit[0] = 1
    zero = [0] * D

    F1 = [0] * D
    for d in range(10):
        F1[d % D] += 1
    F = [unit]
    for m in range(1, L + 2):
        F.append(mul(F[-1], F1))

    U = []
    for c in range(10):
        u = [0] * D
        for d in range(c + 1, 10):
            u[d % D] += 1
        U.append(u)

    PG = [0] * D; PE = [0] * D; PG1 = [0] * D; PE1 = [0] * D
    for a in range(10):
        for b in range(10):
            r = (a + b) % D
            if b > a:
                PG[r] += 1
                if a >= 1:
                    PG1[r] += 1
            elif b == a:
                PE[r] += 1
                if a >= 1:
                    PE1[r] += 1

    Ggt = [zero, zero]
    for m in range(2, L + 2):
        Ggt.append(add(mul(PG, F[m - 2]), mul(PE, Ggt[m - 2])))

    ans = 0
    for Lp in range(2, L):
        vec = add(mul(PG1, F[Lp - 2]), mul(PE1, Ggt[Lp - 2]))
        ans = (ans + vec[R]) % MOD

    pre = [0] * (L + 1)
    for i in range(L):
        pre[i + 1] = pre[i] + N[i]

    Gt = [zero]
    for m in range(L):
        Gt.append(add(mul(Gt[m], F1), shift(U[N[m]], pre[m])))

    # cst[a]: status of N[a..L-1-a], 1 if reversed greater, -1 less, 0 equal
    cst = [0] * (L + 2)
    a = (L - 1) // 2
    while a >= 0:
        b = L - 1 - a
        if a >= b:
            cst[a] = 0
        else:
            if N[b] != N[a]:
                cst[a] = 1 if N[b] > N[a] else -1
            else:
                cst[a] = cst[a + 1]
        a -= 1

    def stat(a, b):
        if a >= b:
            return 0
        return cst[a]

    for k in range(L):
        lo = 1 if k == 0 else 0
        hi = N[k]
        if lo >= hi:
            continue
        if L >= 2 * k + 2:
            M = L - 2 * k - 2
            base = mul(Gt[k], F[M + 1])
            FM = F[M]
            gM = Ggt[M]
            for c in range(lo, hi):
                inner = add(base, mul(shift(U[c], pre[k]), FM))
                eqv = [0] * D
                eqv[(pre[k] + c) % D] = 1
                inner = add(inner, mul(eqv, gM))
                tot = shift(inner, pre[k] + c)
                ans = (ans + tot[R]) % MOD
        else:
            f = L - 1 - k
            for c in range(lo, hi):
                if f == k:
                    gt = False
                elif c != N[f]:
                    gt = c > N[f]
                else:
                    gt = stat(f + 1, k - 1) == 1
                inner = Gt[f]
                if gt:
                    inner = inner[:]
                    inner[pre[f] % D] = (inner[pre[f] % D] + 1) % MOD
                tot = shift(inner, pre[k] + c)
                ans = (ans + tot[R]) % MOD

    if Ns[::-1] > Ns and pre[L] % D == R:
        ans = (ans + 1) % MOD

    print(ans % MOD)

main()
