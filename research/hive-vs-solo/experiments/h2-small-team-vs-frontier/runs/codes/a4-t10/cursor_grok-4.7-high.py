import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    m = int(data[1])
    MOD = 998244353

    mu = [0] * (m + 1)
    tau = [0] * (m + 1)
    lp = [0] * (m + 1)
    ex = [0] * (m + 1)
    primes = []

    mu[1] = 1
    tau[1] = 1

    for i in range(2, m + 1):
        if lp[i] == 0:
            lp[i] = i
            primes.append(i)
            mu[i] = -1
            tau[i] = 2
            ex[i] = 1
        pi = lp[i]
        ti = tau[i]
        ei = ex[i]
        mui = mu[i]
        for p in primes:
            ip = i * p
            if ip > m:
                break
            lp[ip] = p
            if p == pi:
                mu[ip] = 0
                ne = ei + 1
                ex[ip] = ne
                tau[ip] = ti // (ei + 1) * (ne + 1)
                break
            mu[ip] = -mui
            ex[ip] = 1
            tau[ip] = ti << 1

    pref = [0] * (m + 1)
    s = 0
    for i in range(1, m + 1):
        s += mu[i]
        pref[i] = s

    mx = 0
    for v in tau:
        if v > mx:
            mx = v

    perm = [0] * (mx + 1)
    if n <= mx:
        for k in range(n, mx + 1):
            val = 1
            for j in range(k - n + 1, k + 1):
                val = val * j % MOD
            perm[k] = val

    ans = 0
    for d in range(1, m + 1):
        t = tau[d]
        if t >= n:
            ans += perm[t] * pref[m // d]
    print(ans % MOD)


main()
