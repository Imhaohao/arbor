import sys
def main():
    data=sys.stdin.read().split()
    MOD=998244353
    D=int(data[0])
    groups=[]
    S=0
    maxe=0
    for i in range(D):
        e=int(data[1+2*i]); c=int(data[2+2*i])
        groups.append((e,c))
        S+=e*c
        if e>maxe: maxe=e
    n=S+2
    fact=[1]*(n+1)
    for i in range(1,n+1):
        fact[i]=fact[i-1]*i%MOD
    inv=[1]*(n+1)
    inv[n]=pow(fact[n],MOD-2,MOD)
    for i in range(n,0,-1):
        inv[i-1]=inv[i]*i%MOD
    inv2=(MOD+1)//2
    sgnS=1 if S%2==0 else MOD-1
    H=1 if S%2==0 else 0
    ans=0
    S1=S+1
    fS1=fact[S1]
    ge=[(inv[e],e,c) for e,c in groups]
    for m in range(1,S+1):
        cb=fS1*inv[m]%MOD*inv[S1-m]%MOD
        H=(sgnS*cb-H)%MOD*inv2%MOD
        if m>=maxe:
            fm=fact[m]
            g=1
            for ie,e,c in ge:
                b=fm*ie%MOD*inv[m-e]%MOD
                if c==1:
                    g=g*b%MOD
                else:
                    g=g*pow(b,c,MOD)%MOD
            if m&1:
                ans=(ans-g*H)%MOD
            else:
                ans=(ans+g*H)%MOD
    print(ans%MOD)
main()
