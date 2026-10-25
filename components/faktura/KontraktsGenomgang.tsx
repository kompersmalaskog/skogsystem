'use client';
// Genomgången av kontraktsnummer — EN trakt i taget.
//
// VARFÖR: prod 2026-10-24 hade 44 trakter utan kontraktsnummer. Fyrtiofyra fält
// med fyrtiofyra spara-knappar på förstasidan bryter mot "högst EN primär per
// skärm" och blir ändå aldrig gjorda. Samma form som Redigering › Behöver dig
// och lastbilens genomgång: kön fryses när arket öppnas (så räknaren inte
// hoppar när en rad försvinner), förslaget är förvalt, ett tryck sparar och tar
// nästa.
//
// VARJE NUMMER SPARAR FÖR SIG mot /api/faktura/kontraktsnr, som läser tillbaka
// värdet. Ingen samlad spara-knapp: ett halvt sparat formulär där några rader
// gick igenom och andra inte är värre än fyrtiofyra små besked.
import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import type { KontraktsPost } from '@/lib/faktura/listaVy';

export default function KontraktsGenomgang({ ko, onStang, onSparad }: {
  ko: KontraktsPost[];
  onStang: () => void;
  /** Ett nummer är sparat: listan tar bort raden ur sin egen hög. */
  onSparad: (vo: string) => void;
}) {
  const [i, setI] = useState(0);
  const [nummer, setNummer] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [sparade, setSparade] = useState(0);

  const post = ko[i];
  const klar = !post;

  function nasta() {
    setNummer('');
    setFel(null);
    setI(n => n + 1);
  }

  async function spara() {
    if (!post) return;
    const nr = nummer.trim();
    if (!nr) return;
    setSparar(true);
    setFel(null);
    try {
      const res = await fetch('/api/faktura/kontraktsnr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vo_nummer: post.vo, kontraktsnummer: nr }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setFel(j?.meddelande || `Servern svarade ${res.status}. Numret är inte sparat.`);
        return;
      }
      onSparad(post.vo);
      setSparade(n => n + 1);
      nasta();
    } catch (e) {
      setFel(e instanceof Error ? e.message : 'Anropet gick inte fram. Numret är inte sparat.');
    } finally {
      setSparar(false);
    }
  }

  if (klar) {
    return (
      <Ark rubrik="Klart" onStang={onStang} stang="Klar">
        <p style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>
          {sparade === 0
            ? 'Du hoppade över allt.'
            : `Du gick igenom allt — ${sparade} ${sparade === 1 ? 'nummer' : 'nummer'} sparade.`}
        </p>
        <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, color: FARG.text2 }}>
          Trakterna hamnar bland de klara nästa gång listan läses.
        </p>
      </Ark>
    );
  }

  const kanSpara = nummer.trim().length > 0 && !sparar;

  return (
    <Ark
      rubrik="Kontraktsnummer"
      onStang={onStang}
      fot={
        <>
          <button type="button" onClick={spara}
            style={{ ...KNAPP.primar, ...(kanSpara ? null : INAKTIV) }}>
            {sparar ? 'Sparar…' : 'Spara och ta nästa'}
          </button>
          <button type="button" onClick={nasta} style={{ ...KNAPP.tertiar, justifyContent: 'center', width: '100%' }}>
            Hoppa över
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, marginBottom: AVSTAND.s }}>
        <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{i + 1} av {ko.length}</span>
        <div style={{ flex: 1, height: AVSTAND.xs, borderRadius: RADIE.stapel, background: FARG.fyllning, overflow: 'hidden' }}>
          <div style={{ width: `${(i / ko.length) * 100}%`, height: '100%', background: FARG.text }} />
        </div>
      </div>

      <h3 style={{ margin: `0 0 ${AVSTAND.xs}px`, ...TYP.titel, color: FARG.text }}>{post.namn}</h3>
      <p style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.meta, color: FARG.text2 }}>{post.under}</p>

      <Falt
        etikett="Numret står på Vidas kontrakt"
        value={nummer}
        onChange={setNummer}
        inputMode="numeric"
        autoFocus
        stod={post.saknarTrakt
          ? 'Trakten finns inte upplagd — den skapas när numret sparas, märkt som oplanerad.'
          : undefined}
      />

      {fel && <p style={{ margin: 0, ...TYP.text, color: FARG.orange }}>{fel}</p>}

      <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
        Varje nummer sparas för sig. Avbryter du mitt i ligger de du hunnit kvar.
      </p>
    </Ark>
  );
}
