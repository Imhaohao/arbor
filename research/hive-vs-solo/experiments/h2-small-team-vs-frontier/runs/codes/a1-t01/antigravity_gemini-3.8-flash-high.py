import sys

def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    N_str = input_data[0]
    D = int(input_data[1])
    R = int(input_data[2])

    MOD = 998244353
    inv2 = (MOD + 1) // 2
    L = len(N_str)

    # Precomputations for lengths M < L
    # dp_free[k][rem]: number of digit strings of length k with sum % D == rem
    dp_free = [[0] * D for _ in range(L + 1)]
    dp_free[0][0] = 1
    for k in range(L):
        for rem in range(D):
            val = dp_free[k][rem]
            if val:
                for d in range(10):
                    nr = (rem + d) % D
                    dp_free[k + 1][nr] = (dp_free[k + 1][nr] + val) % MOD

    # ends_count[rem]: pairs (d1, dM) in {1..9}^2 with (d1 + dM) % D == rem
    ends_count = [0] * D
    for d1 in range(1, 10):
        for d2 in range(1, 10):
            ends_count[(d1 + d2) % D] += 1

    # dp_pal_pairs[k][rem]: number of choices of k inner pairs (digits in 0..9) with sum of pairs % D == rem
    max_pairs = L // 2 + 1
    dp_pal_pairs = [[0] * D for _ in range(max_pairs + 1)]
    dp_pal_pairs[0][0] = 1
    for k in range(max_pairs):
        for rem in range(D):
            val = dp_pal_pairs[k][rem]
            if val:
                for d in range(10):
                    nr = (rem + 2 * d) % D
                    dp_pal_pairs[k + 1][nr] = (dp_pal_pairs[k + 1][nr] + val) % MOD

    first_pair_count = [0] * D
    for d in range(1, 10):
        first_pair_count[(2 * d) % D] += 1

    mid_count = [0] * D
    for d in range(10):
        mid_count[d % D] += 1

    total_ans = 0

    # 1. Count for lengths M < L
    for M in range(1, L):
        if M == 1:
            continue
        # Total M-digit numbers with no trailing zero and digit sum % D == R
        total_M = 0
        for r in range(D):
            total_M = (total_M + ends_count[r] * dp_free[M - 2][(R - r) % D]) % MOD

        # Palindromes of length M with digit sum % D == R
        pairs = M // 2
        inner_pairs = pairs - 1
        if M % 2 == 0:
            pal_M = 0
            for r in range(D):
                pal_M = (pal_M + first_pair_count[r] * dp_pal_pairs[inner_pairs][(R - r) % D]) % MOD
        else:
            pal_M = 0
            for r1 in range(D):
                if not first_pair_count[r1]:
                    continue
                needed = (R - r1) % D
                ways = 0
                for r2 in range(D):
                    ways = (ways + dp_pal_pairs[inner_pairs][r2] * mid_count[(needed - r2) % D]) % MOD
                pal_M = (pal_M + first_pair_count[r1] * ways) % MOD

        count_M = ((total_M - pal_M) % MOD * inv2) % MOD
        total_ans = (total_ans + count_M) % MOD

    # 2. Count for length L: Set 1
    # x has length L, x[0 : ceil(L/2)] < N_str[0 : ceil(L/2)]
    m = L // 2
    # State: (tight * 2 + rev_cmp) * D + sum_rem
    # tight in {0, 1}, rev_cmp in {0, 1}, sum_rem in {0 .. D-1}
    num_states = 4 * D
    dp = [0] * num_states
    dp[(1 * 2 + 0) * D + 0] = 1  # tight=1, rev_cmp=0, sum_rem=0

    for i in range(m):
        n_i = int(N_str[i])
        min_a = 1 if i == 0 else 0
        next_dp = [0] * num_states

        for tight in (0, 1):
            max_a = n_i if tight else 9
            for rev in (0, 1):
                base_idx = (tight * 2 + rev) * D
                has_ways = False
                for rem in range(D):
                    if dp[base_idx + rem]:
                        has_ways = True
                        break
                if not has_ways:
                    continue

                for a in range(min_a, max_a + 1):
                    next_tight = 1 if (tight and a == n_i) else 0
                    for b in range(10):
                        if rev == 1:
                            next_rev = 1
                        else:
                            if a < b:
                                next_rev = 1
                            elif a == b:
                                next_rev = 0
                            else:
                                continue  # a > b, pruned

                        add_rem = (a + b) % D
                        target_base = (next_tight * 2 + next_rev) * D
                        for rem in range(D):
                            ways = dp[base_idx + rem]
                            if ways:
                                nr = rem + add_rem
                                if nr >= D:
                                    nr -= D
                                next_dp[target_base + nr] += ways

        for idx in range(num_states):
            next_dp[idx] %= MOD
        dp = next_dp

    set1_ans = 0
    if L % 2 == 1:
        mid_idx = m
        n_mid = int(N_str[mid_idx])
        for tight in (0, 1):
            for rev in (0, 1):
                if rev != 1:
                    continue
                base_idx = (tight * 2 + rev) * D
                max_mid = n_mid if tight else 10
                for mid_d in range(max_mid):
                    for rem in range(D):
                        ways = dp[base_idx + rem]
                        if ways and (rem + mid_d) % D == R:
                            set1_ans = (set1_ans + ways) % MOD
    else:
        for rev in (0, 1):
            if rev != 1:
                continue
            base_idx = (0 * 2 + rev) * D  # tight must be 0
            set1_ans = (set1_ans + dp[base_idx + R]) % MOD

    total_ans = (total_ans + set1_ans) % MOD

    # 3. Count for length L: Set 2
    # x[0 : L - m] == N_str[0 : L - m], and suffix x[L - m : L] <= N_str[L - m : L]
    if m > 0:
        S_N = N_str[L - m : L]
        # Precompute digit DP on S_N of length m
        count_less = [[0] * D for _ in range(m + 1)]
        count_equal = [[0] * D for _ in range(m + 1)]

        dp_tight = [0] * D
        dp_tight[0] = 1
        dp_loose = [0] * D

        count_less[0] = list(dp_loose)
        count_equal[0] = list(dp_tight)

        for step in range(m):
            c = int(S_N[step])
            next_tight = [0] * D
            next_loose = [0] * D

            for r in range(D):
                ways = dp_tight[r]
                if ways:
                    for d in range(c):
                        nr = (r + d) % D
                        next_loose[nr] = (next_loose[nr] + ways) % MOD
                    nr = (r + c) % D
                    next_tight[nr] = (next_tight[nr] + ways) % MOD

            for r in range(D):
                ways = dp_loose[r]
                if ways:
                    for d in range(10):
                        nr = (r + d) % D
                        next_loose[nr] = (next_loose[nr] + ways) % MOD

            dp_tight = next_tight
            dp_loose = next_loose
            count_less[step + 1] = list(dp_loose)
            count_equal[step + 1] = list(dp_tight)

        sum_prefix_N = sum(int(c) for c in N_str[:L - m])
        target_sum = (R - sum_prefix_N) % D

        prefix_N_sum = [0] * (m + 1)
        for i in range(m):
            prefix_N_sum[i + 1] = prefix_N_sum[i] + int(N_str[i])

        set2_ans = 0

        for k in range(m):
            # Tail comparison: tail_x vs tail_N
            if k == 0:
                cmp_tail = 0
            else:
                tail_x = "".join(N_str[i] for i in range(k - 1, -1, -1))
                tail_N = N_str[L - k : L]
                if tail_x < tail_N:
                    cmp_tail = -1
                elif tail_x == tail_N:
                    cmp_tail = 0
                else:
                    cmp_tail = 1

            target_digit = int(N_str[L - 1 - k])
            p = m - 1 - k

            for b_k in range(int(N_str[k]) + 1, 10):
                if b_k < target_digit:
                    tail_cmp = -1
                elif b_k > target_digit:
                    tail_cmp = 1
                else:
                    tail_cmp = cmp_tail

                rem_needed = (target_sum - prefix_N_sum[k] - b_k) % D

                set2_ans = (set2_ans + count_less[p][rem_needed]) % MOD
                if tail_cmp <= 0:
                    set2_ans = (set2_ans + count_equal[p][rem_needed]) % MOD

        total_ans = (total_ans + set2_ans) % MOD

    print(total_ans)

if __name__ == '__main__':
    solve()
