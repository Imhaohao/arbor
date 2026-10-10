import sys

def main():
    data = sys.stdin.buffer.read().split()
    q = int(data[0])
    out = []
    pos = 1
    for _ in range(q):
        N = int(data[pos])
        M = int(data[pos + 1])
        pos += 2
        if N == M:
            out.append(0)
            continue
        L = max(N, M).bit_length()
        fmt = '0%db' % L
        A, B, C, D = 0, 1, 1, 0
        sx, sx1 = 0, 1
        su, su1 = 0, 1
        for ca, cb in zip(format(N, fmt), format(M, fmt)):
            if ca == '0':
                if cb == '0':
                    A, B, C, D = A, B + su, C + sx, A + D
                else:
                    A, B, C, D = B + su, B, A + D, D + sx
                sx1 = sx + sx1
            else:
                if cb == '0':
                    A, B, C, D = C + sx, A + D, C, D + su
                else:
                    A, B, C, D = A + D, D + sx, D + su, D
                sx, sx1 = sx + sx1, sx1
            if cb == '0':
                su1 = su + su1
            else:
                su, su1 = su + su1, su1
        out.append(A)
    sys.stdout.write('\n'.join(map(str, out)) + '\n')

main()
