import sys

def main():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    iterator = iter(input_data)
    n = int(next(iterator))
    m = int(next(iterator))
    q = int(next(iterator))
    
    N = 2 * n
    POW2 = [1 << i for i in range(N)]
    R = [POW2[i] for i in range(N)]
    
    for _ in range(m):
        a = int(next(iterator))
        va = int(next(iterator))
        b = int(next(iterator))
        vb = int(next(iterator))
        
        la = 2 * (a - 1) + (1 - va)
        lb = 2 * (b - 1) + (1 - vb)
        
        R[la] |= POW2[lb ^ 1]
        R[lb] |= POW2[la ^ 1]
        
    for k in range(N):
        R_k = R[k]
        bit_k = POW2[k]
        for i in range(N):
            if R[i] & bit_k:
                R[i] |= R_k
                
    for i in range(n):
        u = 2 * i
        if (R[u] & POW2[u ^ 1]) and (R[u ^ 1] & POW2[u]):
            print("-1")
            return
            
    def add_edge(A, B):
        bit_B = POW2[B]
        if R[A] & bit_B:
            return
        R_B = R[B]
        bit_A = POW2[A]
        for X in range(N):
            if R[X] & bit_A:
                R[X] |= R_B

    ans = []
    for _ in range(q):
        u = int(next(iterator))
        v = int(next(iterator))
        if u == v:
            ans.append('0')
            continue
            
        Lu = 2 * (u - 1)
        Lv = 2 * (v - 1)
        
        # Case 1: x_u = 1 and x_v = 1
        case1 = not (
            (R[Lu] & POW2[Lu ^ 1]) or
            (R[Lv] & POW2[Lv ^ 1]) or
            (R[Lu] & POW2[Lv ^ 1]) or
            (R[Lv] & POW2[Lu ^ 1])
        )
        
        # Case 2: x_u = 0 and x_v = 0
        case2 = not (
            (R[Lu ^ 1] & POW2[Lu]) or
            (R[Lv ^ 1] & POW2[Lv]) or
            (R[Lu ^ 1] & POW2[Lv]) or
            (R[Lv ^ 1] & POW2[Lu])
        )
        
        if case1 or case2:
            ans.append('0')
            add_edge(Lu, Lv)
            add_edge(Lv ^ 1, Lu ^ 1)
            add_edge(Lv, Lu)
            add_edge(Lu ^ 1, Lv ^ 1)
        else:
            ans.append('1')
            
    print(''.join(ans))

if __name__ == '__main__':
    main()
