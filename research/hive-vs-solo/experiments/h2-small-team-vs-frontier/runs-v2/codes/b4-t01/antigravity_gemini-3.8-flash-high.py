import sys

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    
    n = int(input_data[0])
    a = [int(x) for x in input_data[1:n+1]]
    
    M = max(a)
    MOD = 998244353
    
    # Frequency array
    c = [0] * (M + 1)
    for x in a:
        c[x] += 1
        
    # Linear sieve for primes and Möbius function mu up to M
    mu = [0] * (M + 1)
    mu[1] = 1
    primes = []
    min_prime = [0] * (M + 1)
    for i in range(2, M + 1):
        if min_prime[i] == 0:
            primes.append(i)
            mu[i] = -1
            min_prime[i] = i
        for p in primes:
            pi = p * i
            if pi > M:
                break
            min_prime[pi] = p
            if i % p == 0:
                mu[pi] = 0
                break
            else:
                mu[pi] = -mu[i]
                
    # Fast zeta transform on divisor lattice to compute cnt[d] = sum_{m >= 1} c[m * d]
    cnt = list(c)
    for p in primes:
        for i in range(M // p, 0, -1):
            cnt[i] += cnt[i * p]
            
    # Precompute factorials and inverse factorials up to max(n, M)
    MAX_FACT = max(n, M)
    fact = [1] * (MAX_FACT + 1)
    for i in range(1, MAX_FACT + 1):
        fact[i] = (fact[i - 1] * i) % MOD
        
    inv_fact = [1] * (MAX_FACT + 1)
    inv_fact[MAX_FACT] = pow(fact[MAX_FACT], MOD - 2, MOD)
    for i in range(MAX_FACT - 1, -1, -1):
        inv_fact[i] = (inv_fact[i + 1] * (i + 1)) % MOD
        
    K_max = min(n, M)
    total = 0
    
    for k in range(1, K_max + 1):
        c_k = cnt[k]
        if c_k < k:
            continue
            
        inv_k = inv_fact[k]
        # Base term for g = 1: mu[1] = 1, cnt[k * 1] = c_k
        s = fact[c_k] * inv_fact[c_k - k] % MOD
        limit = M // k
        
        for g in range(2, limit + 1):
            mg = mu[g]
            if not mg:
                continue
            c_kg = cnt[k * g]
            if c_kg < k:
                continue
            term = fact[c_kg] * inv_fact[c_kg - k] % MOD
            if mg == 1:
                s += term
            else:
                s -= term
                
        total = (total + (s % MOD) * inv_k) % MOD
        
    print(total)

if __name__ == '__main__':
    main()
