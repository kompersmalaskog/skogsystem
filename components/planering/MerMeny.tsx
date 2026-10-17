'use client';

// MER (tavla 27): det som förut var ⓘ:s ~15 val, nu sorterat i grupper — Körvy · Föraren · Planeraren · Övrigt — och "Avsluta objekt" för sig, rött,
// längst ner (bara när objektet är pågående; kräver bekräftelse, som förut). Vad som finns i varje grupp avgörs av lib/objektKort.byggMerGrupper.
// Planerarens block (Visa som) ritas här men matas av sidan. Tilldelning och "Klar — skicka till förare" finns inte här längre: de bor i Klar med trakten?

import React from 'react';
import { AVSTAND, FARG, IKON, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { MerGrupp, MerRad } from '@/lib/objektKort';
import { Gruppkort, Huvud, RadKnapp, Rubrik } from './infoDelar';

export interface PlanerarData {
  /** "Visa som": bara riktig admin. aktivId null = Planerare */
  visaSom: { aktivId: string | null; alternativ: { id: string | null; label: string }[]; onValj: (id: string | null) => void } | null;
}

export interface MerMenyProps {
  objektNamn: string;
  grupper: MerGrupp[];
  planerare: PlanerarData | null;
  avsluta: (() => void) | null;
  onTillbaka: () => void;
  onStang: () => void;
}

function Rad({ r, forst }: { r: MerRad; forst: boolean }) {
  return <RadKnapp forstaRad={forst} testid={`mer-${r.id}`} ikon={r.ikon} etikett={r.etikett} under={r.under} farg={r.farlig ? FARG.rod : undefined} onTryck={r.onTryck} pil={!r.farlig} />;
}

export default function MerMeny({ objektNamn, grupper, planerare, avsluta, onTillbaka, onStang }: MerMenyProps) {
  return (
    <>
      <Huvud titel="Mer" tillbaka={objektNamn} onTillbaka={onTillbaka} onStang={onStang} />
      <div data-testid="mer-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.xl}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.xl }}>
        {grupper.map((g) => {
          if (g.id === 'planeraren') {
            if (!planerare || !planerare.visaSom) return null;
            return (
              <section key={g.id} data-testid="mer-grupp-planeraren">
                <Rubrik>{g.titel}</Rubrik>
                <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
                  {planerare.visaSom && (
                    <Gruppkort testid="mer-visa-som">
                      <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.m}px ${AVSTAND.l}px ${AVSTAND.xs}px` }}>Visa som</div>
                      {planerare.visaSom.alternativ.map((a, i) => {
                        const aktiv = planerare.visaSom!.aktivId === a.id;
                        return (
                          <button key={a.id ?? 'planerare'} type="button" className="press-row" data-testid={`mer-visa-som-${a.id ?? 'planerare'}`} onClick={() => planerare.visaSom!.onValj(a.id)}
                            style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `0 ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', borderTop: i > 0 ? `1px solid ${FARG.linje}` : 'none', color: aktiv ? FARG.orange : FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, flexShrink: 0, width: AVSTAND.xxl, textAlign: 'center' }}>{aktiv ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
                            <span style={{ flex: 1 }}>{a.label}{aktiv ? ' · aktiv' : ''}</span>
                          </button>
                        );
                      })}
                    </Gruppkort>
                  )}
                </div>
              </section>
            );
          }
          if (g.rader.length === 0) return null;
          return (
            <section key={g.id} data-testid={`mer-grupp-${g.id}`}>
              <Rubrik>{g.titel}</Rubrik>
              <Gruppkort>{g.rader.map((r, i) => <Rad key={r.id} r={r} forst={i === 0} />)}</Gruppkort>
            </section>
          );
        })}
        {avsluta && (
          <section data-testid="mer-grupp-avsluta">
            <Gruppkort>
              <button type="button" data-testid="mer-avsluta-objekt" onClick={avsluta} className="press-row"
                style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `0 ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', color: FARG.rod, ...TYP.listtitel, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, flexShrink: 0, width: AVSTAND.xxl, textAlign: 'center' }}>check_circle</span>
                Avsluta objekt
              </button>
            </Gruppkort>
          </section>
        )}
      </div>
    </>
  );
}
