'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Ansökan {
  id: string;
  anvandare_id: string;
  typ: 'semester' | 'atk' | 'stillestand' | 'skordarstopp' | 'skotarstopp';
  startdatum: string;
  slutdatum: string;
  status: 'väntar' | 'godkänd' | 'nekad';
  kommentar: string | null;
  skapad_av: string | null;
  skapad_at: string;
}

const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',system-ui,sans-serif";

const C = {
  bg: '#111110',
  surface: '#1C1C1E',
  surface2: '#1C1C1E',
  surface3: '#2C2C2E',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.15)',
  t1: '#ffffff',
  t2: 'rgba(255,255,255,0.7)',
  t3: 'rgba(255,255,255,0.4)',
  t4: 'rgba(255,255,255,0.2)',
  green: '#22c55e',
  greenDim: 'rgba(34,197,94,0.15)',
  red: '#ef4444',
  redDim: 'rgba(239,68,68,0.15)',
  yellow: '#eab308',
  yellowDim: 'rgba(234,179,8,0.15)',
  blue: '#3b82f6',
  blueDim: 'rgba(59,130,246,0.15)',
  gray: '#9ca3af',
  grayDim: 'rgba(156,163,175,0.12)',
  orange: '#f97316',
  orangeDim: 'rgba(249,115,22,0.15)',
  purple: '#a855f7',
  purpleDim: 'rgba(168,85,247,0.15)',
  accent: '#3b82f6',
  accentDim: 'rgba(59,130,246,0.12)',
};

const TYPINFO: Record<string, { label: string; color: string; bg: string }> = {
  semester: { label: 'Semester', color: C.green, bg: C.greenDim },
  atk: { label: 'ATK', color: C.blue, bg: C.blueDim },
  stillestand: { label: 'Stillestånd', color: C.gray, bg: C.grayDim },
  skordarstopp: { label: 'Skördarstopp', color: C.orange, bg: C.orangeDim },
  skotarstopp: { label: 'Skotarstopp', color: C.purple, bg: C.purpleDim },
};

const STATUSINFO: Record<string, { label: string; color: string; bg: string }> = {
  'väntar': { label: 'Väntar', color: C.yellow, bg: C.yellowDim },
  'godkänd': { label: 'Godkänd', color: C.green, bg: C.greenDim },
  'nekad': { label: 'Nekad', color: C.red, bg: C.redDim },
};

const ANSTÄLLDA = ['Martin', 'Oskar', 'Stefan', 'Peter', 'Erik', 'Jonas'];
const VECKONAMN = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const MÅNADNAMN = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
];

const RÖDA_DAGAR = new Set([
  '2026-01-01', '2026-01-06', '2026-04-03', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-14', '2026-06-06', '2026-06-20',
  '2026-10-31', '2026-12-25', '2026-12-26',
]);

function ärRödDag(iso: string): boolean {
  return RÖDA_DAGAR.has(iso);
}

// === Helpers ===

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(d: string) {
  const p = d.split('-');
  return `${parseInt(p[2])} ${MÅNADNAMN[parseInt(p[1]) - 1]?.substring(0, 3).toLowerCase()}`;
}

function dagMellan(start: string, slut: string): number {
  const s = new Date(start);
  const e = new Date(slut);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

function inRange(day: Date, start: string, slut: string) {
  const d = toISO(day);
  return d >= start && d <= slut;
}

function getWeekNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// === SVG Icons ===

function IconChevron({ dir, color = C.t2 }: { dir: 'left' | 'right'; color?: string }) {
  const pts = dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={pts} />
    </svg>
  );
}

