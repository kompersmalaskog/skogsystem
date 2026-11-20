import os,re,json,urllib.request,urllib.parse,sys
def env():
    d={}
    for l in open('C:/Kompersmåla Skog/Kompersmåla Skog/Appen/skogsystem-claude/.env.local',encoding='utf-8'):
        m=re.match(r'([A-Z_]+)=(.*)',l.strip())
        if m: d[m.group(1)]=m.group(2).strip().strip('"').strip("'")
    return d
E=env(); URL=E['NEXT_PUBLIC_SUPABASE_URL']; KEY=E['NEXT_PUBLIC_SUPABASE_ANON_KEY']
def get(path,params=None,key=None):
    q=('?'+urllib.parse.urlencode(params,safe=',.()*')) if params else ''
    req=urllib.request.Request(f"{URL}/rest/v1/{path}{q}",headers={'apikey':key or KEY,'Authorization':'Bearer '+(key or KEY)})
    with urllib.request.urlopen(req,timeout=60) as r: return json.loads(r.read())
if __name__=='__main__':
    spec=get('')
    for t in ('fakt_tid','fakt_produktion','dim_objekt','dim_maskin','fakt_lass'):
        print(t,list(spec['definitions'].get(t,{}).get('properties',{}).keys()))
