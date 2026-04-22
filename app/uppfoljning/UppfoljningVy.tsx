'use client';

import React, { useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────
export interface Forare {
  namn: string;
  fran: string;
  till: string;
}

export interface Maskin {
  typ: 'Skördare' | 'Skotare';
  modell: string;
  start: string;
  slut: string;
  aktivForare: string;
  tidigareForare?: Forare[];
}

export interface AvbrottRad {
  orsak: string;
  typ: string;
  tid: string;
  antal: number;
}

export interface DieselDag {
  datum: string;
  liter: number;
}

export interface UppfoljningData {
  objektNamn: string;
  senastUppdaterad?: string;
  skordat: number;
  skotat: number;
  kvarPct: number;
  egenSkotning?: boolean;
  grotSkotning?: boolean;
  externSkotning?: boolean;
  externForetag?: string;
  externPrisTyp?: 'm3' | 'timme';
  externPris?: number;
  externAntal?: number;
  maskiner: Maskin[];
  // V6 detail meta
  typ?: 'slutavverkning' | 'gallring';
  areal?: number;
  agare?: string;
  status?: 'pagaende' | 'avslutat';
  skordareModell?: string | null;
  skordareStart?: string | null;
  skordareSlut?: string | null;
  skordareLastDate?: string | null;
  skotareModell?: string | null;
  skotareStart?: string | null;
  skotareSlut?: string | null;
  skotareLastDate?: string | null;
  operatorSkordare?: string | null;
  operatorSkotare?: string | null;
  prodSkordarePerDag?: { datum: string; m3: number }[];
  // Tidredovisning
  skordareG15h: number;
  skordareG0: number;
  skordareTomgang: number;
  skordareKortaStopp: number;
  skordareRast: number;
  skordareAvbrott: number;
  skotareG15h: number;
  skotareG0: number;
  skotareTomgang: number;
  skotareKortaStopp: number;
  skotareRast: number;
  skotareAvbrott: number;
  // Produktion
  skordareM3G15h: number;
  skordareStammarG15h: number;
  skordareMedelstam: number;
  skotareM3G15h: number;
  skotareLassG15h: number;
  skotareSnittlass: number;
  tradslag: { namn: string; pct: number }[];
  sortiment: { namn: string; m3: number }[];
  // Diesel
  dieselTotalt: number;
  dieselPerM3: number;
  skordareL: number;
  skordareL_M3: number;
  skordareL_G15h: number;
  skotareL: number;
  skotareL_M3: number;
  skotareL_G15h: number;
  dieselSkordare: DieselDag[];
  dieselSkotare: DieselDag[];
  // Avbrott
  avbrottSkordare: AvbrottRad[];
  avbrottSkotareTotalt: string;
  avbrottSkordare_totalt: string;
  avbrottSkotare: AvbrottRad[];
  // Skotarproduktion
  antalLass: number;
  snittlassM3: number;
  lassG15h: number;
  skotningsavstand: number;
  lassPerDag: { datum: string; lass: number; m3?: number }[];
  // Balans
  skordareBalG15h: number;
  skotareBalG15h: number;
}

// ── Design tokens ─────────────────────────────────────────────────────────
const V6_GREY = '#8e8e93';
const V6_GREY2 = '#636366';
const V6_CARD = '#141416';
const V6_SEP = 'rgba(255,255,255,0.06)';
const V6_SK = '#a8d582';
const V6_ST = '#f0b24c';
const V6_WARN = '#ff9f0a';
const V6_DONE = '#30d158';
const V6_BG = '#000';
const V6_FF = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif";

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtISO(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'][d.getMonth()]}`;
}
function daysBetween(a?: string | null, b?: string | null): number {
  if (!a) return 0;
  const d1 = new Date(a);
  const d2 = b ? new Date(b) : new Date();
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 864e5));
}
function daysAgo(iso?: string | null): string | null {
  if (!iso) return null;
  const d = daysBetween(iso, undefined);
  return d === 0 ? 'idag' : d === 1 ? 'igår' : `${d} dagar sedan`;
}

