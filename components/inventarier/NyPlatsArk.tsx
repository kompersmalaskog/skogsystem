'use client';

// Ny plats (admin). Namn och typ först; en bil får sin förare (den som håller listan), ett depåskåp sin skotare
// (skåpet följer maskinen). Väljs en skotare och namnet är tomt föreslås "Depåskåp <maskin>".

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { INAKTIV, KNAPP } from '@/lib/design/tokens';
import { skapaPlats } from '@/lib/inventarier/data';
import type { Inventarier, PlatsTyp } from '@/lib/inventarier/typer';
import { maskinNamn } from '@/lib/inventarier/vy';
import { ArkFel, ValRad } from './delar';

type Vy = 'form' | 'forare' | 'skotare';

const TYPER: { typ: PlatsTyp; titel: string; under: string }[] = [
  { typ: 'bil', titel: 'Bil', under: 'Det som ligger i en förares bil' },
  { typ: 'skap', titel: 'Depåskåp', under: 'Följer en skotare' },
  { typ: 'verkstad', titel: 'Verkstad', under: 'En verkstad som har grejer åt oss' },
  { typ: 'hall', titel: 'Hall eller förråd', under: 'Där förbrukningen ligger' },
];

export default function NyPlatsArk({ inv, onStang, onKlar }: {
  inv: Inventarier;
  onStang: () => void;
  onKlar: (kvitto: string, platsId: string) => void;
}) {
  const [vy, setVy] = useState<Vy>('form');
  const [namn, setNamn] = useState('');
  const [typ, setTyp] = useState<PlatsTyp>('bil');
  const [forareId, setForareId] = useState<string | null>(null);
  const [maskinId, setMaskinId] = useState<string | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);

  const forare = forareId ? inv.personer.find(p => p.id === forareId) ?? null : null;
  const skotare = maskinId ? inv.maskiner.find(m => m.maskin_id === maskinId) ?? null : null;
  const skotarna = inv.maskiner.filter(m => m.aktiv && m.maskin_typ === 'Forwarder');
  const giltigt = !!namn.trim();

  async function korSpara() {
    if (!giltigt) return;
    setSparar(true); setFel(null);
    const ordning = Math.max(0, ...inv.platser.map(p => p.ordning)) + 1;
    const s = await skapaPlats({
      namn: namn.trim(), typ,
      maskin_id: typ === 'skap' ? maskinId : null,
      ansvarig_medarbetare_id: typ === 'bil' ? forareId : null,
      ordning,
    });
    setSparar(false);
    if (!s.ok) { setFel(s.fel); return; }
    onKlar(`${s.varde.namn} tillagd`, s.varde.id);
  }

  const fot = vy === 'form' ? (
    <button type="button" onClick={korSpara} data-testid="spara-plats"
      style={{ ...KNAPP.primar, ...((!giltigt || sparar) ? INAKTIV : null) }}>
      {sparar ? 'Sparar…' : 'Lägg till plats'}
    </button>
  ) : undefined;

  return (
    <Ark rubrik={vy === 'forare' ? 'Förare' : vy === 'skotare' ? 'Skotare' : 'Ny plats'}
      onStang={() => (vy === 'form' ? onStang() : setVy('form'))} fot={fot}>
      {vy === 'form' && (
        <>
          <Falt etikett="Namn" value={namn} onChange={setNamn} placeholder={typ === 'bil' ? 'Stefans bil' : typ === 'skap' ? 'Depåskåp Wisent' : 'Maskinhallen'} autoFocus />
          <Sektion rubrik="Vad är det?" kort={false}>
            {TYPER.map((t, i) => (
              <ValRad key={t.typ} titel={t.titel} under={t.under} vald={typ === t.typ} onTryck={() => setTyp(t.typ)}
                sista={i === TYPER.length - 1} attr={{ 'data-platstyp': t.typ }} />
            ))}
          </Sektion>
          {typ === 'bil' && (
            <Sektion rubrik="Vem kör den? (valfritt)" kort={false} not="Föraren ser sin bil först.">
              <Rad titel="Förare" hoger={forare?.namn ?? 'Ingen vald'} onTryck={() => setVy('forare')} sista />
            </Sektion>
          )}
          {typ === 'skap' && (
            <Sektion rubrik="Vilken skotare? (valfritt)" kort={false}>
              <Rad titel="Skotare" hoger={maskinNamn(skotare) ?? 'Ingen vald'} onTryck={() => setVy('skotare')} sista />
            </Sektion>
          )}
          <ArkFel fel={fel} />
        </>
      )}

      {vy === 'forare' && (
        <Sektion rubrik="Förare" kort={false}>
          <ValRad titel="Ingen vald" vald={forareId == null} onTryck={() => { setForareId(null); setVy('form'); }} />
          {inv.personer.map((p, i, alla) => (
            <ValRad key={p.id} titel={p.namn} vald={forareId === p.id} sista={i === alla.length - 1}
              onTryck={() => { setForareId(p.id); setVy('form'); }} />
          ))}
        </Sektion>
      )}

      {vy === 'skotare' && (
        <Sektion rubrik="Skotare" kort={false}>
          <ValRad titel="Ingen vald" vald={maskinId == null} onTryck={() => { setMaskinId(null); setVy('form'); }} />
          {skotarna.map((m, i, alla) => (
            <ValRad key={m.maskin_id} titel={maskinNamn(m)} vald={maskinId === m.maskin_id} sista={i === alla.length - 1}
              onTryck={() => {
                setMaskinId(m.maskin_id);
                if (!namn.trim()) setNamn(`Depåskåp ${maskinNamn(m)}`);
                setVy('form');
              }} />
          ))}
        </Sektion>
      )}
    </Ark>
  );
}
