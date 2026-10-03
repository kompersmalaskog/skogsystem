'use client';
// Sektionen "Markägaren" längst ner i GROT-objekt-arket i /oversikt-v2. Bara förman/admin ser den — GrotObjektArk
// renderar den enbart när onSpara skickats in, och förare kommer aldrig in i GROT-arket alls.
//
// Två fält, direktspar (ingen Spara-knapp):
//   • Bortkört senast — datumväljare + Rensa. Datumet sparas först när det är ett riktigt datum 2000–2100: medan man
//     skriver ger väljaren halvfärdiga värden (tomt, år 0002) som inte betyder "rensa".
//   • Mark — två knappar, Tål blött · Bara torrt/tjäle. Tryck på den valda knappen igen = ingen uppgift (null).
// Inget skäl-val: skälet är alltid markberedning/plantering och behövs inte.
//
// Sparningar går en i taget (kedja): ett datum som skrivs på tangentbordet ger flera värden efter varandra, och två
// verifierade skrivningar får inte korsa varandra. Fältet följer det SPARADE datumet (rad.senast) — men inte medan en
// sparning pågår, så en inmatning inte skrivs över. Misslyckas sparningen går fältet tillbaka till det sparade värdet
// och felet står i klartext; ett datum som inte finns i databasen får aldrig stå kvar i fältet.

import React, { useEffect, useRef, useState } from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { arRimligtSenast, MARKKRAV_KNAPPAR } from '@/lib/grotvy/format';
import type { GrotRad, GrotSkrivning } from '@/lib/grotvy/lista';
import { KNAPP_LITEN } from './ark-delar';

const DATUM_FALT = {
  flex: '1 1 auto', minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: `0 ${AVSTAND.m}px`,
  background: FARG.upphojt, color: FARG.text, border: 'none', borderRadius: RADIE.rad, fontFamily: 'inherit',
  ...TYP.text, ...TNUM, colorScheme: 'dark',
} as React.CSSProperties;

// Valt läge syns utan färg: fylld yta + bock. (Färg är aldrig ensam bärare — i solljus är orange nästan brunt.)
// `border` skrivs som hela shorthand-egenskapen, precis som i KNAPP_LITEN — en löst `borderColor` ovanpå den får React att
// varna när knappen växlar tillbaka till ovald ("don't mix shorthand and non-shorthand").
const VALD: React.CSSProperties = { background: FARG.fyllning, border: `0.5px solid ${FARG.text2}`, color: FARG.text, fontWeight: 600 };

export default function GrotMarkagaren({ rad, onSpara }: {
  rad: GrotRad;
  /** Verifierad sparning till dim_objekt. Returnerar null när det landade, annars ett felmeddelande. */
  onSpara: (patch: GrotSkrivning) => Promise<string | null>;
}) {
  const levande = useRef(true);
  useEffect(() => { levande.current = true; return () => { levande.current = false; }; }, []);

  const [lokal, setLokal] = useState<string>(rad.senast ?? '');
  const [vantar, setVantar] = useState(0); // sparningar i kö eller på väg
  const [fel, setFel] = useState<string | null>(null);
  const kedja = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => { if (vantar === 0) setLokal(rad.senast ?? ''); }, [rad.senast, vantar]);

  const spara = (patch: GrotSkrivning) => {
    setVantar((n) => n + 1); setFel(null);
    kedja.current = kedja.current.then(async () => {
      let felText: string | null;
      try { felText = await onSpara(patch); } catch { felText = 'Kunde inte spara. Försök igen.'; }
      if (!levande.current) return;
      setVantar((n) => n - 1);
      if (felText) setFel(felText);
    });
  };

  const valjDatum = (v: string) => {
    setLokal(v);
    if (arRimligtSenast(v)) spara({ grot_senast: v });
  };

  return (
    <div role="group" aria-label="Markägaren" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, paddingTop: AVSTAND.m, borderTop: `1px solid ${FARG.linje}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: AVSTAND.s }}>
        <div style={{ ...TYP.micro, color: FARG.text2 }}>Markägaren</div>
        {vantar > 0 && <div style={{ ...TYP.meta, color: FARG.text2 }}>Sparar…</div>}
      </div>

      <div style={{ ...TYP.meta, color: FARG.text2 }}>Bortkört senast</div>
      <div style={{ display: 'flex', gap: AVSTAND.s }}>
        <input type="date" value={lokal} min="2000-01-01" max="2100-12-31" aria-label="Bortkört senast"
          onChange={(e) => valjDatum(e.target.value)} style={DATUM_FALT} />
        {(lokal || rad.senast) && (
          <button onClick={() => spara({ grot_senast: null, grot_skal: null })} style={{ ...KNAPP_LITEN, flexGrow: 0, padding: `0 ${AVSTAND.l}px` }}>Rensa</button>
        )}
      </div>

      <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Mark</div>
      <div style={{ display: 'flex', gap: AVSTAND.s }}>
        {MARKKRAV_KNAPPAR.map((k) => {
          const vald = rad.markkrav === k.varde;
          return (
            <button key={k.varde} aria-pressed={vald} onClick={() => spara({ grot_markkrav: vald ? null : k.varde })}
              style={{ ...KNAPP_LITEN, flex: '1 1 0', minWidth: 0, padding: `0 ${AVSTAND.s}px`, textAlign: 'center', lineHeight: 1.2, ...(vald ? VALD : { color: FARG.text2 }) }}>
              {vald ? '✓ ' : ''}{k.etikett}
            </button>
          );
        })}
      </div>

      {fel && <div style={{ ...TYP.meta, color: FARG.orange }}>{fel}</div>}
    </div>
  );
}
