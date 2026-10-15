import sys
from operator import mul

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]
    P = 998244353
    vals = sorted(set(a))
    pos = {v: i for i, v in enumerate(vals)}
    L = [vals[0] % P] + [(vals[k] - vals[k - 1]) % P for k in range(1, len(vals))]
    ix = [pos[x] for x in a]

    s = 1
    Fc = []
    Fp = []
    T1c = 0
    T1p = 0
    for t in range(n):
        at = a[t] % P
        q = ix[t]
        U = sum(map(mul, Fp[:q + 1], L)) % P
        T2 = (at * T1p - U) % P
        T0 = (s * at - T1c) % P
        if t == n - 1:
            print((T0 + T1c + T2) % P)
            return
        Kc = (s + T1p) % P
        r = ix[t + 1]
        m = r if r < q else q
        c1 = (at - 2) % P
        fc = Fc[:m + 1]
        if len(fc) < m + 1:
            fc = fc + [0] * (m + 1 - len(fc))
        fp = Fp[:m + 1]
        if len(fp) < m + 1:
            fp = fp + [0] * (m + 1 - len(fp))
        new = [(y * c1 - x + Kc) % P for x, y in zip(fc, fp)]
        if r > q:
            tail = Fp[q + 1:r + 1]
            if tail:
                new += [at * y % P for y in tail]
            if len(new) < r + 1:
                new += [0] * (r + 1 - len(new))
        T1n = sum(map(mul, new, L)) % P
        s = (T0 + T2) % P
        Fp, Fc = Fc, new
        T1p, T1c = T1c, T1n

main()
