import sys

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    p = 1
    sumA = 0
    sumB = 0
    C = []
    D = []
    for _ in range(n):
        k = data[p]
        if k == b'1':
            m = data[p + 1]
            t = int(data[p + 2])
            p += 3
            if m == b'1':
                sumA += t
            else:
                sumB += t
        else:
            m1 = data[p + 1]
            t1 = int(data[p + 2])
            t2 = int(data[p + 4])
            p += 5
            if m1 == b'1':
                C.append((t1, t2))
            else:
                D.append((t1, t2))

    def johnson(jobs):
        left = [j for j in jobs if j[0] <= j[1]]
        right = [j for j in jobs if j[0] > j[1]]
        left.sort(key=lambda j: j[0])
        right.sort(key=lambda j: -j[1])
        return left + right

    C = johnson(C)
    D = johnson(D)

    t1 = 0
    cf = []
    for a, b in C:
        t1 += a
        cf.append(t1)
    t2 = 0
    df = []
    for a, b in D:
        t2 += a
        df.append(t2)

    m1 = t1 + sumA
    for i in range(len(D)):
        s = df[i]
        if m1 > s:
            s = m1
        m1 = s + D[i][1]

    m2 = t2 + sumB
    for i in range(len(C)):
        s = cf[i]
        if m2 > s:
            s = m2
        m2 = s + C[i][1]

    print(max(m1, m2))

main()
