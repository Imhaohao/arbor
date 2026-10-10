import sys

def stern(n):
    # s(n), Stern's diatomic
    a, b = 1, 0
    while n:
        if n & 1:
            b += a
        else:
            a += b
        n >>= 1
    return b

def inter(n, m):
    cur = {(n, m): 1}
    total = 0
    while cur:
        nxt = {}
        for (a, b), w in cur.items():
            if a < 0 or b < 0:
                continue
            if a == 0 or b == 0:
                total += w
                continue
            if a == b:
                total += w * stern(a + 1)
                continue
            key = (a >> 1, b >> 1)
            nxt[key] = nxt.get(key, 0) + w
            if not (a & 1) and not (b & 1):
                key = ((a >> 1) - 1, (b >> 1) - 1)
                nxt[key] = nxt.get(key, 0) + w
        cur = nxt
    return total

def main():
    data = sys.stdin.buffer.read().split()
    q = int(data[0])
    out = []
    idx = 1
    for _ in range(q):
        N = int(data[idx]); M = int(data[idx + 1]); idx += 2
        sN = stern(N)
        sM = stern(M)
        if N == 0 or M == 0:
            out.append(sN + sM)
            continue
        if N == M:
            out.append(0)
            continue
        f = inter(N - 1, M - 1)
        out.append(sN + sM - 2 * f)
    sys.stdout.write("\n".join(map(str, out)) + "\n")

main()
