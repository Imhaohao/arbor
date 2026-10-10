import sys


def solve():
    # Precompute transition table for the digit DP.
    # State representation:
    # state = (j_prev * 3 + s_N) * 3 + s_M, where:
    #   j_prev in {0, 1}
    #   s_N in {0: b=0, 1: b=1, 2: FAILED}
    #   s_M in {0: b=0, 1: b=1, 2: FAILED}
    # Total states: 2 * 3 * 3 = 18.

    def calc_trans(bit, j_prev, j_curr, s):
        if s == 2:
            return 2
        diff = bit - j_prev - s
        if diff == 1:
            d, next_b = 1, 0
        elif diff == 0:
            d, next_b = 0, 0
        elif diff == -1:
            d, next_b = 1, 1
        else:  # diff == -2
            d, next_b = 0, 1

        if j_curr == 1 and d == 1:
            return 2
        return next_b

    NEXT_STATE = [[[None, None] for _ in range(2)] for _ in range(2)]

    for a_bit in (0, 1):
        for b_bit in (0, 1):
            for j_curr in (0, 1):
                table = [0] * 18
                for state in range(18):
                    s_M = state % 3
                    s_N = (state // 3) % 3
                    j_prev = state // 9
                    ns_N = calc_trans(a_bit, j_prev, j_curr, s_N)
                    ns_M = calc_trans(b_bit, j_prev, j_curr, s_M)
                    table[state] = (j_curr * 3 + ns_N) * 3 + ns_M
                NEXT_STATE[a_bit][b_bit][j_curr] = tuple(table)

    input_data = sys.stdin.read().split()
    if not input_data:
        return

    q = int(input_data[0])
    idx = 1
    out = []

    for _ in range(q):
        N = int(input_data[idx])
        M = int(input_data[idx + 1])
        idx += 2

        if N == M:
            out.append(0)
            continue

        if N == 0:
            s_N_init = 2
            A = 0
        else:
            s_N_init = 0
            A = N - 1

        if M == 0:
            s_M_init = 2
            B = 0
        else:
            s_M_init = 0
            B = M - 1

        mx = A if A > B else B
        K = mx.bit_length() + 2
        max_j_bits = max(0, mx.bit_length() - 1)

        start_state = s_N_init * 3 + s_M_init
        dp = [0] * 18
        dp[start_state] = 1
        active_states = [start_state]

        for i in range(K):
            a_bit = (A >> i) & 1
            b_bit = (B >> i) & 1

            if i < max_j_bits:
                tables = (NEXT_STATE[a_bit][b_bit][0], NEXT_STATE[a_bit][b_bit][1])
            else:
                tables = (NEXT_STATE[a_bit][b_bit][0],)

            next_dp = [0] * 18
            next_active = []

            for state in active_states:
                cnt = dp[state]
                for tbl in tables:
                    ns = tbl[state]
                    if next_dp[ns] == 0:
                        next_active.append(ns)
                    next_dp[ns] += cnt

            dp = next_dp
            active_states = next_active

        ans = 0
        for state in active_states:
            s_M = state % 3
            s_N = (state // 3) % 3
            if (s_N == 0) != (s_M == 0):
                ans += dp[state]

        out.append(ans)

    sys.stdout.write("\n".join(map(str, out)) + "\n")


if __name__ == "__main__":
    solve()