// Sortiment name cleanup (bevarad från tidigare version)
const sortimentNamnMap: Record<string, string> = {
  'BmavFall': 'Barrmassaved', 'BmavFall_V3': 'Barrmassaved', 'BmavFall_V4': 'Barrmassaved',
  'BjörkmavFall': 'Björkmassaved', 'BjörkmavFall_V3': 'Björkmassaved',
  'EngvedFall': 'Energived', 'EngvedFall_V3': 'Energived',
  'Timmer': 'Sågtimmer', 'TimmerFall': 'Sågtimmer',
  'Kubb': 'Kubb', 'KubbFall': 'Kubb',
  'GranTimmer': 'Grantimmer', 'TallTimmer': 'Talltimmer',
  'GranMassa': 'Granmassaved', 'TallMassa': 'Tallmassaved',
};
function sortimentSvenska(raw: string): string {
  if (sortimentNamnMap[raw]) return sortimentNamnMap[raw];
  const base = raw.replace(/_V\d+$/, '');
  if (sortimentNamnMap[base]) return sortimentNamnMap[base];
  const lower = raw.toLowerCase();
  for (const [k, v] of Object.entries(sortimentNamnMap)) {
    if (k.toLowerCase() === lower) return v;
  }
  return raw;
}

const avbrottOversattning: Record<string, string> = {
  'Saw maintenance': 'Sågunderhåll',
  'Refilling and lubrication': 'Påfyllning och smörjning',
  'Boom failure': 'Kranfel',
  'Saw failure': 'Sågfel',
  'Engine failure': 'Motorfel',
  'Hydraulic failure': 'Hydraulikfel',
  'Electric failure': 'Elfel',
  'Boom maintenance': 'Kranunderhåll',
  'Track failure': 'Bandfel',
  'Moving': 'Förflyttning',
};
function avbrottSv(raw: string): string {
  return avbrottOversattning[raw] || raw;
}

// ── Headline (meta + H1) ──────────────────────────────────────────────────
function Headline({ data }: { data: UppfoljningData }) {
  const typLabel = data.typ === 'slutavverkning' ? 'Slutavverkning' : data.typ === 'gallring' ? 'Gallring' : '';
  const parts = [typLabel, data.areal ? `${data.areal} ha` : null, data.agare || null].filter(Boolean);
  return (
    <section style={{ padding: '22px 24px 20px' }}>
      {parts.length > 0 && (
        <div style={{ fontSize: 13, color: V6_GREY, fontWeight: 500 }}>{parts.join(' · ')}</div>
      )}
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.8px', margin: '4px 0 0', lineHeight: 1.05 }}>
        {data.objektNamn}
      </h1>
    </section>
  );
}

