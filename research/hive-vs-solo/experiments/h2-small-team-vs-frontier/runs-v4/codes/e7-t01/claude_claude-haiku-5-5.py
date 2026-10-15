import sys


class Profile:
    def __init__(self, base, entries):
        self.base = base
        self.entries = entries
        zero = []
        self.zero_h = self.zero_l = 0
        self.one_h = self.one_l = self.one_g = 0
        for i, (state, h, l) in enumerate(entries):
            if state == 0:
                zero.append((h + l, i))
                self.zero_h += h
                self.zero_l += l
            else:
                self.one_h += h
                self.one_l += l
                self.one_g += h if h > -l else -l
        zero.sort(reverse=True)
        self.count = len(zero)
        self.values = [d for d, _ in zero]
        self.prefix = [0] * (self.count + 1)
        self.position = [-1] * len(entries)
        for p, (d, i) in enumerate(zero):
            self.prefix[p + 1] = self.prefix[p] + d
            self.position[i] = p
        self.zero_total = self.prefix[self.count]

    def top(self, q, excluded_pos):
        if q == 0:
            return 0
        if excluded_pos < 0 or excluded_pos >= q:
            return self.prefix[q]
        return self.prefix[q + 1] - self.values[excluded_pos]

    def without(self, x):
        zero_h, zero_l, zero_total = self.zero_h, self.zero_l, self.zero_total
        one_h, one_l, one_g = self.one_h, self.one_l, self.one_g
        count = self.count
        excluded_pos = -1
        if x >= 0:
            state, h, l = self.entries[x]
            if state == 0:
                count -= 1
                zero_h -= h
                zero_l -= l
                zero_total -= h + l
                excluded_pos = self.position[x]
            else:
                one_h -= h
                one_l -= l
                one_g -= h if h > -l else -l
        a = self.base
        if count == 0:
            return 0, a + one_h, a + one_l
        if count == 1:
            return 1, -a + zero_h - one_l, -a + zero_l - one_h
        tau = a if count % 2 == 0 else -a
        top_plus = self.top((count + 1) // 2, excluded_pos)
        top_minus = self.top(count // 2, excluded_pos)
        high = tau - zero_l + top_plus + one_g
        low = tau - zero_h + (zero_total - top_minus) - one_g
        return 1, high, low


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    weights = [int(x) for x in data[1:n + 1]]
    adj = [[] for _ in range(n)]
    pos = n + 1
    for _ in range(n - 1):
        u = int(data[pos]) - 1
        v = int(data[pos + 1]) - 1
        pos += 2
        adj[u].append(v)
        adj[v].append(u)

    parent = [-1] * n
    seen = [False] * n
    seen[0] = True
    order = [0]
    for v in order:
        for w in adj[v]:
            if not seen[w]:
                seen[w] = True
                parent[w] = v
                order.append(w)

    down = [(0, 0, 0)] * n
    for v in reversed(order):
        children = [down[w] for w in adj[v] if w != parent[v]]
        down[v] = Profile(weights[v], children).without(-1)

    up = [(0, 0, 0)] * n
    answer = [0] * n
    for v in order:
        neighbours = adj[v]
        entries = [up[v] if w == parent[v] else down[w] for w in neighbours]
        profile = Profile(weights[v], entries)
        answer[v] = profile.without(-1)[1]
        for i, w in enumerate(neighbours):
            if w != parent[v]:
                up[w] = profile.without(i)

    print(' '.join(map(str, answer)))


main()
