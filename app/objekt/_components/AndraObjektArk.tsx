'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Manadsvaljare from '@/components/design/Manadsvaljare';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import { flyttaObjekt, rattaVolym, taBortObjekt } from '@/lib/objekt/data';
import { manadEtikett, stegaManad, type Manad } from '@/lib/objekt/manad';

// Ändra objekt: flytta till en annan månad, rätta volymen och ta bort. Det är inmatning — alltså den här vyns uppgift: trakter glider mellan månader hela
// tiden, och en felimporterad trakt måste gå att ta bort. Status ändras INTE här (se PR-texten): den har följder som ligger i planeringsvyn
// (Klar för maskin, Avsluta objekt) och ett val här skulle gå förbi dem. Cert, sortiment, kontakter och svårighet ligger kvar i Redigering.
type Vy = 'form' | 'bekrafta';

export default function AndraObjektArk({
  objekt, forvaldManad, onStang, onFlyttad, onBorttagen,
}: {
  objekt: { id: string; namn: string; ar: number | null; manad: number | null; volym?: number | null; typ?: string | null };
  /** Månaden man kom ifrån — där ett objekt utan månad hamnar om man trycker Välj månad. */
  forvaldManad: Manad;
  onStang: () => void;
  onFlyttad: (text: string) => void;
  onBorttagen: () => void;
}) {
  const start: Manad | null = objekt.ar != null && objekt.manad != null ? { ar: objekt.ar, manad: objekt.manad } : null;
  const [manad, setManad] = useState<Manad | null>(start);
  const [vy, setVy] = useState<Vy>('form');
  const startVolym = typeof objekt.volym === 'number' && objekt.volym > 0 ? String(Math.round(objekt.volym)) : '';
  const [volym, setVolym] = useState(startVolym);
  const volymTal = Number(volym.replace(/[\s\u00a0]/g, '').replace(',', '.'));
  const volymAndrad = volym.trim() !== startVolym && volym.trim() !== '';
  const volymOk = !volymAndrad || (Number.isFinite(volymTal) && volymTal > 0);
  const harVolym = objekt.typ === 'gallring' || objekt.typ === 'slutavverkning' || startVolym !== '';
  const [upptagen, setUpptagen] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const manadAndrad = manad != null && (start == null || start.ar !== manad.ar || start.manad !== manad.manad);
  const andrad = (manadAndrad || volymAndrad) && volymOk;

  async function spara() {
    setUpptagen(true); setFel(null);
    try {
      const delar: string[] = [];
      // Volymen först: den är det som kan gå fel för användaren (ogiltigt tal). Båda skrivningarna kräver en rad tillbaka.
      if (volymAndrad) { await rattaVolym(objekt.id, volymTal); delar.push(`volymen är ${Math.round(volymTal).toLocaleString('sv-SE')} m³fub`); }
      if (manadAndrad && manad) { await flyttaObjekt(objekt.id, manad); delar.push(`ligger nu i ${manadEtikett(manad).toLowerCase()}`); }
      onFlyttad(`${objekt.namn}: ${delar.join(' och ')}.`);
    } catch (e) { setFel(e instanceof Error ? e.message : String(e)); setUpptagen(false); }
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
      {harVolym && (
        <Sektion rubrik="Volym" kort={false} not="Det inmätta talet från VO:n, när du fått det från Vida. Det ersätter talet från traktfilen — en omimport skriver inte över det.">
          <Falt etikett="Volym" value={volym} onChange={setVolym} inputMode="numeric" enhet="m³fub" />
        </Sektion>
      )}
      <Sektion rubrik="Ta bort" kort={false} not="För en trakt som importerats fel.">
        <button type="button" onClick={() => setVy('bekrafta')} style={KNAPP.destruktiv} data-ta-bort="">Ta bort objektet</button>
      </Sektion>
    </Ark>
  );
}
