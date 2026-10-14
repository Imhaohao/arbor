import sys


def profile(n, k):
    if n < k:
        return n, None, None
    if n == k:
        return k, (k, k + 1), 1
    tail = []

    def value(i):
        return i if i <= k else tail[i - k - 1]

    lo, hi = 0, k + 1
    holes_at_n = None
    for t in range(k + 1, n + 1):
        if t == n:
            holes_at_n = (lo, hi)
        if t % k == 0 and value(t // k) == lo:
            chosen, kept = hi, lo
        else:
            chosen, kept = lo, hi
        tail.append(chosen)
        lo, hi = sorted((kept, value(t - k)))
    g_div = value(n // k) if n % k == 0 else None
    return value(n), holes_at_n, g_div


def winning_moves(n, k, holes, g_div, target):
    if n < k:
        return int(target < n)
    count = 0
    if target <= k + 1 and target not in holes:
        count += 1
    if g_div is not None and g_div == target and n // k < n - k:
        count += 1
    return count


def main():
    data = sys.stdin.buffer.read().split()
    m = int(data[0])
    piles = []
    total = 0
    for i in range(m):
        n = int(data[1 + 2 * i])
        k = int(data[2 + 2 * i])
        g_n, holes, g_div = profile(n, k)
        piles.append((n, k, g_n, holes, g_div))
        total ^= g_n
    answer = 0
    for n, k, g_n, holes, g_div in piles:
        answer += winning_moves(n, k, holes, g_div, total ^ g_n)
    print(answer)


main()
