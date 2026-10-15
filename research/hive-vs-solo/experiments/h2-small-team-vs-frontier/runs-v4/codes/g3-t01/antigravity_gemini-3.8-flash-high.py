import sys

# Increase recursion depth for deep segment tree / call stacks
sys.setrecursionlimit(300000)


def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    n = int(input_data[0])
    q = int(input_data[1])
    s = input_data[2]

    # Pre-allocate queries by right endpoint R
    queries_at = [[] for _ in range(n + 1)]
    idx = 3
    for i in range(q):
        l = int(input_data[idx])
        r = int(input_data[idx + 1])
        idx += 2
        queries_at[r].append((l, i))

    # Build Suffix Automaton (SAM) for the entire string S
    max_states = 2 * n + 5
    sam_len = [0] * max_states
    sam_link = [0] * max_states
    sam_next = [{} for _ in range(max_states)]
    sz = 1
    last_sam = 1

    prefix_state = [0] * (n + 1)

    for i in range(n):
        c = ord(s[i]) - 97
        sz += 1
        cur = sz
        sam_len[cur] = sam_len[last_sam] + 1
        p = last_sam
        while p > 0 and c not in sam_next[p]:
            sam_next[p][c] = cur
            p = sam_link[p]

        if p == 0:
            sam_link[cur] = 1
        else:
            q_state = sam_next[p][c]
            if sam_len[p] + 1 == sam_len[q_state]:
                sam_link[cur] = q_state
            else:
                sz += 1
                clone = sz
                sam_len[clone] = sam_len[p] + 1
                sam_next[clone] = dict(sam_next[q_state])
                sam_link[clone] = sam_link[q_state]
                while p > 0 and sam_next[p].get(c) == q_state:
                    sam_next[p][c] = clone
                    p = sam_link[p]
                sam_link[q_state] = clone
                sam_link[cur] = clone

        last_sam = cur
        prefix_state[i + 1] = cur

    # Segment Tree over positions x in [1, n]
    seg_size = 4 * n + 5
    tree = [0] * seg_size
    lazy_seg = [0] * seg_size

    def seg_add(node, l, r, ql, qr, val):
        if ql <= l and r <= qr:
            tree[node] += val
            lazy_seg[node] += val
            return
        mid = (l + r) // 2
        lz = lazy_seg[node]
        if lz:
            ln = node * 2
            rn = ln + 1
            tree[ln] += lz
            lazy_seg[ln] += lz
            tree[rn] += lz
            lazy_seg[rn] += lz
            lazy_seg[node] = 0
        if ql <= mid:
            seg_add(node * 2, l, mid, ql, qr, val)
        if qr > mid:
            seg_add(node * 2 + 1, mid + 1, r, ql, qr, val)
        tree[node] = max(tree[node * 2], tree[node * 2 + 1])

    def seg_query(node, l, r, ql, qr):
        if ql <= l and r <= qr:
            return tree[node]
        mid = (l + r) // 2
        lz = lazy_seg[node]
        if lz:
            ln = node * 2
            rn = ln + 1
            tree[ln] += lz
            lazy_seg[ln] += lz
            tree[rn] += lz
            lazy_seg[rn] += lz
            lazy_seg[node] = 0
        res = 0
        if ql <= mid:
            res = seg_query(node * 2, l, mid, ql, qr)
        if qr > mid:
            r_res = seg_query(node * 2 + 1, mid + 1, r, ql, qr)
            if r_res > res:
                res = r_res
        return res

    # Link-Cut Tree (LCT) on the SAM suffix link tree (excluding the SAM root 1)
    lct_parent = [0] * max_states
    ch0 = [0] * max_states
    ch1 = [0] * max_states
    val = [0] * max_states
    lazy_lct = [0] * max_states
    top_node = list(range(max_states))

    for u in range(2, sz + 1):
        p = sam_link[u]
        if p != 1:
            lct_parent[u] = p
        else:
            lct_parent[u] = 0

    def push_down(u):
        lz = lazy_lct[u]
        if lz:
            c0 = ch0[u]
            if c0:
                val[c0] = lz
                lazy_lct[c0] = lz
            c1 = ch1[u]
            if c1:
                val[c1] = lz
                lazy_lct[c1] = lz
            lazy_lct[u] = 0

    def rotate(u):
        p = lct_parent[u]
        g = lct_parent[p]
        if ch1[p] == u:
            ch1[p] = ch0[u]
            if ch0[u]:
                lct_parent[ch0[u]] = p
            ch0[u] = p
        else:
            ch0[p] = ch1[u]
            if ch1[u]:
                lct_parent[ch1[u]] = p
            ch1[u] = p
        lct_parent[p] = u
        lct_parent[u] = g
        if ch0[g] == p:
            ch0[g] = u
        elif ch1[g] == p:
            ch1[g] = u

        c0 = ch0[p]
        top_node[p] = top_node[c0] if c0 else p
        c0 = ch0[u]
        top_node[u] = top_node[c0] if c0 else u

    def splay(u):
        curr = u
        st = []
        while True:
            p = lct_parent[curr]
            if ch0[p] != curr and ch1[p] != curr:
                break
            st.append(curr)
            curr = p
        st.append(curr)
        while st:
            push_down(st.pop())

        while True:
            p = lct_parent[u]
            if ch0[p] != u and ch1[p] != u:
                break
            g = lct_parent[p]
            if ch0[g] == p or ch1[g] == p:
                if (ch1[p] == u) == (ch1[g] == p):
                    rotate(p)
                else:
                    rotate(u)
            rotate(u)

    def access(u, R):
        last = 0
        curr = u
        while curr:
            splay(curr)
            end2 = val[curr]
            if end2 != 0:
                top = top_node[curr]
                bottom = curr
                d = R - end2
                l1 = sam_len[sam_link[top]] + 1
                l2 = sam_len[bottom]
                if d < l2:
                    l2 = d
                if l1 <= l2:
                    x_min = end2 - l2 + 1
                    x_max = end2 - l1 + 1
                    seg_add(1, 1, n, x_min, x_max, d)

            ch1[curr] = last
            last = curr
            curr = lct_parent[curr]

        splay(u)
        val[u] = R
        lazy_lct[u] = R

    # Process sweep-line on R from 1 to n
    ans = [0] * q
    for r in range(1, n + 1):
        access(prefix_state[r], r)
        for l, q_idx in queries_at[r]:
            ans[q_idx] = seg_query(1, 1, n, l, r)

    sys.stdout.write("\n".join(map(str, ans)) + "\n")


if __name__ == "__main__":
    main()
