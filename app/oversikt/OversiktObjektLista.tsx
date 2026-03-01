'use client';

import React, { useState } from 'react';
import { OversiktObjekt, C, ST, TF } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym, pc } from './oversikt-utils';

interface Props {
  objekt: OversiktObjekt[];
}

function Ring({ v, color, sz = 30 }: { v: number; color: string; sz?: number }) {
  const r = (sz - 4) / 2;
  const ci = 2 * Math.PI * r;
  const o = ci - (v / 100) * ci;
  return (
    <div style={{ position: 'relative', width: sz, height: sz }}>
      <svg width={sz} height={sz} style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
        <circle cx={sz / 2} cy={sz / 2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={2.5} />
        <circle cx={sz / 2} cy={sz / 2} r={r} fill="none" stroke={color} strokeWidth={2.5}
          strokeDasharray={ci} strokeDashoffset={o} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 600, color: v ? C.t2 : C.t4 }}>
        {v || '–'}
      </span>
    </div>
  );
}

type SortKey = 'namn' | 'vol' | 'status';

export default function OversiktObjektLista({ objekt }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const [lf, setLf] = useState<{ b: string; s: string }>({ b: 'alla', s: 'alla' });
  const [ls, setLs] = useState<SortKey>('namn');
  const [showHist, setShowHist] = useState(false);

  const bolag = [...new Set(objekt.map(o => o.bolag).filter(Boolean))] as string[];

  let li = objekt
    .filter(o => showHist || o.status !== 'klar')
    .filter(o => lf.b === 'alla' || o.bolag === lf.b)
    .filter(o => lf.s === 'alla' || o.status === lf.s);

  if (ls === 'vol') li = [...li].sort((a, b) => (b.volym || 0) - (a.volym || 0));
  else if (ls === 'status') {
    const order: Record<string, number> = { pagaende: 0, skordning: 0, skotning: 1, planerad: 2, importerad: 3, klar: 4 };
    li = [...li].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  } else {
    li = [...li].sort((a, b) => (a.namn || '').localeCompare(b.namn || '', 'sv'));
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '0 16px 80px', fontFamily: ff }}>
      {/* Sticky filters */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: C.bg, padding: '14px 0 10px' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {/* Bolag filter */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 3 }}>
            {['alla', ...bolag].map(b => (
              <button key={b} onClick={() => setLf(f => ({ ...f, b }))} style={{
                padding: '4px 10px', background: lf.b === b ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: lf.b === b ? C.t1 : C.t3, border: 'none', borderRadius: 6, fontSize: 10,
                fontWeight: 500, cursor: 'pointer', fontFamily: ff,
              }}>{b === 'alla' ? 'Alla bolag' : b}</button>
            ))}
          </div>
          {/* Status filter */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 3 }}>
            {[
              { k: 'alla', l: 'Alla' },
              { k: 'planerad', l: 'Planerad' },
              { k: 'pagaende', l: 'Pågå.' },
              { k: 'klar', l: 'Klar' },
            ].map(s => (
              <button key={s.k} onClick={() => setLf(f => ({ ...f, s: s.k }))} style={{
                padding: '4px 10px', background: lf.s === s.k ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: lf.s === s.k ? C.t1 : C.t3, border: 'none', borderRadius: 6, fontSize: 10,
                fontWeight: 500, cursor: 'pointer', fontFamily: ff,
              }}>{s.l}</button>
            ))}
          </div>
          {/* Sort */}
          <div style={{ display: 'flex', gap: 2, marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 3 }}>
            {([
              { k: 'namn' as const, l: 'A–Ö' },
              { k: 'vol' as const, l: 'm³' },
              { k: 'status' as const, l: 'Status' },
            ]).map(s => (
              <button key={s.k} onClick={() => setLs(s.k)} style={{
                padding: '4px 8px', background: ls === s.k ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: ls === s.k ? C.t1 : C.t3, border: 'none', borderRadius: 6, fontSize: 10,
                fontWeight: 500, cursor: 'pointer', fontFamily: ff,
              }}>{s.l}</button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.t4 }}>
          {li.length} objekt · {li.reduce((s, o) => s + (o.volym || 0), 0).toLocaleString('sv-SE')} m³
        </div>
      </div>

      {/* List */}
      {li.map(o => {
        const st = ST[o.status] || ST.planerad;
        const tf = TF[o.typ] || C.yellow;
        const s = sel === o.id;
        const skP = 0; // Production not tracked yet
        const stP = 0;

        return (
          <div key={o.id} onClick={() => setSel(s ? null : o.id)} style={{
            background: s ? C.card : 'transparent', borderRadius: 14,
            padding: s ? 16 : 14, margin: s ? '6px 0' : 0,
            borderBottom: s ? 'none' : `1px solid ${C.border}`,
            cursor: 'pointer', transition: 'background 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Left color bar */}
              <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: tf, opacity: s ? 0.6 : 0.2 }} />
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  {o.namn}{' '}
                  <span style={{ fontSize: 11, fontWeight: 400, color: C.t4 }}>{o.vo_nummer || ''}</span>
                </div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                  {o.bolag || '–'} · {o.atgard || (o.typ === 'slutavverkning' ? 'Slutavv.' : 'Gallring')} · {o.areal || '–'} ha
                </div>
              </div>
              {/* Volume + status */}
              <div style={{ textAlign: 'right', marginRight: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {formatVolym(o.volym || 0)}
                  <span style={{ fontSize: 10, fontWeight: 400, color: C.t4 }}> m³</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 500, color: st.c, padding: '2px 8px', background: st.bg, borderRadius: 5 }}>
                  {st.l}
                </span>
              </div>
              {/* Mini rings */}
              <div style={{ display: 'flex', gap: 4 }}>
                <Ring v={skP} color={tf} />
                <Ring v={stP} color={tf} />
              </div>
            </div>

            {/* Expanded detail */}
            {s && (
              <div style={{ marginTop: 14, animation: 'fadeIn .15s' }}>
                {[
                  { l: 'Skördare', v: 0, p: skP, pr: 0 },
                  { l: 'Skotare', v: 0, p: stP, pr: 0 },
                ].map((r, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '10px 12px', marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: C.t3 }}>{r.l}</span>
                      {r.v ? (
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          {r.v} m³ <span style={{ fontWeight: 400, color: C.t3 }}>{r.pr} m³/G15h</span>
                        </span>
                      ) : (
                        <span style={{ color: C.t4 }}>Ej påbörjad</span>
                      )}
                    </div>
                    <div style={{ height: 3, background: 'rgba(255,255,255,0.03)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${r.p}%`, height: '100%', background: tf, opacity: 0.5, borderRadius: 2, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                ))}

                {/* Action */}
                <button onClick={(e) => { e.stopPropagation(); window.location.href = `/planering?objekt=${o.id}`; }} style={{
                  width: '100%', marginTop: 6, padding: '8px 0', background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${C.border}`, borderRadius: 8, color: C.t2, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', fontFamily: ff,
                }}>
                  Visa avverkning →
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
