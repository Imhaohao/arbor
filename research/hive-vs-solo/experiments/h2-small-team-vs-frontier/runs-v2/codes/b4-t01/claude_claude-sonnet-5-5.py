import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    a = data[1:1 + n]
    M = 150000
    MOD = 998244353
    freq = [0] * (M + 1)
    for x in a:
        freq[int(x)] += 1
    cnt = [0] * (M + 1)
    for d in range(1, M + 1):
        cnt[d] = sum(freq[d::d])

    mu = [1] * (M + 1)
    is_comp = [False] * (M + 1)
    for p in range(2, M + 1):
        if not is_comp[p]:
            for m in range(p, M + 1, p):
                if m > p:
                    is_comp[m] = True
                mu[m] = -mu[m]
            pp = p * p
            for m in range(pp, M + 1, pp):
                mu[m] = 0

    fact = [1] * (n + 1)
    for i in range(1, n + 1):
        fact[i] = fact[i - 1] * i % MOD
    ifact = [1] * (n + 1)
    ifact[n] = pow(fact[n], MOD - 2, MOD)
    for i in range(n, 0, -1):
        ifact[i - 1] = ifact[i] * i % MOD

    answer = 0
    mu_tail = mu[1:]
    for k in range(1, min(n, M) + 1):
        if cnt[k] < k:
            continue
        total = 0
        for c, m in zip(cnt[k::k], mu_tail):
            if m and c >= k:
                if m > 0:
                    total += fact[c] * ifact[c - k]
                else:
                    total -= fact[c] * ifact[c - k]
        answer = (answer + total % MOD * ifact[k]) % MOD
    print(answer % MOD)

main()
