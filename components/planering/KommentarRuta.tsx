'use client';

// EN KOMMENTARRUTA FÖR ALLA STÄLLEN som visar en kommentar (Martin 2026-10-22): kartkortet, instruktionskortet vid inkörning, "Instruktioner på trakten", "Till föraren" i ⓘ-kortet,
// Om trakten och genomgången. Ljusare ruta än kortet, källan överst (Vidas text i blå "Vida · traktdirektiv", egna i "Namn · tid"), texten i 19 px med en punkt per radbrytning
// (numrerade 1, 2, 3 vid två eller fler). Finns det bara EN sådan komponent kan två ställen aldrig se olika ut — ändra här, inte i en kopia.
//
// Texten delas bara på radbrytning (`lib/kommentarPunkter`). Undantaget är Vidas traktdirektiv, som saknar radbrytningar: `meningar` delar det vid meningsslut
// (`vidaMeningar`: punkt, mellanslag, versal) — aldrig för en egen kommentar.

import React from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens';
import { vidaMedStreck, struketText, type Struken } from '@/lib/vidaStruket';
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
  /** Vidas text: delar planeraren strukit (lib/vidaStruket). Står kvar med streck, med vem och när. */
  struket?: readonly Struken[];
  /** Planeraren får stryka: "Stryk det som inte gäller" under texten. Saknas = bara läsning. */
  onVaxla?: (del: string) => void;
  /** Strecket kunde inte sparas — sägs under texten. */
  strykFel?: string | null;
}

/**
 * Visningen av EN kommentar utan åtgärder: rutan, källan överst, texten som punkter. Det är den här som alla ställen utom kartkortets redigerbara rader använder
 * (instruktionskortet, "Instruktioner på trakten", "Till föraren", Om trakten) — samma ruta, samma 19 px, samma etiketter.
 */
export function KommentarVisning({ vida = false, forfattare = null, etikett, vantar = false, text, meningar = false, vidaEtikett = 'Vida · traktdirektiv', struket, onVaxla, strykFel }: KommentarVisningProps) {
  const medStreck = vida && meningar && ((struket && struket.length > 0) || !!onVaxla);
  return (
    <KommentarRuta
      testid={vida ? 'kartkort-kommentar-vida' : 'kartkort-kommentar-rad'}
      kalla={vida ? vidaEtikett : <><span data-testid="kartkort-kommentar-forfattare">{etikett ?? forfattare ?? 'Äldre kommentar'}</span>{vantar ? <span data-testid="kartkort-kommentar-vantar"> · väntar</span> : null}</>}
      kallaFarg={vida ? FARG.bla : FARG.text2}
    >
      {medStreck ? <VidaStreck text={text} struket={struket ?? []} onVaxla={onVaxla} fel={strykFel ?? null} /> : <KommentarPunkter text={text} meningar={meningar} />}
    </KommentarRuta>
  );
}

/**
 * Vidas text med streck över det som inte gäller (Martin 2026-11-05). Läsläget: punkterna som vanligt, en struken del grå med streck och "Struket 5 nov av Martin"
 * under punkten. Planeraren: "Stryk det som inte gäller" öppnar EN rad per del med Stryk / Ta tillbaka (44 px), "Klar" stänger. Inget raderas — Vidas text är orörd.
 */
export function VidaStreck({ text, struket, onVaxla, fel }: { text: string; struket: readonly Struken[]; onVaxla?: (del: string) => void; fel: string | null }) {
  const [andrar, setAndrar] = React.useState(false);
  const punkter = vidaMedStreck(text, struket);
  if (punkter.length === 0) return null;
  const text19: React.CSSProperties = { ...TYP.kommentar, color: FARG.text, overflowWrap: 'anywhere' };
  const streck: React.CSSProperties = { color: FARG.text3, textDecoration: 'line-through' };
  const numrerad = punkter.length >= 2;
  return (
    <div data-testid="vida-streck" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      {andrar ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {punkter.flat().map((d, i) => (
            <button key={i} type="button" data-testid="vida-streck-del" onClick={() => onVaxla?.(d.text)} aria-pressed={!!d.struken}
              style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0`, border: 'none', borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}`, background: 'none', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ ...text19, flex: 1, minWidth: 0, ...(d.struken ? streck : null) }}>{d.text}</span>
              <span style={{ ...TYP.meta, color: FARG.text2, flexShrink: 0 }}>{d.struken ? 'Ta tillbaka' : 'Stryk'}</span>
            </button>
          ))}
          <button type="button" onClick={() => setAndrar(false)} style={{ ...KNAPP.lank, alignSelf: 'flex-end' }}>Klar</button>
        </div>
      ) : (
        <ol data-testid="kartkort-kommentar-text" style={{ ...text19, listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
          {punkter.map((p, i) => {
            const struken = p.map((d) => d.struken).filter((x): x is Struken => !!x);
            return (
              <li key={i} data-testid="kartkort-kommentar-punkt" style={{ display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m }}>
                {numrerad && <span aria-hidden data-testid="kartkort-kommentar-siffra"
                  style={{ flexShrink: 0, width: AVSTAND.xl + AVSTAND.xs, height: AVSTAND.xl + AVSTAND.xs, borderRadius: RADIE.cirkel, background: FARG.bg, color: FARG.text, ...TYP.meta, fontWeight: VIKT.halvfet, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>}
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
                  <span style={text19}>{p.map((d, j) => <React.Fragment key={j}>{j > 0 ? ' ' : ''}<span data-struken={d.struken ? '' : undefined} style={d.struken ? streck : undefined}>{d.text}</span></React.Fragment>)}</span>
                  {/* Strecket säger vem och när — så att föraren ser att det är ett beslut, inte ett fel. */}
                  {[...new Set(struken.map(struketText))].map((t) => <span key={t} style={{ ...TYP.meta, color: FARG.text2 }}>{t}</span>)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {fel && <div role="alert" style={{ ...TYP.meta, color: FARG.orange }}>{fel}</div>}
      {onVaxla && !andrar && <button type="button" data-testid="vida-streck-andra" onClick={() => setAndrar(true)} style={{ ...KNAPP.tertiar, alignSelf: 'flex-start' }}>Stryk det som inte gäller</button>}
    </div>
  );
}
