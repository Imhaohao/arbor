import sys


def main():
    readline = sys.stdin.buffer.readline
    n = int(readline())

    jobs_12 = []
    jobs_21 = []
    load_1 = 0
    load_2 = 0

    for _ in range(n):
        values = list(map(int, readline().split()))

        if values[0] == 1:
            _, machine, duration = values
            if machine == 1:
                load_1 += duration
            else:
                load_2 += duration
        else:
            _, first_machine, first, _, second = values

            # Johnson's order: first <= second by increasing first,
            # followed by first > second by decreasing second.
            key = first if first <= second else 2_000_000_000 - second

            if first_machine == 1:
                load_1 += first
                load_2 += second
                jobs_12.append((key, first, second))
            else:
                load_2 += first
                load_1 += second
                jobs_21.append((key, first, second))

    answer = max(load_1, load_2)

    # Jackson's two-machine schedule attains the maximum of the
    # machine loads and these two optimal directional flow-shop spans.
    for jobs in (jobs_12, jobs_21):
        jobs.sort()
        first_finish = 0
        second_finish = 0

        for _, first, second in jobs:
            first_finish += first
            if second_finish < first_finish:
                second_finish = first_finish
            second_finish += second

        if second_finish > answer:
            answer = second_finish

    print(answer)


if __name__ == "__main__":
    main()
