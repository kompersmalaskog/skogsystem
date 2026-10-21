'use client';

/**
 * Detalj.tsx — en trakts aptering, för EN produkt (2026-10-21, Martin: "som Apple, lite text").
 *
 * Frågan sidan svarar på: har maskinen apterat mot beställningen? Därför räknas
 * allt på MASKINENS egna kap (CuttingReason Automatic). När föraren kortar för att
 * trädet är krokigt eller har fel är det rätt aptering — det står som en neutral
 * rad, aldrig som en miss, och aldrig ordet "fel virke".
 *
 * Ordning: 1) ett tal (i beställd längd) med m³ utanför och förarens kortningar,
 * 2) högst en mening, 3) per längd (kapat minus beställt, åt två håll från mitten),
 * 4) två rader som fälls ut på plats: Per diameter · När föraren kortar.
 * Färg förstärker bara — tecknet och ordet står alltid i texten.
 */

import React, { useState } from 'react';
import { AVSTAND, FARG, IKON, KORT, RADIE, TNUM, TYP, overgang } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ikon from '@/components/design/Ikon';
import type { ObjektVy, ProduktVy } from './types';
import { m3 } from './oversikt';

/** Under så här många m³ från beställt räknas en längd som träff (samma gräns som matrisen). */
export const TRAFF_M3 = 3;

const tecken = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** "13 av 100 stockar kortade av föraren" — andelen manuella kap, avrundad till hela av 100. */
export function forarRad(p: Pick<ProduktVy, 'forcedCutSharePct'>): string {
  const n = Math.min(100, Math.max(0, Math.round(p.forcedCutSharePct)));
  return `${n} av 100 stockar kortade av föraren`;
}

/* ── 1. Talet ── */
function Talet({ p }: { p: ProduktVy }) {
  if (p.gradeAutomatic == null) {
    return (
      <section style={{ ...KORT, marginBottom: AVSTAND.xl }} data-detalj-tal>
        <div style={{ ...TYP.text, color: FARG.text2 }}>Maskinen har inte kapat något på egen hand i den här produkten — inget att bedöma.</div>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>{forarRad(p)}</div>
      </section>
    );
  }
  return (
    <section style={{ ...KORT, marginBottom: AVSTAND.xl }} data-detalj-tal>
      <div style={{ ...TYP.meta, color: FARG.text2 }}>I beställd längd</div>
      <div style={{ ...TYP.tal, marginTop: AVSTAND.s }}>{Math.round(p.gradeAutomatic)} %</div>
      <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.s }}>
        {m3(p.utanforM3 ?? 0)} utanför · av maskinens {m3(p.volymAutoM3)}
      </div>
      <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.xs }} data-forare>{forarRad(p)}</div>
    </section>
  );
}

/* ── 3. Per längd — kapat minus beställt, åt två håll från mitten ── */
function PerLangd({ p }: { p: ProduktVy }) {
  const rader = p.vältor.map((v) => ({ len: v.lenLower, diff: v.actualM3 - v.orderedM3 }));
  if (!rader.length) return null;
  const max = Math.max(1, ...rader.map((r) => Math.abs(r.diff)));
  return (
    <Sektion rubrik="Per längd" not="Kapat minus beställt, maskinens egna kap.">
      <div style={{ padding: `${AVSTAND.s}px 0` }}>
        {rader.map((r) => {
          const traff = Math.abs(r.diff) < TRAFF_M3;
          const bredd = traff ? 0 : (Math.abs(r.diff) / max) * 50;
          const farg = traff ? FARG.text3 : r.diff < 0 ? FARG.rod : FARG.orange;
          return (
            <div key={r.len} data-langd={r.len}
              style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TYP.listtitel.fontSize + AVSTAND.l }}>
              <span style={{ ...TYP.meta, ...TNUM, color: FARG.text, width: AVSTAND.xxl * 2, flexShrink: 0 }}>{r.len} cm</span>
              <div style={{ flex: 1, position: 'relative', height: AVSTAND.s, background: FARG.tonad, borderRadius: RADIE.stapel }}>
                <div style={{ position: 'absolute', left: '50%', top: -AVSTAND.xs, bottom: -AVSTAND.xs, width: 1, background: FARG.text3 }} />
                {!traff && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, width: `${bredd}%`, background: farg, borderRadius: RADIE.stapel,
                    ...(r.diff < 0 ? { right: '50%' } : { left: '50%' }) }} />
                )}
              </div>
              <span style={{ ...TYP.meta, ...TNUM, color: traff ? FARG.text2 : FARG.text, width: AVSTAND.xxl * 2, textAlign: 'right', flexShrink: 0 }}>
                {traff ? 'träff' : `${tecken(r.diff)} m³`}
              </span>
            </div>
          );
        })}
      </div>
    </Sektion>
  );
}

