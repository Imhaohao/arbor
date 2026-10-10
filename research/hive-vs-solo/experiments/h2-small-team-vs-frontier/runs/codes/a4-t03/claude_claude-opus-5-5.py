import sys
def main():
    n,c,k=map(int,sys.stdin.readline().split())
    MOD=998244353
    N=n+2
    fact=[1]*(N+1)
    for i in range(1,N+1):
        fact[i]=fact[i-1]*i%MOD
    inv=[1]*(N+1)
    inv[N]=pow(fact[N],MOD-2,MOD)
    for i in range(N,0,-1):
        inv[i-1]=inv[i]*i%MOD
    def C(a,b):
        if b<0 or a<0 or b>a: return 0
        return fact[a]*inv[b]%MOD*inv[a-b]%MOD
    c1=(c-1)%MOD
    c2=(c-2)%MOD
    def phi(x):
        r=x; p=2
        while p*p<=x:
            if x%p==0:
                while x%p==0: x//=p
                r-=r//p
            p+=1
        if x>1: r-=r//x
        return r
    def f(m,j):
        if m<2: return 0
        if j==0:
            v=pow(c2,m,MOD)
            if m%2==0: v+=c2
            else: v-=c2
            return v%MOD
        if m-2*j<0: return 0
        ways=(C(m-j,j)+C(m-j-1,j-1))%MOD
        return ways*pow(c1,j,MOD)%MOD*pow(c2,m-2*j,MOD)%MOD
    total=0
    d=1
    divs=[]
    while d*d<=n:
        if n%d==0:
            divs.append(d)
            if d*d!=n: divs.append(n//d)
        d+=1
    for d in divs:
        if (k*d)%n!=0: continue
        j=k*d//n
        total=(total+phi(n//d)%MOD*f(d,j))%MOD
    if n%2==0:
        h=n//2
        L=h+1
        rs=0
        for e0 in (0,1):
            for e1 in (0,1):
                rem=k-e0-e1
                if rem<0 or rem%2: continue
                t=rem//2
                T=t+e0+e1
                R=T+1-e0-e1
                if T>L or R<1 or L-T<R: continue
                v=C(L-T-1,R-1)*pow(c1,R,MOD)%MOD*pow(c2,L-T-R,MOD)%MOD
                rs=(rs+v)%MOD
        total=(total+h%MOD*rs)%MOD
    ans=total*pow(2*n%MOD,MOD-2,MOD)%MOD
    print(ans)
main()
