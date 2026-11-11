'use client';
// Cert › Behörigheter: svaret på "Är alla förare behöriga?" och en rad per förare. Tryck = förarens ark.
// Den här delen är EN sektion i Cert-vyn — dokument och påminnelser får egna sektioner bredvid senare.
import { useState } from 'react';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import Ikon from '@/components/design/Ikon';
import { AVSTAND, FARG, IKON, RAD, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { etikettText, sortera, svar, type Lage, type Person } from '@/lib/cert/behorighet';
import type { CertData } from '@/lib/cert/data';
import PersonArk from './PersonArk';

// Färgen förstärker bara: ordet ("saknas", "40 dagar") står alltid i etiketten.
const ETIKETT_FARG: Record<Lage, string> = { ok: FARG.text2, snart: FARG.orange, utgangen: FARG.rod, saknas: FARG.rod };

export default function Behorigheter({ data, idag, skapadAv, onSparat }: { data: CertData; idag: string; skapadAv: string | null; onSparat: () => void }) {
  const [vald, setVald] = useState<Person | null>(null);
  const personer = sortera(data.personer, idag);
  const s = svar(personer, idag);

  return (
    <>
      <Svarsrad rubrik={s.rubrik} rad={s.rad} avvikelse={s.avvikelse} fri={s.tomt} stor />
      {personer.length === 0 ? (
        <p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Ingen förare är vald. Välj vilka som kör maskin under Utbildning › SYN avverkning.</p>
      ) : (
        <Sektion rubrik="Behörigheter">
          {personer.map((p, i) => (
            <button key={p.id} type="button" onClick={() => setVald(p)} data-cert-person={p.id}
              style={{ border: 'none', ...RAD, borderBottom: i === personer.length - 1 ? 'none' : RAD.borderBottom, width: '100%', boxSizing: 'border-box', background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minHeight: TRAFFYTA.min }}>
              <span style={{ ...TYP.listtitel, color: FARG.text, flexShrink: 0 }}>{p.namn}</span>
              <span style={{ flex: 1, display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: AVSTAND.xs }}>
                {p.behorigheter.map(b => {
                  const e = etikettText(b, idag);
                  return (
                    <span key={b.typId} data-cert-etikett={e.lage}
                      style={{ ...TYP.meta, color: ETIKETT_FARG[e.lage], background: FARG.fyllning, borderRadius: RADIE.rad, padding: `${AVSTAND.xs}px ${AVSTAND.s}px`, whiteSpace: 'nowrap' }}>
                      {e.text}
                    </span>
                  );
                })}
              </span>
              <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />
            </button>
          ))}
        </Sektion>
      )}
      {vald && (
        <PersonArk person={vald} vaxlar={data.vaxlar} idag={idag} skapadAv={skapadAv}
          onStang={() => setVald(null)} onSparat={() => { setVald(null); onSparat(); }} />
      )}
    </>
  );
}