function IconPlus({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconCheck({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconWarning({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#c2410c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// === Progress Bar ===

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{
      width: '100%', height: 6, borderRadius: 3,
      background: 'rgba(255,255,255,0.08)', marginTop: 8,
    }}>
      <div style={{
        width: `${pct}%`, height: '100%', borderRadius: 3,
        background: color, transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

// === Kalender ===

function Kalender({
  år, månad, onÄndraMånad, valdStart, valdSlut, onVäljDag, ansökningar, slideDir,
}: {
  år: number; månad: number;
  onÄndraMånad: (d: number) => void;
  valdStart: string | null; valdSlut: string | null;
  onVäljDag: (d: string) => void;
  ansökningar: Ansökan[];
  slideDir: 'left' | 'right' | null;
}) {
  const förstaVeckodag = (new Date(år, månad, 1).getDay() + 6) % 7;
  const antalDagar = new Date(år, månad + 1, 0).getDate();

  // Previous month days to fill
  const prevMonthDays = new Date(år, månad, 0).getDate();

  const rows: { cells: { day: number; inMonth: boolean }[] }[] = [];
  let currentRow: { day: number; inMonth: boolean }[] = [];

  // Fill leading days from previous month
  for (let i = förstaVeckodag - 1; i >= 0; i--) {
    currentRow.push({ day: prevMonthDays - i, inMonth: false });
  }
  for (let d = 1; d <= antalDagar; d++) {
    currentRow.push({ day: d, inMonth: true });
    if (currentRow.length === 7) {
      rows.push({ cells: currentRow });
      currentRow = [];
    }
  }
  // Fill trailing days from next month
  if (currentRow.length > 0) {
    let nextDay = 1;
    while (currentRow.length < 7) {
      currentRow.push({ day: nextDay++, inMonth: false });
    }
    rows.push({ cells: currentRow });
  }

  const dagMap = useMemo(() => {
    const map: Record<number, { typ: string; status: string }[]> = {};
    for (const a of ansökningar) {
      for (let d = 1; d <= antalDagar; d++) {
        const datum = new Date(år, månad, d);
        if (inRange(datum, a.startdatum, a.slutdatum)) {
          if (!map[d]) map[d] = [];
          map[d].push({ typ: a.typ, status: a.status });
        }
      }
    }
    return map;
  }, [ansökningar, år, månad, antalDagar]);

  // Stopp range positions per day: is this day start/end/middle of a stopp?
  const stoppRangeMap = useMemo(() => {
    const map: Record<number, { skordare: 'start' | 'mid' | 'end' | 'single' | null; skotare: 'start' | 'mid' | 'end' | 'single' | null }> = {};
    const stoppAnsökningar = ansökningar.filter(a =>
      (a.typ === 'skordarstopp' || a.typ === 'skotarstopp') && a.status === 'godkänd'
    );
    for (let d = 1; d <= antalDagar; d++) {
      const iso = toISO(new Date(år, månad, d));
      const prevISO = d > 1 ? toISO(new Date(år, månad, d - 1)) : null;
      const nextISO = d < antalDagar ? toISO(new Date(år, månad, d + 1)) : null;
      let skordare: 'start' | 'mid' | 'end' | 'single' | null = null;
      let skotare: 'start' | 'mid' | 'end' | 'single' | null = null;
      for (const a of stoppAnsökningar) {
        if (iso < a.startdatum || iso > a.slutdatum) continue;
        const prevIn = prevISO ? prevISO >= a.startdatum && prevISO <= a.slutdatum : false;
        const nextIn = nextISO ? nextISO >= a.startdatum && nextISO <= a.slutdatum : false;
        const pos = !prevIn && !nextIn ? 'single' : !prevIn ? 'start' : !nextIn ? 'end' : 'mid';
        if (a.typ === 'skordarstopp') skordare = pos;
        if (a.typ === 'skotarstopp') skotare = pos;
      }
      if (skordare || skotare) map[d] = { skordare, skotare };
    }
    return map;
  }, [ansökningar, år, månad, antalDagar]);

  const idag = new Date();
  const idagDag = idag.getFullYear() === år && idag.getMonth() === månad ? idag.getDate() : -1;
  const animClass = slideDir === 'left' ? 'cal-slide-left' : slideDir === 'right' ? 'cal-slide-right' : '';

  return (
    <div>
      {/* Month nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, padding: '0 4px',
      }}>
        <div>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.t1 }}>
            {MÅNADNAMN[månad]}
          </span>
          <span style={{ fontSize: 18, fontWeight: 400, color: C.t3, marginLeft: 8 }}>
            {år}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="nav-cal-btn" onClick={() => onÄndraMånad(-1)} style={navBtnStyle}>
            <IconChevron dir="left" />
          </button>
          <button className="nav-cal-btn" onClick={() => onÄndraMånad(1)} style={navBtnStyle}>
            <IconChevron dir="right" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 0, marginBottom: 4,
      }}>
        {VECKONAMN.map((v, i) => (
          <div key={v} style={{
            textAlign: 'center', fontSize: 12, fontWeight: 500, padding: '6px 0',
            color: i >= 5 ? C.red : C.t3,
            letterSpacing: '0.02em',
          }}>
            {v}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div key={`${år}-${månad}`} className={animClass}>
        {rows.map((row, ri) => (
          <div key={ri} style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 0,
          }}>
            {row.cells.map((cell, ci) => {
              if (!cell.inMonth) {
                return (
                  <div key={`e${ri}-${ci}`} style={{
                    aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 14, color: C.t4, opacity: 0.5 }}>{cell.day}</span>
                  </div>
                );
              }

              const dag = cell.day;
              const iso = toISO(new Date(år, månad, dag));
              const ärHelg = ci >= 5;
              const ärHelgdag = ärRödDag(iso);
              const isInRange = valdStart && valdSlut
                ? iso >= valdStart && iso <= valdSlut
                : valdStart && iso === valdStart;
              const isStart = iso === valdStart;
              const isSlut = valdSlut ? iso === valdSlut : iso === valdStart;
              const isIdag = dag === idagDag;
              const markningar = dagMap[dag] || [];
              const stoppTyper = ['stillestand', 'skordarstopp', 'skotarstopp'];
              const harGodkänd = markningar.some(m => m.status === 'godkänd' && !stoppTyper.includes(m.typ));
              const harVäntar = markningar.some(m => m.status === 'väntar');
              const harStillestånd = markningar.some(m => m.typ === 'stillestand' && m.status === 'godkänd');
              const harSkördarStopp = markningar.some(m => m.typ === 'skordarstopp' && m.status === 'godkänd');
              const harSkotarStopp = markningar.some(m => m.typ === 'skotarstopp' && m.status === 'godkänd');
              const harNekad = markningar.some(m => m.status === 'nekad');

              // Stopp range info
              const stoppInfo = stoppRangeMap[dag];
              const harStopp = harSkördarStopp || harSkotarStopp;

              // Cell background for stopp
              let cellBg = 'transparent';
              let cellRadius = '0px';
              const SKÖRDAR_CLR = '#B45309';
              const SKOTAR_CLR = '#7C3AED';
              if (harSkördarStopp && harSkotarStopp) {
                cellBg = `linear-gradient(135deg, ${SKÖRDAR_CLR} 50%, ${SKOTAR_CLR} 50%)`;
              } else if (harSkördarStopp) {
                cellBg = SKÖRDAR_CLR;
              } else if (harSkotarStopp) {
                cellBg = SKOTAR_CLR;
              }

              // Rounded corners based on position
              if (harStopp && stoppInfo) {
                const pos = harSkördarStopp ? stoppInfo.skordare : stoppInfo.skotare;
                // For dual stopp, use combined position
                const posA = stoppInfo.skordare;
                const posB = stoppInfo.skotare;
                const isStart_ = (posA === 'start' || posA === 'single') && (posB === 'start' || posB === 'single' || !posB);
                const isEnd_ = (posA === 'end' || posA === 'single') && (posB === 'end' || posB === 'single' || !posB);
                if (isStart_ && isEnd_) cellRadius = '6px';
                else if (isStart_) cellRadius = '6px 0 0 6px';
                else if (isEnd_) cellRadius = '0 6px 6px 0';
              }

              // Text/circle styling
              let circleBg = 'transparent';
              let circleColor = harStopp ? '#fff' : (ärHelg || ärHelgdag) ? C.red : C.t1;
              let fontWeight = 400;

              if (isInRange) {
                circleBg = '#ea580c';
                circleColor = '#fff';
                fontWeight = 600;
              } else if (isIdag && !harStopp) {
                circleBg = C.accent;
                circleColor = '#fff';
                fontWeight = 600;
              } else if (isIdag && harStopp) {
                fontWeight = 700;
              } else if (harStopp) {
                fontWeight = 500;
              }

              // Dots (exclude stopp types — they have full bg now)
              const dots: string[] = [];
              if (harGodkänd) dots.push(C.green);
              if (harVäntar) dots.push(C.yellow);
              if (harStillestånd) dots.push(C.gray);
              if (harNekad) dots.push(C.red);

              return (
                <div key={dag} style={{
                  position: 'relative', aspectRatio: '1',
                  background: cellBg,
                  borderRadius: cellRadius,
                  transition: 'background 0.15s',
                }}>
                  <button
                    onClick={() => onVäljDag(iso)}
                    style={{
                      position: 'relative', width: '100%', height: '100%',
                      background: 'transparent', border: 'none',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontFamily: ff, padding: 0,
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 17,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: circleBg,
                      transition: 'all 0.15s ease',
                    }}>
                      <span style={{
                        fontSize: 14, fontWeight,
                        color: circleColor,
                      }}>{dag}</span>
                    </div>
                    {isIdag && !isInRange && !harStopp && (
                      <span style={{
                        position: 'absolute', bottom: dots.length > 0 ? -2 : 2,
                        fontSize: 8, fontWeight: 700, color: C.accent,
                        letterSpacing: '0.04em',
                      }}>idag</span>
                    )}
                    {dots.length > 0 && !isInRange && !harStopp && (
                      <div style={{
                        position: 'absolute', bottom: 2,
                        display: 'flex', gap: 2, justifyContent: 'center',
                      }}>
                        {dots.slice(0, 3).map((c, di) => (
                          <div key={di} style={{
                            width: 4, height: 4, borderRadius: 2, background: c,
                          }} />
                        ))}
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: `1px solid ${C.border}`,
  borderRadius: 10, width: 36, height: 36,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', transition: 'all 0.15s ease',
};

// === Ansökningskort ===

function AnsökningsKort({
  a, showNamn, onHantera, onTaBort,
}: {
  a: Ansökan; showNamn: boolean;
  onHantera?: (id: string, status: 'godkänd' | 'nekad') => void;
  onTaBort?: () => void;
}) {
  const ti = TYPINFO[a.typ] || TYPINFO.semester;
  const si = STATUSINFO[a.status] || STATUSINFO['väntar'];
  const dagar = dagMellan(a.startdatum, a.slutdatum);

  return (
    <div style={{
      background: C.surface2,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px',
      animation: 'fadeUp 0.3s cubic-bezier(0.4,0,0.2,1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: 4,
            background: ti.color,
          }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>
            {showNamn && `${a.anvandare_id} · `}{ti.label}
          </span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px',
          borderRadius: 20, color: si.color, background: si.bg,
        }}>
          {si.label}
        </span>
      </div>
      <div style={{ fontSize: 13, color: C.t2 }}>
        {fmtDate(a.startdatum)} – {fmtDate(a.slutdatum)} · {dagar} dag{dagar !== 1 ? 'ar' : ''}
      </div>
      {a.kommentar && (
        <div style={{ fontSize: 12, color: C.t3, marginTop: 6, fontStyle: 'italic' }}>
          &quot;{a.kommentar}&quot;
        </div>
      )}
      {onHantera && a.status === 'väntar' && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button onClick={() => onHantera(a.id, 'godkänd')} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
            background: C.green, color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: ff,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <IconCheck size={14} /> Godkänn
          </button>
          <button onClick={() => onHantera(a.id, 'nekad')} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
            background: C.redDim, color: C.red, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: ff,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <IconX size={14} /> Neka
          </button>
        </div>
      )}
      {onTaBort && a.status !== 'väntar' && (
        <button onClick={onTaBort} style={{
          marginTop: 8, background: 'none', border: 'none',
          color: C.t3, fontSize: 12, cursor: 'pointer', fontFamily: ff,
        }}>
          Ta bort
        </button>
      )}
    </div>
  );
}

// === Main ===

export default function LedighetPage() {
  const [vy, setVy] = useState<'anställd' | 'chef' | 'historik'>('anställd');
  const [historikPerson, setHistorikPerson] = useState('Alla');
  const [historikStatus, setHistorikStatus] = useState('Alla');
  const [valdAnvändare, setValdAnvändare] = useState(ANSTÄLLDA[0]);
  const [ansökningar, setAnsökningar] = useState<Ansökan[]>([]);
  const [loading, setLoading] = useState(true);

  const nu = new Date();
  const [år, setÅr] = useState(nu.getFullYear());
  const [månad, setMånad] = useState(nu.getMonth());
  const [valdStart, setValdStart] = useState<string | null>(null);
  const [valdSlut, setValdSlut] = useState<string | null>(null);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [klickFas, setKlickFas] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [formTyp, setFormTyp] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formSlut, setFormSlut] = useState('');
  const [formKommentar, setFormKommentar] = useState('');
  const [sparar, setSparar] = useState(false);
  const [felmeddelande, setFelmeddelande] = useState<string | null>(null);
  const [stoppTypForm, setStoppTypForm] = useState('skordarstopp');
  const [sparasStopp, setSparasStopp] = useState(false);

  const hämtaAnsökningar = useCallback(async () => {
    const { data, error } = await supabase
      .from('ledighet_ansokningar')
      .select('*')
      .order('startdatum', { ascending: false });
    if (error) {
      setFelmeddelande('Kunde inte hämta ansökningar: ' + error.message);
    } else if (data) {
      setAnsökningar(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { hämtaAnsökningar(); }, [hämtaAnsökningar]);

  useEffect(() => {
    if (felmeddelande) {
      const t = setTimeout(() => setFelmeddelande(null), 5000);
      return () => clearTimeout(t);
    }
  }, [felmeddelande]);

  const ändraMånad = (delta: number) => {
    setSlideDir(delta > 0 ? 'left' : 'right');
    setTimeout(() => setSlideDir(null), 350);
    let ny = månad + delta;
    let å = år;
    if (ny < 0) { ny = 11; å--; }
    if (ny > 11) { ny = 0; å++; }
    setMånad(ny);
    setÅr(å);
  };

  const väljDag = (iso: string) => {
    if (klickFas === 0) {
      setValdStart(iso);
      setValdSlut(null);
      setKlickFas(1);
    } else if (klickFas === 1) {
      if (iso === valdStart) {
        setValdSlut(iso);
        setKlickFas(2);
      } else if (iso < valdStart!) {
        setValdSlut(valdStart);
        setValdStart(iso);
        setKlickFas(2);
      } else {
        setValdSlut(iso);
        setKlickFas(2);
      }
    } else {
      setValdStart(null);
      setValdSlut(null);
      setKlickFas(0);
    }
  };

  const openForm = () => {
    setFormTyp('');
    setFormStart(valdStart || '');
    setFormSlut(valdSlut || valdStart || '');
    setFormKommentar('');
    setShowForm(true);
  };

  const stoppTyper = ['stillestand', 'skordarstopp', 'skotarstopp'];

  const dubbelbokning = useMemo(() => {
    if (!formStart) return null;
    const slut = formSlut || formStart;
    const person = stoppTyper.includes(formTyp) ? 'alla' : valdAnvändare;
    const overlap = ansökningar.find(a =>
      a.status === 'godkänd' &&
      a.anvandare_id === person &&
      a.startdatum <= slut &&
      a.slutdatum >= formStart
    );
    if (!overlap) return null;
    const ti = TYPINFO[overlap.typ] || TYPINFO.semester;
    return `${overlap.anvandare_id} har redan ${ti.label.toLowerCase()} ${fmtDate(overlap.startdatum)} – ${fmtDate(overlap.slutdatum)} under denna period`;
  }, [formStart, formSlut, formTyp, ansökningar, valdAnvändare]);

  const skickaAnsökan = async () => {
    if (!formStart || !formTyp || (formSlut && formSlut < formStart)) return;
    if (dubbelbokning) {
      setFelmeddelande(dubbelbokning);
      return;
    }
    setSparar(true);
    const slut = formSlut || formStart;
    const typ = formTyp as Ansökan['typ'];
    const ärStopp = stoppTyper.includes(typ);
    const { error } = await supabase.from('ledighet_ansokningar').insert({
      anvandare_id: ärStopp ? 'alla' : valdAnvändare,
      typ,
      startdatum: formStart,
      slutdatum: slut,
      status: ärStopp ? 'godkänd' : 'väntar',
      kommentar: formKommentar || null,
      skapad_av: ärStopp ? 'Chef' : valdAnvändare,
    });
    if (error) {
      setFelmeddelande('Kunde inte skicka ansökan: ' + error.message);
      setSparar(false);
      return;
    }
    setShowForm(false);
    setFormKommentar('');
    setValdStart(null);
    setValdSlut(null);
    setKlickFas(0);
    setSparar(false);
    hämtaAnsökningar();
  };

  const hanteraAnsökan = async (id: string, nystatus: 'godkänd' | 'nekad') => {
    const { error } = await supabase.from('ledighet_ansokningar').update({ status: nystatus }).eq('id', id);
    if (error) {
      setFelmeddelande('Kunde inte uppdatera ansökan: ' + error.message);
      return;
    }
    hämtaAnsökningar();
  };

  const taBortAnsökan = async (id: string) => {
    if (!window.confirm('Är du säker på att du vill ta bort denna ansökan?')) return;
    const { error } = await supabase.from('ledighet_ansokningar').delete().eq('id', id);
    if (error) {
      setFelmeddelande('Kunde inte ta bort ansökan: ' + error.message);
      return;
    }
    hämtaAnsökningar();
  };

  const minaAnsökningar = ansökningar.filter(a => a.anvandare_id === valdAnvändare);
  const väntandeAntal = ansökningar.filter(a => a.status === 'väntar').length;
  const kalenderAnsökningar = useMemo(() => {
    if (vy === 'chef') return ansökningar.filter(a => a.status !== 'nekad');
    return ansökningar.filter(a =>
      a.anvandare_id === valdAnvändare || (stoppTyper.includes(a.typ) && a.status === 'godkänd')
    );
  }, [vy, ansökningar, valdAnvändare]);

  const idagISO = toISO(new Date());
  const kommande = useMemo(() => {
    const src = vy === 'anställd' ? minaAnsökningar : ansökningar;
    return src.filter(a => a.slutdatum >= idagISO && a.status !== 'nekad')
      .sort((a, b) => a.startdatum.localeCompare(b.startdatum));
  }, [vy, minaAnsökningar, ansökningar, idagISO]);

  const tidigare = useMemo(() => {
    const src = vy === 'anställd' ? minaAnsökningar : ansökningar;
    return src.filter(a => a.slutdatum < idagISO || a.status === 'nekad');
  }, [vy, minaAnsökningar, ansökningar, idagISO]);

  const väntande = ansökningar.filter(a => a.status === 'väntar');

  // Collision check for form
  const kollision = useMemo(() => {
    if (!formStart || !formSlut) return [];
    const names: string[] = [];
    for (const a of ansökningar) {
      if (a.status !== 'godkänd') continue;
      if (a.anvandare_id === valdAnvändare || a.anvandare_id === 'alla') continue;
      if (a.startdatum <= formSlut && a.slutdatum >= formStart) {
        if (!names.includes(a.anvandare_id)) names.push(a.anvandare_id);
      }
    }
    return names;
  }, [formStart, formSlut, ansökningar, valdAnvändare]);

  // KPI data
  const atkAnvända = useMemo(() => {
    return minaAnsökningar
      .filter(a => a.typ === 'atk' && a.status !== 'nekad')
      .reduce((sum, a) => sum + dagMellan(a.startdatum, a.slutdatum) * 8, 0);
  }, [minaAnsökningar]);
  const atkTotal = 96; // 12 days * 8h
  const atkKvar = Math.max(0, atkTotal - atkAnvända);

  const semesterAnvända = useMemo(() => {
    return minaAnsökningar
      .filter(a => a.typ === 'semester' && a.status !== 'nekad')
      .reduce((sum, a) => sum + dagMellan(a.startdatum, a.slutdatum), 0);
  }, [minaAnsökningar]);
  const semesterTotal = 25;
  const semesterKvar = Math.max(0, semesterTotal - semesterAnvända);

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: C.t3, marginBottom: 4,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    background: 'rgba(118,118,128,0.18)', border: `1px solid ${C.border}`,
    color: C.t1, fontSize: 14, fontFamily: ff,
    outline: 'none', boxSizing: 'border-box',
    colorScheme: 'dark',
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)', width: '100%', fontFamily: ff,
      background: C.bg, color: C.t1,
      WebkitFontSmoothing: 'antialiased',
    }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes cal-slide-left-anim { from{opacity:0;transform:translateX(30px)} to{opacity:1;transform:translateX(0)} }
        @keyframes cal-slide-right-anim { from{opacity:0;transform:translateX(-30px)} to{opacity:1;transform:translateX(0)} }
        .cal-slide-left { animation: cal-slide-left-anim 0.3s cubic-bezier(0.4,0,0.2,1); }
        .cal-slide-right { animation: cal-slide-right-anim 0.3s cubic-bezier(0.4,0,0.2,1); }
        *::-webkit-scrollbar{width:0;height:0}
        .nav-cal-btn:hover { background: rgba(255,255,255,0.12) !important; transform: scale(1.05); }
        .nav-cal-btn:active { transform: scale(0.95); }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Error toast */}
      {felmeddelande && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#991b1b', color: '#fff', padding: '12px 20px',
          borderRadius: 12, fontSize: 13, fontWeight: 500, fontFamily: ff,
          zIndex: 9999, maxWidth: 400, textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          animation: 'fadeIn 0.25s ease',
        }}>
          {felmeddelande}
        </div>
      )}

      {/* === 1. TABS === */}
      <div style={{
        display: 'flex', background: C.surface,
        borderBottom: `1px solid ${C.border}`, padding: '0 16px',
      }}>
        {([['anställd', 'Min ledighet'], ['chef', 'Hantera'], ['historik', 'Historik']] as const).map(([tab, label]) => {
          const active = vy === tab;
          return (
            <button key={tab} onClick={() => setVy(tab)} style={{
              flex: 1, padding: '14px 0 12px', background: 'none', border: 'none',
              borderBottom: active ? `2.5px solid ${C.t1}` : '2.5px solid transparent',
              color: active ? C.t1 : C.t3,
              fontSize: 14, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {label}
              {tab === 'chef' && väntandeAntal > 0 && (
                <span style={{
                  background: C.red, color: '#fff', fontSize: 11, fontWeight: 700,
                  borderRadius: 10, minWidth: 20, height: 20, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', padding: '0 6px',
                }}>{väntandeAntal}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ padding: '20px 16px 100px', maxWidth: 480, margin: '0 auto' }}>

        {/* === 2. KPI KORT === */}
        {vy === 'anställd' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            {/* ATK-saldo */}
            <div style={{
              background: C.surface, borderRadius: 14, padding: '16px 18px',
              border: `1px solid ${C.border}`,
            }}>
              <div style={labelStyle}>ATK-SALDO</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.t1, lineHeight: 1.1 }}>
                {atkKvar}
              </div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>timmar kvar</div>
              <ProgressBar value={atkKvar} max={atkTotal} color={C.blue} />
            </div>
            {/* Semesterdagar */}
            <div style={{
              background: C.surface, borderRadius: 14, padding: '16px 18px',
              border: `1px solid ${C.border}`,
            }}>
              <div style={labelStyle}>SEMESTERDAGAR</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.t1, lineHeight: 1.1 }}>
                {semesterKvar}
                <span style={{ fontSize: 14, fontWeight: 400, color: C.t3 }}> av {semesterTotal}</span>
              </div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>kvar</div>
              <ProgressBar value={semesterKvar} max={semesterTotal} color={C.green} />
            </div>
          </div>
        )}

        {/* === 3. VÄLJ PERSONAL === */}
        {vy === 'anställd' && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>VÄLJ PERSONAL</div>
            <div style={{
              display: 'flex', gap: 8, flexWrap: 'wrap',
            }}>
              {ANSTÄLLDA.map(n => {
                const active = valdAnvändare === n;
                return (
                  <button key={n} onClick={() => setValdAnvändare(n)} style={{
                    padding: '8px 16px', borderRadius: 20,
                    background: active ? C.blue : C.surface,
                    border: `1px solid ${active ? C.blue : C.border}`,
                    color: active ? '#fff' : C.t2,
                    fontSize: 13, fontWeight: 500, fontFamily: ff,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* === 4. KALENDER === */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: '20px 14px 16px',
          marginBottom: 16,
        }}>
          <Kalender
            år={år} månad={månad} onÄndraMånad={ändraMånad}
            valdStart={valdStart} valdSlut={valdSlut}
            onVäljDag={väljDag}
            ansökningar={kalenderAnsökningar}
            slideDir={slideDir}
          />
        </div>

        {/* === 5. TECKENFÖRKLARING === */}
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28,
          padding: '0 4px',
        }}>
          {[
            { label: 'Semester', color: C.green },
            { label: 'ATK', color: C.blue },
            { label: 'Stillestånd', color: C.gray },
            { label: 'Väntar', color: C.yellow },
            { label: 'Nekad', color: C.red },
            { label: 'Helg', color: C.red },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
              <span style={{ fontSize: 11, color: C.t3, fontWeight: 500 }}>{label}</span>
            </div>
          ))}
          {/* Stopp legends with rectangles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 14, height: 8, borderRadius: 2, background: '#B45309' }} />
            <span style={{ fontSize: 11, color: C.t3, fontWeight: 500 }}>Skördarstopp</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 14, height: 8, borderRadius: 2, background: '#7C3AED' }} />
            <span style={{ fontSize: 11, color: C.t3, fontWeight: 500 }}>Skotarstopp</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 14, height: 8, borderRadius: 2, background: 'linear-gradient(135deg, #B45309 50%, #7C3AED 50%)' }} />
            <span style={{ fontSize: 11, color: C.t3, fontWeight: 500 }}>Båda stopp</span>
          </div>
        </div>

        {/* === 6. MINA ANSÖKNINGAR + KNAPP === */}
        {vy === 'anställd' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.t1 }}>
            Mina Ansökningar
          </span>
          <button onClick={openForm} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 10, border: 'none',
            background: C.blue, color: '#fff',
            fontSize: 13, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
          }}>
            <IconPlus size={14} />
            Ansök om ledighet
          </button>
        </div>
        )}

        {/* === 7. ANSÖKNINGSFORMULÄR === */}
        {showForm && vy === 'anställd' && (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: 20, marginBottom: 24,
            animation: 'fadeUp 0.25s ease',
          }}>
            {/* Collision warning */}
            {kollision.length > 0 && (
              <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '12px 14px', borderRadius: 10,
                background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)',
                marginBottom: 16,
              }}>
                <IconWarning />
                <div style={{ fontSize: 13, color: '#fb923c', lineHeight: 1.4 }}>
                  <strong>Krock i planeringen</strong> — {kollision.join(' och ')} har redan beviljad ledighet under de valda datumen
                </div>
              </div>
            )}

            {/* Typ */}
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>TYP AV LEDIGHET</div>
              <select
                value={formTyp}
                onChange={e => setFormTyp(e.target.value)}
                style={{ ...inputStyle, appearance: 'auto' }}
              >
                <option value="">Välj typ...</option>
                <option value="semester">Semester</option>
                <option value="atk">ATK</option>
              </select>
            </div>

            {/* Datum */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={labelStyle}>STARTDATUM</div>
                <input
                  type="date"
                  value={formStart}
                  onChange={e => setFormStart(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={labelStyle}>SLUTDATUM</div>
                <input
                  type="date"
                  value={formSlut}
                  onChange={e => setFormSlut(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            {formStart && formSlut && formSlut < formStart && (
              <div style={{
                fontSize: 13, color: C.red, marginBottom: 14, fontWeight: 500,
              }}>
                Slutdatum kan inte vara före startdatum
              </div>
            )}

            {/* Kommentar */}
            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>KOMMENTAR</div>
              <textarea
                placeholder="Beskriv anledningen till din ledighet..."
                value={formKommentar}
                onChange={e => setFormKommentar(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'none' }}
              />
            </div>

            {/* Dubbelbokning-varning */}
            {dubbelbokning && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
                background: C.redDim, border: `1px solid rgba(239,68,68,0.25)`,
                borderRadius: 10, marginBottom: 4,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
                <span style={{ fontSize: 13, color: C.red, lineHeight: 1.5, fontFamily: ff }}>
                  {dubbelbokning}
                </span>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setShowForm(false)} style={{
                background: 'none', border: 'none',
                color: C.t2, fontSize: 14, fontWeight: 500,
                cursor: 'pointer', fontFamily: ff, padding: '10px 16px',
              }}>
                Avbryt
              </button>
              <button onClick={skickaAnsökan} disabled={sparar || !formTyp || !formStart || (!!formSlut && formSlut < formStart) || !!dubbelbokning} style={{
                padding: '10px 24px', borderRadius: 10, border: 'none',
                background: dubbelbokning ? C.t4 : C.blue, color: '#fff',
                fontSize: 14, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
                opacity: (sparar || !formTyp || !formStart || (!!formSlut && formSlut < formStart) || !!dubbelbokning) ? 0.5 : 1,
              }}>
                {sparar ? 'Skickar...' : 'Skicka ansökan'}
              </button>
            </div>
          </div>
        )}

        {/* Ansökningslistor */}
        {vy === 'anställd' && (
          <>
            {loading ? (
              <div style={{ color: C.t3, padding: 40, textAlign: 'center', fontSize: 13 }}>Laddar...</div>
            ) : (
              <>
                {kommande.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                    {kommande.map(a => (
                      <AnsökningsKort key={a.id} a={a} showNamn={false} onTaBort={() => taBortAnsökan(a.id)} />
                    ))}
                  </div>
                )}
                {tidigare.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ ...labelStyle, marginTop: 8 }}>TIDIGARE</div>
                    {tidigare.map(a => (
                      <AnsökningsKort key={a.id} a={a} showNamn={false} onTaBort={() => taBortAnsökan(a.id)} />
                    ))}
                  </div>
                )}
                {kommande.length === 0 && tidigare.length === 0 && !showForm && (
                  <div style={{
                    color: C.t3, padding: 30, textAlign: 'center', fontSize: 13,
                    background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
                  }}>
                    Inga ansökningar ännu. Välj datum i kalendern eller klicka &quot;Ansök om ledighet&quot;.
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Manager view */}
        {vy === 'chef' && (
          <>
            {/* ANSÖKNINGAR */}
            <div style={{ ...labelStyle, marginBottom: 12 }}>ANSÖKNINGAR ({väntandeAntal})</div>
            {väntande.length === 0 ? (
              <div style={{
                color: C.t3, padding: 30, textAlign: 'center', fontSize: 13,
                background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
                marginBottom: 32,
              }}>
                Inga väntande ansökningar
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
                {väntande.map(a => (
                  <AnsökningsKort key={a.id} a={a} showNamn onHantera={hanteraAnsökan} />
                ))}
              </div>
            )}

            {/* MASKINSTOPP — välj datum i kalendern */}
            <div style={{ ...labelStyle, marginBottom: 12 }}>MASKINSTOPP</div>
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: 20, marginBottom: 24,
            }}>
              <div style={{ marginBottom: 16 }}>
                <div style={labelStyle}>TYP AV STOPP</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {([['skordarstopp', 'Skördarstopp', '#B45309'], ['skotarstopp', 'Skotarstopp', '#7C3AED']] as const).map(([val, label, clr]) => {
                    const active = stoppTypForm === val;
                    return (
                      <button key={val} onClick={() => setStoppTypForm(val)} style={{
                        flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                        background: active ? clr : 'rgba(255,255,255,0.06)',
                        color: active ? '#fff' : C.t3,
                        fontSize: 13, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ fontSize: 13, color: C.t2, marginBottom: 12, lineHeight: 1.5 }}>
                {!valdStart
                  ? 'Välj startdatum i kalendern ovan'
                  : !valdSlut
                  ? `Start: ${fmtDate(valdStart)} — välj slutdatum`
                  : `${fmtDate(valdStart)} – ${fmtDate(valdSlut)}`
                }
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                {valdStart && (
                  <button onClick={() => { setValdStart(null); setValdSlut(null); setKlickFas(0); }} style={{
                    padding: '10px 16px', borderRadius: 10, border: 'none',
                    background: 'transparent', color: C.t3,
                    fontSize: 13, fontWeight: 500, fontFamily: ff, cursor: 'pointer',
                  }}>
                    Rensa
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (!valdStart) return;
                    const slut = valdSlut || valdStart;
                    setSparasStopp(true);
                    const { error } = await supabase.from('ledighet_ansokningar').insert({
                      anvandare_id: 'alla',
                      typ: stoppTypForm,
                      startdatum: valdStart,
                      slutdatum: slut,
                      status: 'godkänd',
                      kommentar: null,
                      skapad_av: 'Chef',
                    });
                    if (error) setFelmeddelande('Kunde inte skapa stopp: ' + error.message);
                    else {
                      setValdStart(null);
                      setValdSlut(null);
                      setKlickFas(0);
                      hämtaAnsökningar();
                    }
                    setSparasStopp(false);
                  }}
                  disabled={sparasStopp || !valdStart}
                  style={{
                    padding: '10px 24px', borderRadius: 10, border: 'none',
                    background: stoppTypForm === 'skordarstopp' ? '#B45309' : '#7C3AED',
                    color: '#fff',
                    fontSize: 14, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
                    opacity: (sparasStopp || !valdStart) ? 0.5 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {sparasStopp ? 'Sparar...' : 'Spara stopp'}
                </button>
              </div>
            </div>

            {/* Aktiva stopp */}
            {(() => {
              const aktivaStopp = ansökningar.filter(a =>
                stoppTyper.includes(a.typ) && a.status === 'godkänd' && a.slutdatum >= toISO(new Date())
              ).sort((a, b) => a.startdatum.localeCompare(b.startdatum));
              if (aktivaStopp.length === 0) return null;
              return (
                <>
                  <div style={{ ...labelStyle, marginBottom: 12 }}>AKTIVA STOPP</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                    {aktivaStopp.map(a => (
                      <AnsökningsKort key={a.id} a={a} showNamn={false} onTaBort={() => taBortAnsökan(a.id)} />
                    ))}
                  </div>
                </>
              );
            })()}
          </>
        )}

        {/* === HISTORIK-VY === */}
        {vy === 'historik' && (
          <>
            {/* Personfilter */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...labelStyle, marginBottom: 10 }}>PERSON</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Alla', ...ANSTÄLLDA].map(n => {
                  const active = historikPerson === n;
                  return (
                    <button key={n} onClick={() => setHistorikPerson(n)} style={{
                      padding: '7px 14px', borderRadius: 18,
                      background: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
                      border: active ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                      color: active ? '#fff' : C.t3,
                      fontSize: 13, fontWeight: active ? 600 : 400, fontFamily: ff,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Statusfilter */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ ...labelStyle, marginBottom: 10 }}>STATUS</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['Alla', 'Godkänd', 'Nekad', 'Väntar'].map(s => {
                  const active = historikStatus === s;
                  const statusColors: Record<string, string> = { 'Godkänd': C.green, 'Nekad': C.red, 'Väntar': C.yellow };
                  return (
                    <button key={s} onClick={() => setHistorikStatus(s)} style={{
                      padding: '7px 14px', borderRadius: 18,
                      background: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
                      border: active ? `1px solid ${statusColors[s] || 'rgba(255,255,255,0.12)'}` : '1px solid transparent',
                      color: active ? (statusColors[s] || '#fff') : C.t3,
                      fontSize: 13, fontWeight: active ? 600 : 400, fontFamily: ff,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Historiklista */}
            {(() => {
              const filtered = ansökningar
                .filter(a => historikPerson === 'Alla' || a.anvandare_id === historikPerson)
                .filter(a => {
                  if (historikStatus === 'Alla') return true;
                  const map: Record<string, string> = { 'Godkänd': 'godkänd', 'Nekad': 'nekad', 'Väntar': 'väntar' };
                  return a.status === map[historikStatus];
                })
                .sort((a, b) => b.startdatum.localeCompare(a.startdatum));

              if (loading) return (
                <div style={{ color: C.t3, padding: 40, textAlign: 'center', fontSize: 13 }}>Laddar...</div>
              );

              if (filtered.length === 0) return (
                <div style={{
                  color: C.t3, padding: 30, textAlign: 'center', fontSize: 13,
                  background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
                }}>
                  Inga ansökningar matchar filtren
                </div>
              );

              return (
                <div style={{ background: C.surface, borderRadius: 16, overflow: 'hidden' }}>
                  {filtered.map((a, i) => {
                    const ti = TYPINFO[a.typ] || TYPINFO.semester;
                    const si = STATUSINFO[a.status] || STATUSINFO['väntar'];
                    const dagar = dagMellan(a.startdatum, a.slutdatum);
                    return (
                      <div key={a.id}>
                        {i > 0 && (
                          <div style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.06)', margin: '0 20px' }} />
                        )}
                        <div style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: ti.color, display: 'inline-block', flexShrink: 0 }} />
                              <span style={{ fontSize: 15, fontWeight: 600, color: C.t1, fontFamily: ff }}>
                                {a.anvandare_id}
                              </span>
                              <span style={{ fontSize: 13, color: C.t3, fontFamily: ff }}>
                                {ti.label}
                              </span>
                            </div>
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: '3px 10px',
                              borderRadius: 20, color: si.color, background: si.bg,
                            }}>
                              {si.label}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: C.t2, fontFamily: ff }}>
                            {fmtDate(a.startdatum)} – {fmtDate(a.slutdatum)} · {dagar} dag{dagar !== 1 ? 'ar' : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
