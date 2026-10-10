import sys
def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = data[1:1+n]
    N = 1000000
    spf = list(range(N + 1))
    small = []
    sieve = bytearray([1]) * 1001
    for i in range(2, 1001):
        if sieve[i]:
            small.append(i)
            for j in range(i * i, 1001, i):
                sieve[j] = 0
    for p in reversed(small):
        cnt = len(range(p * p, N + 1, p))
        spf[p * p::p] = [p] * cnt
    idx = {p: i for i, p in enumerate(small)}
    PAR = 1 << len(small)
    cache = {}
    seen = set()
    bigbasis = {}
    basis = {}
    rank = 0
    for t in a:
        x0 = int(t)
        key = x0
        if key in cache:
            m, b = cache[key]
        else:
            x = x0
            m = 0
            b = 0
            while x > 1:
                p = spf[x]
                x //= p
                if p > 1000:
                    b = p
                else:
                    m ^= 1 << idx[p]
            if x0 & 1:
                m ^= PAR
            cache[key] = (m, b)
        # identical vectors: dependent after first only if repeated
        if (m, b) in seen:
            continue
        seen.add((m, b))
        if b:
            if b in bigbasis:
                m ^= bigbasis[b]
            else:
                bigbasis[b] = m
                rank += 1
                continue
        while m:
            h = m.bit_length()
            v = basis.get(h)
            if v is None:
                basis[h] = m
                rank += 1
                break
            m ^= v
    print((pow(2, n - rank, 998244353) - 1) % 998244353)
main()
