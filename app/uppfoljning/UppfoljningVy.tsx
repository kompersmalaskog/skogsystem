'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { type ObjektTyp, arRisjobb, typLabel } from '@/lib/objekt/typ';
import { hamtaKallhyggen, type Kallhygge } from '@/lib/grot-koppling';
import { uppfoljningStatus, STATUS_FARG } from '@/lib/uppfoljning/status';
import { type AvvikelseRad } from './lib/avvikelser';

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
  objektId?: string | null;
  // Våning 2 — beräknas i useObjektUppfoljning (kräver 90-dagarsreferensen)
  avvikelser?: AvvikelseRad[];
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
  typ?: ObjektTyp;
  areal?: number;
  agare?: string;
  status?: 'pagaende' | 'avslutat';
  skordareModell?: string | null;
  skordareStart?: string | null;
  skordareSlut?: string | null;
  skordareLastDate?: string | null;
  skotatArManuell?: boolean;
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
  // true = skotartiden är manuellt angiven (JD810E, inga fakt_tid-filer)
  skotareTidManuell?: boolean;
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
  // Typen kommer ur den delade regeln — 'Grot' för risjobb, aldrig gissad.
  const label = data.typ ? typLabel(data.typ) : '';
  const parts = [label, data.areal ? `${data.areal} ha` : null, data.agare || null].filter(Boolean);
  return (
    <section style={{ padding: '22px 24px 12px' }}>
      {parts.length > 0 && (
        <div style={{ fontSize: 13, color: V6_GREY, fontWeight: 500 }}>{parts.join(' · ')}</div>
      )}
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.8px', margin: '4px 0 0', lineHeight: 1.05 }}>
        {data.objektNamn}
      </h1>
    </section>
  );
}

// ── Våning 1: läget i klartext ────────────────────────────────────────────
// "Skotare kör · dag 34 · 412 m³ kvar". Statusen kommer ur den DELADE
// funktionen (lib/uppfoljning/status.ts) — samma sanning som listan.
// Kvar visas ALDRIG som "0 m³ kvar" när skördardatan saknas (skotat > 0
// utan skördat, t.ex. OneDrive-synk-lucka) — då är kvar okänt, inte noll.
function StatusRad({ data }: { data: UppfoljningData }) {
  const s = uppfoljningStatus({ ...data, skordat: data.skordat, skotat: data.skotat });
  return (
    <section style={{ padding: '0 24px 20px', display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_FARG[s.k], flexShrink: 0 }} />
      <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.2px' }}>{s.t}</span>
      {s.dagar != null && (
        <span style={{ fontSize: 15, color: V6_GREY, fontVariantNumeric: 'tabular-nums' }}>
          · {s.k === 'done' ? `${s.dagar} dagar` : `dag ${s.dagar}`}
        </span>
      )}
      {s.visaKvar && s.kvar != null && (
        <span style={{ fontSize: 15, color: V6_GREY, fontVariantNumeric: 'tabular-nums' }}>
          · {s.kvar > 0 ? `${Math.round(s.kvar).toLocaleString('sv-SE')} m³ kvar` : 'allt utkört'}
        </span>
      )}
      {s.kvarOkant && (
        <span style={{ fontSize: 15, color: V6_WARN, fontWeight: 500 }}>· skördardata saknas</span>
      )}
    </section>
  );
}

// ── Våning 2: avvikelser — bara när något FAKTISKT avviker ────────────────
// Trösklarna härleds ur maskinens egen 90-dagarsspridning (Tukey-staket,
// se lib/avvikelser.ts). Allt normalt → zonen försvinner helt.
function AvvikelseZon({ avvikelser }: { avvikelser?: AvvikelseRad[] }) {
  if (!avvikelser || avvikelser.length === 0) return null;
  return (
    <section style={{ padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {avvikelser.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: 'rgba(255,159,10,0.09)', border: '0.5px solid rgba(255,159,10,0.28)', borderRadius: 10, padding: '10px 13px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={V6_WARN} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span style={{ fontSize: 13, color: V6_WARN, fontWeight: 500, lineHeight: 1.45 }}>{a.text}</span>
        </div>
      ))}
    </section>
  );
}

