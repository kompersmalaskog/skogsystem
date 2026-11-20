import json,re,collections
from pathlib import Path
from email import message_from_bytes
from email.utils import parsedate_to_datetime
import inventera as I
IMP=Path('C:/Users/lindq/skogsystem-import')
c=collections.Counter(); out=open(IMP/'xps_rep_bilagor.jsonl','w',encoding='utf-8')
for mbox in sorted(IMP.rglob('*.mbox')):
    konto=next((p for p in mbox.relative_to(IMP).parts if p.startswith('takeout')),mbox.parent.name)
    for i,raw in enumerate(I.iter_mbox(mbox),1):
        if b'xps' not in raw[:200000].lower() and b'.rep' not in raw[:200000].lower(): continue
        try:
            msg=message_from_bytes(raw)
            try: d=parsedate_to_datetime(msg.get('Date')).strftime('%Y-%m-%d')
            except Exception: d=''
            fr=re.search(r'[\w.+-]+@[\w.-]+',I.dekoda(msg.get('From')) or '')
            for p in msg.walk():
                if p.is_multipart(): continue
                fn=I.dekoda(p.get_filename()); ext=fn.lower().rsplit('.',1)[-1] if '.' in fn else ''
                if ext in('xps','rep','oxps'):
                    out.write(json.dumps(dict(konto=konto,datum=d,fran=fr.group(0).lower() if fr else '',amne=I.dekoda(msg.get('Subject'))[:60],namn=fn,ext=ext,bytes=len(p.get_payload(decode=True) or b'')),ensure_ascii=False)+'\n')
        except Exception: pass
print('klar')
