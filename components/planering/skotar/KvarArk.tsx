'use client';

// Tryck på "Kvar ~121 m³" i objektpillen: kvar per sortiment, klar-dag, "Idag: 7 lass · 131 m³" (tryck → dagens lass, tryck på ett lass → Ändra)
// och "Trakten: skotat X av Y m³". Siffrorna har alltid "~": kvar är skördarens mätning minus förarens rapporterade hela m³.

import React, { useState } from 'react';
import { AVSTAND, FARG, TNUM, TYP, medSafeBotten } from '@/lib/design/tokens';
import { klockslag } from '@/lib/skotarLass/avlaggStat';
import { lassRad, lassTitel } from '@/lib/skotarLass/lassModell';
import { sortimentVisning } from '@/lib/skotarLass/sortiment';
import type { Kvar, KvarSammanfattning } from '@/lib/skotarLass/kvar';
import type { Lass } from '@/lib/skotarLass/typer';
import { arkPanel, arkRam, avdelare, knappStor, meta, TRYCK_PX } from './stil';

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
  const rader = kvar.rader.filter((r) => Math.abs(r.kvar) >= 0.5);
  return (
    <div style={arkRam}>
      <div data-testid="kvar-ark" role="dialog" aria-label="Kvar på trakten" style={arkPanel}>
        <div style={{ padding: AVSTAND.l, overflowY: 'auto' }}>
          <div style={{ ...TYP.tal }}>~{sammanfattning.kvarM3} <span style={{ ...TYP.listtitel, color: FARG.text2 }}>m³ kvar</span></div>
          <div style={{ ...meta, marginTop: AVSTAND.xs }}>
            {sammanfattning.klarText ?? 'Klar-dag visas när trakten har skotats två dagar.'}
          </div>
          <div style={avdelare} />
          {rader.length === 0 && <div style={meta}>Inget kvar enligt skördaren.</div>}
          {rader.map((r) => (
            <div key={r.nyckel} style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: 36, alignItems: 'center', ...TYP.text }}>
              <span>{sortimentVisning(r.namn)}</span>
              <span style={{ ...TNUM, color: r.kvar < 0 ? FARG.text2 : FARG.text }}>{r.kvar < 0 ? `${Math.round(-r.kvar)} över` : `~${Math.round(r.kvar)} m³`}</span>
            </div>
          ))}
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
                  <div style={{ ...TYP.listtitel }}>{lassTitel(l)} · {klockslag(l.delar[0].lossadTid)}{l.status === 'vantar_forare' ? ' · fyll i' : ''}</div>
                  <div style={{ ...meta, ...TNUM }}>{l.delar.map((d) => lassRad(d, sortimentVisning)).join('  |  ')}</div>
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
