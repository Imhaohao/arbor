import sys

def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    
    n = int(input_data[0])
    a = [int(x) for x in input_data[1:n+1]]
    
    MOD = 998244353
    inv2 = (MOD + 1) // 2
    inv64 = pow(64, MOD - 2, MOD)
    
    max_a = max(a) if a else 0
    M = max(max_a, 1)
    
    # Precompute powers of 2, 3, and inv2 up to n
    pow2 = [1] * (n + 1)
    pow3 = [1] * (n + 1)
    pow2_inv = [1] * (n + 1)
    for i in range(1, n + 1):
        pow2[i] = (pow2[i - 1] * 2) % MOD
        pow3[i] = (pow3[i - 1] * 3) % MOD
        pow2_inv[i] = (pow2_inv[i - 1] * inv2) % MOD

    # Precompute Omega and mu up to M using a sieve
    min_prime = [0] * (M + 1)
    primes = []
    omega = [0] * (M + 1)
    mu = [0] * (M + 1)
    mu[1] = 1
    
    for i in range(2, M + 1):
        if min_prime[i] == 0:
            min_prime[i] = i
            primes.append(i)
            omega[i] = 1
            mu[i] = -1
        p = min_prime[i]
        for pr in primes:
            if pr > p or i * pr > M:
                break
            min_prime[i * pr] = pr
            omega[i * pr] = omega[i] + 1
            if pr == p:
                mu[i * pr] = 0
            else:
                mu[i * pr] = -mu[i]

    # Frequency of each value in input
    freq = [0] * (M + 1)
    for x in a:
        freq[x] += 1

    # cnt[x]: number of elements in a divisible by x
    cnt = [0] * (M + 1)
    for i in range(1, M + 1):
        s = 0
        for j in range(i, M + 1, i):
            s += freq[j]
        cnt[i] = s

    # cnt_H[H] stores counts of elements in I_H with Omega(a_i / H) = u (0 <= u <= 15)
    cnt_H = [None] * (M + 1)
    for H in range(1, M + 1):
        if cnt[H] > 0:
            arr = [0] * 16
            for v in range(H, M + 1, H):
                if freq[v] > 0:
                    u = omega[v // H]
                    arr[u] += freq[v]
            cnt_H[H] = arr

    # coeff_H[H] will store a dict: (s, d) -> coeff
    coeff_H = [None] * (M + 1)

    # Compute D(g, L) for each g and accumulate into coeff_H
    for g in range(1, M + 1):
        if cnt[g] == 0:
            continue
        max_L = M // g
        # A[m] = 2^(cnt[g * m])
        A = [0] * (max_L + 1)
        for m in range(1, max_L + 1):
            A[m] = pow2[cnt[g * m]]
        
        # In-place Dirichlet Möbius transform: A becomes D(g, L)
        for p in primes:
            if p > max_L:
                break
            for m in range(max_L // p, 0, -1):
                A[m * p] = (A[m * p] - A[m]) % MOD

        # Now distribute D(g, L) to coeff_H
        for L in range(1, max_L + 1):
            val = A[L]
            if val == 0:
                continue
            d = omega[L]
            gL = g * L
            max_m = M // gL
            for m in range(1, max_m + 1):
                if mu[m] != 0:
                    H = gL * m
                    if cnt[H] > 0:
                        s = omega[m]
                        term = (val * mu[m]) % MOD
                        if coeff_H[H] is None:
                            coeff_H[H] = {}
                        key = (s, d)
                        coeff_H[H][key] = (coeff_H[H].get(key, 0) + term) % MOD

    # Fast Walsh-Hadamard Transform (FWHT) in-place for size 64
    def fwht_64(F):
        for len_step in (1, 2, 4, 8, 16, 32):
            for i in range(0, 64, len_step * 2):
                for j in range(len_step):
                    u = F[i + j]
                    v = F[i + len_step + j]
                    F[i + j] = u + v
                    F[i + len_step + j] = u - v

    ans = 0

    # For each H, evaluate Z(H, s, d) and accumulate
    for H in range(1, M + 1):
        if coeff_H[H] is None:
            continue
        
        c_H = cnt_H[H]
        cnt_H_sum = cnt[H]
        pow2_cntH = pow2[cnt_H_sum]
        H_total = 0
        
        for (s, d), coeff in coeff_H[H].items():
            if coeff % MOD == 0:
                continue
            
            # Form frequency array F of size 64
            F = [0] * 64
            for u in range(16):
                c = c_H[u]
                if c > 0:
                    v1 = (u + s) >> 1
                    v2 = (u + s + d) >> 1
                    idx = (v1 << 3) | v2
                    F[idx] += c
            
            # Apply FWHT
            fwht_64(F)
            
            # Compute total_chi = sum_chi 3^E(chi)
            total_chi = 0
            for chi in range(64):
                E = (cnt_H_sum + F[chi]) >> 1
                total_chi = (total_chi + pow3[E]) % MOD
            
            # Z(H, s, d) = inv64 * total_chi - 2^cnt(H)
            Z = (total_chi * inv64 - pow2_cntH) % MOD
            H_total = (H_total + coeff * Z) % MOD
        
        # Multiply by 2^(-cnt(H))
        ans = (ans + H_total * pow2_inv[cnt_H_sum]) % MOD

    print(ans % MOD)

if __name__ == '__main__':
    solve()
