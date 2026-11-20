'use client';

// VAD BETYDER KARTAN (tavla 15): ⓘ › "Vad betyder kartan". Bara det som finns på trakten, grupperat Fara · Natur · Kultur · Blött · Att göra · Info,
// en rad per sort: bilden som på kartan + namn + EN mening. Längst ner "Visa alla symboler". Allt kommer ur lib/teckenforklaring (som läser
// grupper + symboldefinitionerna) — ingen egen färg, form eller förklaring här. Ren presentation.

import React, { useState } from 'react';
import { SymbolIkon } from '@/components/SymbolIkon';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { KANT_SVART_STARK, DIKE } from '@/lib/kartstil';
import { GRUPPER } from '@/lib/larm/grupper';
import { SNEDSTRECK_PX } from '@/lib/ytaStil';
import { byggTeckenforklaring, type ForklaringRad, type TeckenMarkering } from '@/lib/teckenforklaring';
import type { VidaSlag } from '@/lib/larm/grupper';
import { malbildNyckel, type Maskinroll } from '@/lib/malbilder';
import { MalbildBlad, MalbildLista } from '@/components/malbild/Malbild';
import { HOG_TRADSLAG_FARG, KARTA_BLANDAT } from '@/lib/tradslag';
import { Gruppkort, Huvud, Rubrik } from './infoDelar';

export interface VadBetyderKartanProps {
  objektNamn: string;
  markeringar: readonly TeckenMarkering[];
  vida: readonly VidaSlag[];
  /** Maskintypen (skördare/skotare): målbilden kan skilja per roll. */
  roll?: Maskinroll | null;
  /** Trakten har produktionshögar: då förklaras högarnas färger (trädslag). */
  hogar?: boolean;
  onTillbaka: () => void;
  onStang: () => void;
}

const BILD = 40;

/** Ytans bild: gruppens färg, heldragen kant; snedstreckad (som på kartan) när den är en yta man inte får köra in i. Linjen: en streckad/heldragen stapel. */
/** Stenmurens kant i teckenförklaringen (px): kraftig, som på kartan. */
const STENMUR_BILD_KANT_PX = 10;

