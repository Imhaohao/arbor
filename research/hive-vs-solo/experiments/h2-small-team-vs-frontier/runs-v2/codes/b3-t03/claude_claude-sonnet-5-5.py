import sys
from bisect import bisect_right


def main():
    data = sys.stdin.buffer.read().split()
    n, k = int(data[0]), int(data[1])
    jobs = []
    for i in range(n):
        base = 2 + 4 * i
        jobs.append((int(data[base]), int(data[base + 1]), int(data[base + 2]), int(data[base + 3])))
    jobs.sort()
    starts = [j[0] for j in jobs]
    ends = [j[1] for j in jobs]
    outs = [j[2] for j in jobs]
    ins = [j[3] for j in jobs]
    NEG = -10 ** 18
    INF = 10 ** 18
    indices = range(n)

    def reaches_k(x):
        release = [ends[i] + (outs[i] - x if outs[i] > x else 0) for i in indices]
        order = sorted(indices, key=release.__getitem__)
        min_end = [INF] * (n + 2)
        min_end[0] = NEG
        chain = [0] * n
        pointer = 0
        best = 0
        for j in indices:
            sj = starts[j]
            while pointer < n:
                i = order[pointer]
                if release[i] > sj:
                    break
                f = chain[i]
                if ends[i] < min_end[f]:
                    min_end[f] = ends[i]
                pointer += 1
            lead = ins[j]
            latest_prev_end = sj - (lead - x if lead > x else 0)
            f = bisect_right(min_end, latest_prev_end)
            chain[j] = f
            if f > best:
                best = f
                if best >= k:
                    return True
        return best >= k

    high = 10 ** 9
    if not reaches_k(high):
        print(-1)
        return
    low = 0
    while low < high:
        mid = (low + high) // 2
        if reaches_k(mid):
            high = mid
        else:
            low = mid + 1
    print(low)


main()
