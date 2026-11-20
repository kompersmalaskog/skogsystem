import csv,json,re,collections
R=list(csv.DictReader(open('941_rapporter.csv',encoding='utf-8-sig')))
T={}
for l in open('texter.jsonl',encoding='utf-8'):
    d=json.loads(l); T[d['sha']]=d['text'].replace('\xa0',' ')
def hm(s): h,m=s.split(':'); return int(h)+int(m)/60
rows=[]
for r in R:
    t=T[r['sha256']]
    m=re.search(r'Motortid (\d+:\d\d) (\d+:\d\d)',t); b=re.search(r'Bränsle \(l\) (\d+) (\d+)',t); dd=re.search(r'Distans \(km\) ([\d,]+) ([\d,]+)',t)
    if not m: continue
    rows.append(dict(datum=r['datum'],motor_tot=hm(m.group(2)),motor_rap=hm(m.group(1)),bransle_tot=int(b.group(2)) if b else None,dist_tot=float(dd.group(2).replace(',','.')) if dd else None,
        id=r['maskinidentitet'] or '-',agg=r['aggregatmodell'],modell=r['modell'],avs=r['avsandare'].split('@')[0],sha=r['sha256'][:8],fil=r['filnamn']))
rows.sort(key=lambda x:(x['datum'],x['motor_tot']))
print(len(rows),'rapporter med livstidsräknare')
# monotonitet: räknare får aldrig minska över tid för EN maskin
viol=0;prev=None;bad=[]
mx=0
for x in rows:
    if x['motor_tot']+0.5<mx: bad.append(x)
    mx=max(mx,x['motor_tot'])
print('rapporter där livstids-motortid ligger UNDER tidigare max (ex. >0,5 h):',len(bad))
# serier: tilldela till spår
tracks=[]
for x in rows:
    best=None
    for t in tracks:
        if x['motor_tot']>=t[-1]['motor_tot']-0.5:
            if best is None or t[-1]['motor_tot']>best[-1]['motor_tot']: best=t
    if best is None: tracks.append([x])
    else: best.append(x)
print('minsta antal icke-avtagande serier (spår):',len(tracks),[len(t) for t in tracks])
# växande: timmar per år
import itertools
byy=collections.defaultdict(list)
for x in rows: byy[x['datum'][:4]].append(x['motor_tot'])
for y in sorted(byy): print(y,len(byy[y]),'min',round(min(byy[y])),'max',round(max(byy[y])))
for x in bad[:15]: print(x['datum'],round(x['motor_tot']),x['id'],x['agg'],x['avs'],x['fil'])
w=csv.DictWriter(open('941_livstidsrakning.csv','w',encoding='utf-8-sig',newline=''),fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
