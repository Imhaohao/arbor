import sys

def main():
    data = sys.stdin.buffer.read().split()
    q = int(data[0])
    # level matrices
    def level(xb, yb):
        rows = [[0]*8 for _ in range(8)]
        for i in range(2):
            for j in range(2):
                r = 2*i + j
                p = (xb+i) & 1
                d = (xb+i) >> 1
                qq = (yb+j) & 1
                e = (yb+j) >> 1
                if p == 0 and qq == 0:
                    rows[r][2*d+e] += 1
                elif p == 1 and qq == 1:
                    rows[r][2*(d+1)+(e+1)] += 1
                    rows[r][2*d+e] += 1
                elif p == 0 and qq == 1:
                    rows[r][2*d+e+1] += 1
                    rows[r][6+e] += 1
                else:
                    rows[r][2*(d+1)+e] += 1
                    rows[r][4+d] += 1
        for i in range(2):
            p = (xb+i) & 1
            d = (xb+i) >> 1
            if p == 0:
                rows[4+i][4+d] += 1
            else:
                rows[4+i][4+d+1] += 1
                rows[4+i][4+d] += 1
            p = (yb+i) & 1
            d = (yb+i) >> 1
            if p == 0:
                rows[6+i][6+d] += 1
            else:
                rows[6+i][6+d+1] += 1
                rows[6+i][6+d] += 1
        return rows

    L = [[level(a, b) for b in range(2)] for a in range(2)]

    def mul(A, B):
        return [[sum(A[i][k]*B[k][j] for k in range(8)) for j in range(8)] for i in range(8)]

    names = "abcdefgh"
    funcs = []
    for key in range(256):
        mat = None
        for l in range(3, -1, -1):
            xb = (key >> (4+l)) & 1
            yb = (key >> l) & 1
            Lm = L[xb][yb]
            mat = Lm if mat is None else mul(Lm, mat)
        exprs = []
        for r in range(8):
            terms = []
            for c in range(8):
                v = mat[r][c]
                if v:
                    terms.append("%d*%s" % (v, names[c]))
            exprs.append(" + ".join(terms) if terms else "0")
        funcs.append(eval("lambda a,b,c,d,e,f,g,h: (" + ", ".join(exprs) + ")"))

    start = (0, 1, 1, 0, 0, 1, 0, 1)
    out = []
    for t in range(q):
        N = int(data[1+2*t])
        M = int(data[2+2*t])
        if N == M:
            out.append(0)
            continue
        v = start
        for c in range(14, -1, -1):
            s = 4*c
            key = (((N >> s) & 15) << 4) | ((M >> s) & 15)
            v = funcs[key](*v)
        out.append(v[0])
    sys.stdout.write("\n".join(map(str, out)) + "\n")

main()
