'use client';

// KÖRVYNS SNABBARK (plus-knappen): överst "Dina genvägar" (max 4, sparas per maskin), därunder ALLA symboler i ett rutnät
// (senast använda först). Ett tryck på en symbol placerar den på maskinens position, arket stängs och ett kvitto med Ångra visas.
// Håll fingret på en genväg → "Ta bort". Mockup: skärm 8 i Hytten-canvasen.
//
// Lager i arket? Nej: genvägar läggs till genom att hålla fingret på en rad i Lager/Inställningar ("Lägg i plus"). Lager- och
// inställnings-genvägar är växlar (På/Av) och stänger inte arket, så föraren ser att de slog om.
//
// Arket måste vara översta interaktiva lagret (z 640 backdrop / 650 ark, som den gamla plusmenyn — se minnet om dead-tap-buggen).

import React, { useRef, useState } from 'react';
import { skapaLangtryck } from '@/lib/langtryck';

export interface GenvagKort {
  nyckel: string;
  etikett: string;
  /** liten rad under namnet, t.ex. "4 av 11" */
  under?: string | null;
  bakgrund: string;
  ikon: React.ReactNode;
  /** lager/inställning: visar På/Av och stänger inte arket */
  vaxel?: boolean;
  pa?: boolean;
}

export interface SymbolRuta { id: string; namn: string; ikon: React.ReactNode }

const SEKTION: React.CSSProperties = { fontSize: 14, fontWeight: 600, letterSpacing: 1.2, color: '#9aa0a6' };

export function KorvySnabbArk({
  genvagar, symboler, max, onGenvag, onTaBort, onSymbol, onFlerVal, onStang,
}: {
  genvagar: GenvagKort[];
  symboler: SymbolRuta[];
  max: number;
  onGenvag: (nyckel: string) => void;
  onTaBort: (nyckel: string) => void;
  onSymbol: (id: string) => void;
  onFlerVal: () => void;
  onStang: () => void;
}) {
  const [taBort, setTaBort] = useState<string | null>(null);
  const lt = useRef(skapaLangtryck()).current;

  return (
    <>
      <div
        data-testid="korvy-snabbark-bakgrund"
        onClick={onStang}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,17,19,0.45)', zIndex: 640 }}
      />
      <div
        role="dialog"
        aria-label="Genvägar och symboler"
        data-testid="korvy-snabbark"
        onClick={() => { if (taBort) setTaBort(null); }}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 650, maxHeight: '88vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14,
          padding: '6px clamp(14px, 3vw, 28px) calc(env(safe-area-inset-bottom, 0px) + 22px)', background: '#1c1f22', color: '#f2f2f2',
          borderRadius: '28px 28px 0 0', boxShadow: '0 -12px 40px rgba(0,0,0,0.45)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
        }}
      >
        <button
          type="button"
          aria-label="Stäng"
          data-testid="korvy-snabbark-stang"
          onClick={onStang}
          style={{ alignSelf: 'center', width: 120, height: 36, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <span style={{ width: 48, height: 5, borderRadius: 3, background: '#4a4f55' }} />
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={SEKTION}>DINA GENVÄGAR</span>
          <span style={{ fontSize: 14, color: '#7d838a' }}>
            Håll fingret på något i Lager eller Inställningar för att lägga till ({genvagar.length}/{max})
          </span>
        </div>

        {genvagar.length === 0 ? (
          <div style={{ fontSize: 15, color: '#7d838a', padding: '10px 0' }}>Inga genvägar än.</div>
        ) : (
          <div data-testid="korvy-genvagar" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {genvagar.map((g) => {
              const tar = taBort === g.nyckel;
              return (
                <div key={g.nyckel} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    data-testid={`genvag-${g.nyckel}`}
                    data-pa={g.vaxel ? (g.pa ? '1' : '0') : undefined}
                    onPointerDown={(e) => lt.start(() => setTaBort(g.nyckel), e.clientX, e.clientY)}
                    onPointerMove={(e) => lt.rorelse(e.clientX, e.clientY)}
                    onPointerUp={lt.stopp}
                    onPointerLeave={lt.stopp}
                    onPointerCancel={lt.stopp}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={(e) => { e.stopPropagation(); if (lt.slukKlick()) return; if (taBort) { setTaBort(null); return; } onGenvag(g.nyckel); }}
                    className="press-scale"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, width: '100%', minHeight: 84, padding: '0 18px', border: 'none', borderRadius: 18,
                      background: g.bakgrund, color: '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', opacity: tar ? 0.25 : 1,
                      touchAction: 'manipulation', WebkitTouchCallout: 'none', userSelect: 'none',
                    }}
                  >
                    <span aria-hidden="true" style={{ width: 46, height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{g.ikon}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 auto' }}>
                      <span style={{ fontSize: 20, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.etikett}</span>
                      {g.under && <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>{g.under}</span>}
                    </span>
                    {g.vaxel && (
                      <span
                        aria-label={g.pa ? 'På' : 'Av'}
                        style={{ flexShrink: 0, minWidth: 44, padding: '6px 12px', borderRadius: 14, fontSize: 14, fontWeight: 700, textAlign: 'center',
                          background: g.pa ? '#30d158' : 'rgba(255,255,255,0.2)', color: g.pa ? '#0f1113' : '#fff' }}
                      >
                        {g.pa ? 'På' : 'Av'}
                      </span>
                    )}
                  </button>
                  {tar && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 8, alignItems: 'stretch', padding: 8 }}>
                      <button
                        type="button"
                        data-testid={`genvag-tabort-${g.nyckel}`}
                        onClick={(e) => { e.stopPropagation(); setTaBort(null); onTaBort(g.nyckel); }}
                        style={{ flex: 1, minHeight: 56, border: 'none', borderRadius: 14, background: '#ff453a', color: '#fff', fontSize: 18, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
                      >
                        Ta bort
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setTaBort(null); }}
                        style={{ minHeight: 56, padding: '0 16px', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, background: 'rgba(0,0,0,0.35)', color: '#fff', fontSize: 16, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
                      >
                        Avbryt
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ ...SEKTION, marginTop: 6 }}>SYMBOLER · SÄTTS DÄR MASKINEN STÅR</div>
        <div data-testid="korvy-symbolrutnat" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 12 }}>
          {symboler.map((s) => (
            <button
              key={s.id}
              type="button"
              data-testid={`symbolruta-${s.id}`}
              onClick={(e) => { e.stopPropagation(); onSymbol(s.id); }}
              className="press-scale"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 104, padding: '8px 6px',
                border: 'none', borderRadius: 16, background: '#2a2e33', color: '#f2f2f2', fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              <span aria-hidden="true" style={{ width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.ikon}</span>
              <span style={{ fontSize: 16, textAlign: 'center', lineHeight: 1.15 }}>{s.namn}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          data-testid="korvy-snabbark-flerval"
          onClick={(e) => { e.stopPropagation(); onFlerVal(); }}
          className="press-dim"
          style={{ minHeight: 56, marginTop: 4, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, background: 'transparent', color: '#9aa0a6', fontSize: 16, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
        >
          Fler val ›
        </button>
      </div>
    </>
  );
}
