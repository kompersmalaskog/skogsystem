import csv,json,re,collections
inv={r['sha256']:r for r in csv.DictReader(open('inventering.csv',encoding='utf-8-sig'))}
T={}
for l in open('texter.jsonl',encoding='utf-8'):
    d=json.loads(l);T[d['sha']]=d['text']
occ=[json.loads(l) for l in open('occurrences.jsonl',encoding='utf-8')]
W=lambda d:'2019-07-01'<=d<='2020-02-29'
# a) "Bear" i textlager eller filnamn/ämne, mejldatum i fönstret
hits=[]
for o in occ:
    if not W(o['datum']): continue
    t=T.get(o['sha'],'')
    why=[k for k,v in (('text',re.search(r'bear',t,re.I)),('filnamn',re.search(r'bear',o['filnamn'],re.I)),('ämne',re.search(r'bear',o['amne'],re.I))) if v]
    if why: hits.append((o,why))
print('A) PDF-förekomster med "Bear" (text/filnamn/ämne), mejldatum 2019-07..2020-02:',len(hits))
for o,why in sorted(hits,key=lambda h:h[0]['datum']): print(' ',o['datum'],inv[o['sha']]['format'],o['fran'][:38],'|',o['filnamn'][:40],'|',','.join(why))
# b) allt med Bear i texten oavsett datum, per år + format
c=collections.Counter()
for sha,t in T.items():
    if re.search(r'\bbear\b',t,re.I): c[(inv[sha]['format'],(inv[sha]['rapportdatum'] or inv[sha]['mejldatum'])[:4])]+=1
print('B) "Bear" i textlager, alla datum, per format/år:',sorted(c.items()))
# c) Martins mejl med PDF i fönstret
mar=[o for o in occ if W(o['datum']) and 'martin.lindqvist@kompersmalaskog.com' in o['fran'].lower()]
print('C) Martins PDF-förekomster i fönstret:',len(mar))
cm=collections.Counter((o['datum'][:7],inv[o['sha']]['format']) for o in mar)
for k in sorted(cm): print('  ',k,cm[k])
alla=collections.Counter((o['datum'][:7]) for o in occ if W(o['datum']))
print('alla avsändare, PDF per månad i fönstret:',sorted(alla.items()))
print('avsändare i fönstret:',collections.Counter(re.search(r'[\w.+-]+@[\w.-]+',o['fran']).group(0).lower() if re.search(r'[\w.+-]+@',o['fran']) else o['fran'] for o in occ if W(o['datum'])).most_common(8))
