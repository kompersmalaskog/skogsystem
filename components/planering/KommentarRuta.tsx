'use client';

// EN KOMMENTARRUTA FÖR ALLA STÄLLEN som visar en kommentar (Martin 2026-10-22): kartkortet, instruktionskortet vid inkörning, "Instruktioner på trakten", "Till föraren" i ⓘ-kortet,
// Om trakten och genomgången. Ljusare ruta än kortet, källan överst (Vidas text i blå "Vida · traktdirektiv", egna i "Namn · tid"), texten i 19 px med en punkt per radbrytning
// (numrerade 1, 2, 3 vid två eller fler). Finns det bara EN sådan komponent kan två ställen aldrig se olika ut — ändra här, inte i en kopia.
//
// Texten delas bara på radbrytning (`lib/kommentarPunkter`). Undantaget är Vidas traktdirektiv, som saknar radbrytningar: `meningar` delar det vid meningsslut
// (`vidaMeningar`: punkt, mellanslag, versal) — aldrig för en egen kommentar.

import React from 'react';
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens';
import { arNumrerad, kommentarPunkter, vidaMeningar } from '@/lib/kommentarPunkter';

/** Rutan: ljusare än kortet, källan överst, innehållet under. */
export function KommentarRuta({ testid, kalla, kallaFarg, atgard, children }: { testid: string; kalla: React.ReactNode; kallaFarg: string; atgard?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div data-testid={testid} style={{ background: FARG.upphojt, borderRadius: RADIE.kort, padding: `${AVSTAND.m}px ${AVSTAND.l}px ${AVSTAND.l}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRAFFYTA.min - AVSTAND.m }}>
        <div data-testid="kartkort-kommentar-kalla" style={{ flex: 1, minWidth: 0, ...TYP.meta, fontWeight: VIKT.halvfet, color: kallaFarg }}>{kalla}</div>
        {atgard}
      </div>
      {children}
    </div>
  );
}

/** Texten som punkter: en rad = ren text, två eller fler = numrerade 1, 2, 3 (vit siffra i rund bricka). Appen delar aldrig upp en mening själv. */
export function KommentarPunkter({ text, meningar = false }: { text: string; meningar?: boolean }) {
  const punkter = meningar ? vidaMeningar(text) : kommentarPunkter(text);
  if (punkter.length === 0) return null;
  const text19: React.CSSProperties = { ...TYP.kommentar, color: FARG.text, overflowWrap: 'anywhere' };
  if (!arNumrerad(punkter)) return <div data-testid="kartkort-kommentar-text" style={text19}>{punkter[0]}</div>;
  return (
    <ol data-testid="kartkort-kommentar-text" style={{ ...text19, listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      {punkter.map((rad, i) => (
        <li key={i} data-testid="kartkort-kommentar-punkt" style={{ display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m }}>
          <span aria-hidden data-testid="kartkort-kommentar-siffra"
            style={{ flexShrink: 0, width: AVSTAND.xl + AVSTAND.xs, height: AVSTAND.xl + AVSTAND.xs, borderRadius: RADIE.cirkel, background: FARG.bg, color: FARG.text, ...TYP.meta, fontWeight: VIKT.halvfet, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
          <span style={{ ...text19, flex: 1, minWidth: 0 }}>{rad}</span>
        </li>
      ))}
    </ol>
  );
}

export interface KommentarVisningProps {
  /** Vidas text: blå etikett "Vida · traktdirektiv". Annars `forfattare` ("Martin · i går 16:20"), eller "Äldre kommentar" när författaren saknas, eller `etikett` om den ges. */
  vida?: boolean;
  forfattare?: string | null;
  /** Egen etikett (t.ex. "Planerare") i stället för författaren. */
  etikett?: string;
  vantar?: boolean;
  text: string;
  /** Vidas traktdirektiv: delas vid meningsslut i stället för bara på radbrytning. */
  meningar?: boolean;
  /** Vidas etikett i den blå raden överst. Standard "Vida · traktdirektiv"; ⓘ-panelen säger "Hela trakten · Vida" (direktivet gäller hela trakten, ingen yta). */
  vidaEtikett?: string;
}

/**
 * Visningen av EN kommentar utan åtgärder: rutan, källan överst, texten som punkter. Det är den här som alla ställen utom kartkortets redigerbara rader använder
 * (instruktionskortet, "Instruktioner på trakten", "Till föraren", Om trakten) — samma ruta, samma 19 px, samma etiketter.
 */
export function KommentarVisning({ vida = false, forfattare = null, etikett, vantar = false, text, meningar = false, vidaEtikett = 'Vida · traktdirektiv' }: KommentarVisningProps) {
  return (
    <KommentarRuta
      testid={vida ? 'kartkort-kommentar-vida' : 'kartkort-kommentar-rad'}
      kalla={vida ? vidaEtikett : <><span data-testid="kartkort-kommentar-forfattare">{etikett ?? forfattare ?? 'Äldre kommentar'}</span>{vantar ? <span data-testid="kartkort-kommentar-vantar"> · väntar</span> : null}</>}
      kallaFarg={vida ? FARG.bla : FARG.text2}
    >
      <KommentarPunkter text={text} meningar={meningar} />
    </KommentarRuta>
  );
}
