'use client';

// Reservknappen "Lossa här" och raden "N lass väntar på dig" — alltid på plats i skotarläget, ovanför kortet nertill (lossningskortet, "Nytt avlägg här?").
//
// "Lossa här": när upptäckten missar (Daniel, Mölleryd 2026-10-20) räcker ETT tryck för ett lass vid närmaste avlägg.
// "N lass väntar på dig": ett lass som inte kunde bekräfta sig självt (första lasset, kort lossning, del 2, tomt) får aldrig ligga och hänga utan att synas —
// här bekräftar eller stryker föraren det (lass 2 från 09:57 hängde kvar i vantar_forare hela dagen).

import React, { useEffect, useState } from 'react';
import { AVSTAND, FARG, TNUM, TYP, medSafeBotten } from '@/lib/design/tokens';
import { klockslag } from '@/lib/skotarLass/avlaggStat';
import { kanBekrafta, lassRubrikRad, lassSortimentText } from '@/lib/skotarLass/lassModell';
import type { Lass } from '@/lib/skotarLass/typer';
import { arkPanel, arkRam, avdelare, knappPrimar, knappStor, meta, TRYCK_PX } from './stil';

/** Höjden (px) på kortet nertill just nu (0 = inget kort), så raden lägger sig OVANFÖR det i stället för under. Kortet har data-nertill-kort. */
function useNertillHojd(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const mat = () => {
      const el = document.querySelector('[data-nertill-kort]') as HTMLElement | null;
      setH(el ? Math.ceil(el.getBoundingClientRect().height) : 0);
    };
    mat();
    const iv = window.setInterval(mat, 300);
    return () => window.clearInterval(iv);
  }, []);
  return h;
}

/** "1 lass väntar på dig", "2 lass väntar på dig" (lass är samma ord i plural). */
export const vantarText = (n: number): string => `${n} lass väntar på dig`;

export function SkotarNedreRad({ antalVantar, vidLossaHar, onVisaVantar, lossar }: {
  antalVantar: number;
  vidLossaHar: () => void;
  onVisaVantar: () => void;
  /** En lossning pågår: knappen markerar den som bekräftad i stället för att skapa ett nytt lass. */
  lossar: boolean;
}) {
  const hojd = useNertillHojd();
  return (
    <div data-testid="skotar-nedre-rad" style={{
      position: 'fixed', left: AVSTAND.l, right: 96, zIndex: 215, display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s, alignItems: 'center',
      bottom: `calc(${medSafeBotten(AVSTAND.l)} + ${hojd > 0 ? hojd + AVSTAND.s : 0}px)`,
    }}>
      <button type="button" data-testid="lossa-har" onClick={vidLossaHar} style={{ ...knappStor, background: FARG.kort, border: `1px solid ${FARG.linje}` }}>
        {lossar ? 'Lossar – stämmer' : 'Lossa här'}
      </button>
      {antalVantar > 0 && (
        <button type="button" data-testid="lass-vantar" onClick={onVisaVantar} style={{ ...knappStor, background: FARG.kort, border: `1px solid ${FARG.linje}` }}>
          <span style={TNUM}>{vantarText(antalVantar)}</span> <span aria-hidden="true" style={{ color: FARG.text2 }}>›</span>
        </button>
      )}
    </div>
  );
}

export function VantarPaDigArk({ lass, onStammer, onFyllI, onStryk, onStang }: {
  lass: readonly Lass[];
  onStammer: (l: Lass) => void;
  onFyllI: (l: Lass) => void;
  onStryk: (l: Lass) => void;
  onStang: () => void;
}) {
  return (
    <div style={arkRam}>
      <div data-testid="vantar-ark" role="dialog" aria-label="Lass som väntar på dig" style={arkPanel}>
        <div style={{ padding: AVSTAND.l, overflowY: 'auto' }}>
          <div style={{ ...TYP.rubrik }}>{lass.length === 0 ? 'Inga lass väntar på dig' : vantarText(lass.length)}</div>
          <div style={{ ...meta, marginTop: AVSTAND.xs }}>Bekräfta lasset om det stämmer, fyll i det, eller ta bort det om det inte var någon lossning.</div>
          <div style={avdelare} />
          {[...lass].sort((a, b) => a.lassNummer - b.lassNummer).map((l) => (
            <div key={l.id} data-testid={`vantar-lass-${l.lassNummer}`} style={{ marginBottom: AVSTAND.l }}>
              {l.delar.map((d) => (
                <div key={d.delNr}>
                  <div style={{ ...TYP.listtitel }}>{lassRubrikRad(l, d, klockslag(d.lossadTid))}</div>
                  <div style={{ ...meta, ...TNUM }}>{d.rader.length ? lassSortimentText(d.rader) : 'Inte ifyllt'}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.s }}>
                {kanBekrafta(l)
                  ? <button type="button" data-testid={`vantar-stammer-${l.lassNummer}`} onClick={() => onStammer(l)} style={{ ...knappPrimar, flex: 1 }}>Stämmer</button>
                  : <button type="button" data-testid={`vantar-fyll-i-${l.lassNummer}`} onClick={() => onFyllI(l)} style={{ ...knappPrimar, flex: 1 }}>Fyll i</button>}
                {kanBekrafta(l) && <button type="button" data-testid={`vantar-andra-${l.lassNummer}`} onClick={() => onFyllI(l)} style={{ ...knappStor, flexShrink: 0 }}>Ändra</button>}
                <button type="button" aria-label="Det var ingen lossning — ta bort" data-testid={`vantar-stryk-${l.lassNummer}`} onClick={() => onStryk(l)}
                  style={{ ...knappStor, flexShrink: 0, minWidth: TRYCK_PX, padding: 0, color: FARG.text2 }}>✕</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, paddingBottom: medSafeBotten(AVSTAND.l), borderTop: `1px solid ${FARG.linje}` }}>
          <button type="button" data-testid="vantar-stang" onClick={onStang} style={{ ...knappStor, width: '100%' }}>Stäng</button>
        </div>
      </div>
    </div>
  );
}
