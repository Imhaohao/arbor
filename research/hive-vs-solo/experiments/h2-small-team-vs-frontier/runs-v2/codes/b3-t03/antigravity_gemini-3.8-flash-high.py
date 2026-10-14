import sys
from bisect import bisect_right


def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    vals = list(map(int, input_data))
    n = vals[0]
    k = vals[1]

    if k == 1:
        print(0)
        return

    S = vals[2::4]
    E = vals[3::4]
    A = vals[4::4]
    B = vals[5::4]

    # Check if k non-overlapping jobs can be selected at all (X -> infinity)
    order = sorted(range(n), key=lambda i: E[i])
    count = 0
    last_e = -1
    for i in order:
        if S[i] >= last_e:
            count += 1
            last_e = E[i]

    if count < k:
        print(-1)
        return

    max_X = max(max(A), max(B))
    if max_X == 0:
        print(0)
        return

    EA = list(zip(E, A))
    SB = list(zip(S, B))
    insert_events = [(E[i], 0, i) for i in range(n)]

    def check(X):
        E_prime = [e + (a - X if a > X else 0) for e, a in EA]
        S_prime = [s - (b - X if b > X else 0) for s, b in SB]

        unique_E = sorted(set(E_prime))
        rank = {v: i + 1 for i, v in enumerate(unique_E)}
        M = len(unique_E)

        events = list(insert_events)
        events.extend((S_prime[i], 1, i) for i in range(n))
        events.sort()

        bit = [0] * (M + 1)
        dp = [0] * n

        for _, event_type, i in events:
            if event_type == 1:
                q_idx = bisect_right(unique_E, S[i])
                res = 0
                while q_idx > 0:
                    if bit[q_idx] > res:
                        res = bit[q_idx]
                    q_idx -= q_idx & -q_idx
                res += 1
                if res >= k:
                    return True
                dp[i] = res
            else:
                val = dp[i]
                idx = rank[E_prime[i]]
                while idx <= M and val > bit[idx]:
                    bit[idx] = val
                    idx += idx & -idx
        return False

    if check(0):
        print(0)
        return

    low = 0
    high = max_X
    while low + 1 < high:
        mid = (low + high) // 2
        if check(mid):
            high = mid
        else:
            low = mid

    print(high)


if __name__ == '__main__':
    main()
