import sys
from bisect import bisect_left, bisect_right

SHIFT = 15
MASK = (1 << SHIFT) - 1
NEG_INF = -(1 << 62)


class MaxTree:
    def __init__(self, leaves):
        size = 1
        while size < len(leaves):
            size <<= 1
        self.size = size
        self.nodes = [NEG_INF] * (2 * size)
        self.nodes[size:size + len(leaves)] = leaves
        for node in range(size - 1, 0, -1):
            self.nodes[node] = max(self.nodes[2 * node], self.nodes[2 * node + 1])

    def rightmost_at_least(self, pos, value):
        nodes = self.nodes
        size = self.size
        node = pos + size + 1
        while True:
            node -= 1
            while node > 1 and node & 1:
                node >>= 1
            if nodes[node] >= value:
                break
            if node & (node - 1) == 0:
                return -1
        while node < size:
            node = 2 * node + 1
            if nodes[node] < value:
                node -= 1
        return node - size


class DominanceTree:
    def __init__(self, n, keys):
        self.n = n
        self.keys = keys
        buckets = [[] for _ in range(n + 1)]
        for i in range(1, n + 1):
            k = i
            while k <= n:
                buckets[k].append(keys[i])
                k += k & -k
        self.buckets = [sorted(set(b)) for b in buckets]
        self.trees = [[0] * (len(b) + 1) for b in self.buckets]

    def add(self, i, value):
        key = self.keys[i]
        k = i
        while k <= self.n:
            bucket = self.buckets[k]
            tree = self.trees[k]
            size = len(bucket)
            p = bisect_left(bucket, key) + 1
            while p <= size:
                tree[p] += value
                p += p & -p
            k += k & -k

    def prefix(self, r, key_limit):
        total = 0
        k = r
        while k:
            bucket = self.buckets[k]
            tree = self.trees[k]
            j = bisect_left(bucket, key_limit)
            while j:
                total += tree[j]
                j &= j - 1
            k &= k - 1
        return total


def second_screens(n, h):
    tree = MaxTree([NEG_INF] + h[1:])
    p2 = [0] * (n + 1)
    for i in range(1, n + 1):
        first = tree.rightmost_at_least(i - 1, h[i])
        if first > 0:
            p2[i] = max(tree.rightmost_at_least(first - 1, h[i]), 0)
    return p2


def height_window_sums(n, h, L, R, X):
    tree = DominanceTree(n, [0] * (n + 1))
    order = sorted(range(1, n + 1), key=lambda i: -h[i])
    counts = [0] * len(L)
    sums = [0] * len(L)
    ptr = 0
    for t in sorted(range(len(L)), key=lambda t: -X[t]):
        while ptr < n and h[order[ptr]] > X[t]:
            i = order[ptr]
            ptr += 1
            tree.add(i, (i << SHIFT) + 1)
        total = tree.prefix(R[t], 1) - tree.prefix(L[t] - 1, 1)
        counts[t] = total & MASK
        sums[t] = total >> SHIFT
    return counts, sums


def second_screen_sums(n, h, p2, L, R, X):
    vals = sorted(set(h[1:]))
    distinct = len(vals)
    keys = [0] * (n + 1)
    for i in range(1, n + 1):
        keys[i] = distinct - 1 - bisect_left(vals, h[i])
    tree = DominanceTree(n, keys)
    active = sorted((i for i in range(1, n + 1) if p2[i] > 0), key=lambda i: -p2[i])
    counts = [0] * len(L)
    sums = [0] * len(L)
    ptr = 0
    for t in sorted(range(len(L)), key=lambda t: -L[t]):
        while ptr < len(active) and p2[active[ptr]] >= L[t]:
            i = active[ptr]
            ptr += 1
            tree.add(i, (p2[i] << SHIFT) + 1)
        total = tree.prefix(R[t], distinct - bisect_right(vals, X[t]))
        counts[t] = total & MASK
        sums[t] = total >> SHIFT
    return counts, sums


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    q = int(data[1])
    h = [0] + [int(v) for v in data[2:2 + n]]
    query_tokens = data[2 + n:2 + n + 3 * q]
    L = [int(v) for v in query_tokens[0::3]]
    R = [int(v) for v in query_tokens[1::3]]
    X = [int(v) for v in query_tokens[2::3]]
    p2 = second_screens(n, h)
    cnt_a, idx_a = height_window_sums(n, h, L, R, X)
    cnt_b, p2_b = second_screen_sums(n, h, p2, L, R, X)
    answers = []
    for t in range(q):
        lm1 = L[t] - 1
        answers.append(idx_a[t] - lm1 * cnt_a[t] + lm1 * cnt_b[t] - p2_b[t])
    sys.stdout.write("\n".join(map(str, answers)) + "\n")


if __name__ == "__main__":
    main()
