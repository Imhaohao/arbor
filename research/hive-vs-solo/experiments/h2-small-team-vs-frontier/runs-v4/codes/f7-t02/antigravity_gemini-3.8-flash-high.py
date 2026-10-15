import sys

# Increase recursion depth just in case
sys.setrecursionlimit(300000)


def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    n = int(input_data[0])
    q = int(input_data[1])
    s = input_data[2]
    initial_marks = input_data[3]

    queries = []
    ptr = 4
    for _ in range(q):
        p = int(input_data[ptr])
        c = int(input_data[ptr + 1])
        queries.append((p, c))
        ptr += 2

    # Special case: n = 1
    if n == 1:
        current_mark = int(initial_marks[0])
        out = []
        for p, c in queries:
            current_mark = c
            out.append("1" if current_mark != 0 else "0")
        sys.stdout.write("\n".join(out) + "\n")
        return

    # Suffix Array construction via prefix doubling
    sa = list(range(n))
    rank = [ord(c) for c in s]
    k = 1
    while k < n:
        mult = n + 1
        key = [rank[i] * mult + (rank[i + k] + 1 if i + k < n else 0) for i in range(n)]
        sa.sort(key=lambda i: key[i])
        tmp = [0] * n
        r = 0
        tmp[sa[0]] = 0
        for i in range(1, n):
            if key[sa[i]] != key[sa[i - 1]]:
                r += 1
            tmp[sa[i]] = r
        rank = tmp
        if r == n - 1:
            break
        k <<= 1

    # Kasai's algorithm for LCP array
    sa_inv = [0] * n
    for i in range(n):
        sa_inv[sa[i]] = i

    lcp = [0] * (n - 1)
    k = 0
    for i in range(n):
        r = sa_inv[i]
        if r == n - 1:
            k = 0
            continue
        j = sa[r + 1]
        while i + k < n and j + k < n and s[i + k] == s[j + k]:
            k += 1
        lcp[r] = k
        if k > 0:
            k -= 1

    # Total nodes in Cartesian tree: (n - 1) internal nodes + n leaves = 2n - 1
    # Internal nodes: 0 .. n - 2
    # Leaves: n - 1 .. 2n - 2 (Leaf i is at index (n - 1) + i)
    total_nodes = 2 * n - 1
    cart_left = [-1] * (n - 1)
    cart_right = [-1] * (n - 1)
    stack = []
    for i in range(n - 1):
        last = -1
        while stack and lcp[stack[-1]] > lcp[i]:
            last = stack.pop()
        if stack:
            cart_right[stack[-1]] = i
        if last != -1:
            cart_left[i] = last
        stack.append(i)
    cart_root = stack[0]

    LEFT = [-1] * total_nodes
    RIGHT = [-1] * total_nodes
    PARENT = [-1] * total_nodes

    for i in range(n - 1):
        if cart_left[i] != -1:
            LEFT[i] = cart_left[i]
        else:
            LEFT[i] = (n - 1) + i
        if cart_right[i] != -1:
            RIGHT[i] = cart_right[i]
        else:
            RIGHT[i] = (n - 1) + i + 1
        PARENT[LEFT[i]] = i
        PARENT[RIGHT[i]] = i

    # Compute weights
    W = [0] * total_nodes
    # Root
    W[cart_root] = lcp[cart_root]
    # Internal nodes
    for i in range(n - 1):
        if i != cart_root:
            p = PARENT[i]
            W[i] = max(0, lcp[i] - lcp[p])
    # Leaves
    for i in range(n):
        leaf_idx = (n - 1) + i
        p = PARENT[leaf_idx]
        W[leaf_idx] = max(0, (n - sa[i]) - lcp[p])

    # State arrays
    F1 = [0] * total_nodes
    F2 = [0] * total_nodes
    L1 = [0] * total_nodes
    L2 = [0] * total_nodes
    K = [0] * total_nodes
    R = [0] * total_nodes
    LEN = [0] * total_nodes
    ACC = [0] * total_nodes

    # Initialize leaves
    for i in range(n):
        leaf_idx = (n - 1) + i
        c = int(initial_marks[sa[i]])
        if c != 0:
            F1[leaf_idx] = c
            L1[leaf_idx] = c
            K[leaf_idx] = 1
            LEN[leaf_idx] = 1
            ACC[leaf_idx] = 1

    # Post-order traversal to initialize internal nodes
    order = []
    stk = [cart_root]
    while stk:
        u = stk.pop()
        order.append(u)
        l = LEFT[u]
        r = RIGHT[u]
        if l < n - 1:
            stk.append(l)
        if r < n - 1:
            stk.append(r)

    total_accepted = 0
    for i in range(n):
        leaf_idx = (n - 1) + i
        if ACC[leaf_idx]:
            total_accepted += W[leaf_idx]

    for u in reversed(order):
        l = LEFT[u]
        r = RIGHT[u]
        len_l = LEN[l]
        len_r = LEN[r]

        if len_l == 0:
            F1[u] = F1[r]
            F2[u] = F2[r]
            L1[u] = L1[r]
            L2[u] = L2[r]
            K[u] = K[r]
            R[u] = R[r]
            LEN[u] = len_r
        elif len_r == 0:
            F1[u] = F1[l]
            F2[u] = F2[l]
            L1[u] = L1[l]
            L2[u] = L2[l]
            K[u] = K[l]
            R[u] = R[l]
            LEN[u] = len_l
        else:
            ll2 = L2[l]
            rf1 = F1[r]
            if ll2 == rf1:
                K[u] = (K[l] + K[r] - 1) % 5
                R[u] = (R[l] + R[r] + (1 if (len_l >= 2 and len_r >= 2 and L1[l] == F2[r]) else 0)) % 5
                F1[u] = F1[r] if len_l == 1 else F1[l]
                F2[u] = F2[r] if len_l == 1 else F2[l]
                L1[u] = L1[l] if len_r == 1 else L1[r]
                L2[u] = L2[l] if len_r == 1 else L2[r]
                LEN[u] = 1 if (len_l == 1 and len_r == 1) else 2
            else:
                K[u] = (K[l] + K[r]) % 5
                R[u] = (R[l] + R[r] + (1 if (len_l >= 2 and L1[l] == rf1) else 0) + (1 if (len_r >= 2 and ll2 == F2[r]) else 0)) % 5
                F1[u] = F1[l]
                F2[u] = rf1 if len_l == 1 else F2[l]
                L1[u] = ll2 if len_r == 1 else L1[r]
                L2[u] = L2[r]
                LEN[u] = 2

        if LEN[u] > 0 and (K[u] + 2 * R[u]) % 5 == 1:
            ACC[u] = 1
            total_accepted += W[u]

    # Process queries
    out = []
    for p_in, c in queries:
        pos = p_in - 1
        idx = sa_inv[pos]
        leaf = (n - 1) + idx

        old_acc = ACC[leaf]
        if c == 0:
            new_f1 = 0
            new_f2 = 0
            new_l1 = 0
            new_l2 = 0
            new_k = 0
            new_r = 0
            new_len = 0
            new_acc = 0
        else:
            new_f1 = c
            new_f2 = 0
            new_l1 = c
            new_l2 = 0
            new_k = 1
            new_r = 0
            new_len = 1
            new_acc = 1

        if (new_f1 != F1[leaf] or new_f2 != F2[leaf] or new_l1 != L1[leaf] or
            new_l2 != L2[leaf] or new_k != K[leaf] or new_r != R[leaf] or new_len != LEN[leaf]):

            F1[leaf] = new_f1
            F2[leaf] = new_f2
            L1[leaf] = new_l1
            L2[leaf] = new_l2
            K[leaf] = new_k
            R[leaf] = new_r
            LEN[leaf] = new_len
            ACC[leaf] = new_acc

            if new_acc != old_acc:
                total_accepted += (new_acc - old_acc) * W[leaf]

            curr = PARENT[leaf]
            while curr != -1:
                l = LEFT[curr]
                r = RIGHT[curr]
                len_l = LEN[l]
                len_r = LEN[r]

                if len_l == 0:
                    nf1 = F1[r]
                    nf2 = F2[r]
                    nl1 = L1[r]
                    nl2 = L2[r]
                    nk = K[r]
                    nr = R[r]
                    nlen = len_r
                elif len_r == 0:
                    nf1 = F1[l]
                    nf2 = F2[l]
                    nl1 = L1[l]
                    nl2 = L2[l]
                    nk = K[l]
                    nr = R[l]
                    nlen = len_l
                else:
                    ll2 = L2[l]
                    rf1 = F1[r]
                    if ll2 == rf1:
                        nk = (K[l] + K[r] - 1) % 5
                        nr = (R[l] + R[r] + (1 if (len_l >= 2 and len_r >= 2 and L1[l] == F2[r]) else 0)) % 5
                        nf1 = F1[r] if len_l == 1 else F1[l]
                        nf2 = F2[r] if len_l == 1 else F2[l]
                        nl1 = L1[l] if len_r == 1 else L1[r]
                        nl2 = L2[l] if len_r == 1 else L2[r]
                        nlen = 1 if (len_l == 1 and len_r == 1) else 2
                    else:
                        nk = (K[l] + K[r]) % 5
                        nr = (R[l] + R[r] + (1 if (len_l >= 2 and L1[l] == rf1) else 0) + (1 if (len_r >= 2 and ll2 == F2[r]) else 0)) % 5
                        nf1 = F1[l]
                        nf2 = rf1 if len_l == 1 else F2[l]
                        nl1 = ll2 if len_r == 1 else L1[r]
                        nl2 = L2[r]
                        nlen = 2

                nacc = 1 if (nlen > 0 and (nk + 2 * nr) % 5 == 1) else 0

                if (nf1 == F1[curr] and nf2 == F2[curr] and nl1 == L1[curr] and
                    nl2 == L2[curr] and nk == K[curr] and nr == R[curr] and nlen == LEN[curr]):
                    break

                F1[curr] = nf1
                F2[curr] = nf2
                L1[curr] = nl1
                L2[curr] = nl2
                K[curr] = nk
                R[curr] = nr
                LEN[curr] = nlen

                old_cur_acc = ACC[curr]
                ACC[curr] = nacc
                if nacc != old_cur_acc:
                    total_accepted += (nacc - old_cur_acc) * W[curr]

                curr = PARENT[curr]

        out.append(str(total_accepted))

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    solve()
