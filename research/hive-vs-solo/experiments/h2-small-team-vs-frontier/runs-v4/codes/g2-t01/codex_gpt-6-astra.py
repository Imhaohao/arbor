import sys

NEG = -(10**30)


# A message stores (score, export_limit, twice_weighted, even_weighted,
#                   odd_weighted).
def merge(x, y):
    if x is None:
        return y
    if y is None:
        return x

    sx, ex, px, x0, x1 = x
    sy, ey, py, y0, y1 = y

    if ex == 0:
        return sy + sx, ey, py + sx, y0 + sx, y1 + sx
    if ey == 0:
        return sx + sy, ex, px + sy, x0 + sy, x1 + sy

    m0 = max(x0 + y0, x1 + y1)
    m1 = max(x0 + y1, x1 + y0)

    limit = min(ex, ey)
    c1 = px + sy
    c2 = py + sx
    ceiling = min(c1, c2)

    k = limit & ~1
    vx = min(x0, sx + k)
    vy = min(y0, sy + k)
    value = vx + vy

    if value > ceiling:
        best = ceiling
    elif value < ceiling:
        best = value
    else:
        bad = (
            (c1 == value and ((px - vx) & 1))
            or (c2 == value and ((py - vy) & 1))
        )
        best = value - bool(bad)

    if best < ceiling:
        k = (limit - 1) | 1
        vx = min(x1, sx + k)
        vy = min(y1, sy + k)
        value = vx + vy

        if value > ceiling:
            candidate = ceiling
        elif value < ceiling:
            candidate = value
        else:
            bad = (
                (c1 == value and ((px - vx - 1) & 1))
                or (c2 == value and ((py - vy - 1) & 1))
            )
            candidate = value - bool(bad)

        if candidate > best:
            best = candidate

    return best, ex + ey, px + py, m0, m1


def finish(message, a, b, capacity):
    if message is None:
        s = e = p = m0 = 0
        m1 = NEG
    else:
        s, e, p, m0, m1 = message

    if b <= a:
        score = s + b
    else:
        limit = min(b - a, e)
        best = min(m0, s + (limit & ~1))
        if limit:
            candidate = min(m1, s + ((limit - 1) | 1))
            if candidate > best:
                best = candidate
        score = a + best

    if a:
        if a & 1:
            m0, m1 = a + max(m1, m0 - 1), a + max(m0, m1 - 1)
        else:
            m0, m1 = a + max(m0, m1 - 1), a + max(m1, m0 - 1)

    e += a
    p += 2 * a

    if b:
        old_m0 = m0
        if m1 > m0:
            m0 = m1
        if e >= 2:
            candidate = min(old_m0, p - 2)
            if candidate > m1:
                m1 = candidate

    if e > capacity:
        e = capacity
        endpoint_m = m1 if e & 1 else m0
        p = min(p, score + 2 * e, endpoint_m + e)
        m0 = min(m0, score + (e & ~1))
        if e:
            m1 = min(m1, score + ((e - 1) | 1))
        else:
            m1 = NEG

    return score, e, p, m0, m1


def root_score(message, a, b):
    if message is None:
        return min(a, b)

    s, e, p, m0, m1 = message
    if b <= a:
        return s + b

    limit = min(b - a, e)
    best = min(m0, s + (limit & ~1))
    if limit:
        candidate = min(m1, s + ((limit - 1) | 1))
        if candidate > best:
            best = candidate
    return a + best


def main():
    data = iter(map(int, sys.stdin.buffer.read().split()))
    n = next(data)
    a = [next(data) for _ in range(n)]
    b = [next(data) for _ in range(n)]

    graph = [[] for _ in range(n)]
    for _ in range(n - 1):
        u = next(data) - 1
        v = next(data) - 1
        c = next(data)
        graph[u].append((v, c))
        graph[v].append((u, c))

    parent = [-1] * n
    parent_capacity = [0] * n
    order = [0]

    for u in order:
        children = graph[u]
        i = 0
        while i < len(children):
            v, c = children[i]
            if v == parent[u]:
                children[i] = children[-1]
                children.pop()
            else:
                parent[v] = u
                parent_capacity[v] = c
                order.append(v)
                i += 1

    down = [None] * n
    for u in reversed(order):
        combined = None
        for v, _ in graph[u]:
            combined = merge(combined, down[v])
        if u:
            down[u] = finish(combined, a[u], b[u], parent_capacity[u])

    up = [None] * n
    answer = [0] * n

    for u in order:
        children = graph[u]
        prefix = [up[u]]
        combined = up[u]

        for v, _ in children:
            combined = merge(combined, down[v])
            prefix.append(combined)

        answer[u] = root_score(combined, a[u], b[u])

        suffix = None
        for i in range(len(children) - 1, -1, -1):
            v, c = children[i]
            other_branches = merge(prefix[i], suffix)
            up[v] = finish(other_branches, a[u], b[u], c)
            if i:
                suffix = merge(down[v], suffix)

    sys.stdout.write(" ".join(map(str, answer)))


if __name__ == "__main__":
    main()
