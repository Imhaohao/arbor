import sys
def main():
    data = sys.stdin.read().split()
    d = int(data[0])
    P = 998244353
    es = []
    M = 0
    for j in range(d):
        e = int(data[1 + 2 * j]); c = int(data[2 + 2 * j])
        es.append((e, c))
        M += e * c
    n = M + 2
    fact = [1] * (n + 1)
    for i in range(1, n + 1):
        fact[i] = fact[i - 1] * i % P
    ifact = [1] * (n + 1)
    ifact[n] = pow(fact[n], P - 2, P)
    for i in range(n, 0, -1):
        ifact[i - 1] = ifact[i] * i % P
    inv2 = (P + 1) // 2
    sign = 1 if M % 2 == 0 else P - 1
    T = 1 if M % 2 == 0 else 0
    emax = max(e for e, _ in es)
    ans = 0
    fm = fact[M + 1]
    for i in range(0, M + 1):
        if i > 0:
            cb = fm * ifact[i] % P * ifact[M + 1 - i] % P
            T = (-T + sign * cb) % P * inv2 % P
        if i >= emax:
            f = 1
            fi = fact[i]
            for e, c in es:
                f = f * pow(fi * ifact[e] % P * ifact[i - e] % P, c, P) % P
            term = f * T % P
            if i & 1:
                ans -= term
            else:
                ans += term
    print(ans % P)
main()
