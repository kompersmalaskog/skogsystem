import csv,json,re,collections
inv={r['sha256']:r for r in csv.DictReader(open('inventering.csv',encoding='utf-8-sig'))}
T={}
for l in open('texter.jsonl',encoding='utf-8'):
    d=json.loads(l);T[d['sha']]=d['text']
F={}
for l in open('ponsse_aptman_full.jsonl',encoding='utf-8'):
    d=json.loads(l);F[d['sha']]=' '.join(d['pages'])
occ=collections.defaultdict(list)
for l in open('occurrences.jsonl',encoding='utf-8'):
    o=json.loads(l);occ[o['sha']].append(o)
pat=re.compile(r'scorpion|giant|gigant',re.I)
rows=[]
for sha,t in T.items():
    full=F.get(sha,t)
    m=pat.findall(full)
    fn=inv[sha]['filnamn']
    if not m and not pat.search(fn): continue
    # modelltext: ett utdrag runt träffen
    mm=re.search(r'.{0,25}(scorpion|giant|gigant).{0,30}',' '.join(full.split()),re.I)
    o=min(occ[sha],key=lambda o:o['datum'])
    rows.append(dict(sha256=sha[:10],format=inv[sha]['format'],mejldatum=o['datum'],rapportdatum=inv[sha]['rapportdatum'],avsandare=re.search(r'[\w.+-]+@[\w.-]+',o['fran']).group(0).lower() if re.search(r'@',o['fran']) else o['fran'],
        filnamn=fn,traff=','.join(sorted({x.lower() for x in m})),modelltext=(mm.group(0) if mm else '')))
rows.sort(key=lambda r:r['mejldatum'])
w=csv.DictWriter(open('scorpion_traffar.csv','w',encoding='utf-8-sig',newline=''),fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
print(len(rows),'träffar')
c=collections.Counter((r['format'],r['traff'],r['mejldatum'][:4]) for r in rows)
for k in sorted(c): print(k,c[k])
print(collections.Counter(r['avsandare'] for r in rows).most_common())
print(collections.Counter(r['modelltext'][:60] for r in rows if r['format']!='ponsse_maskinspecifik_summering').most_common(12))
