import sb_las as sb,csv,json,re,collections,urllib.parse
K=sb.env()['SUPABASE_SERVICE_ROLE_KEY']
IMP='C:/Users/lindq/skogsystem-import'
MAP={'Rottne H8E Logmax':'R64101','Rottne H8E 2026':'R64428','Ponsse Wisent':'A030353','Elephant King gammal':'A110148','Elephant King ny':'A130743'}
def pages(table,select,flt):
    out=[];off=0
    while True:
        r=sb.get(table,{'select':select,'order':'id','limit':'1000','offset':str(off),**flt},key=K)
        out+=r
        if len(r)<1000: break
        off+=1000
    return out
tid=collections.defaultdict(lambda:[0,0,0])  # (maskin,objekt) -> [g15_sek, bransle, rows]
prod=collections.defaultdict(lambda:[0.0,0,0])
for mid in set(MAP.values()):
    for r in pages('fakt_tid','id,datum,maskin_id,objekt_id,processing_sek,terrain_sek,other_work_sek,bransle_liter',{'maskin_id':'eq.'+mid,'datum':'gte.2024-12-01'}):
        a=tid[(mid,r['objekt_id'])]; a[0]+=(r['processing_sek'] or 0)+(r['terrain_sek'] or 0)+(r['other_work_sek'] or 0); a[1]+=float(r['bransle_liter'] or 0); a[2]+=1
    if mid.startswith('R'):
        for r in pages('fakt_produktion','id,datum,maskin_id,objekt_id,volym_m3sub,stammar',{'maskin_id':'eq.'+mid,'datum':'gte.2024-12-01'}):
            a=prod[(mid,r['objekt_id'])]; a[0]+=float(r['volym_m3sub'] or 0); a[1]+=int(r['stammar'] or 0); a[2]+=1
objs=sb.get('dim_objekt',{'select':'objekt_id,object_name,vo_nummer,objektnr','limit':'5000','order':'objekt_id'},key=K)
print('dim_objekt',len(objs),'tid-objekt',len(tid),'prod-objekt',len(prod))
json.dump({'tid':{f'{k[0]}|{k[1]}':v for k,v in tid.items()},'prod':{f'{k[0]}|{k[1]}':v for k,v in prod.items()},'objs':objs},open(IMP+'/facit_skogsystem.json','w',encoding='utf-8'),ensure_ascii=False)
