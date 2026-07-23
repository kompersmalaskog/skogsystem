'use client';

/**
 * Detalj.tsx — läge 3: den låsta ordningen 1) Vältorna 2) Ansvarskortet
 * 3) Guiden 4) Detaljmatrisen (hopfälld). Designkontraktet styr: m³ är
 * valutan, gråa staplar (färg hör inte hemma i vältorna), tystnad när bra.
 */

import React, { useState } from 'react';
import type { ObjektVy, ProduktVy, MatrisRuta } from './types';

const GREY = '#8e8e93';
const GREY2 = '#636366';
const CARD = '#1c1c1e';
const SEP = 'rgba(255,255,255,0.08)';
const WARN = '#ff9f0a';
const RED = '#ff453a';
const YELLOW = '#ffd60a';
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif";

const kommatal = (n: number) => n.toString().replace('.', ',');

/* ── 1. Vältorna — träffar vi längderna? ── */
function Vältorna({ p }: { p: ProduktVy }) {
  const max = Math.max(1, ...p.vältor.map((v) => Math.max(v.actualM3, v.orderedM3)));
  return (
    <section style={{ background: CARD, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Träffar vi längderna?</div>
      <div style={{ fontSize: 13, color: GREY, marginBottom: 16 }}>Kapat mot beställt, per längd</div>
      {p.vältor.map((v) => {
        const bredd = (v.actualM3 / max) * 100;
        const streck = (v.orderedM3 / max) * 100;
        return (
          <div key={v.lenLower} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
              <span style={{ color: '#fff', fontWeight: 600 }}>{v.lenLower} cm</span>
              <span style={{ color: GREY }}>{v.actualM3} m³ <span style={{ color: GREY2 }}>(best. {v.orderedM3})</span></span>
            </div>
            <div style={{ position: 'relative', height: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 6 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${bredd}%`, background: '#8e8e93', borderRadius: 6 }} />
              <div style={{ position: 'absolute', left: `${streck}%`, top: -2, bottom: -2, width: 2, background: '#fff', opacity: 0.9 }} title={`beställt ${v.orderedM3} m³`} />
            </div>
          </div>
        );
      })}
      {p.vältorTwist && (
        <div style={{ fontSize: 13, color: WARN, marginTop: 12, lineHeight: 1.5, paddingTop: 12, borderTop: `1px solid ${SEP}` }}>
          {p.vältorTwist}
        </div>
      )}
    </section>
  );
}

/* ── 2. Ansvarskortet — 100 prickar ── */
function Ansvarskortet({ p }: { p: ProduktVy }) {
  const N = Math.min(100, Math.round((p.forcedCutSharePct / 100) * 100));
  const prickar = Array.from({ length: 100 }, (_, i) => i < N);
  return (
    <section style={{ background: CARD, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Vem valde kapet?</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(20, 1fr)', gap: 4, maxWidth: 320, marginBottom: 14 }}>
        {prickar.map((gul, i) => (
          <div key={i} style={{ aspectRatio: '1', borderRadius: '50%', background: gul ? YELLOW : 'rgba(255,255,255,0.13)' }} />
        ))}
      </div>
      <div style={{ fontSize: 13, color: GREY, lineHeight: 1.5 }}>
        Av 100 timmerstockar kapade du <span style={{ color: '#fff', fontWeight: 600 }}>{N}</span> själv — när trädet hade fel.
        Resten fördelade maskinen, som träffade{' '}
        <span style={{ color: '#fff', fontWeight: 600 }}>{p.gradeAutomatic != null ? kommatal(p.gradeAutomatic) : '–'} %</span> på egen hand.
      </div>
    </section>
  );
}

/* ── 3. Guiden — vid fel på trädet ── */
function Guiden({ p }: { p: ProduktVy }) {
  if (!p.guide.klen && !p.guide.grov) return null;
  return (
    <section style={{ background: CARD, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Vid fel på trädet</div>
      {p.guide.klen && <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.5, marginBottom: 8 }}>{p.guide.klen}</div>}
      {p.guide.grov && <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.5, marginBottom: 8 }}>{p.guide.grov}</div>}
      <div style={{ fontSize: 12, color: GREY2, marginTop: 6 }}>Riktning, inte regel — kvaliteten bestämmer alltid.</div>
    </section>
  );
}

/* ── 4. Detaljmatrisen — hopfälld ── */
function Detaljmatris({ p }: { p: ProduktVy }) {
  const [öppen, setÖppen] = useState(false);
  const längder = Array.from(new Set(p.matris.map((m) => m.lenLower))).sort((a, b) => a - b);
  const diametrar = Array.from(new Set(p.matris.map((m) => m.diaLower))).sort((a, b) => a - b);
  const cell = (d: number, l: number) => p.matris.find((m) => m.diaLower === d && m.lenLower === l);
  const klent = diametrar.filter((d) => d < 310);
  const grovt = diametrar.filter((d) => d >= 310);

  const rad = (d: number) => (
    <tr key={d}>
      <td style={{ padding: '4px 8px', fontSize: 12, color: GREY, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: CARD }}>{d} mm</td>
      {längder.map((l) => {
        const c = cell(d, l);
        const visa = c && c.farga;
        return (
          <td key={l} style={{ padding: '4px 6px', textAlign: 'center', fontSize: 12, fontWeight: 700,
            color: visa ? (c!.deviationM3 < 0 ? RED : WARN) : 'transparent' }}>
            {visa ? (c!.deviationM3 > 0 ? `+${c!.deviationM3}` : c!.deviationM3) : ''}
          </td>
        );
      })}
    </tr>
  );

  return (
    <section style={{ background: CARD, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <button onClick={() => setÖppen(!öppen)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <span style={{ transform: öppen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: GREY }}>›</span>
        Visa detaljmatris
      </button>
      {öppen && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, color: GREY }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: RED }} /> saknas</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: WARN }} /> för mycket</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: CARD }}></th>
                  {längder.map((l) => <th key={l} style={{ padding: '4px 6px', fontSize: 11, color: GREY2, fontWeight: 500 }}>{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {klent.length > 0 && <tr><td colSpan={längder.length + 1} style={{ padding: '8px 8px 4px', fontSize: 11, color: GREY2, fontWeight: 600 }}>KLENT (&lt; 310 mm)</td></tr>}
                {klent.map(rad)}
                {grovt.length > 0 && <tr><td colSpan={längder.length + 1} style={{ padding: '8px 8px 4px', fontSize: 11, color: GREY2, fontWeight: 600 }}>GROVT (≥ 310 mm)</td></tr>}
                {grovt.map(rad)}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: GREY, marginTop: 12, lineHeight: 1.5 }}>
            −9 betyder: här saknas 9 m³. Tomt = på beställningen.
          </div>
        </div>
      )}
    </section>
  );
}

export default function Detalj({ vy, produkt }: { vy: ObjektVy; produkt: ProduktVy }) {
  return (
    <div>
      <Vältorna p={produkt} />
      <Ansvarskortet p={produkt} />
      <Guiden p={produkt} />
      <Detaljmatris p={produkt} />
    </div>
  );
}
