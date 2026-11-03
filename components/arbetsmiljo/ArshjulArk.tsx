'use client';

// Årshjulet: det som ska göras en gång om året, i månadsordning. Ett tryck på en punkt med egen vy (riskbedömning, skyddsrond) går dit;
// resten öppnas i samma ark med vad man gör, ett fält för vad ni bestämde och EN knapp: Gjort. Texterna: lib/arbetsmiljo/arshjul.ts.

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { supabase } from '@/lib/supabase';
import { MANADER, angraGjord, markeraGjord, type ManuellPunkt, type Rad as ArshjulRad } from '@/lib/arbetsmiljo/arshjul';

const TON = { orange: FARG.orange, gron: FARG.gron } as const;

export default function ArshjulArk({ ar, rader, onStang, onAndrat }: { ar: number; rader: ArshjulRad[]; onStang: () => void; onAndrat: () => void }) {
  const [vald, setVald] = useState<ManuellPunkt | null>(null);
  const [text, setText] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const rad = vald ? rader.find(r => r.punkt.id === vald) ?? null : null;

  const kor = async (f: () => Promise<string | null>) => {
    setSparar(true); setFel(null);
    const e = await f();
    setSparar(false);
    if (e) { setFel(e); return; }
    setVald(null); setText('');
    onAndrat();
  };

  if (rad && vald) {
    const gjord = !!rad.gjordTid;
    return (
      <Ark rubrik={rad.punkt.titel} stang={gjord ? 'Klar' : 'Avbryt'} onStang={() => { setVald(null); setFel(null); }}
        fot={gjord ? undefined : (
          <>
            {fel && <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: 0 }}>{fel}</p>}
            <button type="button" data-gjort disabled={sparar} onClick={() => void kor(() => markeraGjord(supabase, ar, vald, text))}
              style={{ ...KNAPP.primar, ...(sparar ? INAKTIV : {}) }}>{sparar ? 'Sparar …' : 'Gjort'}</button>
          </>
        )}>
        <p style={{ ...TYP.text, color: FARG.text, margin: 0 }}>{rad.punkt.vad}</p>
        {gjord ? (
          <div style={{ marginTop: AVSTAND.l }}>
            <p style={{ ...TYP.listtitel, color: FARG.gron, margin: 0 }}>✓ {rad.under}</p>
            {rad.anteckning && <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>{rad.anteckning}</p>}
            {fel && <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: `${AVSTAND.m}px 0 0` }}>{fel}</p>}
            <button type="button" data-angra disabled={sparar} onClick={() => void kor(() => angraGjord(supabase, ar, vald))}
              style={{ ...KNAPP.tertiar, marginTop: AVSTAND.l }}>Ångra – inte gjord</button>
          </div>
        ) : (
          <div style={{ marginTop: AVSTAND.l }}>
            <Sektion rubrik="Vad bestämde ni? (frivilligt)" kort={false}>
              <textarea value={text} onChange={e => setText(e.target.value)} aria-label="Vad bestämde ni?" rows={3} maxLength={500}
                style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min * 2, border: 'none', borderRadius: RADIE.rad, background: FARG.upphojt, color: FARG.text, padding: AVSTAND.m, fontFamily: 'inherit', ...TYP.text, outline: 'none', resize: 'vertical' }} />
            </Sektion>
          </div>
        )}
      </Ark>
    );
  }

  const gjorda = rader.filter(r => r.gjordTid).length;
  return (
    <Ark rubrik={`Året ${ar}`} stang="Klar" onStang={onStang}>
      <p data-arshjul-svar style={{ ...TYP.text, color: FARG.text2, margin: `0 0 ${AVSTAND.m}px` }}>
        {gjorda === rader.length ? 'Allt är gjort i år.' : `${gjorda} av ${rader.length} gjort i år.`}
      </p>
      <Sektion rubrik="Det här ska göras varje år" kort={false}>
        {rader.map((r, i) => {
          const manuell = !r.punkt.href;
          return (
            <Rad key={r.punkt.id} sista={i === rader.length - 1} attr={{ 'data-arshjul': r.punkt.id }}
              titel={r.gjordTid ? <>✓ {r.punkt.titel}</> : r.punkt.titel}
              under={<span style={{ color: r.ton ? TON[r.ton] : FARG.text2 }}>{r.under}</span>}
              hoger={<span style={{ color: FARG.text2 }}>{MANADER[r.punkt.manad - 1]}</span>}
              href={r.punkt.href}
              onTryck={manuell ? () => { setVald(r.punkt.id as ManuellPunkt); setText(''); setFel(null); } : undefined} />
          );
        })}
      </Sektion>
    </Ark>
  );
}
