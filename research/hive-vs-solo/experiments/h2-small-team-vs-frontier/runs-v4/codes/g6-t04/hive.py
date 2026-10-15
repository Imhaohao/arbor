import sys
from fractions import Fraction


def add_term(row, index, coef):
    row[index] = row.get(index, 0) + coef


def pivot(tableau, reduced, leave, enter):
    scale = tableau[leave][enter]
    pivot_row = [x / scale for x in tableau[leave]]
    tableau[leave] = pivot_row
    for i, row in enumerate(tableau):
        if i != leave and row[enter] != 0:
            factor = row[enter]
            tableau[i] = [x - factor * y for x, y in zip(row, pivot_row)]
    factor = reduced[enter]
    if factor != 0:
        reduced[:] = [x - factor * y for x, y in zip(reduced, pivot_row)]


def choose_leaving_row(tableau, basis, enter, rhs_index):
    best = None
    for i, row in enumerate(tableau):
        if row[enter] > 0:
            key = (row[rhs_index] / row[enter], basis[i])
            if best is None or key < best[0]:
                best = (key, i)
    return None if best is None else best[1]


def maximize(num_vars, rows, rhs, objective):
    count = len(rows)
    width = num_vars + count
    tableau = []
    for i, (row, bound) in enumerate(zip(rows, rhs)):
        line = [Fraction(0)] * (width + 1)
        for j, coef in row.items():
            line[j] = Fraction(coef)
        line[num_vars + i] = Fraction(1)
        line[width] = Fraction(bound)
        tableau.append(line)
    reduced = [Fraction(-c) for c in objective] + [Fraction(0)] * (count + 1)
    basis = [num_vars + i for i in range(count)]
    while True:
        enter = next((j for j in range(width) if reduced[j] < 0), None)
        if enter is None:
            return reduced[width]
        leave = choose_leaving_row(tableau, basis, enter, width)
        if leave is None:
            raise ValueError("unbounded")
        pivot(tableau, reduced, leave, enter)
        basis[leave] = enter


def node_rows(n, links, nodes, s):
    m = len(links)
    rows, rhs = [], []
    for v in range(n):
        dv = 3 * m + v
        gen, proc = {dv: 1}, {dv: 1}
        for j, (u, w, _, _, _) in enumerate(links):
            main, pre, post = j, m + j, 2 * m + j
            if u == v:
                for idx in (main, pre, post):
                    add_term(gen, idx, 1)
                for idx in (main, post):
                    add_term(proc, idx, 1)
            if w == v:
                for idx in (main, pre, post):
                    add_term(gen, idx, -1)
                add_term(proc, post, -1)
        a, k, b, _ = nodes[v]
        rows += [gen, proc, {dv: 1}]
        rhs += [a[s[v]], k[s[v]], b[s[v]]]
    return rows, rhs


def link_rows(links, s):
    m = len(links)
    rows, rhs = [], []
    for j, (u, w, cap, pen, qen) in enumerate(links):
        total = cap[2 * s[u] + s[w]]
        if total != -1:
            rows.append({j: 1, m + j: 1, 2 * m + j: 1})
            rhs.append(total)
        rows.append({m + j: 1})
        rhs.append(pen[s[w]])
        rows.append({2 * m + j: 1})
        rhs.append(qen[s[u]])
    return rows, rhs


def max_absorbed(n, links, nodes, s):
    m = len(links)
    n_rows, n_rhs = node_rows(n, links, nodes, s)
    l_rows, l_rhs = link_rows(links, s)
    objective = [0] * (3 * m) + [1] * n
    return maximize(3 * m + n, n_rows + l_rows, n_rhs + l_rhs, objective)


def main():
    data = sys.stdin.read().split()
    n, m = int(data[0]), int(data[1])
    values = list(map(int, data[2:]))
    nodes = []
    for v in range(n):
        g = values[8 * v: 8 * v + 8]
        nodes.append(((g[0], g[4]), (g[1], g[5]), (g[2], g[6]), (g[3], g[7])))
    offset = 8 * n
    links = []
    for j in range(m):
        g = values[offset + 10 * j: offset + 10 * j + 10]
        links.append((g[0] - 1, g[1] - 1, g[2:6], g[6:8], g[8:10]))
    best = None
    for mask in range(1 << n):
        s = [(mask >> v) & 1 for v in range(n)]
        generated_minus_cost = sum(nodes[v][0][s[v]] - nodes[v][3][s[v]] for v in range(n))
        value = generated_minus_cost - max_absorbed(n, links, nodes, s)
        if best is None or value > best:
            best = value
    print(int(best))


main()
