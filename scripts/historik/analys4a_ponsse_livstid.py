import csv,json,re,collections
inv={r['sha256']:r for r in csv.DictReader(open('inventering.csv',encoding='utf-8-sig'))}
F={}
for l in open('ponsse_aptman_full.jsonl',encoding='utf-8'):
    d=json.loads(l);F[d['sha']]=d['pages'][0].replace('\xa0',' ')
def mail(s):
    m=re.search(r'[\w.+-]+@[\w.-]+',s); return m.group(0).lower() if m else s
rows=[]
for sha,t in F.items():
    r=inv[sha]
    if r['format']!='ponsse_maskinspecifik_summering': continue
    mod=re.search(r'^\d+\s+(Ponsse [^\n]+)\n([^\n]*)\nh (\d+)\n([^\n]*)\n([^\n]*)\n([^\n]*)',t,re.M)
    if not mod: continue
    foretag=re.search(r'Opti4G[^\n]*?(Kompersmåla Skog Ab|Kompersmåla Skog|Axsten[^\n]*)',t) or re.search(r'\n(Kompersmåla Skog[^\n]*|Axsten[^\n]*)\n',t)
    tf=re.search(r'(\d+)Totalförbrukning l',t)
    rows.append(dict(datum=r['rapportdatum'],modell=' '.join(mod.group(1).split()),maskin_id=mod.group(2).strip(),timmar=int(mod.group(3)),opti=mod.group(4).strip()[:28],huvud=mod.group(5).strip()[:14],foretag=(foretag.group(1).strip() if foretag else mod.group(6).strip())[:26],
         totalforbr=int(tf.group(1)) if tf else None,avsandare=mail(r['avsandare']).split('@')[0][:20],fil=r['filnamn'][:30],sha=sha[:8]))
rows.sort(key=lambda x:(x['datum'],x['timmar']))
w=csv.DictWriter(open('ponsse_lifetid.csv','w',encoding='utf-8-sig',newline=''),fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
for mod in sorted({r['modell'] for r in rows}):
    rs=[r for r in rows if r['modell']==mod]
    mx=0;bad=0
    tracks=[]
    for x in rs:
        best=None
        for t in tracks:
            if x['timmar']>=t[-1]['timmar']-1 and (best is None or t[-1]['timmar']>best[-1]['timmar']): best=t
        if best is None: tracks.append([x])
        else: best.append(x)
    print(mod,len(rs),rs[0]['datum'],rs[-1]['datum'],'timmar',rs[0]['timmar'],'->',rs[-1]['timmar'],'spår',[len(t) for t in tracks],'maskin-id',collections.Counter(r['maskin_id'] for r in rs).most_common(4),'foretag',collections.Counter(r['foretag'] for r in rs).most_common(3),'huvud',collections.Counter(r['huvud'] for r in rs).most_common(3))
    if len(tracks)>1:
        for t in tracks: print('   spår',len(t),t[0]['datum'],t[0]['timmar'],'->',t[-1]['datum'],t[-1]['timmar'],t[0]['maskin_id'])
