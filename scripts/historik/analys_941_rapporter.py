import csv,json,re,collections
inv={r['sha256']:r for r in csv.DictReader(open('inventering.csv',encoding='utf-8-sig'))}
T={}
for l in open('texter.jsonl',encoding='utf-8'):
    d=json.loads(l);T[d['sha']]=d['text']
def mail(s):
    m=re.search(r'[\w.+-]+@[\w.-]+',s); return m.group(0).lower() if m else s
rows=[]
for sha,r in inv.items():
    if r['format'] not in ('maxixplorer_drf','maxixplorer_produktionsrapport'): continue
    t=T[sha].replace('\xa0',' ')
    ch=re.search(r'Chassinummer\s+(\S+)',t)
    if not (ch and ch.group(1)=='9410013317') and r['chassinummer']!='9410013317': continue
    ag=re.search(r'Aggregatmodell\s+(.+)',t)
    rows.append(dict(sha256=sha,format=r['format'],datum=r['rapportdatum'] or r['mejldatum'],chassinummer=ch.group(1) if ch else '(saknas i text)',
      maskinidentitet=r['maskin_nr'],modell=r['maskinmodell'],aggregatmodell=ag.group(1).split()[0] if ag else '',
      aggregattillverkare=(re.search(r'Aggregattillverkare\s+(.+?)(?:\s{2,}|$)',t) or [0,''])[1].strip()[:30],
      programversion=r['programversion'],avsandare=mail(r['avsandare']),filnamn=r['filnamn']))
rows.sort(key=lambda x:x['datum'])
w=csv.DictWriter(open('941_rapporter.csv','w',encoding='utf-8-sig',newline=''),fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
print(len(rows),'rapporter; chassinr ej i text:',sum(1 for r in rows if r['chassinummer'].startswith('(')))
g=collections.defaultdict(list)
for r in rows: g[(r['maskinidentitet'] or '–',r['modell'] or '–',r['aggregatmodell'] or '–',r['chassinummer'])].append(r)
print('| identitet | modell | aggregat | prog | antal | första | sista |')
for k,v in sorted(g.items(),key=lambda kv:min(x['datum'] for x in kv[1])):
    d=sorted(x['datum'] for x in v); print(f'| {k[0]} | {k[1]} | {k[2]} | {k[3]} | {len(v)} | {d[0]} | {d[-1]} |')
