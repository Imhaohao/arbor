import sys


def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    n = int(input_data[0])
    idx = 1
    J12 = []
    J21 = []
    J1 = []
    J2 = []

    for _ in range(n):
        k = int(input_data[idx])
        if k == 1:
            m = int(input_data[idx + 1])
            t = int(input_data[idx + 2])
            idx += 3
            if m == 1:
                J1.append(t)
            else:
                J2.append(t)
        else:
            m1 = int(input_data[idx + 1])
            t1 = int(input_data[idx + 2])
            # input_data[idx + 3] is m2
            t2 = int(input_data[idx + 4])
            idx += 5
            if m1 == 1:
                J12.append((t1, t2))
            else:
                J21.append((t1, t2))

    # Johnson's rule sorting key:
    # First machine processing time <= second machine processing time goes first (sorted by first machine time asc),
    # otherwise second (sorted by second machine time desc).
    key_fn = lambda x: (0, x[0]) if x[0] <= x[1] else (1, -x[1])
    J12.sort(key=key_fn)
    J21.sort(key=key_fn)

    # Phase 1 & 2 on Lathe 1: J12 first operations, then J1
    time1 = 0
    C1 = []
    for x in J12:
        time1 += x[0]
        C1.append(time1)

    for t in J1:
        time1 += t

    # Phase 1 & 2 on Lathe 2: J21 first operations, then J2
    time2 = 0
    C2 = []
    for x in J21:
        time2 += x[0]
        C2.append(time2)

    for t in J2:
        time2 += t

    # Phase 3 on Lathe 1: J21 second operations
    for i, x in enumerate(J21):
        if time1 < C2[i]:
            time1 = C2[i]
        time1 += x[1]

    # Phase 3 on Lathe 2: J12 second operations
    for i, x in enumerate(J12):
        if time2 < C1[i]:
            time2 = C1[i]
        time2 += x[1]

    print(max(time1, time2))


if __name__ == '__main__':
    solve()
