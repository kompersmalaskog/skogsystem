import csv,collections
S=list(csv.DictReader(open('skift.csv',encoding='utf-8-sig')))
def mn(t): h,m=t.split(':'); return int(h)*60+int(m)
def iv(s):
    a,b=mn(s['tin']),mn(s['tut'])
    if b<a: b+=1440
    return a,b
act=[s for s in S if mn(s['g15'].split(':')[0]+':'+s['g15'].split(':')[1] if False else s['g15'])>0 or float(s['volym_m3fub'] or 0)>0]
g=collections.defaultdict(list)
for s in act: g[(s['maskin_namn'],s['datum'])].append(s)
out=[]
for (m,d),v in g.items():
    for i in range(len(v)):
        for j in range(i+1,len(v)):
            a,b=v[i],v[j]
            if a['forare']==b['forare']: continue
            (a1,a2),(b1,b2)=iv(a),iv(b)
            ov=min(a2,b2)-max(a1,b1)
            if ov>=15:  # minst 15 min överlapp
                out.append(dict(maskin_namn=m,datum=d,forare_a=a['forare'],in_a=a['tin'],ut_a=a['tut'],g15_a=a['g15'],forare_b=b['forare'],in_b=b['tin'],ut_b=b['tut'],g15_b=b['g15'],overlapp_min=ov,sha_a=a['sha256'][:8],sha_b=b['sha256'][:8]))
w=csv.DictWriter(open('overlapp.csv','w',encoding='utf-8-sig',newline=''),fieldnames=list(out[0]));w.writeheader();w.writerows(out)
print(len(out),'överlapp (>=15 min,olika förare, G15>0 eller volym>0)')
print(collections.Counter(o['maskin_namn'] for o in out))
for m in sorted({o['maskin_namn'] for o in out}):
    xs=[o for o in out if o['maskin_namn']==m]
    print(m,min(x['datum'] for x in xs),max(x['datum'] for x in xs),collections.Counter(x['datum'][:7] for x in xs).most_common(8))
    for x in xs[:4]: print('  ',x['datum'],x['forare_a'],x['in_a'],x['ut_a'],'|',x['forare_b'],x['in_b'],x['ut_b'],x['overlapp_min'])
