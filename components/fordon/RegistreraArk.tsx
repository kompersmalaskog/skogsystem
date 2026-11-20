'use client';

// Registrera — "vad gjordes, och när?". Det som krävs först (vilken kontroll, datum), det valfria sist och märkt.
// Nästa datum räknas av appen (datum + kontrollens intervall) och står under fältet; en kontroll utan
// intervall (cisternkontroll) frågar efter nästa datum i stället. Spara är grå tills det som krävs finns.

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Sektion from '@/components/design/Sektion';
import { INAKTIV, KNAPP } from '@/lib/design/tokens';
import { fmtDatumLang, type Resurs } from '@/lib/kontroller-format';
import { fordonsKontroller, kontrollNamn, nastaDatum } from '@/lib/fordon/vy';
import { ArkFel, ValRad, idagLokal } from './delar';

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export default function RegistreraArk({ resurs, forvald, onStang, onSparad }: {
  resurs: Resurs;
  forvald: string | null;
  onStang: () => void;
  onSparad: () => void;
}) {
  const kontroller = fordonsKontroller(resurs);
  const [kontrollId, setKontrollId] = useState<string | null>(forvald ?? (kontroller.length === 1 ? kontroller[0].id : null));
  const [datum, setDatum] = useState(idagLokal());
  const [nasta, setNasta] = useState('');
  const [utfordAv, setUtfordAv] = useState('');
  const [kostnad, setKostnad] = useState('');
  const [anteckning, setAnteckning] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const vald = kontroller.find(k => k.id === kontrollId) ?? null;
  const raknat = vald && DATUM.test(datum) ? nastaDatum(vald, datum) : null;
  const behoverNasta = !!vald && vald.intervall_manader == null;
  const kanSpara = !!vald && DATUM.test(datum) && (!behoverNasta || (DATUM.test(nasta) && nasta > datum)) && !sparar;

  async function spara() {
    if (!kanSpara || !vald) return;
    setSparar(true); setFel(null);
    const k = parseInt(kostnad.replace(/\s/g, ''), 10);
    try {
      const res = await fetch('/api/handelse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resurs_id: resurs.id,
          kontroll_id: vald.id,
          typ: vald.typ,
          datum,
          nasta_forfall: behoverNasta ? nasta : null,
          utford_av: utfordAv.trim() || null,
          kostnad: Number.isFinite(k) ? k : null,
          anteckning: anteckning.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) { setFel(`Kunde inte spara: ${body.error || res.status}. Försök igen.`); setSparar(false); return; }
      onSparad();
    } catch {
      setFel('Kunde inte spara. Kontrollera täckningen och försök igen.');
      setSparar(false);
    }
  }

  return (
    <Ark rubrik="Registrera" onStang={onStang}
      fot={<>
        <button type="button" onClick={spara} disabled={!kanSpara}
          style={{ ...KNAPP.primar, ...(kanSpara ? null : INAKTIV) }} data-testid="spara-registrering">
          {sparar ? 'Sparar…' : 'Spara'}
        </button>
        <ArkFel fel={fel} />
      </>}>

      <Sektion rubrik="Vad gjordes?" kort={false}>
        {kontroller.map((k, i) => (
          <ValRad key={k.id} titel={kontrollNamn(k.typ)} vald={kontrollId === k.id} onTryck={() => setKontrollId(k.id)}
            sista={i === kontroller.length - 1} attr={{ 'data-kontroll': k.typ }} />
        ))}
      </Sektion>

      <Falt etikett="När?" value={datum} onChange={setDatum} typ="date" name="datum"
        stod={raknat ? `Nästa gång: ${fmtDatumLang(raknat)}` : undefined} />

      {behoverNasta && (
        <Falt etikett="Nästa gång" value={nasta} onChange={setNasta} typ="date" name="nasta"
          stod={nasta && DATUM.test(nasta) && nasta <= datum ? 'Nästa gång måste vara efter datumet ovan.' : `${kontrollNamn(vald!.typ)} har inget fast intervall.`} />
      )}

      <Sektion rubrik="Valfritt" kort={false}>
        <Falt etikett="Vem gjorde det?" value={utfordAv} onChange={setUtfordAv} placeholder="Bilprovningen, Dekra…" name="utford_av" />
        <Falt etikett="Kostnad" value={kostnad} onChange={setKostnad} inputMode="numeric" enhet="kr" name="kostnad" />
        <Falt etikett="Anteckning" value={anteckning} onChange={setAnteckning} name="anteckning" />
      </Sektion>
    </Ark>
  );
}
