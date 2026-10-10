import sys

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = data[1:1+n]
    MOD = 998244353
    N = 10**6
    # small primes up to 1000
    small = []
    is_p = bytearray([1]) * 1001
    is_p[0] = is_p[1] = 0
    for i in range(2, 1001):
        if is_p[i]:
            small.append(i)
            for j in range(i*i, 1001, i):
                is_p[j] = 0
    spf = list(range(N + 1))
    for p in reversed(small):
        cnt = len(range(p*p, N + 1, p))
        spf[p*p::p] = [p] * cnt
    idx = {}
    for i, p in enumerate(small):
        idx[p] = 1 << (i + 1)

    cache = {}
    first = {}
    rank = 0
    basis = {}
    pivmask = 0
    seen = set()

    def insert(x):
        nonlocal pivmask, rank
        if x in seen:
            return
        seen.add(x)
        m = x & pivmask
        while m:
            low = m & -m
            x ^= basis[low]
            m ^= low
        if x:
            piv = x & -x
            for k in list(basis.keys()):
                b = basis[k]
                if b & piv:
                    basis[k] = b ^ x
            basis[piv] = x
            pivmask |= piv
            rank += 1

    for tok in a:
        v = int(tok)
        r = cache.get(v)
        if r is None:
            x = v
            mask = v & 1
            large = 0
            while x > 1:
                p = spf[x]
                if p > 1000:
                    large = x
                    break
                e = 0
                while x % p == 0:
                    x //= p
                    e ^= 1
                if e:
                    mask ^= idx[p]
            r = (mask, large)
            cache[v] = r
        mask, large = r
        if large:
            f = first.get(large)
            if f is None:
                first[large] = mask
                rank += 1
            else:
                insert(mask ^ f)
        else:
            insert(mask)

    print((pow(2, n - rank, MOD) - 1) % MOD)

main()
