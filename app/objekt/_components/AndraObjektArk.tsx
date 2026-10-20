'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Manadsvaljare from '@/components/design/Manadsvaljare';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import { flyttaObjekt, taBortObjekt } from '@/lib/objekt/data';
import { manadEtikett, stegaManad, type Manad } from '@/lib/objekt/manad';

// Ändra objekt: flytta till en annan månad och ta bort. Det är inmatning — alltså den här vyns uppgift: trakter glider mellan månader hela
// tiden, och en felimporterad trakt måste gå att ta bort. Status ändras INTE här (se PR-texten): den har följder som ligger i planeringsvyn
// (Klar för maskin, Avsluta objekt) och ett val här skulle gå förbi dem. Cert, sortiment, kontakter och svårighet ligger kvar i Redigering.
type Vy = 'form' | 'bekrafta';

export default function AndraObjektArk({
  objekt, forvaldManad, onStang, onFlyttad, onBorttagen,
}: {
  objekt: { id: string; namn: string; ar: number | null; manad: number | null };
  /** Månaden man kom ifrån — där ett objekt utan månad hamnar om man trycker Välj månad. */
  forvaldManad: Manad;
  onStang: () => void;
  onFlyttad: (text: string) => void;
  onBorttagen: () => void;
}) {
  const start: Manad | null = objekt.ar != null && objekt.manad != null ? { ar: objekt.ar, manad: objekt.manad } : null;
  const [manad, setManad] = useState<Manad | null>(start);
  const [vy, setVy] = useState<Vy>('form');
  const [upptagen, setUpptagen] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const andrad = manad != null && (start == null || start.ar !== manad.ar || start.manad !== manad.manad);

  async function spara() {
    if (!manad) return;
    setUpptagen(true); setFel(null);
    try { await flyttaObjekt(objekt.id, manad); onFlyttad(`${objekt.namn} ligger nu i ${manadEtikett(manad).toLowerCase()}.`); }
    catch (e) { setFel(e instanceof Error ? e.message : String(e)); setUpptagen(false); }
  }

  async function taBort() {
    setUpptagen(true); setFel(null);
    try { await taBortObjekt(objekt.id); onBorttagen(); }
    catch (e) { setFel(e instanceof Error ? e.message : String(e)); setUpptagen(false); }
  }

  if (vy === 'bekrafta') {
    return (
      <Ark rubrik="Ta bort objektet?" onStang={() => { setVy('form'); setFel(null); }}
        fot={(
          <>
            {fel && <p role="alert" style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>{fel}</p>}
            <button type="button" onClick={taBort} disabled={upptagen} data-borttag="" style={{ ...KNAPP.sekundar, color: FARG.rod, ...(upptagen ? INAKTIV : null) }}>
              {upptagen ? 'Tar bort …' : 'Ta bort'}
            </button>
          </>
        )}>
        <p style={{ margin: `${AVSTAND.m}px 0`, ...TYP.text }}>{objekt.namn} tas bort från appen. Det går inte att ångra.</p>
      </Ark>
    );
  }

  return (
    <Ark rubrik="Ändra objekt" onStang={onStang}
      fot={(
        <>
          {fel && <p role="alert" style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>{fel}</p>}
          <button type="button" onClick={spara} disabled={!andrad || upptagen} style={{ ...KNAPP.primar, ...(andrad && !upptagen ? null : INAKTIV) }}>
            {upptagen ? 'Sparar …' : 'Spara'}
          </button>
        </>
      )}>
      <p style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.text, color: FARG.text2 }}>{objekt.namn}</p>
      <Sektion rubrik="Månad" kort={false}>
        {manad ? (
          <Manadsvaljare etikett={manadEtikett(manad)} onBakat={() => setManad(stegaManad(manad, -1))} onFramat={() => setManad(stegaManad(manad, 1))} />
        ) : (
          <Rad titel="Ingen månad" under={`Tryck för att lägga in i ${manadEtikett(forvaldManad).toLowerCase()}`} sista onTryck={() => setManad(forvaldManad)} attr={{ 'data-valj-manad': '' }} />
        )}
      </Sektion>
      <Sektion rubrik="Ta bort" kort={false} not="För en trakt som importerats fel.">
        <button type="button" onClick={() => setVy('bekrafta')} style={KNAPP.destruktiv} data-ta-bort="">Ta bort objektet</button>
      </Sektion>
    </Ark>
  );
}
