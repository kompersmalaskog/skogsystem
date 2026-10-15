'use client';

// MER (tavla 27): det som förut var ⓘ:s ~15 val, nu sorterat i grupper — Körvy · Föraren · Planeraren · Övrigt — och "Avsluta objekt" för sig, rött,
// längst ner (bara när objektet är pågående; kräver bekräftelse, som förut). Vad som finns i varje grupp avgörs av lib/objektKort.byggMerGrupper.
// Planerarens block (Visa som, tilldelning, "Klar — skicka till förare") ritas här men matas av sidan — samma handlers som förut.

import React from 'react';
import { AVSTAND, FARG, IKON, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { MerGrupp, MerRad } from '@/lib/objektKort';
import { Gruppkort, Huvud, RadKnapp, Rubrik } from './infoDelar';

export interface PlanerarData {
  /** "Visa som": bara riktig admin. aktivId null = Planerare */
  visaSom: { aktivId: string | null; alternativ: { id: string | null; label: string }[]; onValj: (id: string | null) => void } | null;
  /** Tilldelning + Klar — skicka till förare: döljs för förare och avslutade objekt */
  tilldelning: {
    skordare: string; skotare: string; forare: { id: string; namn: string }[];
    onSkordare: (id: string | null) => void; onSkotare: (id: string | null) => void;
    klarSkickad: boolean; kanSkicka: boolean; skickar: boolean; onSkicka: () => void;
  } | null;
}

export interface MerMenyProps {
  objektNamn: string;
  grupper: MerGrupp[];
  planerare: PlanerarData | null;
  avsluta: (() => void) | null;
  onTillbaka: () => void;
  onStang: () => void;
}

const valjareStil: React.CSSProperties = {
  flex: 1, minWidth: 0, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, background: FARG.fyllning, border: 'none', borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
};

function Rad({ r, forst }: { r: MerRad; forst: boolean }) {
  return <RadKnapp forstaRad={forst} testid={`mer-${r.id}`} ikon={r.ikon} etikett={r.etikett} under={r.under} farg={r.farlig ? FARG.rod : undefined} onTryck={r.onTryck} pil={!r.farlig} />;
}

export default function MerMeny({ objektNamn, grupper, planerare, avsluta, onTillbaka, onStang }: MerMenyProps) {
  const t = planerare?.tilldelning;
  return (
    <>
      <Huvud titel="Mer" tillbaka={objektNamn} onTillbaka={onTillbaka} onStang={onStang} />
      <div data-testid="mer-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.xl}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.xl }}>
        {grupper.map((g) => {
          if (g.id === 'planeraren') {
            if (!planerare || (!planerare.visaSom && !t)) return null;
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
                  {t && (
                    <div data-testid="mer-tilldelning">
                      <Gruppkort>
                        {([
                          { roll: 'Skördare', varde: t.skordare, set: t.onSkordare },
                          { roll: 'Skotare', varde: t.skotare, set: t.onSkotare },
                        ] as const).map((r, i) => (
                          <label key={r.roll} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, borderTop: i > 0 ? `1px solid ${FARG.linje}` : 'none' }}>
                            <span style={{ width: AVSTAND.xxl * 2 + AVSTAND.s, flexShrink: 0, ...TYP.text }}>{r.roll}</span>
                            <select value={r.varde} onChange={(e) => r.set(e.target.value || null)} aria-label={`${r.roll}: välj förare`} style={valjareStil}>
                              <option value="" style={{ color: FARG.text, background: FARG.kort }}>Välj förare…</option>
                              {t.forare.map((m) => <option key={m.id} value={m.id} style={{ color: FARG.text, background: FARG.kort }}>{m.namn}</option>)}
                            </select>
                          </label>
                        ))}
                      </Gruppkort>
                      {t.klarSkickad ? (
                        <div data-testid="mer-skickad" style={{ marginTop: AVSTAND.s, minHeight: TRAFFYTA.primar, borderRadius: RADIE.knapp, border: `1px solid ${FARG.gron}`, color: FARG.gron, ...TYP.listtitel, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.s }}>
                          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad }}>check_circle</span>Skickad till förare
                        </div>
                      ) : (
                        <button type="button" data-testid="mer-klar-skicka" onClick={t.onSkicka} disabled={!t.kanSkicka || t.skickar}
                          style={{ marginTop: AVSTAND.s, width: '100%', minHeight: TRAFFYTA.primar, border: 'none', borderRadius: RADIE.knapp, background: t.kanSkicka ? FARG.text : FARG.fyllning, color: t.kanSkicka ? FARG.bg : FARG.text3, ...TYP.listtitel,
                            opacity: t.kanSkicka && !t.skickar ? 1 : 0.4, cursor: t.kanSkicka ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                          {t.skickar ? 'Skickar…' : 'Klar — skicka till förare'}
                        </button>
                      )}
                    </div>
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
