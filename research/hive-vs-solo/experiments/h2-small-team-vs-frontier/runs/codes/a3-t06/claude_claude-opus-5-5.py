import sys

def johnson(jobs):
    # jobs: list of (a, b); a on first machine, b on second
    g1 = [j for j in jobs if j[0] <= j[1]]
    g2 = [j for j in jobs if j[0] > j[1]]
    g1.sort(key=lambda x: x[0])
    g2.sort(key=lambda x: -x[1])
    return g1 + g2

def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    idx = 1
    j12 = []
    j21 = []
    s1 = 0
    s2 = 0
    for _ in range(n):
        k = data[idx]
        if k == b'1':
            m = data[idx + 1]
            t = int(data[idx + 2])
            idx += 3
            if m == b'1':
                s1 += t
            else:
                s2 += t
        else:
            m1 = data[idx + 1]
            t1 = int(data[idx + 2])
            t2 = int(data[idx + 4])
            idx += 5
            if m1 == b'1':
                j12.append((t1, t2))
            else:
                j21.append((t1, t2))
    o12 = johnson(j12)
    o21 = johnson(j21)

    # Machine 1 first ops of J12
    t = 0
    c12 = []
    for a, b in o12:
        t += a
        c12.append(t)
    m1_time = t + s1
    # Machine 2 first ops of J21
    t = 0
    c21 = []
    for a, b in o21:
        t += a
        c21.append(t)
    m2_time = t + s2

    # Machine 1: second ops of J21
    t = m1_time
    for i in range(len(o21)):
        c = c21[i]
        if c > t:
            t = c
        t += o21[i][1]
    m1_end = t
    # Machine 2: second ops of J12
    t = m2_time
    for i in range(len(o12)):
        c = c12[i]
        if c > t:
            t = c
        t += o12[i][1]
    m2_end = t
    print(max(m1_end, m2_end))

main()
