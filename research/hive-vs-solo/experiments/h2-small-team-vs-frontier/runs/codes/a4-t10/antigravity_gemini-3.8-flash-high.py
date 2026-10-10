import sys

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    n = int(input_data[0])
    m = int(input_data[1])

    MOD = 998244353

    if n > m:
        print(0)
        return

    if n == 1:
        print(m % MOD)
        return

    if n > 240:
        print(0)
        return

    # Precompute factorials and inverse factorials for permutation P(d, k)
    fact = [1] * 245
    for i in range(1, 245):
        fact[i] = (fact[i - 1] * i) % MOD

    inv_fact = [1] * 245
    inv_fact[244] = pow(fact[244], MOD - 2, MOD)
    for i in range(243, -1, -1):
        inv_fact[i] = (inv_fact[i + 1] * (i + 1)) % MOD

    def perm(d, k):
        if d < k:
            return 0
        return (fact[d] * inv_fact[d - k]) % MOD

    # Generate all valid prime exponent signatures whose minimal number is <= m
    PRIMES = [2, 3, 5, 7, 11, 13, 17, 19]

    def get_min_val(sig):
        val = 1
        for p, e in zip(PRIMES, sig):
            val *= p ** e
            if val > m:
                return val
        return val

    sig_to_id = {(): 0}
    id_to_sig = [()]
    queue = [()]

    head = 0
    while head < len(queue):
        curr = queue[head]
        head += 1
        for E in range(1, 21):
            cand = tuple(sorted(curr + (E,), reverse=True))
            if len(cand) <= len(PRIMES) and get_min_val(cand) <= m:
                if cand not in sig_to_id:
                    sig_to_id[cand] = len(id_to_sig)
                    id_to_sig.append(cand)
                    queue.append(cand)

    K = len(id_to_sig)
    trans = [[-1] * 21 for _ in range(K)]
    for sid in range(K):
        curr = id_to_sig[sid]
        for E in range(1, 21):
            cand = tuple(sorted(curr + (E,), reverse=True))
            if cand in sig_to_id:
                trans[sid][E] = sig_to_id[cand]

    # Linear sieve to count the frequency of each signature among 1..m
    spf = [0] * (m + 1)
    c = [0] * (m + 1)
    rem = [0] * (m + 1)
    sig = [0] * (m + 1)
    counts = [0] * K

    counts[0] = 1  # number 1 has empty signature ()
    primes = []
    sig_prime = trans[0][1]

    for i in range(2, m + 1):
        if spf[i] == 0:
            spf[i] = i
            c[i] = 1
            rem[i] = 1
            sig[i] = sig_prime
            counts[sig_prime] += 1
            primes.append(i)

        spf_i = spf[i]
        c_i = c[i]
        rem_i = rem[i]
        sig_rem_i = sig[rem_i]
        trans_i_1 = trans[sig[i]][1]

        for p in primes:
            ip = i * p
            if ip > m:
                break
            spf[ip] = p
            if p == spf_i:
                c_ip = c_i + 1
                c[ip] = c_ip
                rem[ip] = rem_i
                s = trans[sig_rem_i][c_ip]
                sig[ip] = s
                counts[s] += 1
                break
            else:
                c[ip] = 1
                rem[ip] = i
                sig[ip] = trans_i_1
                counts[trans_i_1] += 1

    # Inclusion-exclusion to compute distinct sequences with LCM equal to a signature
    def compute_f(S, req_n):
        k = len(S)
        d_all = 1
        for e in S:
            d_all *= e + 1
        if d_all < req_n:
            return 0

        total = 0
        for mask in range(1 << k):
            dj = 1
            sign = 1
            for j in range(k):
                if (mask >> j) & 1:
                    dj *= S[j]
                    sign = -sign
                else:
                    dj *= S[j] + 1
            if dj >= req_n:
                term = perm(dj, req_n)
                if sign == 1:
                    total += term
                else:
                    total -= term
        return total % MOD

    ans = 0
    for sid in range(K):
        cnt = counts[sid]
        if cnt == 0:
            continue
        S = id_to_sig[sid]
        f_val = compute_f(S, n)
        if f_val:
            ans = (ans + cnt * f_val) % MOD

    print(ans)

if __name__ == '__main__':
    main()
