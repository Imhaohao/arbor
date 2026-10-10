import sys
def main():
    data = sys.stdin.read().split()
    Ns = data[0]
    D = int(data[1]); R = int(data[2])
    M = 998244353
    n = len(Ns)
    if n == 1:
        print(0); return
    N = [int(ch) for ch in Ns]
    ans = 0

    H = [[0] * D for _ in range(2)]
    for a in range(1, 10):
        for b in range(1, 10):
            if b > a:
                H[1][(a + b) % D] += 1
            elif b == a:
                H[0][(a + b) % D] += 1
    inner = {}
    for a in range(10):
        for b in range(10):
            c = (b > a) - (b < a)
            key = ((a + b) % D, c)
            inner[key] = inner.get(key, 0) + 1
    k = 0
    while 2 * k + 2 <= n - 1:
        ans += H[1][R]
        if 2 * k + 3 <= n - 1:
            for s in range(D):
                v = H[1][s]
                if v:
                    for c in range(10):
                        if (s + c) % D == R:
                            ans += v
        ans %= M
        NH = [[0] * D for _ in range(2)]
        for st in range(2):
            for s in range(D):
                v = H[st][s]
                if not v:
                    continue
                for (ds, c), cnt in inner.items():
                    if st == 0:
                        if c == 1:
                            nst = 1
                        elif c == -1:
                            continue
                        else:
                            nst = 0
                    else:
                        nst = 1
                    t = (s + ds) % D
                    NH[nst][t] = (NH[nst][t] + v * cnt) % M
        H = NH
        k += 1

    dp = {(0, 0, 0): [1] + [0] * (D - 1)}
    for i in range(n // 2):
        j = n - 1 - i
        groups = {}
        for a in range(1 if i == 0 else 0, 10):
            pa = 1 if a < N[i] else (0 if a == N[i] else 2)
            for b in range(1 if i == 0 else 0, 10):
                c = (b > a) - (b < a)
                qb = 0 if b < N[j] else (2 if b > N[j] else 1)
                key = ((a + b) % D, c, pa, qb)
                groups[key] = groups.get(key, 0) + 1
        ndp = {}
        for (st, p, q), vec in dp.items():
            for (ds, c, pa, qb), cnt in groups.items():
                if st == 0:
                    if c == 1:
                        nst = 1
                    elif c == -1:
                        continue
                    else:
                        nst = 0
                else:
                    nst = 1
                if p == 1:
                    np_ = 1
                elif pa == 2:
                    continue
                else:
                    np_ = pa
                nq = 0 if qb == 0 else (1 if qb == 2 else q)
                key = (nst, np_, nq)
                tgt = ndp.get(key)
                if tgt is None:
                    tgt = [0] * D
                    ndp[key] = tgt
                for s in range(D):
                    v = vec[s]
                    if v:
                        t = (s + ds) % D
                        tgt[t] = (tgt[t] + v * cnt) % M
        dp = ndp
    if n % 2 == 1:
        m = n // 2
        groups = {}
        for c in range(10):
            pc = 1 if c < N[m] else (0 if c == N[m] else 2)
            key = (c % D, pc)
            groups[key] = groups.get(key, 0) + 1
        ndp = {}
        for (st, p, q), vec in dp.items():
            for (ds, pc), cnt in groups.items():
                if p == 1:
                    np_ = 1
                elif pc == 2:
                    continue
                else:
                    np_ = pc
                key = (st, np_, q)
                tgt = ndp.get(key)
                if tgt is None:
                    tgt = [0] * D
                    ndp[key] = tgt
                for s in range(D):
                    v = vec[s]
                    if v:
                        t = (s + ds) % D
                        tgt[t] = (tgt[t] + v * cnt) % M
        dp = ndp
    for (st, p, q), vec in dp.items():
        if st == 1 and (p == 1 or q == 0):
            ans += vec[R]
    print(ans % M)
main()