// ── Maskinkort ────────────────────────────────────────────────────────────
function MaskinCell({
  label, color, modell, forare, statusKort, primary, primaryUnit, primaryLabel, snitt, senaste,
}: {
  label: string; color: string; modell?: string | null; forare?: string | null;
  statusKort: string; primary: number; primaryUnit: string; primaryLabel: string;
  snitt: number | null; senaste: string | null;
}) {
  return (
    <div style={{ background: V6_CARD, borderRadius: 16, padding: '16px 16px 14px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
        <span style={{ fontSize: 11, color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
        <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.8px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{primary}</span>
        <span style={{ fontSize: 14, color: V6_GREY, fontWeight: 500 }}>{primaryUnit}</span>
      </div>
      <div style={{ fontSize: 11, color: V6_GREY, marginTop: 4, fontWeight: 500, minHeight: 14 }}>{primaryLabel}</div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `0.5px solid ${V6_SEP}`, fontSize: 12, color: V6_GREY, display: 'flex', flexDirection: 'column', gap: 3, fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          <span>Status</span>
          <span style={{ color: '#fff', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>{statusKort}</span>
        </div>
        {snitt != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Snitt/dag</span><span style={{ color: '#fff', fontWeight: 500 }}>{snitt} m³</span>
          </div>
        )}
        {senaste && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Senast</span><span style={{ color: '#fff', fontWeight: 500 }}>{senaste}</span>
          </div>
        )}
        {modell && (
          <div style={{ marginTop: 4, fontSize: 11, color: V6_GREY2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {modell}{forare ? ` · ${forare}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

function Maskinkort({ data }: { data: UppfoljningData }) {
  const kvar = Math.max(0, data.skordat - data.skotat);
  const seven = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const skAct = !!(data.skordareLastDate && data.skordareLastDate >= seven);
  const stAct = !!(data.skotareLastDate && data.skotareLastDate >= seven);

  const skProd = data.prodSkordarePerDag || [];
  const skSnitt = skProd.length > 0 ? Math.round(skProd.reduce((a, b) => a + b.m3, 0) / skProd.length) : null;
  const stProd = data.lassPerDag || [];
  const stProdWithM3 = stProd.filter(d => typeof d.m3 === 'number');
  const stSnitt = stProdWithM3.length > 0 ? Math.round(stProdWithM3.reduce((a, b) => a + (b.m3 || 0), 0) / stProdWithM3.length) : null;

  const showSt = !!data.skotareModell || data.skotat > 0;
  const hasSk = !!data.skordareModell || data.skordat > 0;

  return (
    <section style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: showSt && hasSk ? '1fr 1fr' : '1fr', gap: 10 }}>
        {hasSk && (
          <MaskinCell
            label="Skördare" color={V6_SK}
            modell={data.skordareModell} forare={data.operatorSkordare}
            statusKort={data.skordareSlut ? 'Klar' : skAct ? 'Aktiv idag' : data.skordareStart ? `Start ${fmtISO(data.skordareStart)}` : '—'}
            primary={Math.round(data.skordat)}
            primaryUnit="m³" primaryLabel="skördat"
            snitt={skSnitt}
            senaste={daysAgo(data.skordareLastDate)}
          />
        )}
        {showSt && (
          <MaskinCell
            label="Skotare" color={V6_ST}
            modell={data.skotareModell} forare={data.operatorSkotare}
            statusKort={data.skotareSlut ? 'Klar' : stAct ? 'Aktiv idag' : data.skotareStart ? `Start ${fmtISO(data.skotareStart)}` : 'Ej startad'}
            primary={Math.round(data.skotat)}
            primaryUnit="m³"
            primaryLabel={kvar > 0 ? `utkört · ${Math.round(kvar)} kvar` : 'utkört'}
            snitt={stSnitt}
            senaste={daysAgo(data.skotareLastDate)}
          />
        )}
      </div>
    </section>
  );
}

// ── Tidslinje ─────────────────────────────────────────────────────────────
function Tidslinje({ data }: { data: UppfoljningData }) {
  const allDates = [data.skordareStart, data.skordareSlut, data.skotareStart, data.skotareSlut].filter(Boolean) as string[];
  if (allDates.length === 0) return null;
  const now = new Date().toISOString().slice(0, 10);
  const withNow = [...allDates, now];
  const min = withNow.reduce((a, b) => a < b ? a : b);
  const max = withNow.reduce((a, b) => a > b ? a : b);
  const totalDays = daysBetween(min, max);
  const toPct = (iso?: string | null) => iso ? (daysBetween(min, iso) / totalDays) * 100 : 0;
  const today = toPct(now);

  type Track = { label: string; color: string; start: string; end: string; active: boolean };
  const tracks: Track[] = [];
  if (data.skordareModell || data.skordareStart) {
    tracks.push({ label: 'Skördare', color: V6_SK, start: data.skordareStart || min, end: data.skordareSlut || now, active: !data.skordareSlut });
  }
  if (data.skotareModell || data.skotareStart) {
    tracks.push({ label: 'Skotare', color: V6_ST, start: data.skotareStart || min, end: data.skotareSlut || now, active: !!(data.skotareStart && !data.skotareSlut) });
  }
  if (tracks.length === 0) return null;

  return (
    <section style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 12px' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Tidslinje</h2>
        <span style={{ fontSize: 12, color: V6_GREY, fontVariantNumeric: 'tabular-nums' }}>{totalDays} dagar</span>
      </div>
      <div style={{ background: V6_CARD, borderRadius: 16, padding: '18px 18px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: V6_GREY2, fontWeight: 600, marginBottom: 16, fontVariantNumeric: 'tabular-nums' }}>
          <span>{fmtISO(min)}</span>
          <span>{data.status === 'avslutat' ? fmtISO(max) : 'Idag'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
          {data.status !== 'avslutat' && (
            <div style={{ position: 'absolute', left: `${today}%`, top: -10, bottom: -10, width: 1, background: 'rgba(255,255,255,0.14)', pointerEvents: 'none', zIndex: 1 }} />
          )}
          {tracks.map((t, i) => {
            const startPct = toPct(t.start);
            const endPct = toPct(t.end);
            const width = Math.max(2, endPct - startPct);
            return (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color }} />
                  <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{t.label}</span>
                  <span style={{ fontSize: 11, color: V6_GREY, fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' }}>
                    {fmtISO(t.start)} → {t.active ? 'pågår' : fmtISO(t.end)}
                  </span>
                </div>
                <div style={{ position: 'relative', height: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                  <div style={{ position: 'absolute', left: `${startPct}%`, width: `${width}%`, top: 0, bottom: 0, background: t.color, borderRadius: 6, opacity: t.active ? 1 : 0.5 }} />
                  {t.active && (
                    <div style={{ position: 'absolute', left: `${endPct}%`, top: -2, width: 16, height: 16, marginLeft: -8, borderRadius: '50%', background: t.color, boxShadow: `0 0 0 3px ${V6_CARD}, 0 0 14px ${t.color}` }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Kollapsbar sektion ────────────────────────────────────────────────────
function Collapse({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: `0.5px solid ${V6_SEP}` }}>
      <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '16px 24px', background: 'transparent', border: 'none', color: '#fff', fontFamily: V6_FF, cursor: 'pointer' }}>
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.2px' }}>{title}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={V6_GREY} strokeWidth="2" strokeLinecap="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>
          <polyline points="4 2 8 6 4 10" />
        </svg>
      </button>
      {open && <div style={{ paddingBottom: 8 }}>{children}</div>}
    </div>
  );
}

// ── Produktivitet ─────────────────────────────────────────────────────────
function ProdKort({ color, label, rows }: { color: string; label: string; rows: [string, string][] }) {
  return (
    <div style={{ background: V6_CARD, borderRadius: 14, padding: '14px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
        <span style={{ fontSize: 11, color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rows.map(([v, u], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums', lineHeight: 1, whiteSpace: 'nowrap' }}>{v}</span>
            <span style={{ fontSize: 11, color: V6_GREY, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{u}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Produktivitet({ data }: { data: UppfoljningData }) {
  const skRows: [string, string][] = [];
  if (data.skordareM3G15h > 0) skRows.push([String(data.skordareM3G15h), 'm³/G15h']);
  if (data.skordareStammarG15h > 0) skRows.push([String(data.skordareStammarG15h), 'stammar/G15h']);
  if (data.skordareMedelstam > 0) skRows.push([String(data.skordareMedelstam), 'm³ medelstam']);

  const stRows: [string, string][] = [];
  if (data.skotareM3G15h > 0) stRows.push([String(data.skotareM3G15h), 'm³/G15h']);
  if (data.skotareLassG15h > 0) stRows.push([String(data.skotareLassG15h), 'lass/G15h']);
  if (data.skotareSnittlass > 0) stRows.push([`${data.skotareSnittlass} m³`, 'snittlass']);
  if (data.skotningsavstand > 0) stRows.push([`${data.skotningsavstand} m`, 'skotningsavstånd']);

  if (skRows.length === 0 && stRows.length === 0) {
    return <div style={{ padding: '0 24px 16px', color: V6_GREY, fontSize: 13 }}>Ingen data</div>;
  }

  return (
    <div style={{ padding: '0 24px 16px', display: 'grid', gridTemplateColumns: skRows.length > 0 && stRows.length > 0 ? '1fr 1fr' : '1fr', gap: 10 }}>
      {skRows.length > 0 && <ProdKort color={V6_SK} label="Skördare" rows={skRows} />}
      {stRows.length > 0 && <ProdKort color={V6_ST} label="Skotare" rows={stRows} />}
    </div>
  );
}

// ── Produktion per dag ────────────────────────────────────────────────────
function ProdChart({ data, color, snitt }: { data: { datum: string; m3: number; lass?: number }[]; color: string; snitt: number }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map(d => d.m3), 1);
  const chartH = 130;
  const barMaxH = chartH - 20;
  const snittH = snitt ? (snitt / max) * barMaxH : 0;
  return (
    <div style={{ background: V6_CARD, borderRadius: 14, padding: '16px 18px 14px' }}>
      <div style={{ position: 'relative', height: chartH, borderBottom: `0.5px solid ${V6_SEP}`, paddingBottom: 4 }}>
        {snitt > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 4 + snittH, height: 0, borderTop: `1px dashed ${V6_GREY2}`, pointerEvents: 'none', zIndex: 2 }}>
            <span style={{ position: 'absolute', right: 0, top: -16, fontSize: 10, color: V6_GREY, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 700, background: V6_CARD, padding: '0 4px' }}>snitt {Math.round(snitt)} m³</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: '100%' }}>
          {data.map((d, i) => {
            const h = (d.m3 / max) * barMaxH;
            const isActive = active === i;
            return (
              <div key={i} onClick={() => setActive(isActive ? null : i)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end', cursor: 'pointer', position: 'relative' }}>
                {isActive && d.lass != null && (
                  <div style={{ position: 'absolute', bottom: h + 30, left: '50%', transform: 'translateX(-50%)', background: '#2c2c2e', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 9px', whiteSpace: 'nowrap', fontSize: 11, color: '#fff', zIndex: 5, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>{d.lass} lass · {Math.round(d.m3)} m³</div>
                )}
                <div style={{ fontSize: 11, color: '#fff', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{Math.round(d.m3)}</div>
                <div style={{ width: '100%', maxWidth: 26, height: `${h}px`, background: color, borderRadius: 3, minHeight: 4, opacity: active != null && !isActive ? 0.4 : 1, transition: 'opacity .15s' }} />
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: V6_GREY, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{d.datum}</div>
        ))}
      </div>
    </div>
  );
}

function ProdPerDag({ data }: { data: UppfoljningData }) {
  const skData = data.prodSkordarePerDag || [];
  const stRaw = data.lassPerDag || [];
  // Bara dagar med m³-data för skotare
  const stData = stRaw.filter(d => typeof d.m3 === 'number' && d.m3 > 0).map(d => ({ datum: d.datum, m3: d.m3 || 0, lass: d.lass }));
  const hasSk = skData.length > 0;
  const hasSt = stData.length > 0;
  if (!hasSk && !hasSt) return <div style={{ padding: '0 24px 16px', color: V6_GREY, fontSize: 13 }}>Ingen data</div>;

  const skSnitt = hasSk ? skData.reduce((a, b) => a + b.m3, 0) / skData.length : 0;
  const stSnitt = hasSt ? stData.reduce((a, b) => a + b.m3, 0) / stData.length : 0;
  const stTotalLass = hasSt ? stData.reduce((a, b) => a + (b.lass || 0), 0) : 0;
  const stTotal = hasSt ? stData.reduce((a, b) => a + b.m3, 0) : 0;
  const skTotal = hasSk ? skData.reduce((a, b) => a + b.m3, 0) : 0;

  return (
    <div style={{ padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {hasSk && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: V6_SK, alignSelf: 'center' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Skördare</span>
            <span style={{ fontSize: 11, color: V6_GREY, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
              Snitt {Math.round(skSnitt)} m³/dag · {Math.round(skTotal)} m³
            </span>
          </div>
          <ProdChart data={skData} color={V6_SK} snitt={skSnitt} />
        </div>
      )}
      {hasSt && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: V6_ST, alignSelf: 'center' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Skotare</span>
            <span style={{ fontSize: 11, color: V6_GREY, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
              Snitt {Math.round(stSnitt)} m³/dag · {stTotalLass} lass · {Math.round(stTotal)} m³
            </span>
          </div>
          <ProdChart data={stData} color={V6_ST} snitt={stSnitt} />
          <div style={{ fontSize: 10, color: V6_GREY2, marginTop: 6, textAlign: 'center' }}>Tryck på en stapel för att se antal lass</div>
        </div>
      )}
    </div>
  );
}

// ── Trädslag + Sortiment ──────────────────────────────────────────────────
function Tradslag({ tradslag }: { tradslag: { namn: string; pct: number }[] }) {
  if (!tradslag || tradslag.length === 0) return null;
  const colors = ['#a8d582', '#64d2ff', '#ff9f0a', '#bf5af2', '#ff453a'];
  return (
    <div style={{ padding: '0 24px 16px' }}>
      <div style={{ background: V6_CARD, borderRadius: 14, padding: '16px 16px 14px' }}>
        <div style={{ fontSize: 11, color: V6_GREY, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 12 }}>Trädslag</div>
        <div style={{ display: 'flex', height: 14, borderRadius: 3, overflow: 'hidden', gap: 2, marginBottom: 14 }}>
          {tradslag.map((t, i) => (
            <div key={t.namn} style={{ width: `${t.pct}%`, background: colors[i % colors.length] }} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tradslag.map((t, i) => (
            <div key={t.namn} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length], flexShrink: 0, alignSelf: 'center' }} />
              <span style={{ flex: 1, fontSize: 14, color: '#fff' }}>{t.namn}</span>
              <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{t.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sortiment({ sortiment }: { sortiment: { namn: string; m3: number }[] }) {
  if (!sortiment || sortiment.length === 0) return null;
  const max = Math.max(...sortiment.map(s => s.m3), 1);
  const total = sortiment.reduce((a, b) => a + b.m3, 0);
  return (
    <div style={{ padding: '0 24px 16px' }}>
      <div style={{ background: V6_CARD, borderRadius: 14, padding: '14px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: V6_GREY, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>Sortiment</span>
          <span style={{ fontSize: 12, color: V6_GREY, fontVariantNumeric: 'tabular-nums' }}>{Math.round(total)} m³</span>
        </div>
        {sortiment.map((s, i) => (
          <div key={s.namn} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : `0.5px solid ${V6_SEP}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: '#fff', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 8 }}>
                {sortimentSvenska(s.namn)}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {s.m3} <span style={{ fontSize: 10, color: V6_GREY, fontWeight: 600 }}>m³</span>
              </span>
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
              <div style={{ width: `${(s.m3 / max) * 100}%`, height: '100%', background: V6_SK, borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tid & Diesel ──────────────────────────────────────────────────────────
function TidKort({ label, color, rows }: { label: string; color: string; rows: [string, number, boolean?][] }) {
  return (
    <div style={{ background: V6_CARD, borderRadius: 14, padding: '14px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
        <span style={{ fontSize: 11, color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(([k, v, accent], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, color: accent ? '#fff' : V6_GREY, fontWeight: accent ? 600 : 400 }}>{k}</span>
            <span style={{ fontSize: accent ? 17 : 13, fontWeight: accent ? 700 : 500, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
              {v.toFixed(1)}<span style={{ fontSize: 10, color: V6_GREY, marginLeft: 2 }}>h</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tid({ data }: { data: UppfoljningData }) {
  const hasSk = data.skordareG15h > 0;
  const hasSt = data.skotareG15h > 0;
  if (!hasSk && !hasSt) return null;
  const skRows: [string, number, boolean?][] = [
    ['G15', data.skordareG15h, true],
    ['G0', data.skordareG0],
    ['Tomgång', data.skordareTomgang],
    ['Korta stopp', data.skordareKortaStopp],
    ['Rast', data.skordareRast],
    ['Avbrott', data.skordareAvbrott],
  ];
  const stRows: [string, number, boolean?][] = [
    ['G15', data.skotareG15h, true],
    ['G0', data.skotareG0],
    ['Tomgång', data.skotareTomgang],
    ['Korta stopp', data.skotareKortaStopp],
    ['Rast', data.skotareRast],
    ['Avbrott', data.skotareAvbrott],
  ];
  return (
    <div style={{ padding: '0 24px 16px', display: 'grid', gridTemplateColumns: hasSk && hasSt ? '1fr 1fr' : '1fr', gap: 10 }}>
      {hasSk && <TidKort label="Skördare" color={V6_SK} rows={skRows} />}
      {hasSt && <TidKort label="Skotare" color={V6_ST} rows={stRows} />}
    </div>
  );
}

function Diesel({ data }: { data: UppfoljningData }) {
  if (!data.dieselTotalt) return null;
  const skL = data.skordareL || 0;
  const stL = data.skotareL || 0;
  return (
    <div style={{ padding: '0 24px 16px' }}>
      <div style={{ background: V6_CARD, borderRadius: 14, padding: '16px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: V6_GREY, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>Diesel</span>
          {data.dieselPerM3 > 0 && (
            <span style={{ fontSize: 12, color: V6_GREY, fontVariantNumeric: 'tabular-nums' }}>{data.dieselPerM3.toFixed(2)} L/m³</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{Math.round(data.dieselTotalt)}</span>
          <span style={{ fontSize: 13, color: V6_GREY }}>liter</span>
        </div>
        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', marginBottom: 10 }}>
          <div style={{ width: `${(skL / data.dieselTotalt) * 100}%`, background: V6_SK }} />
          <div style={{ width: `${(stL / data.dieselTotalt) * 100}%`, background: V6_ST }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
          <div>
            <span style={{ color: V6_GREY }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: V6_SK, marginRight: 5 }} />
              Skördare
            </span>
            <span style={{ marginLeft: 6, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{skL} L</span>
          </div>
          <div>
            <span style={{ color: V6_GREY }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: V6_ST, marginRight: 5 }} />
              Skotare
            </span>
            <span style={{ marginLeft: 6, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{stL} L</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Avbrott ───────────────────────────────────────────────────────────────
function AvbrottKort({ label, color, items, totalt }: { label: string; color: string; items: AvbrottRad[]; totalt: string }) {
  return (
    <div style={{ background: V6_CARD, borderRadius: 14, padding: '14px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: color, marginRight: 6, verticalAlign: 'middle' }} />
          {label}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{totalt}</span>
      </div>
      {items.map((a, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i > 0 ? `0.5px solid ${V6_SEP}` : 'none' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: '#fff' }}>{avbrottSv(a.orsak)}</div>
            <div style={{ fontSize: 11, color: V6_GREY, marginTop: 2 }}>{a.typ} · {a.antal} ggr</div>
          </div>
          <div style={{ fontSize: 13, color: V6_GREY, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{a.tid}</div>
        </div>
      ))}
    </div>
  );
}

function Avbrott({ data }: { data: UppfoljningData }) {
  const sk = data.avbrottSkordare || [];
  const st = data.avbrottSkotare || [];
  if (sk.length === 0 && st.length === 0) return null;
  return (
    <div style={{ padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sk.length > 0 && <AvbrottKort label="Skördare" color={V6_SK} items={sk} totalt={data.avbrottSkordare_totalt} />}
      {st.length > 0 && <AvbrottKort label="Skotare" color={V6_ST} items={st} totalt={data.avbrottSkotareTotalt} />}
    </div>
  );
}

// ── Extern skotning ───────────────────────────────────────────────────────
function Extern({ data }: { data: UppfoljningData }) {
  if (!data.externSkotning) return null;
  const total = (data.externPris || 0) * (data.externAntal || 0);
  return (
    <div style={{ padding: '0 24px 16px' }}>
      <div style={{ background: V6_CARD, borderRadius: 14, padding: '14px 18px 14px' }}>
        <div style={{ fontSize: 11, color: V6_GREY, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Extern skotning</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{data.externForetag || '—'}</div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: V6_GREY, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>Pris</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{data.externPris}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: V6_GREY, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>Antal</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{data.externAntal}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: V6_GREY, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>Totalt</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              {total.toLocaleString('sv-SE')} <span style={{ fontSize: 10, color: V6_GREY }}>kr</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sticky nav ────────────────────────────────────────────────────────────
function Nav({ onBack }: { onBack?: () => void }) {
  if (!onBack) return null;
  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 30, height: 44, display: 'flex', alignItems: 'center', padding: '0 6px', background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', borderBottom: `0.5px solid ${V6_SEP}` }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'none', border: 'none', color: '#fff', fontSize: 17, cursor: 'pointer', padding: '8px 10px', fontFamily: V6_FF, letterSpacing: '-0.2px' }}>
        <svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="10 2 2 10 10 18" />
        </svg>
        <span style={{ marginLeft: 2 }}>Uppföljning</span>
      </button>
    </nav>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function UppfoljningVy({ data, onBack }: { data: UppfoljningData; onBack?: () => void }) {
  const hasAvbrott = (data.avbrottSkordare?.length || 0) > 0 || (data.avbrottSkotare?.length || 0) > 0;
  const hasProduktivitet = data.skordareM3G15h > 0 || data.skordareStammarG15h > 0 || data.skotareM3G15h > 0 || data.skotningsavstand > 0 || data.skotareSnittlass > 0 || data.skotareLassG15h > 0 || data.skordareMedelstam > 0;
  const hasProdPerDag = (data.prodSkordarePerDag?.length || 0) > 0 || (data.lassPerDag?.some(d => typeof d.m3 === 'number' && d.m3 > 0));
  const hasTradslagSort = data.tradslag.length > 0 || data.sortiment.length > 0;
  const hasTidDiesel = data.skordareG15h > 0 || data.skotareG15h > 0 || data.dieselTotalt > 0;

  return (
    <div style={{ minHeight: '100%', background: V6_BG, color: '#fff', fontFamily: V6_FF, WebkitFontSmoothing: 'antialiased' }}>
      <Nav onBack={onBack} />
      <Headline data={data} />
      <Maskinkort data={data} />
      <Tidslinje data={data} />

      <div style={{ marginTop: 8 }}>
        {hasProduktivitet && <Collapse title="Produktivitet"><Produktivitet data={data} /></Collapse>}
        {hasProdPerDag && <Collapse title="Produktion per dag"><ProdPerDag data={data} /></Collapse>}
        {hasTradslagSort && (
          <Collapse title="Trädslag & sortiment">
            <Tradslag tradslag={data.tradslag} />
            <Sortiment sortiment={data.sortiment} />
          </Collapse>
        )}
        {hasTidDiesel && (
          <Collapse title="Tid & diesel">
            <Tid data={data} />
            <Diesel data={data} />
          </Collapse>
        )}
        {hasAvbrott && <Collapse title="Avbrott"><Avbrott data={data} /></Collapse>}
        {data.externSkotning && <Collapse title="Extern skotning"><Extern data={data} /></Collapse>}
      </div>
      <div style={{ height: 60 }} />
    </div>
  );
}
