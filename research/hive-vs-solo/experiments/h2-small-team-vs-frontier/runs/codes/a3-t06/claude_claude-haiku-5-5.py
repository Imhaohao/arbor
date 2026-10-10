import sys

def johnson(jobs):
    front = sorted((p, q) for p, q in jobs if p <= q)
    back = sorted((p, q) for p, q in jobs if p > q)
    back.sort(key=lambda x: -x[1])
    c1 = 0
    c2 = 0
    for p, q in front + back:
        c1 += p
        c2 = max(c2, c1) + q
    return c2

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    pos = 1
    wa = 0
    wb = 0
    xs = []
    ys = []
    for _ in range(n):
        if data[pos] == b'1':
            m = data[pos + 1]
            t = int(data[pos + 2])
            pos += 3
            if m == b'1':
                wa += t
            else:
                wb += t
        else:
            m1 = data[pos + 1]
            t1 = int(data[pos + 2])
            t2 = int(data[pos + 4])
            pos += 5
            if m1 == b'1':
                wa += t1
                wb += t2
                xs.append((t1, t2))
            else:
                wb += t1
                wa += t2
                ys.append((t1, t2))
    ans = max(wa, wb, johnson(xs), johnson(ys))
    sys.stdout.write(str(ans) + "\n")

main()