export function ForklaringBild({ rad }: { rad: ForklaringRad }) {
  if (rad.slag === 'symbol') return <SymbolIkon typ={rad.typ} storlek={BILD} />;
  const farg = GRUPPER[rad.grupp].farg;
  if (rad.slag === 'linje' && rad.typ === 'stonewall') {
    // Stenmuren som på kartan: gruppens färg, streckad som stenar på rad, med KRAFTIG mörk kant under — ingen andra nyans.
    return (
      <span aria-hidden="true" data-bild="linje" data-kant="stark" style={{ position: 'relative', width: BILD, height: BILD, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: 0, right: 0, height: STENMUR_BILD_KANT_PX, borderRadius: RADIE.cirkel, background: KANT_SVART_STARK }} />
        <span style={{ position: 'absolute', left: 0, right: 0, height: 0, borderTop: `${STENMUR_BILD_KANT_PX - 4}px dashed ${farg}` }} />
      </span>
    );
  }
  if (rad.slag === 'linje' && rad.typ === 'ditch') {
    // Diket som på kartan: mörk kant, jordkant, fåra och en smal blå vattenlinje (lib/kartstil DIKE) — ingen randning.
    return (
      <span aria-hidden="true" data-bild="linje" data-dike="ja" style={{ position: 'relative', width: BILD, height: BILD, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: 0, right: 0, height: 13, borderRadius: RADIE.cirkel, background: DIKE.kant }} />
        <span style={{ position: 'absolute', left: 1, right: 1, height: 10, borderRadius: RADIE.cirkel, background: DIKE.jord }} />
        <span style={{ position: 'absolute', left: 2, right: 2, height: 6, borderRadius: RADIE.cirkel, background: DIKE.fara }} />
        <span style={{ position: 'absolute', left: 3, right: 3, height: 3, borderRadius: RADIE.cirkel, background: DIKE.vatten }} />
      </span>
    );
  }
  if (rad.slag === 'linje' && rad.ledning) {
    // Kraftledningen som på kartan: röd linje med mörk kant, korta stolpar (tvärstreck) och farosymbolen (triangel med blixt) — samma bild ur symbolkällan.
    return (
      <span aria-hidden="true" data-bild="linje" data-ledning="ja" style={{ position: 'relative', width: BILD, height: BILD, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: 0, right: 0, height: 8, borderRadius: RADIE.cirkel, background: KANT_SVART_STARK }} />
        <span style={{ position: 'absolute', left: 1, right: 1, height: 4, borderRadius: RADIE.cirkel, background: farg }} />
        {[0.12, 0.88].map((x) => (
          <span key={x} data-stolpe="ja" style={{ position: 'absolute', left: `${x * 100}%`, width: 6, height: 20, marginLeft: -3, borderRadius: 2, background: KANT_SVART_STARK, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <span style={{ width: 2.5, height: 16, background: farg }} />
          </span>
        ))}
        <span data-farosymbol="ja" style={{ position: 'absolute', left: '50%', marginLeft: -9, top: BILD / 2 - 9, display: 'flex' }}><SymbolIkon typ="powerline" storlek={18} /></span>
      </span>
    );
  }
  if (rad.slag === 'linje') {
    return <span aria-hidden="true" data-bild="linje" style={{ width: BILD, height: BILD, flexShrink: 0, display: 'flex', alignItems: 'center' }}><span style={{ width: '100%', height: 0, borderTop: `3px solid ${farg}`, borderRadius: RADIE.cirkel }} /></span>;
  }
  const streck = rad.forbjuden
    ? { backgroundImage: `repeating-linear-gradient(135deg, ${farg} 0 2px, transparent 2px 6px)`, backgroundSize: `${SNEDSTRECK_PX}px ${SNEDSTRECK_PX}px` }
    : { backgroundColor: farg, opacity: 1 };
  return (
    <span aria-hidden="true" data-bild={rad.forbjuden ? 'yta-snedstreck' : 'yta'} style={{ width: BILD, height: BILD, flexShrink: 0, boxSizing: 'border-box', borderRadius: RADIE.knapp, border: `3px solid ${farg}`, position: 'relative', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', inset: 0, ...streck, opacity: rad.forbjuden ? 1 : 0.25 }} />
    </span>
  );
}

/**
 * Högarna på kartan (Martin 2026-11-06, bild K): en prick per hög i trädslagets hela färg, större prick = mer virke. Blandad = halv–halv.
 * Samma färger som kartan (lib/tradslag HOG_TRADSLAG_FARG / hogTradslagFarger) — ingen egen palett.
 */
const HOG_RADER: { namn: string; farg: string; farg2?: string }[] = [
  { namn: 'Gran', farg: HOG_TRADSLAG_FARG.GRAN },
  { namn: 'Tall', farg: HOG_TRADSLAG_FARG.TALL },
  { namn: 'Björk', farg: HOG_TRADSLAG_FARG['BJÖRK'] },
  { namn: 'Blandat', farg: HOG_TRADSLAG_FARG.GRAN, farg2: HOG_TRADSLAG_FARG.TALL },
  { namn: 'Okänt trädslag', farg: KARTA_BLANDAT },
];
export function HogPrickBild({ farg, farg2 }: { farg: string; farg2?: string }) {
  const bakgrund = farg2 ? `linear-gradient(90deg, ${farg} 50%, ${farg2} 50%)` : farg;
  return (
    <span aria-hidden="true" data-bild="hog" style={{ width: BILD, height: BILD, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ width: 16, height: 16, borderRadius: RADIE.cirkel, background: bakgrund, boxShadow: `0 0 0 1.5px ${KANT_SVART_STARK}` }} />
    </span>
  );
}

export default function VadBetyderKartan({ objektNamn, markeringar, vida, roll = null, hogar = false, onTillbaka, onStang }: VadBetyderKartanProps) {
  const [visaAlla, setVisaAlla] = useState(false);
  // Tryck på en rad öppnar målbilden (bara för sorter som har en); "Alla målbilder" öppnar vilken som helst.
  const [malbild, setMalbild] = useState<{ nyckel: string; ikon?: React.ReactNode } | null>(null);
  const grupper = byggTeckenforklaring({ markeringar, vida, visaAlla });
  return (
    <>
      <Huvud titel="Vad betyder kartan" tillbaka={objektNamn} onTillbaka={onTillbaka} onStang={onStang} />
      <div data-testid="teckenforklaring" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.xl}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
        {grupper.length === 0 && (
          <div data-testid="teckenforklaring-tom" style={{ ...TYP.text, color: FARG.text2 }}>Inget är utsatt på den här trakten än.</div>
        )}
        {grupper.map((g) => (
          <section key={g.grupp} data-testid={`teckenforklaring-grupp-${g.grupp}`}>
            <Rubrik>{g.namn}</Rubrik>
            <Gruppkort>
              {g.rader.map((r, i) => {
                const mn = malbildNyckel(r.slag, r.typ);
                const stil: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, minHeight: TRAFFYTA.primar + AVSTAND.s, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` };
                const innehall = (
                  <>
                    <ForklaringBild rad={r} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', ...TYP.text, color: FARG.text, overflowWrap: 'anywhere' }}>{r.namn}</span>
                      <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere' }}>{r.forklaring}</span>
                    </span>
                    {mn && <span aria-hidden="true" style={{ flexShrink: 0, color: FARG.bla }}>›</span>}
                  </>
                );
                return mn ? (
                  <button key={r.nyckel} type="button" data-testid={`teckenforklaring-rad-${r.nyckel}`} data-malbild={mn} onClick={() => setMalbild({ nyckel: mn, ikon: <ForklaringBild rad={r} /> })} className="press-dim"
                    aria-label={`${r.namn}: så ska det se ut`}
                    style={{ ...stil, width: '100%', boxSizing: 'border-box', border: 'none', borderTop: stil.borderTop, background: 'transparent', color: 'inherit', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                    {innehall}
                  </button>
                ) : (
                  <div key={r.nyckel} data-testid={`teckenforklaring-rad-${r.nyckel}`} style={stil}>{innehall}</div>
                );
              })}
            </Gruppkort>
          </section>
        ))}
        {(hogar || visaAlla) && (
          <section data-testid="teckenforklaring-hogar">
            <Rubrik>Högar</Rubrik>
            <Gruppkort>
              {HOG_RADER.map((h, i) => (
                <div key={h.namn} data-testid={`teckenforklaring-hog-${h.namn}`} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, minHeight: TRAFFYTA.primar + AVSTAND.s, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                  <HogPrickBild farg={h.farg} farg2={h.farg2} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', ...TYP.text, color: FARG.text }}>{h.namn}</span>
                    {i === 0 && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>Större prick = mer virke kvar. Tryck på en hög för att se sortimenten.</span>}
                    {h.farg2 && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>De två största trädslagen, halva var.</span>}
                  </span>
                </div>
              ))}
            </Gruppkort>
          </section>
        )}
        <MalbildLista roll={roll} onVisa={(n) => setMalbild({ nyckel: n })} />
        <button type="button" data-testid="teckenforklaring-visa-alla" onClick={() => setVisaAlla((v) => !v)} className="press"
          style={{ ...KNAPP.sekundar, width: '100%', minHeight: TRAFFYTA.primar, fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation' }}>
          {visaAlla ? 'Visa bara det som finns här' : 'Visa alla symboler'}
        </button>
      </div>
      {malbild && <MalbildBlad nyckel={malbild.nyckel} roll={roll} ikon={malbild.ikon} onStang={() => setMalbild(null)} />}
    </>
  );
}
