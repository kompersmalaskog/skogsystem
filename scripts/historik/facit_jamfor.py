import csv,json,re,difflib,collections
IMP='C:/Users/lindq/skogsystem-import'
F=json.load(open(IMP+'/facit_skogsystem.json',encoding='utf-8'))
objs={str(o['objekt_id']):o for o in F['objs']}
MAP={'Rottne H8E Logmax':'R64101','Rottne H8E 2026':'R64428','Ponsse Wisent':'A030353','Elephant King gammal':'A110148','Elephant King ny':'A130743'}
def norm(s): return re.sub(r'[^a-zåäö0-9 ]','',(s or '').lower()).split()
def sim(a,b):
    na,nb=norm(a),norm(b)
    if not na or not nb: return 0
    if set(na)==set(nb): return 1
    r=difflib.SequenceMatcher(None,' '.join(na),' '.join(nb)).ratio()
    s,l=(set(na),set(nb)) if len(na)<=len(nb) else (set(nb),set(na))
    if len(s)>=2 and s<=l: r=max(r,0.95)
    return r
def mm(sek): 
    return sek/3600
tid={tuple(k.split('|',1)):v for k,v in F['tid'].items()}
prod={tuple(k.split('|',1)):v for k,v in F['prod'].items()}
def hm(m): h,mi=m.split(':'); return int(h)+int(mi)/60
O=[o for o in csv.DictReader(open(IMP+'/objekt.csv',encoding='utf-8-sig')) if o['maskin_namn'] in MAP and o['senaste_for_nyckel']=='ja' and o['rapportdatum']>='2025-01-01']
rows=[];unm=[]
for o in O:
    mid=MAP[o['maskin_namn']]
    cands=[]
    for (m,oid) in tid:
        if m!=mid: continue
        ob=objs.get(oid,{})
        s=0
        if o['objektnr'] and (o['objektnr']==oid or o['objektnr']==str(ob.get('vo_nummer')) or o['objektnr']==str(ob.get('objektnr'))): s=1.5
        s=max(s,sim(o['objekt'],ob.get('object_name')))
        cands.append((s,oid))
    cands.sort(reverse=True)
    if not cands or cands[0][0]<0.85: unm.append(o); continue
    oid=cands[0][1]; ob=objs.get(oid,{})
    t=tid.get((mid,oid),[0,0,0]); p=prod.get((mid,oid),[0,0,0])
    g15r=hm(o['g15']) if o['g15'] else None; g15s=t[0]/3600
    vr=float(o['volym_m3fub']) if o['volym_m3fub'] else None
    rows.append(dict(maskin=o['maskin_namn'],rapport_objekt=o['objekt'],rapportdatum=o['rapportdatum'],ss_objekt=ob.get('object_name'),ss_id=oid,match=round(cands[0][0],2),
       vol_rapport=vr,vol_ss=round(p[0],1) if mid.startswith('R') else None,g15_rapport=round(g15r,1) if g15r else None,g15_ss=round(g15s,1),
       bransle_rapport=float(o['bransle_l']) if o['bransle_l'] else None,bransle_ss=round(t[1])))
def pct(a,b): return None if a in(None,0) or b is None else round(100*(b-a)/a,1)
for r in rows:
    r['d_vol_pct']=pct(r['vol_rapport'],r['vol_ss']); r['d_g15_pct']=pct(r['g15_rapport'],r['g15_ss']); r['d_bransle_pct']=pct(r['bransle_rapport'],r['bransle_ss'])
w=csv.DictWriter(open(IMP+'/facit_jamforelse.csv','w',encoding='utf-8-sig',newline=''),fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
print(len(O),'rapportobjekt 2025-26;',len(rows),'matchade;',len(unm),'ej matchade')
print('| Maskin | Objekt (rapport) | Rapport | Vol rapp | Vol SS | Δvol % | G15 rapp | G15 SS | ΔG15 % | Bränsle Δ % |'); print('|---|---|---|---|---|---|---|---|---|---|')
for r in sorted(rows,key=lambda r:(r['maskin'],r['rapportdatum'])):
    print(f"| {r['maskin']} | {r['rapport_objekt'][:28]} | {r['rapportdatum']} | {r['vol_rapport'] if r['vol_rapport'] is not None else ''} | {r['vol_ss'] if r['vol_ss'] is not None else ''} | {r['d_vol_pct'] if r['d_vol_pct'] is not None else ''} | {r['g15_rapport']} | {r['g15_ss']} | {r['d_g15_pct'] if r['d_g15_pct'] is not None else ''} | {r['d_bransle_pct'] if r['d_bransle_pct'] is not None else ''} |")
print('ej matchade:',collections.Counter(o['maskin_namn'] for o in unm))
print([ (o['maskin_namn'],o['objekt'],o['rapportdatum']) for o in unm][:12])
