import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    it = map(int, data)
    n = next(it)

    jobs12 = []  # first on lathe 1, then lathe 2: (t1, t2)
    jobs21 = []  # first on lathe 2, then lathe 1: (t2_first, t1_second)
    single1 = 0
    single2 = 0

    for _ in range(n):
        k = next(it)
        if k == 1:
            m = next(it)
            t = next(it)
            if m == 1:
                single1 += t
            else:
                single2 += t
        else:
            m1 = next(it)
            t1 = next(it)
            next(it)  # m2, always the other lathe
            t2 = next(it)
            if m1 == 1:
                jobs12.append((t1, t2))
            else:
                jobs21.append((t1, t2))

    # Johnson's order: short first-machine jobs early (by ascending first time),
    # long first-machine jobs late (by descending second time).
    jobs12.sort(key=lambda job: (0, job[0]) if job[0] <= job[1] else (1, -job[1]))
    jobs21.sort(key=lambda job: (0, job[0]) if job[0] <= job[1] else (1, -job[1]))

    # Lathe 1: all 1→2 first operations, then free work, then 2→1 second operations.
    finish12 = []
    t = 0
    for a, _b in jobs12:
        t += a
        finish12.append(t)
    m1 = t + single1

    # Lathe 2: all 2→1 first operations, then free work, then 1→2 second operations.
    finish21 = []
    t = 0
    for c, _d in jobs21:
        t += c
        finish21.append(t)
    m2 = t + single2

    for i, (_c, d) in enumerate(jobs21):
        start = m1 if m1 > finish21[i] else finish21[i]
        m1 = start + d

    for i, (_a, b) in enumerate(jobs12):
        start = m2 if m2 > finish12[i] else finish12[i]
        m2 = start + b

    print(m1 if m1 > m2 else m2)


main()