// ── Maskinkort ────────────────────────────────────────────────────────────
function MaskinCell({
  label, color, modell, forare, statusOrd, primary, primaryUnit, primaryLabel, snitt,
}: {
  label: string; color: string; modell?: string | null; forare?: string | null;
  statusOrd: string | null; primary: number; primaryUnit: string; primaryLabel: string;
  snitt: number | null;
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
        {snitt != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Snitt/dag</span><span style={{ color: '#fff', fontWeight: 500 }}>{snitt} m³</span>
          </div>
        )}
        {(modell || statusOrd) && (
          <div style={{ marginTop: snitt != null ? 4 : 0, fontSize: 11, color: V6_GREY2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[modell, forare, statusOrd].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Risjobbets rubrikvolym: RAPPORTERAD grotvolym (blå badge) ──────────────
// Ett risjobb skördar aldrig — dess volym är skotarens lassmätning i m³fub,
// förarens bedömning, inte skördarmätt virke. Aldrig grön Mätt, aldrig "0 m³".
function RisRubrik({ data }: { data: UppfoljningData }) {
  const vol = Math.round(data.skotat);
  const harVol = vol > 0;
  return (
    <section style={{ padding: '0 24px 20px' }}>
      <div style={{ background: V6_CARD, borderRadius: 16, padding: '16px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: V6_ST }} />
          <span style={{ fontSize: 11, color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Ris hämtat</span>
        </div>
        {harVol ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.8px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{vol.toLocaleString('sv-SE')}</span>
            <span style={{ fontSize: 14, color: V6_GREY, fontWeight: 500 }}>m³fub</span>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8ab4f8', border: '1px solid rgba(138,180,248,0.35)', borderRadius: 5, padding: '1px 5px' }}>rapporterat</span>
          </div>
        ) : (
          <div style={{ fontSize: 15, color: V6_GREY, fontWeight: 600 }}>Inga lass registrerade än</div>
        )}
        {(data.skotareModell || data.operatorSkotare) && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${V6_SEP}`, fontSize: 12, color: V6_GREY }}>
            {[data.skotareModell, data.operatorSkotare].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </section>
  );
}

// Källhyggen: avverkningsobjekten riset kommer från (grot_koppling). Namn +
// länk till respektive detaljvy. Tomt/laddar/fel hålls isär (ärliga tillstånd).
function Kallhyggen({ objektId }: { objektId?: string | null }) {
  const router = useRouter();
  const [lage, setLage] = useState<{ status: 'laddar' | 'ok' | 'fel'; hyggen: Kallhygge[]; fel: string }>({ status: 'laddar', hyggen: [], fel: '' });

  useEffect(() => {
    if (!objektId) { setLage({ status: 'ok', hyggen: [], fel: '' }); return; }
    let avbruten = false;
    (async () => {
      const r = await hamtaKallhyggen(objektId);
      if (avbruten) return;
      setLage(r.ok ? { status: 'ok', hyggen: r.hyggen, fel: '' } : { status: 'fel', hyggen: [], fel: r.message });
    })();
    return () => { avbruten = true; };
  }, [objektId]);

  return (
    <section style={{ padding: '0 24px 20px' }}>
      <div style={{ fontSize: 11, color: V6_GREY, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 8px 2px' }}>Ris hämtas från</div>
      {lage.status === 'laddar' ? (
        <div style={{ fontSize: 13, color: V6_GREY, padding: '4px 2px' }}>Läser källhyggen …</div>
      ) : lage.status === 'fel' ? (
        <div style={{ fontSize: 13, color: V6_WARN, padding: '4px 2px' }}>Kunde inte läsa källhyggena</div>
      ) : lage.hyggen.length === 0 ? (
        <div style={{ fontSize: 13, color: V6_GREY2, padding: '4px 2px' }}>Inga källhyggen kopplade — kopplas i redigeringen.</div>
      ) : (
        <div style={{ background: V6_CARD, borderRadius: 14, overflow: 'hidden' }}>
          {lage.hyggen.map((h, i) => (
            <button key={h.objekt_id} onClick={() => router.push(`/uppfoljning/${encodeURIComponent(h.urlId)}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48, padding: '11px 16px', background: 'transparent', border: 'none', borderTop: i > 0 ? `0.5px solid ${V6_SEP}` : 'none', color: '#fff', fontFamily: V6_FF, cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.namn}</span>
              {h.auto_avbockad && <span style={{ fontSize: 10, color: V6_DONE, fontWeight: 600 }}>grot avbockat</span>}
              <svg width="7" height="12" viewBox="0 0 8 14" fill="none" stroke={V6_GREY2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <polyline points="1 1 7 7 1 13" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Maskinkort({ data }: { data: UppfoljningData }) {
  const idag = new Date().toISOString().slice(0, 10);
  // "kör idag" bara när senaste aktiviteten faktiskt är IDAG — läget i
  // övrigt bor i våning 1 (statusraden), korten upprepar det inte.
  const statusOrd = (slut?: string | null, lastDate?: string | null) =>
    slut ? `klar ${fmtISO(slut)}` : lastDate === idag ? 'kör idag' : null;

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
            statusOrd={statusOrd(data.skordareSlut, data.skordareLastDate)}
            primary={Math.round(data.skordat)}
            primaryUnit="m³" primaryLabel="skördat"
            snitt={skSnitt}
          />
        )}
        {showSt && (
          <MaskinCell
            label="Skotare" color={V6_ST}
            modell={data.skotareModell} forare={data.operatorSkotare}
            statusOrd={statusOrd(data.skotareSlut, data.skotareLastDate)}
            primary={Math.round(data.skotat)}
            primaryUnit="m³"
            primaryLabel={data.skotatArManuell ? 'utkört (manuellt angivet)' : 'utkört'}
            snitt={stSnitt}
          />
        )}
      </div>
    </section>
  );
}

// ── Tidslinje ─────────────────────────────────────────────────────────────
// Spannet ("34 dagar") visas i collapse-rubriken — samma beräkning som
// komponenten gör internt för procent-skalan.
function tidslinjeDagar(data: UppfoljningData): number | null {
  const allDates = [data.skordareStart, data.skordareSlut, data.skotareStart, data.skotareSlut].filter(Boolean) as string[];
  if (allDates.length === 0) return null;
  const withNow = [...allDates, new Date().toISOString().slice(0, 10)];
  const min = withNow.reduce((a, b) => a < b ? a : b);
  const max = withNow.reduce((a, b) => a > b ? a : b);
  return daysBetween(min, max);
}

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
    <section style={{ padding: '0 24px 16px' }}>
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
// Stängd sektion ger ändå sin siffra (varde) — man öppnar för att förstå
// VARFÖR, inte för att få talet. Värdet radbryter på smal skärm.
function Collapse({ title, varde, children, defaultOpen = false }: { title: string; varde?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: `0.5px solid ${V6_SEP}` }}>
      <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', padding: '16px 24px', background: 'transparent', border: 'none', color: '#fff', fontFamily: V6_FF, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.2px', flexShrink: 0 }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {varde != null && (
            <span style={{ fontSize: 12, color: V6_GREY, fontWeight: 500, fontVariantNumeric: 'tabular-nums', textAlign: 'right', lineHeight: 1.35 }}>{varde}</span>
          )}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={V6_GREY} strokeWidth="2" strokeLinecap="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>
            <polyline points="4 2 8 6 4 10" />
          </svg>
        </span>
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
// rows: [etikett, timmar|null, framhävd?]. null = måttet rapporteras inte av
// maskinen (skotarens G0/korta stopp finns varken i StanForD eller Opti4G) —
// visas som "rapporteras inte", aldrig som en falsk 0,0 h.
function TidKort({ label, color, rows }: { label: string; color: string; rows: [string, number | null, boolean?][] }) {
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
            {v === null ? (
              <span style={{ fontSize: 12, color: V6_GREY, fontWeight: 400 }}>rapporteras inte</span>
            ) : (
              <span style={{ fontSize: accent ? 17 : 13, fontWeight: accent ? 700 : 500, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                {v.toFixed(1)}<span style={{ fontSize: 10, color: V6_GREY, marginLeft: 2 }}>h</span>
              </span>
            )}
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
  const skRows: [string, number | null, boolean?][] = [
    ['G15', data.skordareG15h, true],
    ['G0', data.skordareG0],
    ['Korta pauser', data.skordareKortaStopp],
    ['Rast', data.skordareRast],
    ['Avbrott', data.skordareAvbrott],
  ];
  // Skotaren har varken G0 eller korta stopp i källdata — StanForD emitterar
  // ingen ShortDownTime, Opti4G har ingen G0-rad. Rapporteras inte, aldrig 0.
  const stRows: [string, number | null, boolean?][] = [
    ['G15', data.skotareG15h, true],
    ['G0', null],
    ['Korta pauser', null],
    ['Rast', data.skotareRast],
    ['Avbrott', data.skotareAvbrott],
  ];
  return (
    <div style={{ padding: '0 24px 16px', display: 'grid', gridTemplateColumns: hasSk && hasSt ? '1fr 1fr' : '1fr', gap: 10 }}>
      {hasSk && <TidKort label="Skördare" color={V6_SK} rows={skRows} />}
      {hasSt && <TidKort label={data.skotareTidManuell ? 'Skotare · manuell tid' : 'Skotare'} color={V6_ST} rows={stRows} />}
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
  // Pris och totalsumma bor i EKONOMIVYN — uppföljningen är en ren operativ
  // vy som kan visas medarbetare. Här: vem som skotar och hur mycket.
  return (
    <div style={{ padding: '0 24px 16px' }}>
      <div style={{ background: V6_CARD, borderRadius: 14, padding: '14px 18px 14px' }}>
        <div style={{ fontSize: 11, color: V6_GREY, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Extern skotning</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{data.externForetag || '—'}</div>
        {(data.externAntal || 0) > 0 && (
          <div style={{ marginTop: 12, fontSize: 13, color: V6_GREY }}>
            Omfattning{' '}
            <span style={{ color: '#fff', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {data.externAntal} {data.externPrisTyp === 'timme' ? 'h' : 'm³'}
            </span>
          </div>
        )}
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
  const risjobb = arRisjobb(data);

  // ── Rubriktal — samma tal som sektionerna visar, inget nytt beräknas.
  // ÄRLIGHET: en maskin utan data får inget påhittat värde — den utelämnas.
  const sv = (n: number) => n.toLocaleString('sv-SE');

  const prodVarde = (() => {
    const sk = data.skordareM3G15h > 0 ? data.skordareM3G15h : null;
    const st = data.skotareM3G15h > 0 ? data.skotareM3G15h : null;
    if (sk != null && st != null) return `Skördare ${sv(sk)} · Skotare ${sv(st)}`;
    if (sk != null) return `${sv(sk)} m³/G15h`;
    if (st != null) return `${sv(st)} m³/G15h`;
    return null;
  })();

  const perDagVarde = (() => {
    const skDagar = data.prodSkordarePerDag || [];
    const skSnitt = skDagar.length > 0 ? Math.round(skDagar.reduce((a, b) => a + b.m3, 0) / skDagar.length) : null;
    const stDagar = (data.lassPerDag || []).filter(d => typeof d.m3 === 'number' && d.m3 > 0);
    const stSnitt = stDagar.length > 0 ? Math.round(stDagar.reduce((a, b) => a + (b.m3 || 0), 0) / stDagar.length) : null;
    if (skSnitt != null && stSnitt != null) return `Skördare ${sv(skSnitt)} · Skotare ${sv(stSnitt)}`;
    if (skSnitt != null) return `snitt ${sv(skSnitt)} m³/dag`;
    if (stSnitt != null) return `snitt ${sv(stSnitt)} m³/dag`;
    return null;
  })();

  const tradslagVarde = (() => {
    const total = data.skordat > 0 ? data.skordat : data.sortiment.reduce((a, b) => a + b.m3, 0);
    return total > 0 ? `${sv(Math.round(total))} m³` : null;
  })();

  const tidDieselVarde = (() => {
    const skG15 = data.skordareG15h > 0 ? data.skordareG15h : null;
    const stG15 = data.skotareG15h > 0 ? data.skotareG15h : null;
    let g15Del: string | null = null;
    if (skG15 != null && stG15 != null) g15Del = `Skördare ${sv(skG15)} · Skotare ${sv(stG15)} G15h`;
    else if (skG15 != null) g15Del = `${sv(skG15)} G15h`;
    else if (stG15 != null) g15Del = `${sv(stG15)} G15h`;
    const lm3Del = data.dieselPerM3 > 0 ? `${sv(data.dieselPerM3)} L/m³` : null;
    const delar = [g15Del, lm3Del].filter(Boolean);
    return delar.length > 0 ? delar.join(' · ') : null;
  })();

  // Tidslinjen är "hur gick det", inte "vad är läget" — degraderad till
  // detaljerna (våning 3). Gate:as på att minst ett spår kan ritas.
  const tidslinjeVarde = (!!data.skordareModell || !!data.skordareStart || !!data.skotareModell || !!data.skotareStart)
    ? tidslinjeDagar(data)
    : null;

  const avbrottVarde = (() => {
    // Totalsträngarna ("4.2h") är samma tal som sektionens kort visar.
    const skH = (data.avbrottSkordare?.length || 0) > 0 ? parseFloat(data.avbrottSkordare_totalt) || 0 : 0;
    const stH = (data.avbrottSkotare?.length || 0) > 0 ? parseFloat(data.avbrottSkotareTotalt) || 0 : 0;
    const sum = skH + stH;
    return sum > 0 ? `${sum.toFixed(1).replace('.', ',')} h` : null;
  })();

  return (
    <div style={{ minHeight: '100%', background: V6_BG, color: '#fff', fontFamily: V6_FF, WebkitFontSmoothing: 'antialiased' }}>
      <Nav onBack={onBack} />
      <Headline data={data} />
      <StatusRad data={data} />
      <AvvikelseZon avvikelser={data.avvikelser} />
      {/* Ett objekts vy speglar vad objektet ÄR. Risjobb: rapporterad
          grotvolym + källhyggen, inga virkessektioner. Virkesjobb: som förut,
          inga grot-fält. arRisjobb gate:ar. */}
      {risjobb ? (
        <>
          <RisRubrik data={data} />
          <Kallhyggen objektId={data.objektId} />
        </>
      ) : (
        <Maskinkort data={data} />
      )}

      <div style={{ marginTop: 8 }}>
        {!risjobb && hasProduktivitet && <Collapse title="Produktivitet" varde={prodVarde}><Produktivitet data={data} /></Collapse>}
        {!risjobb && hasProdPerDag && <Collapse title="Produktion per dag" varde={perDagVarde}><ProdPerDag data={data} /></Collapse>}
        {!risjobb && hasTradslagSort && (
          <Collapse title="Trädslag & sortiment" varde={tradslagVarde}>
            <Tradslag tradslag={data.tradslag} />
            <Sortiment sortiment={data.sortiment} />
          </Collapse>
        )}
        {hasTidDiesel && (
          <Collapse title="Tid & diesel" varde={tidDieselVarde}>
            <Tid data={data} />
            <Diesel data={data} />
          </Collapse>
        )}
        {hasAvbrott && <Collapse title="Avbrott" varde={avbrottVarde}><Avbrott data={data} /></Collapse>}
        {tidslinjeVarde != null && <Collapse title="Tidslinje" varde={`${tidslinjeVarde} dagar`}><Tidslinje data={data} /></Collapse>}
        {data.externSkotning && <Collapse title="Extern skotning" varde={data.externForetag || null}><Extern data={data} /></Collapse>}
      </div>
      <div style={{ height: 60 }} />
    </div>
  );
}
