'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// === TYPER ===
interface Ansökan {
  id: string;
  anvandare_id: string;
  typ: 'semester' | 'atk' | 'stillestand';
  startdatum: string;
  slutdatum: string;
  status: 'väntar' | 'godkänd' | 'nekad';
  kommentar: string | null;
  skapad_av: string | null;
  skapad_at: string;
}

// === KONSTANTER ===
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif";

const C = {
  bg: '#070708',
  surface: '#0f0f10',
  surface2: '#151517',
  surface3: '#1a1a1c',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.13)',
  t1: '#f5f5f7',
  t2: '#a1a1a6',
  t3: '#6e6e73',
  green: '#22c55e',
  greenDim: 'rgba(34,197,94,0.12)',
  red: '#ef4444',
  redDim: 'rgba(239,68,68,0.12)',
  yellow: '#eab308',
  yellowDim: 'rgba(234,179,8,0.12)',
  blue: '#3b82f6',
  blueDim: 'rgba(59,130,246,0.12)',
  gray: '#6e6e73',
  grayDim: 'rgba(110,110,115,0.12)',
};

const TYPINFO: Record<string, { label: string; color: string; bg: string }> = {
  semester: { label: 'Semester', color: C.green, bg: C.greenDim },
  atk: { label: 'ATK', color: C.blue, bg: C.blueDim },
  stillestand: { label: 'Stillestånd', color: C.gray, bg: C.grayDim },
};

const STATUSINFO: Record<string, { label: string; color: string; bg: string }> = {
  'väntar': { label: 'Väntar', color: C.yellow, bg: C.yellowDim },
  'godkänd': { label: 'Godkänd', color: C.green, bg: C.greenDim },
  'nekad': { label: 'Nekad', color: C.red, bg: C.redDim },
};

const ANSTÄLLDA = [
  'Martin', 'Oskar', 'Stefan', 'Peter', 'Erik', 'Jonas',
];

const VECKONAMN = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const MÅNADNAMN = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
];

// === HJÄLPFUNKTIONER ===
function fmtDate(d: string) {
  const p = d.split('-');
  return `${p[2]}/${p[1]}`;
}

function toISO(d: Date) {
  return d.toISOString().split('T')[0];
}

function dagMellan(start: string, slut: string): number {
  const s = new Date(start);
  const e = new Date(slut);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function inRange(day: Date, start: string, slut: string) {
  const d = toISO(day);
  return d >= start && d <= slut;
}

// === BADGE-KOMPONENT ===
function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 8px',
      borderRadius: 6, color, background: bg, letterSpacing: '0.02em',
    }}>{text}</span>
  );
}

