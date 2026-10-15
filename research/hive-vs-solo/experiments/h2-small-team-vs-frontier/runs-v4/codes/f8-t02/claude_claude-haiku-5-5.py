import sys

MOD = 998244353


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    values = list(map(int, data[1:1 + n]))
    lim = max(values)

    mult = [0] * (lim + 1)
    for v in values:
        mult[v] += 1

    cnt = [0] * (lim + 1)
    for e in range(1, lim + 1):
        cnt[e] = sum(mult[e::e])

    spf = list(range(lim + 1))
    for i in range(2, int(lim ** 0.5) + 1):
        if spf[i] == i:
            for j in range(i * i, lim + 1, i):
                if spf[j] == j:
                    spf[j] = i

    omega = [0] * (lim + 1)
    mu = [0] * (lim + 1)
    mu[1] = 1
    for x in range(2, lim + 1):
        p = spf[x]
        y = x // p
        omega[x] = omega[y] + 1
        mu[x] = 0 if y % p == 0 else -mu[y]

    squarefree = [k for k in range(1, lim + 1) if mu[k]]

    K = [[0] * 16 for _ in range(lim + 1)]
    for g in range(1, lim + 1):
        if cnt[g] == 0:
            continue
        w = omega[g]
        for k in squarefree:
            e = g * k
            if e > lim:
                break
            K[e][w] += mu[k]

    pow2 = [1] * (n + 1)
    pow3 = [1] * (n + 1)
    inv2pow = [1] * (n + 1)
    inv2 = (MOD + 1) // 2
    for i in range(1, n + 1):
        pow2[i] = pow2[i - 1] * 2 % MOD
        pow3[i] = pow3[i - 1] * 3 % MOD
        inv2pow[i] = inv2pow[i - 1] * inv2 % MOD

    Xi = [None] * (lim + 1)
    for h in range(1, lim + 1):
        if cnt[h]:
            Xi[h] = [0] * 16
    for e in range(1, lim + 1):
        if cnt[e] == 0:
            continue
        nonzero = [(b, v) for b, v in enumerate(K[e]) if v]
        if not nonzero:
            continue
        weight = pow2[cnt[e]]
        for h in range(e, lim + 1, e):
            row = Xi[h]
            if row is None:
                continue
            for b, v in nonzero:
                row[b] += weight * v

    inv64 = pow(64, MOD - 2, MOD)
    match_slots = []
    for lab in range(64):
        va, vb = lab >> 3, lab & 7
        slots = []
        for s in range(64):
            x = ((s >> 3) & va) ^ ((s & 7) & vb)
            if bin(x).count("1") % 2 == 0:
                slots.append(s)
        match_slots.append(slots)

    class_cache = {}

    def classes(m):
        cls = class_cache.get(m)
        if cls is None:
            acc = [0] * 16
            for v in range(m, lim + 1, m):
                if mult[v]:
                    acc[omega[v]] += mult[v]
            cls = [(w, c) for w, c in enumerate(acc) if c]
            class_cache[m] = cls
        return cls

    def phi(m, a, b):
        p = [0] * 64
        for w, c in classes(m):
            lab = (((w - a) >> 1) << 3) | ((w - b) >> 1)
            for s in match_slots[lab]:
                p[s] += c
        total = 0
        for x in p:
            total += pow3[x]
        return (total % MOD * inv64 % MOD * inv2pow[cnt[m]] - 1) % MOD

    ans = 0
    for h in range(1, lim + 1):
        if cnt[h] == 0:
            continue
        a = omega[h]
        coeff = [x % MOD for x in Xi[h][:a + 1]]
        if not any(coeff):
            continue
        acc = [0] * (a + 1)
        for k in squarefree:
            m = h * k
            if m > lim:
                break
            if cnt[m] == 0:
                continue
            mk = mu[k]
            for b in range(a + 1):
                if coeff[b]:
                    acc[b] += mk * phi(m, a, b)
        for b in range(a + 1):
            ans += coeff[b] * acc[b]
        ans %= MOD

    print(ans % MOD)


main()
