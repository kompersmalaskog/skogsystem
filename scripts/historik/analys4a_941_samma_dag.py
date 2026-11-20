import csv,json,re,collections
S=[s for s in csv.DictReader(open('skift.csv',encoding='utf-8-sig')) if s['maskin_namn']=='Komatsu 941']
R={r['sha256']:r for r in csv.DictReader(open('941_rapporter.csv',encoding='utf-8-sig'))}
T={}
for l in open('texter.jsonl',encoding='utf-8'):
    d=json.loads(l)
    if d['sha'] in R: T[d['sha']]=d['text'].replace('\xa0',' ')
def apt(t):
    m=re.search(r'APT -fil namn\s+(.+)',t); return m.group(1).strip()[:40] if m else ''
by=collections.defaultdict(list)
for s in S:
    if float(s['g15_h'] or 0)<=0.05 and float(s['volym_m3fub'] or 0)==0: continue
    by[s['datum']].append(s)
multi={}
for d,v in by.items():
    objs={(x['objektnr'],x['objekt']) for x in v}
    if len({o[1].lower() for o in objs})>1: multi[d]=v
print('dagar med skift:',len(by),' dagar med >=2 olika objekt:',len(multi))
def mn(t): h,m=t.split(':'); return int(h)*60+int(m)
def iv(s):
    a,b=mn(s['tin']),mn(s['tut']); 
    return a,(b if b>=a else b+1440)
# tidsöverlapp mellan skift från olika objekt samma dag (G15>0)
conf=[]
for d,v in multi.items():
    for i in range(len(v)):
        for j in range(i+1,len(v)):
            a,b=v[i],v[j]
            if a['objekt'].lower()==b['objekt'].lower(): continue
            (a1,a2),(b1,b2)=iv(a),iv(b); ov=min(a2,b2)-max(a1,b1)
            conf.append((d,a,b,ov))
print('par olika objekt samma dag:',len(conf),' varav tidsöverlapp>0:',sum(1 for c in conf if c[3]>0),' >=30 min:',sum(1 for c in conf if c[3]>=30))
def attrs(s):
    r=R.get(s['sha256']); 
    return (r['maskinidentitet'] or '-',r['modell'],r['aggregatmodell'],r['programversion'][:5],r['avsandare'].split('@')[0][:22],apt(T.get(s['sha256'],''))) if r else ('?',)*6
rows=[]
for d,a,b,ov in sorted(conf,key=lambda c:(c[0],c[1]["tin"])):
    rows.append(dict(datum=d,objekt_a=a['objekt'],forare_a=a['forare'],in_a=a['tin'],ut_a=a['tut'],g15_a=a['g15'],id_a=attrs(a)[0],agg_a=attrs(a)[2],avs_a=attrs(a)[4],apt_a=attrs(a)[5],
                     objekt_b=b['objekt'],forare_b=b['forare'],in_b=b['tin'],ut_b=b['tut'],g15_b=b['g15'],id_b=attrs(b)[0],agg_b=attrs(b)[2],avs_b=attrs(b)[4],apt_b=attrs(b)[5],overlapp_min=ov))
w=csv.DictWriter(open('941_parallella.csv','w',encoding='utf-8-sig',newline=''),fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
print('per år:',sorted(collections.Counter(c[0][:4] for c in conf).items()))
print('fält som skiljer inom paren (antal par där a!=b):')
for k in ('id','agg','avs','apt'):
    print(' ',k,sum(1 for r in rows if r[k+'_a']!=r[k+'_b']),'av',len(rows))
for r in rows[:12]: print(r['datum'],r['objekt_a'][:18],r['forare_a'],r['in_a'],r['ut_a'],r['id_a'],r['agg_a'],r['avs_a'],'||',r['objekt_b'][:18],r['forare_b'],r['in_b'],r['ut_b'],r['id_b'],r['agg_b'],r['avs_b'],r['overlapp_min'])
