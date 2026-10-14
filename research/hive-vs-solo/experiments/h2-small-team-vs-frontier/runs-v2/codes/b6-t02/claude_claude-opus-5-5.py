import sys

def compute_second_screens(h, n):
    p2 = [0] * (n + 1)
    waiting_first = []
    waiting_second = []
    for j in range(n, 0, -1):
        hj = h[j]
        while waiting_second and h[waiting_second[-1]] <= hj:
            p2[waiting_second.pop()] = j
        batch = []
        while waiting_first and h[waiting_first[-1]] <= hj:
            batch.append(waiting_first.pop())
        batch.reverse()
        waiting_second.extend(batch)
        waiting_first.append(j)
    return p2

def build_prefix_blocks(order, block, n):
    blocks = []
    cur = 0
    for idx, pos in enumerate(order):
        if idx % block == 0:
            blocks.append(cur)
        cur |= 1 << pos
    while len(blocks) <= n // block:
        blocks.append(cur)
    return blocks

def build_bit_masks(p2, n):
    max_bits = max(p2).bit_length()
    masks = []
    for b in range(max_bits):
        s = ''.join('1' if (p2[i] >> b) & 1 else '0' for i in range(n, -1, -1))
        masks.append(int(s, 2))
    return masks

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]); q = int(data[1])
    h = [0] * (n + 1)
    for i in range(n):
        h[i + 1] = int(data[2 + i])
    p2 = compute_second_screens(h, n)

    count_at = [0] * (n + 2)
    for i in range(1, n + 1):
        count_at[p2[i]] += 1
    count_ge = [0] * (n + 2)
    running = 0
    for v in range(n, -1, -1):
        running += count_at[v]
        count_ge[v] = running

    BLOCK = 32
    order = sorted(range(1, n + 1), key=lambda i: -p2[i])
    blocks = build_prefix_blocks(order, BLOCK, n)
    bit_masks = build_bit_masks(p2, n)

    queries = []
    base = 2 + n
    for k in range(q):
        l = int(data[base + 3 * k]); r = int(data[base + 3 * k + 1]); x = int(data[base + 3 * k + 2])
        queries.append((l, r, x))
    query_order = sorted(range(q), key=lambda k: -queries[k][2])
    height_order = sorted(range(1, n + 1), key=lambda i: -h[i])

    fen_cnt = [0] * (n + 1)
    fen_sum = [0] * (n + 1)
    present = 0
    ptr = 0
    ans = [0] * q

    for k in query_order:
        l, r, x = queries[k]
        while ptr < n and h[height_order[ptr]] > x:
            pos = height_order[ptr]
            ptr += 1
            present |= 1 << pos
            i = pos
            while i <= n:
                fen_cnt[i] += 1
                fen_sum[i] += pos
                i += i & (-i)

        cnt_t = 0; sum_t = 0
        i = r
        while i > 0:
            cnt_t += fen_cnt[i]; sum_t += fen_sum[i]
            i -= i & (-i)
        i = l - 1
        while i > 0:
            cnt_t -= fen_cnt[i]; sum_t -= fen_sum[i]
            i -= i & (-i)

        total = count_ge[l]
        t = total // BLOCK
        selected = present & blocks[t] & ((1 << (r + 1)) - 1)
        cnt_s = selected.bit_count()
        sum_s = 0
        if cnt_s:
            for b, mask in enumerate(bit_masks):
                sum_s += (selected & mask).bit_count() << b
        for idx in range(t * BLOCK, total):
            pos = order[idx]
            if pos <= r and h[pos] > x:
                cnt_s += 1
                sum_s += p2[pos]

        lm1 = l - 1
        ans[k] = sum_t - lm1 * cnt_t - sum_s + lm1 * cnt_s

    sys.stdout.write('\n'.join(map(str, ans)) + '\n')

main()
