import sys
from heapq import heappush, heappop

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    n = int(input_data[0])
    k = int(input_data[1])

    a = [0] * n
    Delta = [0] * n
    b = [0] * n
    c = [0] * n
    d = [0] * n
    W = [0] * n
    P = [0] * n
    D = [0] * n

    idx = 2
    for i in range(n):
        ai = int(input_data[idx])
        deltai = int(input_data[idx + 1])
        bi = int(input_data[idx + 2])
        ci = int(input_data[idx + 3])
        di = int(input_data[idx + 4])
        wi = int(input_data[idx + 5])
        idx += 6

        a[i] = ai
        Delta[i] = deltai
        b[i] = bi
        c[i] = ci
        d[i] = di
        W[i] = wi
        P[i] = ai + ci
        D[i] = di - bi + ci

    DWPD = list(zip(D, W, P, Delta))

    # Theoretical lower bound on max drift over any schedule
    low = max(W[i] * (a[i] - Delta[i] + b[i] - d[i]) for i in range(n))

    # Upper bound from an EDD-ordered heuristic schedule with top-k overclocking
    order_heur = sorted(range(n), key=D.__getitem__)
    top_k = set(sorted(range(n), key=Delta.__getitem__, reverse=True)[:k])
    cur_U = 0
    heur_max = -float("inf")
    for i in order_heur:
        eff_a = a[i] - (Delta[i] if i in top_k else 0)
        V = cur_U + eff_a + b[i]
        drift = W[i] * (V - d[i])
        if drift > heur_max:
            heur_max = drift
        cur_U += eff_a + c[i]

    high = max(heur_max, low)

    def check(mid):
        data = [(d + mid // w, p, delta) for d, w, p, delta in DWPD]
        data.sort()
        cur_time = 0

        if k == 0:
            for d_prime, p, _ in data:
                cur_time += p
                if cur_time > d_prime:
                    return False
            return True

        used_k = 0
        heap = []
        for d_prime, p, delta in data:
            cur_time += p
            if used_k < k and delta > 0:
                heappush(heap, -delta)
            while cur_time > d_prime:
                if used_k == k or not heap:
                    return False
                cur_time += heappop(heap)
                used_k += 1
        return True

    ans = high
    while low <= high:
        mid = (low + high) // 2
        if check(mid):
            ans = mid
            high = mid - 1
        else:
            low = mid + 1

    print(ans)

if __name__ == "__main__":
    main()
