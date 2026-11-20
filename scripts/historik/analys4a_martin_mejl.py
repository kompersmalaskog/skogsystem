import json,re
from pathlib import Path
from email import message_from_bytes
from email.utils import parsedate_to_datetime
import inventera as I
IMP=Path('C:/Users/lindq/skogsystem-import')
out=open(IMP/'martin_mejl_2019_2020.jsonl','w',encoding='utf-8')
n=0
for mbox in sorted(IMP.rglob('*.mbox')):
    konto=next((p for p in mbox.relative_to(IMP).parts if p.startswith('takeout')),mbox.parent.name)
    for i,raw in enumerate(I.iter_mbox(mbox),1):
        try:
            # snabbfilter på rubriker före full tolkning
            head=raw[:6000]
            if b'artin' not in head: continue
            msg=message_from_bytes(raw)
            fr=I.dekoda(msg.get('From')).lower()
            if 'martin.lindqvist@kompersmalaskog.com' not in fr: continue
            try: d=parsedate_to_datetime(msg.get('Date')).strftime('%Y-%m-%d')
            except Exception: continue
            if not ('2019-07-01'<=d<='2020-02-29'): continue
            att=[]
            for p in msg.walk():
                if p.is_multipart(): continue
                fn=I.dekoda(p.get_filename()); ct=p.get_content_type()
                if fn or not ct.startswith('text/'):
                    pl=p.get_payload(decode=True) or b''
                    att.append(dict(namn=fn,typ=ct,bytes=len(pl)))
            to=I.dekoda(msg.get('To'))
            out.write(json.dumps(dict(konto=konto,datum=d,amne=I.dekoda(msg.get('Subject')),till=to[:80],bilagor=att),ensure_ascii=False)+'\n'); n+=1
        except Exception: pass
print('klar',n)
