'use client';
// Arket för ETT krav: vad som krävs (underlag, hur ofta, var det finns idag) och de två bockarna Klart och
// Uppladdat hos SE. Spara är grå tills något ändrats. Ett krav som räknas ur Utbildning har ingen Klart-bock:
// det visar läget i Utbildning och en knapp dit.
import { useState } from 'react';
import Link from 'next/link';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import { Toggle } from '@/components/utbildning/ui';
import { AVSTAND, FARG, INAKTIV, KNAPP, RAD, TYP } from '@/lib/design/tokens';
import { LIGGARE, STATUS_TEXT, status, utbRader, type Krav, type UtbLage } from '@/lib/cert/krav';
import { sparaKrav } from '@/lib/cert/data';

export default function KravArk({ krav, utb, onStang, onSparat }: { krav: Krav; utb?: UtbLage; onStang: () => void; onSparat: () => void }) {
  const urUtbildning = krav.kalla === 'utbildning';
  const liggare = krav.kravNr === LIGGARE;
  const [klar, setKlar] = useState(krav.klar);
  const [se, setSe] = useState(krav.uppladdadSe);
  const [sparar, setSparar] = useState(false);
  const [felText, setFelText] = useState<string | null>(null);
  const harVaxlar = !urUtbildning || liggare;
  const andrad = (!urUtbildning && klar !== krav.klar) || (harVaxlar && se !== krav.uppladdadSe);
  const kanSpara = andrad && !sparar;

  async function spara() {
    setSparar(true); setFelText(null);
    try {
      await sparaKrav(krav.kravNr, urUtbildning ? { uppladdadSe: se } : { klar, uppladdadSe: se });
      onSparat();
    } catch (e: any) {
      setFelText(e?.message ?? 'Kunde inte spara.');
      setSparar(false);
    }
  }

  return (
    <Ark rubrik={krav.namn} onStang={onStang} stang={harVaxlar ? 'Avbryt' : 'Klar'}
      fot={harVaxlar ? <>
        {felText && <div role="alert" style={{ ...TYP.meta, color: FARG.rod }}>{felText}</div>}
        <button type="button" onClick={spara} disabled={!kanSpara} style={{ ...KNAPP.primar, ...(kanSpara ? null : INAKTIV) }}>
          {sparar ? 'Sparar…' : 'Spara'}
        </button>
      </> : undefined}>
      <Sektion rubrik={`SE-krav ${krav.kravNr}`} kort={false}>
        <Info etikett="Underlag" varde={krav.underlag} />
        <Info etikett="Hur ofta" varde={krav.hurOfta} />
        <Info etikett="Var det finns idag" varde={krav.varFinns} sista />
      </Sektion>

      {urUtbildning ? (
        <Sektion rubrik="Läget i Utbildning" kort={false}>
          <div data-cert-utb style={{ ...RAD, display: 'block' }}>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>{STATUS_TEXT[status(krav, utb)]}</div>
            {utbRader(krav, utb).map(r => <div key={r} style={{ ...TYP.text, color: FARG.text, marginTop: AVSTAND.xs }}>{r}</div>)}
          </div>
          {liggare && <VaxelRad titel="Uppladdat hos SE" pa={se} onByt={setSe} sista />}
          <Link href={utb?.typId ? `/utbildning/typ/${utb.typId}` : '/utbildning'}
            style={{ ...KNAPP.sekundar, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', boxSizing: 'border-box', marginTop: AVSTAND.m }}>
            Öppna Utbildning
          </Link>
        </Sektion>
      ) : (
        <Sektion rubrik="Status" kort={false}>
          <VaxelRad titel="Klart" pa={klar} onByt={setKlar} />
          <VaxelRad titel="Uppladdat hos SE" pa={se} onByt={setSe} sista />
        </Sektion>
      )}
    </Ark>
  );
}

function Info({ etikett, varde, sista }: { etikett: string; varde: string; sista?: boolean }) {
  return (
    <div style={{ ...RAD, display: 'block', borderBottom: sista ? 'none' : RAD.borderBottom }}>
      <div style={{ ...TYP.meta, color: FARG.text2 }}>{etikett}</div>
      <div style={{ ...TYP.text, color: FARG.text, marginTop: AVSTAND.xs }}>{varde}</div>
    </div>
  );
}

/** En rad med av/på. HELA raden är tryckytan (44 px) — själva reglaget är bara 31 px högt. */
function VaxelRad({ titel, pa, onByt, sista }: { titel: string; pa: boolean; onByt: (pa: boolean) => void; sista?: boolean }) {
  return (
    <div role="switch" aria-checked={pa} aria-label={titel} tabIndex={0} onClick={() => onByt(!pa)}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onByt(!pa); } }}
      style={{ ...RAD, justifyContent: 'space-between', cursor: 'pointer', borderBottom: sista ? 'none' : RAD.borderBottom }}>
      <span style={{ ...TYP.text, color: FARG.text }}>{titel}</span>
      <span aria-hidden style={{ pointerEvents: 'none', lineHeight: 0 }}><Toggle checked={pa} onChange={() => {}} /></span>
    </div>
  );
}
