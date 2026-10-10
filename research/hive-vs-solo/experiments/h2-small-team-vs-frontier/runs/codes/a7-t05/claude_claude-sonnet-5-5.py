import sys
def main():
    a,c,m,x0,G=map(int,sys.stdin.read().split())
    x=x0
    seen={}
    pref=[(0,0,0,0,0)]
    xs=[]
    i=0
    while i<G:
        p=i%4
        key=x*4+p
        if key in seen:
            break
        seen[key]=i
        xs.append(x)
        D=list(range(24))
        for k in range(23,0,-1):
            x=(a*x+c)%m
            j=x%(k+1)
            D[k],D[j]=D[j],D[k]
        t=D[23]//6
        hands=[sorted(D[6*s:6*s+6]) for s in range(4)]
        wins=[0,0,0,0]
        leader=p
        last=0
        for _ in range(6):
            h=hands[leader]
            nt=[k for k in h if k//6!=t]
            if nt:
                card=max(nt,key=lambda k:(k%6)*4+3-k//6)
            else:
                card=h[0]
            h.remove(card)
            led=card//6
            best=card
            win=leader
            for d in range(1,4):
                s=(leader+d)%4
                h=hands[s]
                bs=best//6
                br=best%6
                ls=[k for k in h if k//6==led]
                if ls:
                    cand=None
                    if bs==led:
                        for k in ls:
                            if k%6>br:
                                cand=k
                                break
                    card=cand if cand is not None else ls[0]
                else:
                    tr=[k for k in h if k//6==t]
                    cand=None
                    for k in tr:
                        if bs!=t or k%6>br:
                            cand=k
                            break
                    if cand is not None:
                        card=cand
                    else:
                        nt=[k for k in h if k//6!=t]
                        if nt:
                            card=min(nt,key=lambda k:(k%6)*4+k//6)
                        else:
                            card=h[0]
                h.remove(card)
                cs=card//6
                if (cs==t and bs!=t) or (cs==bs and card%6>br):
                    best=card
                    win=s
            wins[win]+=1
            leader=win
            last=win
        sc=[0,0,0,0]
        sw=0
        if 6 in wins:
            sc[wins.index(6)]=20
            sw=1
        else:
            for s in range(4):
                v=wins[s]
                if s==last:
                    v+=2
                if wins[s]==0:
                    v-=2
                sc[s]=v
        q=pref[-1]
        pref.append((q[0]+sc[0],q[1]+sc[1],q[2]+sc[2],q[3]+sc[3],q[4]+sw))
        i+=1
    if i==G:
        r=pref[G]
        print(*r[:5],x)
        return
    j=seen[x*4+i%4]
    L=i-j
    cnt=(G-j)//L
    idx=j+(G-j)%L
    pj=pref[j]
    pi=pref[i]
    px=pref[idx]
    res=[pj[k]+cnt*(pi[k]-pj[k])+px[k]-pj[k] for k in range(5)]
    print(*res,xs[idx])
main()