// === KALENDER-KOMPONENT ===
function Kalender({
  år, månad, onÄndraMånad, valdStart, valdSlut, onVäljDag, ansökningar,
}: {
  år: number; månad: number; onÄndraMånad: (delta: number) => void;
  valdStart: string | null; valdSlut: string | null;
  onVäljDag: (d: string) => void; ansökningar: Ansökan[];
}) {
  const förstaVeckodag = (new Date(år, månad, 1).getDay() + 6) % 7; // mån=0
  const antalDagar = new Date(år, månad + 1, 0).getDate();
  const celler: (number | null)[] = [];
  for (let i = 0; i < förstaVeckodag; i++) celler.push(null);
  for (let d = 1; d <= antalDagar; d++) celler.push(d);

  // Skapa map av dag → ansökningstyper för snabb lookup
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

  return (
    <div>
      {/* Månadsnavigering */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => onÄndraMånad(-1)} style={navBtnStyle}>◂</button>
        <span style={{ fontSize: 16, fontWeight: 600, color: C.t1 }}>
          {MÅNADNAMN[månad]} {år}
        </span>
        <button onClick={() => onÄndraMånad(1)} style={navBtnStyle}>▸</button>
      </div>

      {/* Veckodag-header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {VECKONAMN.map(v => (
          <div key={v} style={{ textAlign: 'center', fontSize: 11, color: C.t3, fontWeight: 500, padding: '4px 0' }}>
            {v}
          </div>
        ))}
      </div>

      {/* Dagceller */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {celler.map((dag, i) => {
          if (dag === null) return <div key={`e${i}`} />;

          const iso = toISO(new Date(år, månad, dag));
          const isVald = (valdStart && valdSlut && iso >= valdStart && iso <= valdSlut)
            || (valdStart && !valdSlut && iso === valdStart);
          const isStart = iso === valdStart;
          const isSlut = iso === valdSlut;
          const isIdag = dag === idagDag;
          const markningar = dagMap[dag] || [];
          const harGodkänd = markningar.some(m => m.status === 'godkänd');
          const harVäntar = markningar.some(m => m.status === 'väntar');
          const harStillestånd = markningar.some(m => m.typ === 'stillestand' && m.status === 'godkänd');

          let bgColor = 'transparent';
          let borderColor = 'transparent';
          if (isVald) { bgColor = 'rgba(59,130,246,0.25)'; borderColor = C.blue; }
          else if (harStillestånd) bgColor = 'rgba(110,110,115,0.15)';
          else if (harGodkänd) bgColor = 'rgba(34,197,94,0.12)';
          else if (harVäntar) bgColor = 'rgba(234,179,8,0.08)';

          return (
            <button
              key={dag}
              onClick={() => onVäljDag(iso)}
              style={{
                background: bgColor,
                border: `1.5px solid ${borderColor}`,
                borderRadius: 8,
                padding: '6px 0',
                minHeight: 38,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative',
                fontFamily: ff,
              }}
            >
              <span style={{
                fontSize: 13, fontWeight: isIdag ? 700 : 400,
                color: isVald ? C.t1 : isIdag ? C.blue : C.t2,
              }}>{dag}</span>
              {/* Prickar för markerade dagar */}
              {markningar.length > 0 && !isVald && (
                <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                  {markningar.slice(0, 3).map((m, mi) => (
                    <div key={mi} style={{
                      width: 4, height: 4, borderRadius: 2,
                      background: m.typ === 'stillestand' ? C.gray
                        : m.status === 'godkänd' ? C.green
                          : m.status === 'nekad' ? C.red : C.yellow,
                    }} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  width: 36, height: 36,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: C.t2, fontSize: 16, fontFamily: ff,
};

// === HUVUDKOMPONENT ===
export default function LedighetPage() {
  const [vy, setVy] = useState<'anställd' | 'chef'>('anställd');
  const [valdAnvändare, setValdAnvändare] = useState(ANSTÄLLDA[0]);
  const [ansökningar, setAnsökningar] = useState<Ansökan[]>([]);
  const [loading, setLoading] = useState(true);

  // Kalenderstate
  const nu = new Date();
  const [år, setÅr] = useState(nu.getFullYear());
  const [månad, setMånad] = useState(nu.getMonth());
  const [valdStart, setValdStart] = useState<string | null>(null);
  const [valdSlut, setValdSlut] = useState<string | null>(null);

  // Ansökningsmodal
  const [showModal, setShowModal] = useState(false);
  const [modalTyp, setModalTyp] = useState<'semester' | 'atk' | 'stillestand'>('semester');
  const [modalKommentar, setModalKommentar] = useState('');
  const [modalAnvändare, setModalAnvändare] = useState(''); // för stillestånd
  const [sparar, setSparar] = useState(false);

  // Chef: stillestånd-modal
  const [showStillestånd, setShowStillestånd] = useState(false);
  const [stillKommentar, setStillKommentar] = useState('');

  const hämtaAnsökningar = async () => {
    const { data } = await supabase
      .from('ledighet_ansokningar')
      .select('*')
      .order('startdatum', { ascending: false });
    if (data) setAnsökningar(data);
    setLoading(false);
  };

  useEffect(() => { hämtaAnsökningar(); }, []);

  const ändraMånad = (delta: number) => {
    let ny = månad + delta;
    let å = år;
    if (ny < 0) { ny = 11; å--; }
    if (ny > 11) { ny = 0; å++; }
    setMånad(ny);
    setÅr(å);
  };

  const väljDag = (iso: string) => {
    if (!valdStart || valdSlut) {
      setValdStart(iso);
      setValdSlut(null);
    } else {
      if (iso < valdStart) {
        setValdStart(iso);
        setValdSlut(valdStart);
      } else {
        setValdSlut(iso);
      }
    }
  };

  const skickaAnsökan = async (typ: 'semester' | 'atk') => {
    if (!valdStart) return;
    setSparar(true);
    const slut = valdSlut || valdStart;
    await supabase.from('ledighet_ansokningar').insert({
      anvandare_id: valdAnvändare,
      typ,
      startdatum: valdStart,
      slutdatum: slut,
      status: 'väntar',
      kommentar: modalKommentar || null,
      skapad_av: valdAnvändare,
    });
    setShowModal(false);
    setModalKommentar('');
    setValdStart(null);
    setValdSlut(null);
    setSparar(false);
    hämtaAnsökningar();
  };

  const skickaStillestånd = async () => {
    if (!valdStart) return;
    setSparar(true);
    const slut = valdSlut || valdStart;
    await supabase.from('ledighet_ansokningar').insert({
      anvandare_id: 'alla',
      typ: 'stillestand',
      startdatum: valdStart,
      slutdatum: slut,
      status: 'godkänd',
      kommentar: stillKommentar || null,
      skapad_av: 'Chef',
    });
    setShowStillestånd(false);
    setStillKommentar('');
    setValdStart(null);
    setValdSlut(null);
    setSparar(false);
    hämtaAnsökningar();
  };

  const hanteraAnsökan = async (id: string, nystatus: 'godkänd' | 'nekad') => {
    await supabase.from('ledighet_ansokningar')
      .update({ status: nystatus })
      .eq('id', id);
    hämtaAnsökningar();
  };

  const taBortAnsökan = async (id: string) => {
    await supabase.from('ledighet_ansokningar').delete().eq('id', id);
    hämtaAnsökningar();
  };

  // Filtrera ansökningar beroende på vy
  const minaAnsökningar = ansökningar.filter(a => a.anvandare_id === valdAnvändare);
  const väntandeAntal = ansökningar.filter(a => a.status === 'väntar').length;

  // Kalenderns ansökningar — visa alla godkända + egna väntande
  const kalenderAnsökningar = useMemo(() => {
    if (vy === 'chef') return ansökningar.filter(a => a.status !== 'nekad');
    return ansökningar.filter(a =>
      (a.anvandare_id === valdAnvändare) ||
      (a.typ === 'stillestand' && a.status === 'godkänd')
    );
  }, [vy, ansökningar, valdAnvändare]);

  const valdDagar = valdStart
    ? dagMellan(valdStart, valdSlut || valdStart)
    : 0;

  return (
    <div style={{
      height: 'calc(100vh - 56px)', width: '100vw', fontFamily: ff,
      background: C.bg, color: C.t1, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      WebkitFontSmoothing: 'antialiased',
    }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        *::-webkit-scrollbar{width:0}
      `}</style>

      {/* === TAB-BAR === */}
      <div style={{
        display: 'flex', gap: 0, background: C.surface,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        {(['anställd', 'chef'] as const).map(tab => {
          const active = vy === tab;
          return (
            <button key={tab} onClick={() => setVy(tab)} style={{
              flex: 1, padding: '14px 0', background: active ? C.surface3 : 'transparent',
              border: 'none', borderBottom: active ? `2px solid ${C.t1}` : '2px solid transparent',
              color: active ? C.t1 : C.t3, fontSize: 13, fontWeight: 600,
              fontFamily: ff, cursor: 'pointer', letterSpacing: '0.02em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              {tab === 'anställd' ? '👤 Min ledighet' : '👔 Hantera'}
              {tab === 'chef' && väntandeAntal > 0 && (
                <span style={{
                  background: C.yellow, color: '#000', fontSize: 10, fontWeight: 700,
                  borderRadius: 10, minWidth: 18, height: 18, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                }}>{väntandeAntal}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* === INNEHÅLL === */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 100px' }}>

        {/* Anställdväljare (anställdvy) */}
        {vy === 'anställd' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.t3, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              Välj person
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ANSTÄLLDA.map(n => (
                <button key={n} onClick={() => setValdAnvändare(n)} style={{
                  padding: '6px 14px', borderRadius: 8,
                  background: valdAnvändare === n ? 'rgba(59,130,246,0.2)' : C.surface3,
                  border: `1px solid ${valdAnvändare === n ? C.blue : C.border}`,
                  color: valdAnvändare === n ? C.t1 : C.t2,
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: ff,
                }}>{n}</button>
              ))}
            </div>
          </div>
        )}

        {/* === KALENDER === */}
        <div style={{
          background: `linear-gradient(to bottom, ${C.surface3}, ${C.surface})`,
          border: `1px solid ${C.border}`, borderRadius: 16, padding: 16,
          marginBottom: 16,
        }}>
          <Kalender
            år={år} månad={månad} onÄndraMånad={ändraMånad}
            valdStart={valdStart} valdSlut={valdSlut}
            onVäljDag={väljDag}
            ansökningar={kalenderAnsökningar}
          />

          {/* Valt intervall info + knappar */}
          {valdStart && (
            <div style={{
              marginTop: 16, padding: '12px 16px', borderRadius: 12,
              background: 'rgba(59,130,246,0.08)', border: `1px solid rgba(59,130,246,0.2)`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              animation: 'fadeUp 0.2s ease',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>
                  {fmtDate(valdStart)}{valdSlut && valdSlut !== valdStart ? ` → ${fmtDate(valdSlut)}` : ''}
                </div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                  {valdDagar} dag{valdDagar !== 1 ? 'ar' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {vy === 'anställd' ? (
                  <>
                    <button onClick={() => { setModalTyp('semester'); setShowModal(true); }} style={actionBtnStyle(C.green)}>
                      Semester
                    </button>
                    <button onClick={() => { setModalTyp('atk'); setShowModal(true); }} style={actionBtnStyle(C.blue)}>
                      ATK
                    </button>
                  </>
                ) : (
                  <button onClick={() => setShowStillestånd(true)} style={actionBtnStyle(C.gray)}>
                    Stillestånd
                  </button>
                )}
                <button onClick={() => { setValdStart(null); setValdSlut(null); }} style={{
                  background: 'none', border: 'none', color: C.t3, fontSize: 18,
                  cursor: 'pointer', padding: '0 4px', fontFamily: ff,
                }}>✕</button>
              </div>
            </div>
          )}
        </div>

        {/* === ANSTÄLLDVY: MINA ANSÖKNINGAR === */}
        {vy === 'anställd' && (
          <div>
            <SectionHeader text="Mina ansökningar" />
            {loading ? (
              <div style={{ color: C.t3, padding: 20, textAlign: 'center' }}>Laddar...</div>
            ) : minaAnsökningar.length === 0 ? (
              <div style={{ color: C.t3, padding: 20, textAlign: 'center', fontSize: 13 }}>
                Inga ansökningar ännu
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {minaAnsökningar.map(a => (
                  <AnsökningsKort key={a.id} a={a} showNamn={false} onTaBort={() => taBortAnsökan(a.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* === CHEFVY: VÄNTANDE ANSÖKNINGAR === */}
        {vy === 'chef' && (
          <div>
            {/* Väntande */}
            <SectionHeader text={`Väntande ansökningar (${väntandeAntal})`} />
            {ansökningar.filter(a => a.status === 'väntar').length === 0 ? (
              <div style={{ color: C.t3, padding: 20, textAlign: 'center', fontSize: 13 }}>
                Inga väntande ansökningar
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                {ansökningar.filter(a => a.status === 'väntar').map(a => (
                  <AnsökningsKort key={a.id} a={a} showNamn onHantera={hanteraAnsökan} />
                ))}
              </div>
            )}

            {/* Alla hanterade */}
            <SectionHeader text="Hanterade" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ansökningar.filter(a => a.status !== 'väntar').map(a => (
                <AnsökningsKort key={a.id} a={a} showNamn onTaBort={() => taBortAnsökan(a.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Teckenförklaring */}
        <div style={{ marginTop: 24, padding: 16, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.t3, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
            Teckenförklaring
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {[
              { label: 'Semester', color: C.green },
              { label: 'ATK', color: C.blue },
              { label: 'Stillestånd', color: C.gray },
              { label: 'Väntar', color: C.yellow },
              { label: 'Nekad', color: C.red },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
                <span style={{ fontSize: 12, color: C.t2 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* === MODAL: Bekräfta ansökan === */}
      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.t1, marginBottom: 16 }}>
            {modalTyp === 'semester' ? '🌴 Ansök semester' : '⏰ Ta ut ATK'}
          </div>
          <div style={{ fontSize: 13, color: C.t2, marginBottom: 4 }}>
            {valdAnvändare} • {fmtDate(valdStart!)}{valdSlut ? ` → ${fmtDate(valdSlut)}` : ''} • {valdDagar} dag{valdDagar !== 1 ? 'ar' : ''}
          </div>
          <textarea
            placeholder="Kommentar (valfritt)"
            value={modalKommentar}
            onChange={e => setModalKommentar(e.target.value)}
            style={textareaStyle}
            rows={2}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={() => setShowModal(false)} style={cancelBtnStyle}>Avbryt</button>
            <button
              onClick={() => skickaAnsökan(modalTyp)}
              disabled={sparar}
              style={{
                ...confirmBtnStyle,
                background: modalTyp === 'semester' ? C.green : C.blue,
                opacity: sparar ? 0.6 : 1,
              }}
            >
              {sparar ? 'Skickar...' : 'Skicka ansökan'}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* === MODAL: Stillestånd === */}
      {showStillestånd && (
        <ModalOverlay onClose={() => setShowStillestånd(false)}>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.t1, marginBottom: 16 }}>
            🏭 Lägg in stillestånd
          </div>
          <div style={{ fontSize: 13, color: C.t2, marginBottom: 4 }}>
            Hela företaget • {fmtDate(valdStart!)}{valdSlut ? ` → ${fmtDate(valdSlut)}` : ''} • {valdDagar} dag{valdDagar !== 1 ? 'ar' : ''}
          </div>
          <textarea
            placeholder="Anledning (valfritt)"
            value={stillKommentar}
            onChange={e => setStillKommentar(e.target.value)}
            style={textareaStyle}
            rows={2}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={() => setShowStillestånd(false)} style={cancelBtnStyle}>Avbryt</button>
            <button
              onClick={skickaStillestånd}
              disabled={sparar}
              style={{ ...confirmBtnStyle, background: C.gray, opacity: sparar ? 0.6 : 1 }}
            >
              {sparar ? 'Sparar...' : 'Lägg in stillestånd'}
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// === DELKOMPONENTER ===

function SectionHeader({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: C.t3, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10,
    }}>
      {text}
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

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
      background: `linear-gradient(to bottom, ${C.surface3}, ${C.surface})`,
      border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px',
      animation: 'fadeUp 0.25s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showNamn && (
            <span style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>{a.anvandare_id}</span>
          )}
          <Badge text={ti.label} color={ti.color} bg={ti.bg} />
          <Badge text={si.label} color={si.color} bg={si.bg} />
        </div>
        {onTaBort && a.status !== 'väntar' && (
          <button onClick={onTaBort} style={{
            background: 'none', border: 'none', color: C.t3, cursor: 'pointer',
            fontSize: 14, padding: '2px 6px', fontFamily: ff,
          }}>✕</button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 13, color: C.t2 }}>
          {fmtDate(a.startdatum)} → {fmtDate(a.slutdatum)}
        </div>
        <div style={{ fontSize: 12, color: C.t3 }}>
          {dagar} dag{dagar !== 1 ? 'ar' : ''}
        </div>
      </div>
      {a.kommentar && (
        <div style={{ fontSize: 12, color: C.t3, marginTop: 6, fontStyle: 'italic' }}>
          "{a.kommentar}"
        </div>
      )}
      {/* Chef: godkänn/neka knappar */}
      {onHantera && a.status === 'väntar' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={() => onHantera(a.id, 'godkänd')}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
              background: C.green, color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: ff,
            }}
          >
            ✓ Godkänn
          </button>
          <button
            onClick={() => onHantera(a.id, 'nekad')}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
              background: C.red, color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: ff,
            }}
          >
            ✕ Neka
          </button>
        </div>
      )}
    </div>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surface3, borderRadius: '20px 20px 0 0',
          padding: '24px 20px max(20px, env(safe-area-inset-bottom))',
          width: '100%', maxWidth: 480,
          border: `1px solid ${C.borderStrong}`, borderBottom: 'none',
          animation: 'fadeUp 0.25s ease',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// === STYLES ===

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    padding: '8px 16px', borderRadius: 10, border: 'none',
    background: color, color: '#fff', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: ff, whiteSpace: 'nowrap',
  };
}

const textareaStyle: React.CSSProperties = {
  width: '100%', marginTop: 12, padding: '10px 12px', borderRadius: 10,
  background: C.surface, border: `1px solid ${C.border}`,
  color: C.t1, fontSize: 13, fontFamily: ff, resize: 'none',
  outline: 'none',
};

const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: '12px 0', borderRadius: 10,
  background: C.surface, border: `1px solid ${C.border}`,
  color: C.t2, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: ff,
};

const confirmBtnStyle: React.CSSProperties = {
  flex: 2, padding: '12px 0', borderRadius: 10, border: 'none',
  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: ff,
};