/* ── 4a. Per diameter — matrisen, bara rutorna som sticker ut ── */
function PerDiameter({ p }: { p: ProduktVy }) {
  const längder = Array.from(new Set(p.vältor.map((v) => v.lenLower))).sort((a, b) => a - b);
  const diametrar = Array.from(new Set(p.matris.map((m) => m.diaLower))).sort((a, b) => a - b);
  const cell = (d: number, l: number) => p.matris.find((m) => m.diaLower === d && m.lenLower === l);
  if (!längder.length || !diametrar.length) return <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.s}px 0 ${AVSTAND.m}px` }}>Ingen diameter att visa.</div>;
  const th = { ...TYP.meta, ...TNUM, color: FARG.text3, fontWeight: TYP.meta.fontWeight, padding: `${AVSTAND.xs}px ${AVSTAND.xs}px` } as const;
  return (
    <div style={{ padding: `${AVSTAND.s}px 0 ${AVSTAND.m}px` }} data-matris>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...th, position: 'sticky', left: 0, background: FARG.kort }} />
              {längder.map((l) => <th key={l} style={th}>{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {diametrar.map((d) => (
              <tr key={d}>
                <td style={{ ...th, color: FARG.text2, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: FARG.kort, textAlign: 'left' }}>{d} mm</td>
                {längder.map((l) => {
                  const c = cell(d, l);
                  const visa = c?.farga;
                  return (
                    <td key={l} style={{ ...TYP.meta, ...TNUM, textAlign: 'center', padding: `${AVSTAND.xs}px`, color: visa ? (c!.deviationM3 < 0 ? FARG.rod : FARG.orange) : FARG.text3 }}>
                      {visa ? tecken(c!.deviationM3) : '·'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>m³ från beställt. · = på beställningen.</div>
    </div>
  );
}

/* ── 4b. När föraren kortar — alla stockar inräknat, och vilken längd vältan saknar ── */
function NarForarenKortar({ p }: { p: ProduktVy }) {
  return (
    <div style={{ padding: `${AVSTAND.s}px 0 ${AVSTAND.m}px` }} data-forare-kortar>
      <div style={{ ...TYP.text, ...TNUM }}>
        Alla stockar inräknat: {p.gradePct == null ? '–' : `${Math.round(p.gradePct)} %`} i beställd längd
      </div>
      {(p.guide.klen || p.guide.grov) && (
        <>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.m }}>Längden vältan saknar mest:</div>
          {p.guide.klen && <div style={{ ...TYP.text, ...TNUM, marginTop: AVSTAND.xs }}>{p.guide.klen}</div>}
          {p.guide.grov && <div style={{ ...TYP.text, ...TNUM, marginTop: AVSTAND.xs }}>{p.guide.grov}</div>}
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>Riktning, inte regel — kvaliteten bestämmer.</div>
        </>
      )}
    </div>
  );
}

function FallUtRad({ titel, oppen, onTryck, sista, id, children }: { titel: string; oppen: boolean; onTryck: () => void; sista?: boolean; id: string; children: React.ReactNode }) {
  return (
    <>
      <Rad titel={titel} onTryck={onTryck} pil={false} sista={sista && !oppen} attr={{ 'data-fall-ut': id, 'aria-expanded': String(oppen) }}
        hoger={<span style={{ display: 'inline-flex', transform: oppen ? 'rotate(90deg)' : undefined, transition: overgang('transform') }}><Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} /></span>} />
      {oppen && children}
    </>
  );
}

export default function Detalj({ produkt: p }: { vy: ObjektVy; produkt: ProduktVy }) {
  const [oppen, setOppen] = useState<'diameter' | 'forare' | null>(null);
  const vaxla = (k: 'diameter' | 'forare') => setOppen((o) => (o === k ? null : k));
  return (
    <div>
      <Talet p={p} />
      {p.mening && <p style={{ ...TYP.text, margin: `0 0 ${AVSTAND.xl}px` }} data-mening>{p.mening}.</p>}
      <PerLangd p={p} />
      <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
        <FallUtRad id="diameter" titel="Per diameter" oppen={oppen === 'diameter'} onTryck={() => vaxla('diameter')}>
          <PerDiameter p={p} />
        </FallUtRad>
        <FallUtRad id="forare" titel="När föraren kortar" oppen={oppen === 'forare'} onTryck={() => vaxla('forare')} sista>
          <NarForarenKortar p={p} />
        </FallUtRad>
      </div>
    </div>
  );
}
