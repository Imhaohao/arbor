import sys


def merge(x, y):
    if x is None:
        return y
    if y is None:
        return x
    kx, rx, fx1, fx2, lx2, lx1 = x
    ky, ry, fy1, fy2, ly2, ly1 = y
    if lx1 == fy1:
        cross = kx >= 2 and ky >= 2 and lx2 == fy2
        last2 = ly2 if ky >= 2 else (lx2 if kx >= 2 else None)
        first2 = fx2 if kx >= 2 else (fy2 if ky >= 2 else None)
        return (kx + ky - 1, rx + ry + cross, fx1, first2, last2, ly1)
    cross = (kx >= 2 and lx2 == fy1) + (ky >= 2 and lx1 == fy2)
    first2 = fx2 if kx >= 2 else fy1
    last2 = ly2 if ky >= 2 else lx1
    return (kx + ky, rx + ry + cross, fx1, first2, last2, ly1)


def is_one(summary):
    return summary is not None and (summary[0] + 2 * summary[1]) % 5 == 1


def leaf_value(mark):
    return None if mark == 0 else (1, 0, mark, None, None, mark)


def fold(child_ids, summary):
    acc = None
    for child in child_ids:
        acc = merge(acc, summary[child])
    return acc


def build_suffix_array(s):
    n = len(s)
    rank = [ord(ch) for ch in s]
    k = 1
    while True:
        second = rank[k:] + [-1] * min(k, n)
        base = max(rank) + 2
        key = [a * base + b + 1 for a, b in zip(rank, second)]
        sa = sorted(range(n), key=key.__getitem__)
        new_rank = [0] * n
        for pos in range(1, n):
            new_rank[sa[pos]] = new_rank[sa[pos - 1]] + (key[sa[pos]] != key[sa[pos - 1]])
        rank = new_rank
        if rank[sa[-1]] == n - 1:
            return sa, rank
        k <<= 1


def build_lcp(s, sa, rank):
    n = len(s)
    lcp = [0] * (n + 1)
    h = 0
    for i in range(n):
        r = rank[i]
        if r == 0:
            h = 0
            continue
        j = sa[r - 1]
        while i + h < n and j + h < n and s[i + h] == s[j + h]:
            h += 1
        lcp[r] = h
        h = max(h - 1, 0)
    return lcp


def build_tree(lcp):
    n = len(lcp) - 1
    depth = [0]
    low = [0]
    parent = [0]
    stack = [0]
    top_after = [0] * (n + 1)
    closed = []
    for i in range(1, n + 1):
        cur = lcp[i]
        start = i - 1
        pending = None
        while cur < depth[stack[-1]]:
            node = stack.pop()
            closed.append(node)
            start = low[node]
            if cur <= depth[stack[-1]]:
                parent[node] = stack[-1]
            else:
                pending = node
        if cur > depth[stack[-1]]:
            node = len(depth)
            depth.append(cur)
            low.append(start)
            parent.append(0)
            if pending is not None:
                parent[pending] = node
            stack.append(node)
        top_after[i] = stack[-1]
    return depth, low, parent, closed, top_after


class Ledger:
    def __init__(self, s, marks):
        n = len(s)
        sa, rank = build_suffix_array(s)
        lcp = build_lcp(s, sa, rank)
        depth, low, parent, closed, top_after = build_tree(lcp)
        inner = len(depth)
        leaf_parent = [
            top_after[j + 1] if lcp[j + 1] > lcp[j] else top_after[j] for j in range(n)
        ]
        self.rank = rank
        self.inner = inner
        self.parent = parent + leaf_parent
        self.children = self._build_children(low + list(range(n)))
        self.weight = self._build_weights(depth, parent, leaf_parent, sa)
        self.summary = self._build_summaries(marks, sa, closed)
        self.on = [is_one(x) for x in self.summary]
        self.total = sum(w for w, flag in zip(self.weight, self.on) if flag)

    def _build_children(self, low_all):
        children = [[] for _ in range(self.inner)]
        for node in sorted(range(1, len(self.parent)), key=low_all.__getitem__):
            children[self.parent[node]].append(node)
        return children

    def _build_weights(self, depth, parent, leaf_parent, sa):
        n = len(sa)
        weight = [0] * len(self.parent)
        for t in range(1, self.inner):
            weight[t] = depth[t] - depth[parent[t]]
        for j in range(n):
            weight[self.inner + j] = (n - sa[j]) - depth[leaf_parent[j]]
        return weight

    def _build_summaries(self, marks, sa, closed):
        summary = [None] * len(self.parent)
        for j, pos in enumerate(sa):
            summary[self.inner + j] = leaf_value(marks[pos])
        for node in closed:
            summary[node] = fold(self.children[node], summary)
        return summary

    def set_mark(self, p, mark):
        node = self.inner + self.rank[p]
        value = leaf_value(mark)
        while node and self.summary[node] != value:
            self.summary[node] = value
            now_on = is_one(value)
            if now_on != self.on[node]:
                self.on[node] = now_on
                self.total += self.weight[node] if now_on else -self.weight[node]
            node = self.parent[node]
            if node:
                value = fold(self.children[node], self.summary)
        return self.total


def main():
    data = sys.stdin.read().split()
    n, q = int(data[0]), int(data[1])
    s = data[2]
    marks = []
    pos = 3
    while len(marks) < n:
        marks.extend(int(ch) for ch in data[pos])
        pos += 1
    ledger = Ledger(s, marks)
    out = []
    for _ in range(q):
        p = int(data[pos]) - 1
        c = int(data[pos + 1])
        pos += 2
        out.append(ledger.set_mark(p, c))
    sys.stdout.write("\n".join(map(str, out)) + "\n")


if __name__ == "__main__":
    main()
