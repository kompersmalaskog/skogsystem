'use client';

// Tryck på "Kvar ~121 m³" i objektpillen: kvar per sortiment, klar-dag, "Idag: 7 lass · 131 m³" (tryck → dagens lass, tryck på ett lass → Ändra)
// och "Trakten: skotat X av Y m³". Siffrorna har alltid "~": kvar är skördarens mätning minus skotat (Opti-lassen före appens start + appens lass).
//
// Läsbart i hytten: de största sortimenten (högst KVAR_SYNLIGA) var för sig, resten samlat på en rad "Övrigt ~X m³ ›" som fälls ut. Sortimentet står
// vitt/semibold och mottagaren grå efter. Skotat mer än skördat är "✓ klart" — aldrig "X över" eller minus. Allt innehåll är minst 17 px.

import React, { useState } from 'react';
import { AVSTAND, FARG, TNUM, TYP, medSafeBotten } from '@/lib/design/tokens';
import { klockslag } from '@/lib/skotarLass/avlaggStat';
import { lassRubrikRad, lassSortimentText } from '@/lib/skotarLass/lassModell';
import { kvarVy, type Kvar, type KvarSammanfattning, type KvarSortiment } from '@/lib/skotarLass/kvar';
import type { Lass } from '@/lib/skotarLass/typer';
import { arkPanel, arkRam, avdelare, knappStor, meta, TRYCK_PX } from './stil';
import { SortimentNamn } from './SortimentNamn';

/** Kvar eller "✓ klart" — ordet bär betydelsen, färgen bara förstärker den. */
function KvarVarde({ kvar, klart }: { kvar: number; klart: boolean }) {
  return klart
    ? <span data-klart="ja" style={{ ...TYP.text, color: FARG.gron }}><span aria-hidden="true">✓ </span>klart</span>
    : <span style={{ ...TYP.listtitel, ...TNUM, color: FARG.text }}>~{Math.round(kvar)} m³</span>;
}

const Rad = ({ r }: { r: KvarSortiment }) => (
  <div data-testid={`kvar-rad-${r.nyckel}`} style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: 44, alignItems: 'center' }}>
    <SortimentNamn namn={r.namn} />
    <KvarVarde kvar={r.kvar} klart={r.klart} />
  </div>
);

export function KvarArk({ kvar, sammanfattning, dagens, idagText, vantande, onLass, onStang }: {
  kvar: Kvar;
  sammanfattning: KvarSammanfattning;
  dagens: readonly Lass[];
  idagText: string;
  vantande: number;
  onLass: (l: Lass) => void;
  onStang: () => void;
}) {
  const [visaIdag, setVisaIdag] = useState(false);
  const [visaOvrigt, setVisaOvrigt] = useState(false);
  const vy = kvarVy(kvar);
  const tomt = vy.synliga.length === 0 && !vy.ovrigt;
  return (
    <div style={arkRam}>
      <div data-testid="kvar-ark" role="dialog" aria-label="Kvar på trakten" style={arkPanel}>
        <div style={{ padding: AVSTAND.l, overflowY: 'auto' }}>
          <div style={{ ...TYP.tal }}>~{sammanfattning.kvarM3} <span style={{ ...TYP.listtitel, color: FARG.text2 }}>m³ kvar</span></div>
          <div style={{ ...meta, marginTop: AVSTAND.xs }}>
            {sammanfattning.klarText ?? 'Klar-dag visas när trakten har skotats två dagar.'}
          </div>
          <div style={avdelare} />
          {tomt && <div style={meta}>Inget kvar enligt skördaren.</div>}
          {vy.synliga.map((r) => <Rad key={r.nyckel} r={r} />)}
          {vy.ovrigt && (
            <>
              <button type="button" data-testid="kvar-ovrigt" aria-expanded={visaOvrigt} onClick={() => setVisaOvrigt((v) => !v)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRYCK_PX, padding: 0, border: 'none', background: 'transparent', color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ ...TYP.listtitel }}>Övrigt</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}>
                  <KvarVarde kvar={vy.ovrigt.kvar} klart={vy.ovrigt.klart} />
                  <span aria-hidden="true" style={{ ...TYP.text, color: FARG.text2 }}>{visaOvrigt ? '⌄' : '›'}</span>
                </span>
              </button>
              {visaOvrigt && (
                <div data-testid="kvar-ovrigt-lista" style={{ paddingLeft: AVSTAND.m, borderLeft: `2px solid ${FARG.linje}` }}>
                  {vy.ovrigt.rader.filter((r) => !r.oklassat).map((r) => <Rad key={r.nyckel} r={r} />)}
                </div>
              )}
            </>
          )}
          <div style={avdelare} />
          <button type="button" data-testid="kvar-idag" onClick={() => setVisaIdag((v) => !v)}
            style={{ ...knappStor, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={TNUM}>{idagText}</span><span style={{ color: FARG.text2 }}>{visaIdag ? '▴' : '▾'}</span>
          </button>
          {visaIdag && (
            <div style={{ marginTop: AVSTAND.s, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
              {dagens.length === 0 && <div style={meta}>Inga lass i dag än.</div>}
              {[...dagens].sort((a, b) => b.lassNummer - a.lassNummer).map((l) => (
                <button key={l.id} type="button" data-testid={`kvar-lass-${l.lassNummer}`} onClick={() => onLass(l)}
                  style={{ ...knappStor, width: '100%', display: 'block', textAlign: 'left', background: FARG.tonad, minHeight: TRYCK_PX }}>
                  {l.delar.map((d) => (
                    <div key={d.delNr} style={{ marginTop: d.delNr === l.delar[0].delNr ? 0 : AVSTAND.s }}>
                      <div data-testid="kvar-lass-rubrik" style={{ ...TYP.listtitel }}>{lassRubrikRad(l, d, klockslag(d.lossadTid))}{l.status === 'vantar_forare' ? ' · fyll i' : ''}</div>
                      <div data-testid="kvar-lass-sortiment" style={{ ...meta, ...TNUM }}>{lassSortimentText(d.rader)}</div>
                    </div>
                  ))}
                </button>
              ))}
            </div>
          )}
          <div style={{ ...meta, marginTop: AVSTAND.l, ...TNUM }}>
            Trakten: skotat ~{Math.round(kvar.skotat)} av {Math.round(kvar.skordat)} m³ skördat
          </div>
          {vantande > 0 && <div style={{ ...meta, marginTop: AVSTAND.xs, color: FARG.orange }}>{vantande} väntar på att skickas</div>}
        </div>
        <div style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, paddingBottom: medSafeBotten(AVSTAND.l), borderTop: `1px solid ${FARG.linje}` }}>
          <button type="button" data-testid="kvar-stang" onClick={onStang} style={{ ...knappStor, width: '100%' }}>Stäng</button>
        </div>
      </div>
    </div>
  );
}
