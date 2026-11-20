import csv,json,re,collections,statistics
S=[s for s in csv.DictReader(open('skift.csv',encoding='utf-8-sig')) if s['maskin_namn']=='Komatsu 941']
def mn(t): h,m=t.split(':'); return int(h)*60+int(m)
by=collections.defaultdict(list)
for s in S:
    a,b=mn(s['tin']),mn(s['tut']); b=b if b>=a else b+1440
    by[s['datum']].append((a,b,float(s['g15_h'] or 0)*60,s))
flag=[]
for d,v in by.items():
    act=[x for x in v if x[2]>0]
    if not act: continue
    span=max(x[1] for x in act)-min(x[0] for x in act)
    tot=sum(x[2] for x in act)
    # union av intervall
    iv=sorted((x[0],x[1]) for x in act); un=0;cur=None
    for a,b in iv:
        if cur is None: cur=[a,b]
        elif a<=cur[1]: cur[1]=max(cur[1],b)
        else: un+=cur[1]-cur[0]; cur=[a,b]
    un+=cur[1]-cur[0]
    flag.append((d,tot,span,un,len({x[3]['forare'] for x in act}),act))
bad=[f for f in flag if f[1]>f[3]+10]   # summa G15 större än tidsunionen
print('dagar med G15>0:',len(flag),' dagar där summa G15 > unionen av skifttider (+10 min):',len(bad))
print('per år:',sorted(collections.Counter(f[0][:4] for f in bad).items()))
print('G15-summa >24h/dygn:',sum(1 for f in flag if f[1]>24*60))
R={r['sha256']:r for r in csv.DictReader(open('941_rapporter.csv',encoding='utf-8-sig'))}
rows=[]
for d,tot,span,un,nd,act in sorted(bad):
    rows.append(dict(datum=d,sum_g15_min=round(tot),union_min=un,span_min=span,forare=';'.join(sorted({x[3]['forare'] for x in act})),objekt=';'.join(sorted({x[3]['objekt'][:25] for x in act})),
        identiteter=';'.join(sorted({R[x[3]['sha256']]['maskinidentitet'] or '-' for x in act if x[3]['sha256'] in R})),agg=';'.join(sorted({R[x[3]['sha256']]['aggregatmodell'] for x in act if x[3]['sha256'] in R})),
        avsandare=';'.join(sorted({R[x[3]['sha256']]['avsandare'].split('@')[0] for x in act if x[3]['sha256'] in R}))))
w=csv.DictWriter(open('941_parallella_dagar.csv','w',encoding='utf-8-sig',newline=''),fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
for r in rows[:25]: print(r['datum'],r['sum_g15_min'],r['union_min'],r['forare'],'|',r['objekt'][:50],'|',r['identiteter'],r['agg'][:12],r['avsandare'])
