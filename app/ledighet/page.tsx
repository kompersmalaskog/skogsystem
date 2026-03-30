'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Ansökan {
  id: string;
  anvandare_id: string;
  typ: 'semester' | 'atk' | 'skordarstopp' | 'skotarstopp';
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
  nekad: '#BE185D',
  nekadDim: 'rgba(190,24,93,0.15)',
  accent: '#3b82f6',
  accentDim: 'rgba(59,130,246,0.12)',
};

const TYPINFO: Record<string, { label: string; color: string; bg: string }> = {
  semester: { label: 'Semester', color: C.green, bg: C.greenDim },
  atk: { label: 'ATK', color: C.blue, bg: C.blueDim },
  skordarstopp: { label: 'Skördarstopp', color: C.orange, bg: C.orangeDim },
  skotarstopp: { label: 'Skotarstopp', color: C.purple, bg: C.purpleDim },
};

const STATUSINFO: Record<string, { label: string; color: string; bg: string }> = {
  'väntar': { label: 'Väntar', color: C.yellow, bg: C.yellowDim },
  'godkänd': { label: 'Godkänd', color: C.green, bg: C.greenDim },
  'nekad': { label: 'Nekad', color: C.nekad, bg: C.nekadDim },
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
              const stoppTyper = ['skordarstopp', 'skotarstopp'];
              const harGodkänd = markningar.some(m => m.status === 'godkänd' && !stoppTyper.includes(m.typ));
              const harVäntar = markningar.some(m => m.status === 'väntar');
              const harSkördarStopp = markningar.some(m => m.typ === 'skordarstopp' && m.status === 'godkänd');
              const harSkotarStopp = markningar.some(m => m.typ === 'skotarstopp' && m.status === 'godkänd');
              const harNekad = markningar.some(m => m.status === 'nekad');

              const harStopp = harSkördarStopp || harSkotarStopp;

              // Text/circle styling
              let circleBg = 'transparent';
              let circleColor = (ärHelg || ärHelgdag) ? C.red : C.t1;
              let fontWeight = 400;

              if (isInRange) {
                circleBg = '#ea580c';
                circleColor = '#fff';
                fontWeight = 600;
              } else if (isIdag) {
                circleBg = C.accent;
                circleColor = '#fff';
                fontWeight = 600;
              }

              // Dots for leave types (not stopp)
              const dots: string[] = [];
              if (harGodkänd) dots.push(C.green);
              if (harVäntar) dots.push(C.yellow);
              if (harNekad) dots.push(C.nekad);

              // Bottom stopp bar
              const SKÖRDAR_CLR = '#B45309';
              const SKOTAR_CLR = '#7C3AED';
              let stoppBar: React.ReactNode = null;
              if (harStopp) {
                const barStyle: React.CSSProperties = {
                  position: 'absolute', bottom: 1, left: 2, right: 2, height: 5,
                  borderRadius: 2,
                };
                if (harSkördarStopp && harSkotarStopp) {
                  stoppBar = (
                    <div style={barStyle}>
                      <div style={{ display: 'flex', height: '100%', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ flex: 1, background: SKÖRDAR_CLR }} />
                        <div style={{ flex: 1, background: SKOTAR_CLR }} />
                      </div>
                    </div>
                  );
                } else {
                  stoppBar = <div style={{ ...barStyle, background: harSkördarStopp ? SKÖRDAR_CLR : SKOTAR_CLR }} />;
                }
              }

              return (
                <div key={dag} style={{ position: 'relative', aspectRatio: '1' }}>
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
                    {isIdag && !isInRange && (
                      <span style={{
                        position: 'absolute', bottom: harStopp ? 7 : dots.length > 0 ? -2 : 2,
                        fontSize: 8, fontWeight: 700, color: C.accent,
                        letterSpacing: '0.04em',
                      }}>idag</span>
                    )}
                    {dots.length > 0 && !isInRange && (
                      <div style={{
                        position: 'absolute', bottom: harStopp ? 8 : 2,
                        display: 'flex', gap: 2, justifyContent: 'center',
                      }}>
                        {dots.slice(0, 3).map((c, di) => (
                          <div key={di} style={{
                            width: 4, height: 4, borderRadius: 2, background: c,
                          }} />
                        ))}
                      </div>
                    )}
                    {stoppBar}
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
  const [historikÅr, setHistorikÅr] = useState(new Date().getFullYear());
  const [historikTyp, setHistorikTyp] = useState('Alla');
  const [expanderad, setExpanderad] = useState<Record<string, boolean>>({});
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
  const [editingStoppId, setEditingStoppId] = useState<string | null>(null);
  const [visaTeam, setVisaTeam] = useState(false);

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

  const stoppTyper = ['skordarstopp', 'skotarstopp'];

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

  // Saldo per person for a given year
  const getSaldo = useCallback((person: string, årFilter?: number) => {
    const y = årFilter || new Date().getFullYear();
    const yStr = String(y);
    const pa = ansökningar.filter(a =>
      a.anvandare_id === person && a.status === 'godkänd' &&
      (a.startdatum.startsWith(yStr) || a.slutdatum.startsWith(yStr))
    );
    const semAnvända = pa.filter(a => a.typ === 'semester').reduce((s, a) => s + dagMellan(a.startdatum, a.slutdatum), 0);
    const atkAnvändaDagar = pa.filter(a => a.typ === 'atk').reduce((s, a) => s + dagMellan(a.startdatum, a.slutdatum), 0);
    const semTotal = 25;
    const atkTotalDagar = 5;
    return {
      semAnvända, semTotal, semKvar: Math.max(0, semTotal - semAnvända),
      atkAnvända: atkAnvändaDagar, atkTotal: atkTotalDagar, atkKvar: Math.max(0, atkTotalDagar - atkAnvändaDagar),
      totalUttaget: semAnvända + atkAnvändaDagar,
    };
  }, [ansökningar]);

  const saldoFärg = (kvar: number) => kvar > 5 ? C.green : kvar > 0 ? C.yellow : C.red;

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

        {/* =============================================
            FLIK 1: MIN LEDIGHET
            ============================================= */}
        {vy === 'anställd' && (
          <>
            {/* KPI kort */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div style={{ background: C.surface, borderRadius: 14, padding: '16px 18px', border: `1px solid ${C.border}` }}>
                <div style={labelStyle}>ATK-SALDO</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: C.t1, lineHeight: 1.1 }}>{atkKvar}</div>
                <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>timmar kvar</div>
                <ProgressBar value={atkKvar} max={atkTotal} color={C.blue} />
              </div>
              <div style={{ background: C.surface, borderRadius: 14, padding: '16px 18px', border: `1px solid ${C.border}` }}>
                <div style={labelStyle}>SEMESTERDAGAR</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: C.t1, lineHeight: 1.1 }}>
                  {semesterKvar}<span style={{ fontSize: 14, fontWeight: 400, color: C.t3 }}> av {semesterTotal}</span>
                </div>
                <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>kvar</div>
                <ProgressBar value={semesterKvar} max={semesterTotal} color={C.green} />
              </div>
            </div>

            {/* Kalender — bara den inloggades data + stopp */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 14px 16px', marginBottom: 12 }}>
              <Kalender år={år} månad={månad} onÄndraMånad={ändraMånad} valdStart={valdStart} valdSlut={valdSlut} onVäljDag={väljDag} ansökningar={kalenderAnsökningar} slideDir={slideDir} />
            </div>

            {/* Teckenförklaring — kompakt en rad */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24, padding: '0 4px' }}>
              {[{ l: 'Semester', c: C.green }, { l: 'ATK', c: C.blue }, { l: 'Väntar', c: C.yellow }, { l: 'Nekad', c: C.nekad }, { l: 'Helg', c: C.red }].map(({ l, c }) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 4, background: c }} />
                  <span style={{ fontSize: 10, color: C.t3, fontWeight: 500 }}>{l}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 14, height: 4, borderRadius: 2, background: '#B45309' }} />
                <span style={{ fontSize: 10, color: C.t3, fontWeight: 500 }}>Skördarstopp</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 14, height: 4, borderRadius: 2, background: '#7C3AED' }} />
                <span style={{ fontSize: 10, color: C.t3, fontWeight: 500 }}>Skotarstopp</span>
              </div>
            </div>

            {/* Mina Ansökningar header + knapp */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.t1 }}>Mina Ansökningar</span>
              <button onClick={openForm} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none',
                background: C.blue, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
              }}>
                <IconPlus size={14} /> Ansök
              </button>
            </div>

            {/* Ansökningslistor */}
            {loading ? (
              <div style={{ color: C.t3, padding: 40, textAlign: 'center', fontSize: 13 }}>Laddar...</div>
            ) : (
              <>
                {kommande.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                    {kommande.map(a => <AnsökningsKort key={a.id} a={a} showNamn={false} onTaBort={() => taBortAnsökan(a.id)} />)}
                  </div>
                )}
                {tidigare.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ ...labelStyle, marginTop: 8 }}>TIDIGARE</div>
                    {tidigare.map(a => <AnsökningsKort key={a.id} a={a} showNamn={false} onTaBort={() => taBortAnsökan(a.id)} />)}
                  </div>
                )}
                {kommande.length === 0 && tidigare.length === 0 && !showForm && (
                  <div style={{ color: C.t3, padding: 30, textAlign: 'center', fontSize: 13, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}` }}>
                    Inga ansökningar ännu. Välj datum i kalendern eller tryck &quot;Ansök&quot;.
                  </div>
                )}
              </>
            )}

            {/* Formulär — modal/sheet overlay */}
            {showForm && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                <div onClick={() => setShowForm(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
                <div style={{
                  position: 'relative', width: '100%', maxWidth: 480,
                  background: C.surface, borderRadius: '20px 20px 0 0', padding: '24px 20px 32px',
                  animation: 'fadeUp 0.25s ease',
                }}>
                  <div style={{ width: 40, height: 4, borderRadius: 2, background: C.t4, margin: '0 auto 20px' }} />

                  {kollision.length > 0 && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 10, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', marginBottom: 16 }}>
                      <IconWarning />
                      <div style={{ fontSize: 13, color: '#fb923c', lineHeight: 1.4 }}>
                        <strong>Krock</strong> — {kollision.join(' och ')} har ledighet under dessa datum
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    {([['semester', 'Semester'], ['atk', 'ATK']] as const).map(([val, label]) => {
                      const active = formTyp === val;
                      return (
                        <button key={val} onClick={() => setFormTyp(val)} style={{
                          flex: 1, height: 48, borderRadius: 12,
                          background: active ? '#fff' : 'rgba(255,255,255,0.06)',
                          border: active ? 'none' : '1px solid rgba(255,255,255,0.1)',
                          color: active ? '#111' : '#fff',
                          fontSize: 15, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div>
                      <div style={labelStyle}>STARTDATUM</div>
                      <input type="date" value={formStart} onChange={e => setFormStart(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <div style={labelStyle}>SLUTDATUM</div>
                      <input type="date" value={formSlut} onChange={e => setFormSlut(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                  {formStart && formSlut && formSlut < formStart && (
                    <div style={{ fontSize: 13, color: C.red, marginBottom: 14, fontWeight: 500 }}>Slutdatum kan inte vara före startdatum</div>
                  )}

                  <div style={{ marginBottom: 16 }}>
                    <div style={labelStyle}>KOMMENTAR</div>
                    <textarea placeholder="Beskriv anledningen..." value={formKommentar} onChange={e => setFormKommentar(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'none' }} />
                  </div>

                  {dubbelbokning && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: C.nekadDim, border: `1px solid rgba(190,24,93,0.25)`, borderRadius: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
                      <span style={{ fontSize: 13, color: C.nekad, lineHeight: 1.5, fontFamily: ff }}>{dubbelbokning}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: C.t2, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: ff, padding: '10px 16px' }}>Avbryt</button>
                    <button onClick={skickaAnsökan} disabled={sparar || !formTyp || !formStart || (!!formSlut && formSlut < formStart) || !!dubbelbokning} style={{
                      padding: '10px 24px', borderRadius: 10, border: 'none', background: dubbelbokning ? C.t4 : C.blue, color: '#fff',
                      fontSize: 14, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
                      opacity: (sparar || !formTyp || !formStart || (!!formSlut && formSlut < formStart) || !!dubbelbokning) ? 0.5 : 1,
                    }}>
                      {sparar ? 'Skickar...' : 'Skicka ansökan'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* =============================================
            FLIK 2: HANTERA
            ============================================= */}

        {/* Manager view */}
        {vy === 'chef' && (
          <>
            {/* Kalender — alla anställda + stopp */}
            {!visaTeam && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 14px 16px', marginBottom: 12 }}>
              <Kalender år={år} månad={månad} onÄndraMånad={ändraMånad} valdStart={valdStart} valdSlut={valdSlut} onVäljDag={väljDag} ansökningar={kalenderAnsökningar} slideDir={slideDir} />
            </div>
            )}

            {/* Teamvy */}
            {visaTeam && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 14px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '0 4px' }}>
                <div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: C.t1 }}>{MÅNADNAMN[månad]}</span>
                  <span style={{ fontSize: 18, fontWeight: 400, color: C.t3, marginLeft: 8 }}>{år}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="nav-cal-btn" onClick={() => ändraMånad(-1)} style={navBtnStyle}><IconChevron dir="left" /></button>
                  <button className="nav-cal-btn" onClick={() => ändraMånad(1)} style={navBtnStyle}><IconChevron dir="right" /></button>
                </div>
              </div>
              {(() => {
                const dagar = new Date(år, månad + 1, 0).getDate();
                const dagBredd = `${100 / dagar}%`;
                const stoppBlock = ansökningar.filter(a => (a.typ === 'skordarstopp' || a.typ === 'skotarstopp') && a.status === 'godkänd' && a.slutdatum >= toISO(new Date(år, månad, 1)) && a.startdatum <= toISO(new Date(år, månad, dagar)));
                const renderBlock = (a: Ansökan, color: string) => {
                  const s = Math.max(1, new Date(a.startdatum) <= new Date(år, månad, 1) ? 1 : new Date(a.startdatum).getDate());
                  const e = Math.min(dagar, new Date(a.slutdatum) >= new Date(år, månad, dagar) ? dagar : new Date(a.slutdatum).getDate());
                  return <div key={a.id} style={{ position: 'absolute', top: 0, bottom: 0, left: `${((s-1)/dagar)*100}%`, width: `${((e-s+1)/dagar)*100}%`, background: color, borderRadius: 3 }} />;
                };
                const typFärg: Record<string, string> = { semester: C.green, atk: C.blue };
                return (
                  <div>
                    <div style={{ display: 'flex', paddingLeft: 90, marginBottom: 4 }}>
                      {Array.from({ length: dagar }, (_, i) => i + 1).map(d => (
                        <div key={d} style={{ width: dagBredd, textAlign: 'center', fontSize: 9, color: d % 5 === 0 || d === 1 ? C.t3 : 'transparent', fontFamily: ff }}>{d}</div>
                      ))}
                    </div>
                    {stoppBlock.length > 0 && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ width: 86, flexShrink: 0, fontSize: 11, fontWeight: 600, color: C.t3, fontFamily: ff }}>Maskinstopp</div>
                          <div style={{ flex: 1, position: 'relative', height: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 3 }}>
                            {stoppBlock.map(a => renderBlock(a, a.typ === 'skordarstopp' ? '#B45309' : '#7C3AED'))}
                          </div>
                        </div>
                        <div style={{ height: 1, background: C.border, margin: '6px 0 8px 86px' }} />
                      </>
                    )}
                    {ANSTÄLLDA.map(person => {
                      const pa = ansökningar.filter(a => a.anvandare_id === person && a.status !== 'nekad' && !stoppTyper.includes(a.typ) && a.slutdatum >= toISO(new Date(år, månad, 1)) && a.startdatum <= toISO(new Date(år, månad, dagar)));
                      return (
                        <div key={person} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ width: 86, flexShrink: 0, fontSize: 12, fontWeight: 500, color: C.t2, fontFamily: ff, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person}</div>
                          <div style={{ flex: 1, position: 'relative', height: 18, background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                            {pa.map(a => {
                              const s = Math.max(1, new Date(a.startdatum) <= new Date(år, månad, 1) ? 1 : new Date(a.startdatum).getDate());
                              const e = Math.min(dagar, new Date(a.slutdatum) >= new Date(år, månad, dagar) ? dagar : new Date(a.slutdatum).getDate());
                              return <div key={a.id} title={`${TYPINFO[a.typ]?.label}: ${a.startdatum} – ${a.slutdatum}`} style={{ position: 'absolute', top: 2, bottom: 2, left: `${((s-1)/dagar)*100}%`, width: `${((e-s+1)/dagar)*100}%`, background: typFärg[a.typ] || C.gray, borderRadius: 3, opacity: a.status === 'väntar' ? 0.5 : 0.85 }} />;
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            )}

            {/* [Kalender] [Team] toggle */}
            <div style={{ display: 'flex', background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 3, marginBottom: 20 }}>
              {(['kalender', 'team'] as const).map(v => {
                const active = v === 'kalender' ? !visaTeam : visaTeam;
                return (
                  <button key={v} onClick={() => setVisaTeam(v === 'team')} style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: active ? C.t1 : C.t3, fontSize: 13, fontWeight: active ? 600 : 400, fontFamily: ff, cursor: 'pointer',
                  }}>
                    {v === 'kalender' ? 'Kalender' : 'Team'}
                  </button>
                );
              })}
            </div>

            {/* Personväljare */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...labelStyle, marginBottom: 10 }}>VÄLJ PERSONAL</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ANSTÄLLDA.map(n => {
                  const active = valdAnvändare === n;
                  return (
                    <button key={n} onClick={() => setValdAnvändare(n)} style={{
                      padding: '8px 16px', borderRadius: 20,
                      background: active ? C.blue : C.surface, border: `1px solid ${active ? C.blue : C.border}`,
                      color: active ? '#fff' : C.t2, fontSize: 13, fontWeight: 500, fontFamily: ff, cursor: 'pointer',
                    }}>{n}</button>
                  );
                })}
              </div>
            </div>

            {/* SALDO-TABELL */}
            <div style={{ ...labelStyle, marginBottom: 12 }}>SALDO {år}</div>
            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 28 }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 65px 75px', padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Namn</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Semester</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>ATK</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Uttaget</span>
              </div>
              {ANSTÄLLDA.map((person, i) => {
                const s = getSaldo(person, år);
                return (
                  <div key={person}>
                    {i > 0 && <div style={{ height: 0.5, background: C.border, margin: '0 16px' }} />}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 65px 75px', padding: '10px 16px', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.t1 }}>{person}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: saldoFärg(s.semKvar), textAlign: 'right' }}>{s.semKvar} kvar</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: saldoFärg(s.atkKvar), textAlign: 'right' }}>{s.atkKvar} kvar</span>
                      <span style={{ fontSize: 13, color: C.t2, textAlign: 'right' }}>{s.totalUttaget} d</span>
                    </div>
                  </div>
                );
              })}
            </div>

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
                {editingStoppId && (
                  <button onClick={() => { setEditingStoppId(null); setValdStart(null); setValdSlut(null); setKlickFas(0); }} style={{
                    padding: '10px 16px', borderRadius: 10, border: 'none',
                    background: 'transparent', color: C.t3,
                    fontSize: 13, fontWeight: 500, fontFamily: ff, cursor: 'pointer',
                  }}>
                    Avbryt redigering
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (!valdStart) return;
                    const slut = valdSlut || valdStart;
                    setSparasStopp(true);
                    let error;
                    if (editingStoppId) {
                      ({ error } = await supabase.from('ledighet_ansokningar').update({
                        typ: stoppTypForm,
                        startdatum: valdStart,
                        slutdatum: slut,
                      }).eq('id', editingStoppId));
                    } else {
                      ({ error } = await supabase.from('ledighet_ansokningar').insert({
                        anvandare_id: 'alla',
                        typ: stoppTypForm,
                        startdatum: valdStart,
                        slutdatum: slut,
                        status: 'godkänd',
                        kommentar: null,
                        skapad_av: 'Chef',
                      }));
                    }
                    if (error) setFelmeddelande('Kunde inte spara stopp: ' + error.message);
                    else {
                      setValdStart(null);
                      setValdSlut(null);
                      setKlickFas(0);
                      setEditingStoppId(null);
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
                  {sparasStopp ? 'Sparar...' : editingStoppId ? 'Uppdatera stopp' : 'Spara stopp'}
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
                    {aktivaStopp.map(a => {
                      const ti = TYPINFO[a.typ] || TYPINFO.skordarstopp;
                      const dagar = dagMellan(a.startdatum, a.slutdatum);
                      const isEditing = editingStoppId === a.id;
                      return (
                        <div key={a.id} style={{
                          background: C.surface2,
                          border: `1px solid ${isEditing ? ti.color : C.border}`,
                          borderRadius: 12, padding: '14px 16px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 18, height: 5, borderRadius: 2, background: ti.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>{ti.label}</span>
                          </div>
                          <div style={{ fontSize: 13, color: C.t2 }}>
                            {fmtDate(a.startdatum)} – {fmtDate(a.slutdatum)} · {dagar} dag{dagar !== 1 ? 'ar' : ''}
                          </div>
                          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                            <button onClick={() => {
                              setEditingStoppId(a.id);
                              setStoppTypForm(a.typ);
                              setValdStart(a.startdatum);
                              setValdSlut(a.slutdatum);
                              setKlickFas(2);
                            }} style={{
                              background: 'none', border: 'none', padding: 0,
                              color: C.accent, fontSize: 13, fontWeight: 500,
                              cursor: 'pointer', fontFamily: ff,
                            }}>
                              Redigera
                            </button>
                            <button onClick={() => {
                              if (window.confirm('Är du säker? Detta tar bort stoppet för alla.')) {
                                taBortAnsökan(a.id);
                              }
                            }} style={{
                              background: 'none', border: 'none', padding: 0,
                              color: C.t3, fontSize: 13, fontWeight: 500,
                              cursor: 'pointer', fontFamily: ff,
                            }}>
                              Ta bort
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </>
        )}

        {/* === HISTORIK-VY === */}
        {vy === 'historik' && (() => {
          const årStr = String(historikÅr);
          const årsAnsökningar = ansökningar.filter(a =>
            a.startdatum.startsWith(årStr) || a.slutdatum.startsWith(årStr)
          );
          const personAnsökningar = årsAnsökningar.filter(a =>
            !stoppTyper.includes(a.typ) &&
            (historikTyp === 'Alla' || a.typ === historikTyp.toLowerCase())
          );
          const stoppAnsökningar = årsAnsökningar.filter(a => stoppTyper.includes(a.typ) && a.status === 'godkänd');

          // Summering
          const personerMedLedighet = new Set(personAnsökningar.filter(a => a.status !== 'nekad').map(a => a.anvandare_id));
          const totalSemester = personAnsökningar
            .filter(a => a.typ === 'semester' && a.status !== 'nekad')
            .reduce((s, a) => s + dagMellan(a.startdatum, a.slutdatum), 0);
          const totalATK = personAnsökningar
            .filter(a => a.typ === 'atk' && a.status !== 'nekad')
            .reduce((s, a) => s + dagMellan(a.startdatum, a.slutdatum), 0);

          return (
          <>
            {/* Filter */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              {/* År */}
              <div style={{ display: 'flex', gap: 4 }}>
                {[2024, 2025, 2026].map(y => (
                  <button key={y} onClick={() => setHistorikÅr(y)} style={{
                    padding: '7px 14px', borderRadius: 18,
                    background: historikÅr === y ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
                    border: historikÅr === y ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                    color: historikÅr === y ? '#fff' : C.t3,
                    fontSize: 13, fontWeight: historikÅr === y ? 600 : 400, fontFamily: ff,
                    cursor: 'pointer',
                  }}>
                    {y}
                  </button>
                ))}
              </div>
              {/* Typ */}
              <div style={{ display: 'flex', gap: 4 }}>
                {['Alla', 'Semester', 'ATK'].map(t => (
                  <button key={t} onClick={() => setHistorikTyp(t)} style={{
                    padding: '7px 14px', borderRadius: 18,
                    background: historikTyp === t ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
                    border: historikTyp === t ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                    color: historikTyp === t ? '#fff' : C.t3,
                    fontSize: 13, fontWeight: historikTyp === t ? 600 : 400, fontFamily: ff,
                    cursor: 'pointer',
                  }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Sammanfattning */}
            <div style={{
              background: C.surface, borderRadius: 12, padding: '14px 18px',
              border: `1px solid ${C.border}`, marginBottom: 20,
            }}>
              <span style={{ fontSize: 14, color: C.t2, fontFamily: ff }}>
                <strong style={{ color: C.t1 }}>{historikÅr}</strong> — {personerMedLedighet.size} person{personerMedLedighet.size !== 1 ? 'er' : ''} har tagit{' '}
                <strong style={{ color: C.t1 }}>{totalSemester} d semester</strong>,{' '}
                <strong style={{ color: C.t1 }}>{totalATK} d ATK</strong>
              </span>
            </div>

            {/* Personkort */}
            {ANSTÄLLDA.map(person => {
              const pAnsökningar = personAnsökningar
                .filter(a => a.anvandare_id === person)
                .sort((a, b) => b.startdatum.localeCompare(a.startdatum));
              if (pAnsökningar.length === 0) return null;
              const saldo = getSaldo(person, historikÅr);
              const isOpen = expanderad[person] !== false;

              return (
                <div key={person} style={{ marginBottom: 10 }}>
                  <button
                    onClick={() => setExpanderad(prev => ({ ...prev, [person]: !isOpen }))}
                    style={{
                      width: '100%', background: C.surface, border: `1px solid ${C.border}`,
                      borderRadius: isOpen ? '12px 12px 0 0' : 12,
                      padding: '14px 18px', cursor: 'pointer', textAlign: 'left',
                      fontFamily: ff,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: C.t1 }}>{person}</span>
                      <span style={{ fontSize: 14, color: C.t3, transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0)' }}>›</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: C.green, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: C.t3, flex: 1 }}>Semester: {saldo.semAnvända}/{saldo.semTotal} använda</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>{saldo.semKvar} kvar</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: C.blue, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: C.t3, flex: 1 }}>ATK: {saldo.atkAnvända}/{saldo.atkTotal} använda</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>{saldo.atkKvar} kvar</span>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div style={{
                      background: C.surface, border: `1px solid ${C.border}`, borderTop: 'none',
                      borderRadius: '0 0 12px 12px', overflow: 'hidden',
                    }}>
                      {pAnsökningar.map((a, i) => {
                        const ti = TYPINFO[a.typ] || TYPINFO.semester;
                        const si = STATUSINFO[a.status] || STATUSINFO['väntar'];
                        const d = dagMellan(a.startdatum, a.slutdatum);
                        return (
                          <div key={a.id}>
                            {i > 0 && <div style={{ height: 0.5, background: C.border, margin: '0 18px' }} />}
                            <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: 3, background: ti.color, display: 'inline-block' }} />
                                  <span style={{ fontSize: 13, fontWeight: 500, color: C.t1, fontFamily: ff }}>{ti.label}</span>
                                </div>
                                <span style={{ fontSize: 12, color: C.t3, fontFamily: ff }}>
                                  {fmtDate(a.startdatum)} – {fmtDate(a.slutdatum)} · {d} dag{d !== 1 ? 'ar' : ''}
                                </span>
                              </div>
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: '3px 8px',
                                borderRadius: 20, color: si.color, background: si.bg,
                              }}>
                                {si.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Maskinstopp */}
            {stoppAnsökningar.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ ...labelStyle, marginBottom: 12 }}>MASKINSTOPP {historikÅr}</div>
                <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                  {stoppAnsökningar.sort((a, b) => a.startdatum.localeCompare(b.startdatum)).map((a, i) => {
                    const ti = TYPINFO[a.typ] || TYPINFO.skordarstopp;
                    const d = dagMellan(a.startdatum, a.slutdatum);
                    return (
                      <div key={a.id}>
                        {i > 0 && <div style={{ height: 0.5, background: C.border, margin: '0 18px' }} />}
                        <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 18, height: 5, borderRadius: 2, background: ti.color, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: C.t1, fontFamily: ff }}>{ti.label}</span>
                            <span style={{ fontSize: 12, color: C.t3, fontFamily: ff, marginLeft: 8 }}>
                              {fmtDate(a.startdatum)} – {fmtDate(a.slutdatum)} · {d} dag{d !== 1 ? 'ar' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
          );
        })()}
      </div>
    </div>
  );
}
