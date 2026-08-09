'use client';

import React, { useState } from 'react';
import { OversiktObjekt, C, ST, TF } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym, pc } from './oversikt-utils';
import type { ProdAgg } from './page';

interface Props {
  objekt: OversiktObjekt[];
  prodMap: Record<string, ProdAgg>;
}

function Ring({ v, color, sz = 36 }: { v: number; color: string; sz?: number }) {
  const r = (sz - 4) / 2;
  const ci = 2 * Math.PI * r;
  const o = ci - (v / 100) * ci;
  return (
    <div style={{ position: 'relative', width: sz, height: sz }}>
      <svg width={sz} height={sz} style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
        <circle cx={sz / 2} cy={sz / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={2.5} />
        <circle cx={sz / 2} cy={sz / 2} r={r} fill="none" stroke={color} strokeWidth={2.5}
          strokeDasharray={ci} strokeDashoffset={o} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: v ? C.t2 : C.t4 }}>
        {v || '–'}
      </span>
    </div>
  );
}

function Tag({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
      color: warn ? C.yellow : C.t2,
      background: warn ? C.yd : 'rgba(255,255,255,0.04)',
      border: `1px solid ${C.border}`,
    }}>{children}</span>
  );
}

/** Detail panel — slide-in bottom sheet */
function ObjektDetalj({ obj, prodMap, onClose }: { obj: OversiktObjekt; prodMap: Record<string, ProdAgg>; onClose: () => void }) {
  const tf = TF[obj.typ] || C.yellow;
  const st = ST[obj.status] || ST.planerad;
  const prod = prodMap[obj.id];
  const skVol = prod?.skordareVol || 0;
  const stVol = prod?.skotareVol || 0;
  const skP = pc(skVol, obj.volym || 0);
  const stP = pc(stVol, obj.volym || 0);
  const ber = obj.trakt_data?.beraknad;

  const noteringar: string[] = [];
  if (obj.transport_kommentar) noteringar.push(obj.transport_kommentar);
  if (obj.skordare_manuell_fallning_text) noteringar.push(obj.skordare_manuell_fallning_text);
  if (obj.markagare_ved_text) noteringar.push(obj.markagare_ved_text);
  if (obj.info_anteckningar) noteringar.push(obj.info_anteckningar);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.t3, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative', width: '100%', maxWidth: 500, maxHeight: '85vh',
        background: C.cardGrad, borderRadius: '12px 12px 0 0',
        borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}`, borderBottom: 'none',
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {/* Top accent line */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${tf}, transparent)` }} />

        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        <div style={{ padding: '0 20px 24px' }}>
          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{obj.namn}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: st.c, padding: '3px 10px', background: st.bg, borderRadius: 20 }}>{st.l}</span>
            </div>
            <div style={{ fontSize: 13, color: C.t3 }}>
              {obj.bolag || '–'} · {obj.atgard || (obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring')} · {obj.areal || '–'} ha
              {obj.vo_nummer ? ` · ${obj.vo_nummer}` : ''}
            </div>
          </div>

          {/* Volym + Produktion */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            <div style={{ background: C.cardGrad, borderRadius: 12, padding: '14px 12px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{formatVolym(obj.volym || 0)}<span style={{ fontSize: 13, fontWeight: 400, color: C.t3 }}> m³</span></div>
              <div style={{ fontSize: 13, color: C.t3, marginTop: 4 }}>Planerad volym</div>
            </div>
            <div style={{ background: C.cardGrad, borderRadius: 12, padding: '14px 12px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{formatVolym(Math.round(skVol))}<span style={{ fontSize: 13, fontWeight: 400, color: C.t3 }}> m³</span></div>
              <div style={{ fontSize: 13, color: C.t3, marginTop: 4 }}>Skördat ({skP}%)</div>
            </div>
          </div>

          {/* Progress bars */}
          {(skVol > 0 || stVol > 0) && (
            <div style={{ marginBottom: 20 }}>
              {[{ l: 'Skördare', p: skP }, { l: 'Skotare', p: stP }].map((r, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: C.t3 }}>{r.l}</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{r.p}%</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${r.p}%`, height: '100%', background: tf, borderRadius: 2, transition: 'width 0.5s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Restriktioner — only if present */}
          {ber?.restriktioner && ber.restriktioner.length > 0 && (
            <div style={{ background: C.rd, border: `1px solid rgba(255,69,58,0.15)`, borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.red, marginBottom: 8 }}>Restriktioner</div>
              {ber.restriktioner.map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: C.t1, marginBottom: 4 }}>
                  {r.name}{r.warning ? <span style={{ color: C.red }}> — {r.warning}</span> : ''}
                </div>
              ))}
            </div>
          )}

          {/* Väg & Transport — only if relevant */}
          {(obj.transport_trailer_in !== undefined || obj.transport_kommentar || obj.barighet || obj.terrang) && (
            <Section title="Väg & Transport">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {obj.barighet && <Tag>{obj.barighet}</Tag>}
                {obj.terrang && <Tag>{obj.terrang}</Tag>}
                {obj.transport_trailer_in === true && <Tag>Trailer in</Tag>}
                {obj.transport_trailer_in === false && <Tag warn>Ej trailer</Tag>}
              </div>
              {obj.transport_kommentar && (
                <div style={{ fontSize: 13, color: C.t2, marginTop: 8, lineHeight: 1.5 }}>{obj.transport_kommentar}</div>
              )}
            </Section>
          )}

          {/* Kontakt — only if present */}
          {(obj.kontakt_namn || obj.markagare || obj.kontakt_telefon) && (
            <Section title="Kontakt">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{obj.kontakt_namn || obj.markagare || '–'}</div>
                </div>
                {obj.kontakt_telefon && (
                  <a href={`tel:${obj.kontakt_telefon}`} onClick={e => e.stopPropagation()}
                    style={{
                      fontSize: 13, color: '#5b8fff', textDecoration: 'none', fontWeight: 500,
                      padding: '8px 16px', background: 'rgba(91,143,255,0.1)', borderRadius: 14,
                      minHeight: 44, display: 'flex', alignItems: 'center',
                    }}>
                    {obj.kontakt_telefon}
                  </a>
                )}
              </div>
            </Section>
          )}

          {/* Maskin-info */}
          {(obj.skordare_maskin || obj.skotare_maskin) && (
            <Section title="Maskiner">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {obj.skordare_maskin && <Tag>{obj.skordare_maskin}{obj.skordare_band ? ` · Band ${obj.skordare_band_par || ''}p` : ''}</Tag>}
                {obj.skotare_maskin && <Tag>{obj.skotare_maskin}{obj.skotare_band ? ` · Band ${obj.skotare_band_par || ''}p` : ''}</Tag>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {obj.skotare_lastreder_breddat && <Tag>Brett lastrede</Tag>}
                {obj.skotare_ris_direkt && <Tag>GROT direkt</Tag>}
                {obj.skordare_manuell_fallning && <Tag warn>Manuell fällning</Tag>}
                {obj.markagare_ska_ha_ved && <Tag>Ved åt markägare</Tag>}
              </div>
            </Section>
          )}

          {/* Noteringar — only if present */}
          {noteringar.length > 0 && (
            <Section title="Noteringar">
              {noteringar.map((n, i) => (
                <div key={i} style={{ fontSize: 13, color: C.t2, marginBottom: 6, lineHeight: 1.5 }}>{n}</div>
              ))}
            </Section>
          )}

          {/* Tillträde — only if present */}
          {obj.ovrigt_info && (
            <Section title="Tillträde">
              <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.5 }}>{obj.ovrigt_info}</div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

type SortKey = 'namn' | 'vol' | 'status';
type GroupMode = 'lista' | 'maskin';

// Åtgärd → traktyp. Martins mappning: Au/Rp/Lrk = Slutavverkning, Gallring = Gallring.
// Saknad/okänd åtgärd faller tillbaka på objektets typ-fält.
const SLUTAVV_ATGARDER = new Set(['au', 'rp', 'lrk']);
function klassaObjektTyp(o: OversiktObjekt): 'slutavverkning' | 'gallring' {
  const a = (o.atgard || '').trim().toLowerCase();
  if (SLUTAVV_ATGARDER.has(a)) return 'slutavverkning';
  if (a === 'gallring') return 'gallring';
  return o.typ === 'slutavverkning' ? 'slutavverkning' : 'gallring';
}

export default function OversiktObjektLista({ objekt, prodMap }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const [lf, setLf] = useState<{ b: string; s: string; t: string }>({ b: 'alla', s: 'alla', t: 'alla' });
  const [ls, setLs] = useState<SortKey>('status');
  const [groupMode, setGroupMode] = useState<GroupMode>('lista');
  const [showHist, setShowHist] = useState(false);

  const bolag = [...new Set(objekt.map(o => o.bolag).filter(Boolean))] as string[];
  const selectedObj = sel ? objekt.find(o => o.id === sel) : null;

  let li = objekt
    .filter(o => showHist || o.status !== 'klar')
    .filter(o => lf.b === 'alla' || o.bolag === lf.b)
    .filter(o => lf.t === 'alla' || klassaObjektTyp(o) === lf.t)
    .filter(o => {
      if (lf.s === 'alla') return true;
      if (lf.s === 'pagaende') return o.status === 'pagaende' || o.status === 'skordning' || o.status === 'skotning';
      return o.status === lf.s;
    });

  if (ls === 'vol') li = [...li].sort((a, b) => (b.volym || 0) - (a.volym || 0));
  else if (ls === 'status') {
    const order: Record<string, number> = { pagaende: 0, skordning: 0, skotning: 1, planerad: 2, importerad: 3, klar: 4 };
    li = [...li].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  } else {
    li = [...li].sort((a, b) => (a.namn || '').localeCompare(b.namn || '', 'sv'));
  }

  // Per maskin: objektet listas under BÅDE sin skördare och sin skotare (Martins val:
  // objektets egna fält skordare_maskin/skotare_maskin). Räknas i båda summorna.
  const grupper: { maskin: string; objekt: OversiktObjekt[]; volym: number }[] = [];
  if (groupMode === 'maskin') {
    const map = new Map<string, OversiktObjekt[]>();
    const utan: OversiktObjekt[] = [];
    for (const o of li) {
      const unika = Array.from(new Set([o.skordare_maskin, o.skotare_maskin].filter(Boolean) as string[]));
      if (unika.length === 0) { utan.push(o); continue; }
      for (const m of unika) {
        if (!map.has(m)) map.set(m, []);
        map.get(m)!.push(o);
      }
    }
    for (const m of Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'sv'))) {
      const objs = map.get(m)!;
      grupper.push({ maskin: m, objekt: objs, volym: objs.reduce((s, o) => s + (o.volym || 0), 0) });
    }
    if (utan.length > 0) {
      grupper.push({ maskin: 'Ej tilldelad maskin', objekt: utan, volym: utan.reduce((s, o) => s + (o.volym || 0), 0) });
    }
  }

  const renderKort = (o: OversiktObjekt) => {
    const st = ST[o.status] || ST.planerad;
    const tf = TF[o.typ] || C.yellow;
    const prod = prodMap[o.id];
    const skP = pc(prod?.skordareVol || 0, o.volym || 0);
    const stP = pc(prod?.skotareVol || 0, o.volym || 0);

    return (
      <div key={o.id} onClick={() => setSel(o.id)} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 14px', minHeight: 44,
        background: C.cardGrad, border: `1px solid ${C.border}`,
        borderRadius: 12, marginBottom: 8,
        cursor: 'pointer',
      }}>
        {/* Left color bar */}
        <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: tf, opacity: 0.4 }} />
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{o.namn}</span>
            {o.grot === true && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: C.gd, color: C.green, whiteSpace: 'nowrap', flexShrink: 0 }}>GROT</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {o.bolag || '–'} · {o.atgard || (o.typ === 'slutavverkning' ? 'Slutavv.' : 'Gallring')} · {o.areal || '–'} ha{o.terrang ? ` · ${o.terrang}` : ''}
          </div>
        </div>
        {/* Volume + status */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            {formatVolym(o.volym || 0)}
            <span style={{ fontSize: 11, fontWeight: 400, color: C.t3 }}> m³</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 500, color: st.c, padding: '2px 8px', background: st.bg, borderRadius: 20 }}>
            {st.l}
          </span>
        </div>
        {/* Mini rings */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <Ring v={skP} color={tf} />
          <Ring v={stP} color={tf} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '0 16px 80px', fontFamily: ff }}>
      {/* Sticky filters — 44px touch targets */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: C.bg, padding: '14px 0 10px' }}>
        {/* Vy-växling + traktyp */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {/* Per maskin / Lista */}
          <div style={{ display: 'flex', gap: 3, background: C.cardGrad, borderRadius: 20, padding: 3, border: `1px solid ${C.border}`, boxShadow: C.shadowSm }}>
            {([{ k: 'lista' as const, l: 'Lista' }, { k: 'maskin' as const, l: 'Per maskin' }]).map(g => (
              <button key={g.k} onClick={() => setGroupMode(g.k)} style={{
                padding: '8px 12px', minHeight: 36, background: groupMode === g.k ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: groupMode === g.k ? C.t1 : C.t3, border: 'none', borderRadius: 20, fontSize: 12,
                fontWeight: 500, cursor: 'pointer', fontFamily: ff,
              }}>{g.l}</button>
            ))}
          </div>
          {/* Traktyp — Slutavverkning / Gallring */}
          <div style={{ display: 'flex', gap: 3, background: C.cardGrad, borderRadius: 20, padding: 3, border: `1px solid ${C.border}`, boxShadow: C.shadowSm }}>
            {([{ k: 'alla', l: 'Alla' }, { k: 'slutavverkning', l: 'Slutavv.' }, { k: 'gallring', l: 'Gallring' }]).map(t => (
              <button key={t.k} onClick={() => setLf(f => ({ ...f, t: t.k }))} style={{
                padding: '8px 12px', minHeight: 36, background: lf.t === t.k ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: lf.t === t.k ? C.t1 : C.t3, border: 'none', borderRadius: 20, fontSize: 12,
                fontWeight: 500, cursor: 'pointer', fontFamily: ff,
              }}>{t.l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {/* Status filter */}
          <div style={{ display: 'flex', gap: 3, background: C.cardGrad, borderRadius: 20, padding: 3, border: `1px solid ${C.border}`, boxShadow: C.shadowSm }}>
            {[
              { k: 'alla', l: 'Alla' },
              { k: 'pagaende', l: 'Pågående' },
              { k: 'planerad', l: 'Planerad' },
              { k: 'importerad', l: 'Import.' },
              { k: 'klar', l: 'Klar' },
            ].map(s => (
              <button key={s.k} onClick={() => { setLf(f => ({ ...f, s: s.k })); if (s.k === 'klar') setShowHist(true); }} style={{
                padding: '8px 12px', minHeight: 36, background: lf.s === s.k ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: lf.s === s.k ? C.t1 : C.t3, border: 'none', borderRadius: 20, fontSize: 12,
                fontWeight: 500, cursor: 'pointer', fontFamily: ff,
              }}>{s.l}</button>
            ))}
          </div>
          {/* Sort */}
          <div style={{ display: 'flex', gap: 3, marginLeft: 'auto', background: C.cardGrad, borderRadius: 20, padding: 3, border: `1px solid ${C.border}`, boxShadow: C.shadowSm }}>
            {([
              { k: 'namn' as const, l: 'A–Ö' },
              { k: 'vol' as const, l: 'm³' },
              { k: 'status' as const, l: 'Status' },
            ]).map(s => (
              <button key={s.k} onClick={() => setLs(s.k)} style={{
                padding: '8px 10px', minHeight: 36, background: ls === s.k ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: ls === s.k ? C.t1 : C.t3, border: 'none', borderRadius: 20, fontSize: 12,
                fontWeight: 500, cursor: 'pointer', fontFamily: ff,
              }}>{s.l}</button>
            ))}
          </div>
        </div>
        {/* Bolag filter (if multiple) */}
        {bolag.length > 1 && (
          <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
            {['alla', ...bolag].map(b => (
              <button key={b} onClick={() => setLf(f => ({ ...f, b }))} style={{
                padding: '6px 12px', minHeight: 32, background: lf.b === b ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: lf.b === b ? C.t1 : C.t3, border: 'none', borderRadius: 20, fontSize: 12,
                fontWeight: 500, cursor: 'pointer', fontFamily: ff,
              }}>{b === 'alla' ? 'Alla bolag' : b}</button>
            ))}
          </div>
        )}
        <div style={{ fontSize: 12, color: C.t3 }}>
          {li.length} objekt · {li.reduce((s, o) => s + (o.volym || 0), 0).toLocaleString('sv-SE')} m³
        </div>
      </div>

      {/* List — platt eller grupperad per maskin */}
      {groupMode === 'lista'
        ? li.map(renderKort)
        : grupper.length === 0
          ? <div style={{ fontSize: 13, color: C.t3, padding: '20px 4px' }}>Inga objekt.</div>
          : grupper.map(g => (
              <div key={g.maskin} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>{g.maskin}</span>
                  <span style={{ fontSize: 12, color: C.t3 }}>
                    {g.objekt.length} objekt · {g.volym.toLocaleString('sv-SE')} m³
                  </span>
                </div>
                {g.objekt.map(renderKort)}
              </div>
            ))}

      {/* Detail panel */}
      {selectedObj && (
        <ObjektDetalj obj={selectedObj} prodMap={prodMap} onClose={() => setSel(null)} />
      )}
    </div>
  );
}
