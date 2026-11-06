'use client';
// TRAKTER — listan över alla trakter (./trakterLista). Under 1100 px är listan skärmen (ett tryck: kartan flyger dit och trakten öppnas,
// listan stängs); från 1100 px står den till vänster om kartan och trakten öppnas bredvid (arken flyttas höger om listan med CSS).
// Selektorerna har inga citattecken (React escapar dem i <style>).
import React, { useState } from 'react';
import { FARG, TYP, AVSTAND, RADIE, KNAPP } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import { FasSteg } from '@/components/objekt/FasSteg';
import { GRUPPER } from '@/lib/larm/grupper';
import type { TrakterGrupper, TraktRad } from './trakterLista';

export const TRAKTER_SIDOKOLUMN_FRAN_PX = 1100;
export const TRAKTER_BREDD_PX = 360;

const CSS = `
.tp { position: absolute; inset: 0; z-index: 9; overflow-y: auto; background: ${FARG.bg}; color: ${FARG.text}; }
@media (min-width: ${TRAKTER_SIDOKOLUMN_FRAN_PX}px) {
  .tp { right: auto; width: ${TRAKTER_BREDD_PX}px; border-right: 1px solid ${FARG.linje}; }
  .sheet-upp { left: ${TRAKTER_BREDD_PX}px !important; }
}
`;

function TraktGrupp({ rubrik, rader, valt, onValj, hopfalld }: { rubrik: string; rader: TraktRad[]; valt: string | null; onValj: (id: string) => void; hopfalld?: boolean }) {
  const [oppen, setOppen] = useState(!hopfalld);
  if (!rader.length) return null;
  if (!oppen) {
    return (
      <button type="button" onClick={() => setOppen(true)} aria-expanded={false}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, padding: `0 ${AVSTAND.m}px`, border: 'none', borderRadius: RADIE.kort, background: FARG.kort, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', ...TYP.listtitel }}>
        <span>{rubrik} · {rader.length}</span><span style={{ color: FARG.text2 }}>›</span>
      </button>
    );
  }
  return (
    <Sektion rubrik={`${rubrik} · ${rader.length}`}>
      <div style={{ overflow: 'hidden' }}>
        {rader.map((r, i) => (
          <button key={r.id} type="button" data-trakt-rad="" onClick={() => onValj(r.id)} aria-current={r.id === valt ? 'true' : undefined}
            style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: AVSTAND.s, minHeight: 48, padding: AVSTAND.m, border: 'none', borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}`, background: r.id === valt ? FARG.upphojt : 'none', color: FARG.text, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs, minWidth: 0 }}>
              <span style={{ ...TYP.listtitel, overflowWrap: 'anywhere' }}>{r.namn}</span>
              {/* Samma rad som i Planeringens objektlista: stegen och traktanalysen (components/objekt/FasSteg, lib/traktAnalys). */}
              {r.steg && r.steg.length > 0 && <FasSteg steg={r.steg} />}
              {r.under && <span style={{ ...TYP.meta, color: r.underOrange ? FARG.orange : FARG.text2 }}>{r.under}</span>}
              {r.fynd && (
                <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.meta, color: r.fynd.kategori ? FARG.text2 : FARG.text3 }}>
                  {r.fynd.kategori && <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, flexShrink: 0, background: r.fynd.kategori === 'vattenskydd' ? GRUPPER.blott.farg : GRUPPER.kultur.farg }} />}
                  {r.fynd.text}
                </span>
              )}
            </span>
            <span style={{ color: FARG.text2 }}>›</span>
          </button>
        ))}
      </div>
    </Sektion>
  );
}

export function TrakterPanel({ grupper, valt, onValj, onStang }: { grupper: TrakterGrupper; valt: string | null; onValj: (id: string) => void; onStang: () => void }) {
  return (
    <aside className="tp" aria-label="Trakter">
      <style>{CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l, padding: `${AVSTAND.l}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl}px` }}>
        <button type="button" onClick={onStang} style={{ ...KNAPP.lank, alignSelf: 'flex-start', padding: 0 }}>‹ Kartan</button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          <div style={{ ...TYP.titel }}>Trakter</div>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>{grupper.antal === 1 ? '1 trakt som inte är avslutad' : `${grupper.antal} trakter som inte är avslutade`}</div>
        </div>
        {grupper.antal === 0 && <div style={{ ...TYP.text, color: FARG.text2 }}>Inga trakter just nu.</div>}
        <TraktGrupp rubrik="Pågår" rader={grupper.pagar} valt={valt} onValj={onValj} />
        <TraktGrupp rubrik="Planerade" rader={grupper.planerade} valt={valt} onValj={onValj} />
        <TraktGrupp rubrik="Oplanerade" rader={grupper.oplanerade} valt={valt} onValj={onValj} hopfalld />
      </div>
    </aside>
  );
}

/** Menyknappen nere till höger (Martin 2026-11-06: "kartan så ren som möjligt … det väljer man i en meny"). Orange prick = något i menyn behöver dig. */
export function KartMenyKnapp({ onClick, prick }: { onClick: () => void; prick: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={prick ? 'Meny – något behöver dig' : 'Meny'} data-testid="kartmeny"
      style={{ position: 'absolute', right: AVSTAND.l, bottom: `calc(${AVSTAND.l}px + env(safe-area-inset-bottom))`, zIndex: 7, width: 52, height: 52, borderRadius: RADIE.cirkel, border: 'none', background: FARG.kort, color: FARG.text, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.45)' }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      {prick && <span aria-hidden="true" style={{ position: 'absolute', top: AVSTAND.s, right: AVSTAND.s, width: 10, height: 10, borderRadius: RADIE.cirkel, background: FARG.orange, boxShadow: `0 0 0 2px ${FARG.kort}` }} />}
    </button>
  );
}

export interface MenyRad { id: string; text: string; under?: string | null; underOrange?: boolean; onClick: () => void }
/** Menyn: en rad per lista. Öppnas nerifrån som ett ark; tryck utanför eller Stäng stänger. */
export function KartMeny({ rader, onStang }: { rader: MenyRad[]; onStang: () => void }) {
  return (
    <>
      <div onClick={onStang} aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 8 }} />
      <div role="menu" aria-label="Meny" className="sheet-upp"
        style={{ position: 'absolute', right: AVSTAND.l, bottom: `calc(${AVSTAND.l + 52 + AVSTAND.s}px + env(safe-area-inset-bottom))`, zIndex: 9, width: 280, maxWidth: `calc(100% - ${AVSTAND.l * 2}px)`, background: FARG.kort, borderRadius: RADIE.sheet, overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
        {rader.map((r, i) => (
          <button key={r.id} type="button" role="menuitem" onClick={r.onClick}
            style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: AVSTAND.s, minHeight: 52, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, border: 'none', borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}`, background: 'none', color: FARG.text, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
              <span style={{ ...TYP.listtitel }}>{r.text}</span>
              {r.under && <span style={{ ...TYP.meta, color: r.underOrange ? FARG.orange : FARG.text2 }}>{r.under}</span>}
            </span>
            <span style={{ color: FARG.text2 }}>›</span>
          </button>
        ))}
      </div>
    </>
  );
}
