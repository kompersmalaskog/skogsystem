import csv,collections
from datetime import date
rm=list(csv.DictReader(open('rapport_maskin.csv',encoding='utf-8-sig')))
inv={r['sha256']:r for r in csv.DictReader(open('inventering.csv',encoding='utf-8-sig'))}
life={}
for r in csv.DictReader(open('ponsse_lifetid.csv',encoding='utf-8-sig')): life.setdefault(r['sha'],r)
Ponsse=lambda r:r['format']=='ponsse_maskinspecifik_summering'
rows=[]
for r in rm:
    if r['format']!='ponsse_maskinspecifik_summering': continue
    mod=inv[r['sha256']]['maskinmodell']
    nm={'Ponsse Bear 2015':'Bear','Ponsse Scorpion King':'Scorpion King','Ponsse Elephant King Af':'Elephant King gammal','Ponsse Elephant King 2015':'Elephant King ny','Ponsse Wisent 2015':'Wisent'}.get(mod)
    if nm: rows.append((nm,r['datum'],r['maskin_namn']=='exkludera'))
M=['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec']
for nm in ('Bear','Scorpion King','Elephant King gammal','Elephant King ny','Wisent'):
    rs=[r for r in rows if r[0]==nm]
    c=collections.Counter((r[1][:4],int(r[1][5:7])) for r in rs)
    y0,y1=min(r[1][:4] for r in rs),max(r[1][:4] for r in rs)
    print(f'\n### {nm} ({len(rs)} rapporter, varav {sum(1 for r in rs if r[2])} exkl. månads-/årsrapporter)')
    print('| År | '+' | '.join(M)+' | Σ |'); print('|---|'+'---|'*13)
    for y in range(int(y0),int(y1)+1):
        print(f'| {y} | '+' | '.join(str(c[(str(y),m)]) if c[(str(y),m)] else '·' for m in range(1,13))+f' | {sum(c[(str(y),m)] for m in range(1,13))} |')
# luckor i livstidstimmar
print('\nLUCKOR (>45 dagar mellan rapporter, med förbrukade livstidstimmar):')
L=list(csv.DictReader(open('ponsse_lifetid.csv',encoding='utf-8-sig')))
nm2={'Ponsse Bear 2015':'Bear','Ponsse Scorpion King':'Scorpion King','Ponsse Elephant King Af':'EK gammal','Ponsse Elephant King 2015':'EK ny','Ponsse Wisent 2015':'Wisent'}
for mod,nm in nm2.items():
    xs=sorted([x for x in L if x['modell']==mod],key=lambda x:(x['datum'],int(x['timmar'])))
    for a,b in zip(xs,xs[1:]):
        d=(date.fromisoformat(b['datum'])-date.fromisoformat(a['datum'])).days
        if d>45: print(f"  {nm}: {a['datum']} (h {a['timmar']}) -> {b['datum']} (h {b['timmar']}): {d} dagar, {int(b['timmar'])-int(a['timmar'])} h utan rapport")
E=0
