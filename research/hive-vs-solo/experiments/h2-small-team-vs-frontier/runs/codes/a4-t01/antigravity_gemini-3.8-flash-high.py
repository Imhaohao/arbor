import sys

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    
    MOD = 998244353
    
    D = int(input_data[0])
    idx = 1
    groups = []
    M = 0
    max_e = 0
    for _ in range(D):
        e = int(input_data[idx])
        c = int(input_data[idx + 1])
        groups.append((e, c))
        M += e * c
        if e > max_e:
            max_e = e
        idx += 2
        
    # Precompute factorials and inverse factorials up to M + 1
    fact = [1] * (M + 2)
    for i in range(1, M + 2):
        fact[i] = (fact[i - 1] * i) % MOD
        
    invfact = [1] * (M + 2)
    invfact[M + 1] = pow(fact[M + 1], MOD - 2, MOD)
    for i in range(M, -1, -1):
        invfact[i] = (invfact[i + 1] * (i + 1)) % MOD
        
    # P[i] = prod_{j=1}^D (binom(i, e_j))^{c_j} for i from 0 to M
    P = [1] * (M + 1)
    for i in range(max_e):
        P[i] = 0
        
    # Group by c to minimize pow calls
    groups_by_c = {}
    for e, c in groups:
        groups_by_c.setdefault(c, []).append(e)
        
    for c, es in groups_by_c.items():
        if c == 1:
            for e in es:
                invfact_e = invfact[e]
                for i in range(max_e, M + 1):
                    b = fact[i] * invfact_e % MOD * invfact[i - e] % MOD
                    P[i] = (P[i] * b) % MOD
        elif len(es) == 1:
            e = es[0]
            invfact_e = invfact[e]
            for i in range(max_e, M + 1):
                b = fact[i] * invfact_e % MOD * invfact[i - e] % MOD
                P[i] = (P[i] * pow(b, c, MOD)) % MOD
        else:
            for i in range(max_e, M + 1):
                prod = 1
                for e in es:
                    b = fact[i] * invfact[e] % MOD * invfact[i - e] % MOD
                    prod = (prod * b) % MOD
                P[i] = (P[i] * pow(prod, c, MOD)) % MOD

    # Compute C[i] = sum_{k=i}^M (-1)^{k-i} binom(k, i)
    # Using the recurrence: C[M] = 1, C[i] = (2 * C[i + 1] + (-1)^{M - i} * binom(M + 1, i + 1)) % MOD
    C = [0] * (M + 1)
    C[M] = 1
    sign = MOD - 1  # (-1)^{M - (M - 1)} = -1
    fact_M1 = fact[M + 1]
    for i in range(M - 1, 0, -1):
        b = fact_M1 * invfact[i + 1] % MOD * invfact[M - i] % MOD
        term = (sign * b) % MOD
        C[i] = (2 * C[i + 1] + term) % MOD
        sign = MOD - sign

    # Total climbs = sum_{i=max_e}^M P[i] * C[i] % MOD
    ans = 0
    for i in range(max_e, M + 1):
        ans = (ans + P[i] * C[i]) % MOD

    print(ans)

if __name__ == '__main__':
    main()
