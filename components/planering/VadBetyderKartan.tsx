'use client';

// VAD BETYDER KARTAN (tavla 15): ⓘ › "Vad betyder kartan". Bara det som finns på trakten, grupperat Fara · Natur · Kultur · Blött · Att göra · Info,
// en rad per sort: bilden som på kartan + namn + EN mening. Längst ner "Visa alla symboler". Allt kommer ur lib/teckenforklaring (som läser
// grupper + symboldefinitionerna) — ingen egen färg, form eller förklaring här. Ren presentation.

import React, { useState } from 'react';
import { SymbolIkon } from '@/components/SymbolIkon';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { GRUPPER } from '@/lib/larm/grupper';
import { SNEDSTRECK_PX } from '@/lib/ytaStil';
import { byggTeckenforklaring, type ForklaringRad, type TeckenMarkering } from '@/lib/teckenforklaring';
import type { VidaSlag } from '@/lib/larm/grupper';
import { Gruppkort, Huvud, Rubrik } from './infoDelar';

export interface VadBetyderKartanProps {
  objektNamn: string;
  markeringar: readonly TeckenMarkering[];
  vida: readonly VidaSlag[];
  onTillbaka: () => void;
  onStang: () => void;
}

const BILD = 40;

/** Ytans bild: gruppens färg, heldragen kant; snedstreckad (som på kartan) när den är en yta man inte får köra in i. Linjen: en streckad/heldragen stapel. */
export function ForklaringBild({ rad }: { rad: ForklaringRad }) {
  if (rad.slag === 'symbol') return <SymbolIkon typ={rad.typ} storlek={BILD} />;
  const farg = GRUPPER[rad.grupp].farg;
  if (rad.slag === 'linje') {
    return <span aria-hidden="true" data-bild="linje" style={{ width: BILD, height: BILD, flexShrink: 0, display: 'flex', alignItems: 'center' }}><span style={{ width: '100%', height: 0, borderTop: `3px ${rad.streckad ? 'dashed' : 'solid'} ${farg}`, borderRadius: RADIE.cirkel }} /></span>;
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

export default function VadBetyderKartan({ objektNamn, markeringar, vida, onTillbaka, onStang }: VadBetyderKartanProps) {
  const [visaAlla, setVisaAlla] = useState(false);
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
              {g.rader.map((r, i) => (
                <div key={r.nyckel} data-testid={`teckenforklaring-rad-${r.nyckel}`}
                  style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, minHeight: TRAFFYTA.primar + AVSTAND.s, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                  <ForklaringBild rad={r} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', ...TYP.text, color: FARG.text, overflowWrap: 'anywhere' }}>{r.namn}</span>
                    <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere' }}>{r.forklaring}</span>
                  </span>
                </div>
              ))}
            </Gruppkort>
          </section>
        ))}
        <button type="button" data-testid="teckenforklaring-visa-alla" onClick={() => setVisaAlla((v) => !v)} className="press"
          style={{ ...KNAPP.sekundar, width: '100%', minHeight: TRAFFYTA.primar, fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation' }}>
          {visaAlla ? 'Visa bara det som finns här' : 'Visa alla symboler'}
        </button>
      </div>
    </>
  );
}
