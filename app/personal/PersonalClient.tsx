'use client';

import { useEffect, useMemo, useState } from 'react';

type Certifikat = {
  id: string;
  medarbetare_id: string;
  namn: string;
  utfardad_datum: string | null;
  utgar_datum: string | null;
  anteckning: string | null;
  aktiv: boolean;
};

type Person = {
  id: string;
  namn: string;
  roll: string | null;
  epost: string | null;
  telefon: string | null;
  hemadress: string | null;
  maskin_id: string | null;
  friskvard_budget_total: number | null;
  friskvard_budget_anvant: number | null;
  anhorig_namn: string | null;
  anhorig_telefon: string | null;
  anhorig_relation: string | null;
  certifikat: Certifikat[];
};

type Status = 'ok' | 'varning' | 'kritisk' | null;

const MÅN_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function dagarKvar(datum: string | null): number | null {
  if (!datum) return null;
  const idag = new Date(); idag.setHours(0, 0, 0, 0);
  const d = new Date(datum + 'T00:00:00');
  return Math.round((d.getTime() - idag.getTime()) / 86400000);
}
function fmtDatum(datum: string | null): string {
  if (!datum) return '—';
  const d = new Date(datum + 'T00:00:00');
  return `${d.getDate()} ${MÅN_KORT[d.getMonth()]} ${d.getFullYear()}`;
}
function statusFör(datum: string | null): Status {
  const d = dagarKvar(datum);
  if (d == null) return null;
  if (d < 7) return 'kritisk';
  if (d < 30) return 'varning';
  return 'ok';
}
function statusFärg(s: Status): string {
  if (s === 'kritisk') return '#ff453a';
  if (s === 'varning') return '#ff9f0a';
  if (s === 'ok') return '#34c759';
  return '#636366';
}
function fmtKr(n: number | null): string {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}

function värstaCertStatus(cert: Certifikat[]): Status {
  const statusar = cert.map(c => statusFör(c.utgar_datum)).filter(Boolean) as Status[];
  if (statusar.includes('kritisk')) return 'kritisk';
  if (statusar.includes('varning')) return 'varning';
  if (statusar.length) return 'ok';
  return null;
}

export default function PersonalClient({ kanRedigera }: { kanRedigera: boolean }) {
  const [personal, setPersonal] = useState<Person[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [utvikt, setUtvikt] = useState<string | null>(null);
  const [redigerar, setRedigerar] = useState<Person | null>(null);
  const [nyCertFör, setNyCertFör] = useState<Person | null>(null);

  async function hämta() {
    setLaddar(true); setFel(null);
    try {
      const r = await fetch('/api/personal', { cache: 'no-store' });
      const body = await r.json();
      if (!r.ok || !body.ok) { setFel(body.error || `HTTP ${r.status}`); setPersonal([]); }
      else setPersonal(body.personal || []);
    } catch (e: any) {
      setFel(e?.message || String(e));
    }
    setLaddar(false);
  }
  useEffect(() => { hämta(); }, []);

  const friskTotal = useMemo(() => {
    const total = personal.reduce((s, p) => s + (p.friskvard_budget_total || 0), 0);
    const använt = personal.reduce((s, p) => s + (p.friskvard_budget_anvant || 0), 0);
    return { total, använt };
  }, [personal]);

  const s = {
    page: { background: '#000', minHeight: '100vh', color: '#fff', fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased' as const, paddingBottom: 40 },
    header: { padding: '20px 16px 8px' },
    titel: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 },
    underrad: { fontSize: 13, color: 'rgba(235,235,245,0.6)', marginTop: 2 },
    friskCard: { margin: '16px', padding: 14, background: '#1c1c1e', borderRadius: 12 },
    sektionTitel: { fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: 'rgba(235,235,245,0.6)', textTransform: 'uppercase' as const, padding: '4px 16px 8px' },
    lista: { background: '#1c1c1e', borderRadius: 12, margin: '0 16px', overflow: 'hidden' as const },
    rad: { minHeight: 56, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', userSelect: 'none' as const, WebkitTapHighlightColor: 'transparent' as any },
    radHöger: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    namn: { fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: '#fff' },
    undertext: { fontSize: 13, color: 'rgba(235,235,245,0.6)', marginTop: 2 },
    prick: { width: 10, height: 10, borderRadius: '50%' as const, flexShrink: 0 },
    expand: { marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' },
    blockTitel: { fontSize: 12, fontWeight: 600, color: 'rgba(235,235,245,0.5)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
    detRad: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', fontSize: 14, borderBottom: '1px solid rgba(255,255,255,0.04)' },
    detLab: { color: 'rgba(235,235,245,0.8)' },
    detVal: { color: '#fff', textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const },
    tomTillstand: { textAlign: 'center' as const, padding: 40, color: 'rgba(235,235,245,0.5)', fontSize: 14 },
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.titel}>Personal</h1>
        <p style={s.underrad}>Friskvård, certifikat, kontaktinfo</p>
      </div>

      {friskTotal.total > 0 && (
        <div style={s.friskCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'rgba(235,235,245,0.6)', fontWeight: 500 }}>Friskvård totalt</span>
            <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' as const }}>
              {fmtKr(friskTotal.använt)} av {fmtKr(friskTotal.total)}
            </span>
          </div>
          <ProgressBar anvant={friskTotal.använt} total={friskTotal.total} />
        </div>
      )}

      <div style={s.sektionTitel}>Anställda</div>

      {laddar && <div style={s.tomTillstand}>Laddar…</div>}
      {!laddar && fel && <div style={{ ...s.tomTillstand, color: '#ff6b6b' }}>Fel: {fel}</div>}

      <div style={s.lista}>
        {personal.map((p, i) => {
          const friskStatus: Status = p.friskvard_budget_total && p.friskvard_budget_anvant != null
            ? (p.friskvard_budget_anvant / p.friskvard_budget_total >= 0.9 ? 'kritisk'
              : p.friskvard_budget_anvant / p.friskvard_budget_total >= 0.7 ? 'varning' : 'ok')
            : null;
          const certStatus = värstaCertStatus(p.certifikat);
          // Övergripande status: värsta av friskvård och cert
          const rank = (x: Status) => x === 'kritisk' ? 3 : x === 'varning' ? 2 : x === 'ok' ? 1 : 0;
          const värsta: Status = rank(friskStatus) >= rank(certStatus) ? friskStatus : certStatus;
          const harUtvikt = utvikt === p.id;

          return (
            <div
              key={p.id}
              style={{ ...s.rad, ...(i === 0 ? { borderTop: 'none' } : {}) }}
              onClick={() => setUtvikt(u => u === p.id ? null : p.id)}
            >
              <div style={s.radHöger}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={s.namn}>{p.namn}</div>
                  <div style={s.undertext}>
                    {[p.roll, p.maskin_id].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                {värsta && <div style={{ ...s.prick, background: statusFärg(värsta) }} />}
              </div>

              {harUtvikt && (
                <div style={s.expand} onClick={e => e.stopPropagation()}>
                  {/* Friskvård */}
                  <div style={s.blockTitel}>Friskvård</div>
                  {p.friskvard_budget_total ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
                        <span style={{ color: 'rgba(235,235,245,0.8)' }}>Använt</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' as const }}>
                          {fmtKr(p.friskvard_budget_anvant || 0)} / {fmtKr(p.friskvard_budget_total)}
                          <span style={{ color: 'rgba(235,235,245,0.5)', marginLeft: 6 }}>
                            (kvar {fmtKr(Math.max(0, (p.friskvard_budget_total || 0) - (p.friskvard_budget_anvant || 0)))})
                          </span>
                        </span>
                      </div>
                      <ProgressBar anvant={p.friskvard_budget_anvant || 0} total={p.friskvard_budget_total} />
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: 'rgba(235,235,245,0.5)', paddingBottom: 6 }}>Ingen budget satt</div>
                  )}

                  {/* Certifikat */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={s.blockTitel}>Certifikat</div>
                    {kanRedigera && (
                      <button
                        onClick={() => setNyCertFör(p)}
                        style={{ background: 'none', border: 'none', color: '#0a84ff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>
                        + Lägg till
                      </button>
                    )}
                  </div>
                  {p.certifikat.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(235,235,245,0.5)', paddingBottom: 6 }}>Inga certifikat registrerade</div>
                  ) : (
                    p.certifikat.map(c => {
                      const st = statusFör(c.utgar_datum);
                      const d = dagarKvar(c.utgar_datum);
                      return (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', fontSize: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: '#fff' }}>{c.namn}</div>
                            {c.anteckning && (
                              <div style={{ fontSize: 12, color: 'rgba(235,235,245,0.5)', marginTop: 2 }}>{c.anteckning}</div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' as const, display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
                            <div>
                              <div style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' as const }}>{fmtDatum(c.utgar_datum)}</div>
                              {d != null && (
                                <div style={{ fontSize: 12, color: st === 'kritisk' ? '#ff453a' : st === 'varning' ? '#ff9f0a' : 'rgba(235,235,245,0.5)', marginTop: 1 }}>
                                  {d < 0 ? `${Math.abs(d)} dagar sen` : d === 0 ? 'idag' : `om ${d} dagar`}
                                </div>
                              )}
                            </div>
                            {st && <div style={{ width: 8, height: 8, borderRadius: 4, background: statusFärg(st), marginTop: 6 }} />}
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Kontaktinfo */}
                  <div style={s.blockTitel}>Kontakt</div>
                  <div style={s.detRad}><span style={s.detLab}>Telefon</span><span style={s.detVal}>{p.telefon || '—'}</span></div>
                  <div style={s.detRad}><span style={s.detLab}>E-post</span><span style={{ ...s.detVal, fontSize: 13 }}>{p.epost || '—'}</span></div>
                  {p.hemadress && (
                    <div style={s.detRad}><span style={s.detLab}>Adress</span><span style={{ ...s.detVal, fontSize: 13 }}>{p.hemadress}</span></div>
                  )}

                  {/* Anhörig */}
                  <div style={s.blockTitel}>Anhörig</div>
                  {p.anhorig_namn || p.anhorig_telefon ? (
                    <>
                      <div style={s.detRad}><span style={s.detLab}>Namn</span><span style={s.detVal}>{p.anhorig_namn || '—'}{p.anhorig_relation ? ` (${p.anhorig_relation})` : ''}</span></div>
                      <div style={s.detRad}><span style={s.detLab}>Telefon</span><span style={s.detVal}>{p.anhorig_telefon || '—'}</span></div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: 'rgba(235,235,245,0.5)', paddingBottom: 6 }}>Ingen anhörig registrerad</div>
                  )}

                  {kanRedigera && (
                    <div style={{ marginTop: 14 }}>
                      <button
                        onClick={() => setRedigerar(p)}
                        style={{ width: '100%', minHeight: 44, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Redigera friskvård & anhörig
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {redigerar && (
        <PersonForm person={redigerar} onStäng={() => setRedigerar(null)} onSparad={() => { setRedigerar(null); hämta(); }}/>
      )}
      {nyCertFör && (
        <CertForm person={nyCertFör} onStäng={() => setNyCertFör(null)} onSparad={() => { setNyCertFör(null); hämta(); }}/>
      )}
    </div>
  );
}

function ProgressBar({ anvant, total }: { anvant: number; total: number }) {
  const procent = total > 0 ? Math.min(100, Math.round((anvant / total) * 100)) : 0;
  const färg = procent >= 90 ? '#ff453a' : procent >= 70 ? '#ff9f0a' : '#34c759';
  return (
    <div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${procent}%`, height: '100%', background: färg, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ fontSize: 11, color: 'rgba(235,235,245,0.5)', marginTop: 4, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }}>{procent}%</div>
    </div>
  );
}

/* ── Person-form: friskvård + anhörig + kontakt ──────────────────────── */

function PersonForm({ person, onStäng, onSparad }: { person: Person; onStäng: () => void; onSparad: () => void }) {
  const [budget, setBudget] = useState(person.friskvard_budget_total?.toString() || '');
  const [använt, setAnvänt] = useState(person.friskvard_budget_anvant?.toString() || '');
  const [telefon, setTelefon] = useState(person.telefon || '');
  const [hemadress, setHemadress] = useState(person.hemadress || '');
  const [anhNamn, setAnhNamn] = useState(person.anhorig_namn || '');
  const [anhTel, setAnhTel] = useState(person.anhorig_telefon || '');
  const [anhRel, setAnhRel] = useState(person.anhorig_relation || '');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  async function spara() {
    setSparar(true); setFel(null);
    const payload: any = {
      friskvard_budget_total: budget ? parseFloat(budget) : null,
      friskvard_budget_anvant: använt ? parseFloat(använt) : 0,
      telefon: telefon.trim() || null,
      hemadress: hemadress.trim() || null,
      anhorig_namn: anhNamn.trim() || null,
      anhorig_telefon: anhTel.trim() || null,
      anhorig_relation: anhRel.trim() || null,
    };
    const r = await fetch(`/api/personal/${person.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await r.json();
    if (!r.ok || !body.ok) { setFel(body.error || `HTTP ${r.status}`); setSparar(false); return; }
    onSparad();
  }

  return <BottomSheet titel={`Redigera ${person.namn}`} onStäng={onStäng}>
    <SektionTitel text="Friskvård" />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <InputFält label="Budget totalt" type="number" value={budget} onChange={setBudget}/>
      <InputFält label="Hittills använt" type="number" value={använt} onChange={setAnvänt}/>
    </div>
    <SektionTitel text="Kontakt" />
    <InputFält label="Telefon" type="tel" value={telefon} onChange={setTelefon}/>
    <InputFält label="Hemadress" value={hemadress} onChange={setHemadress}/>
    <SektionTitel text="Anhörig" />
    <InputFält label="Namn" value={anhNamn} onChange={setAnhNamn}/>
    <InputFält label="Telefon" type="tel" value={anhTel} onChange={setAnhTel}/>
    <InputFält label="Relation (make/fru/partner)" value={anhRel} onChange={setAnhRel}/>
    {fel && <div style={{ padding: 10, background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13, marginTop: 12 }}>{fel}</div>}
    <Knappar onAvbryt={onStäng} onSpara={spara} sparar={sparar}/>
  </BottomSheet>;
}

function CertForm({ person, onStäng, onSparad }: { person: Person; onStäng: () => void; onSparad: () => void }) {
  const [namn, setNamn] = useState('');
  const [utfardad, setUtfardad] = useState('');
  const [utgar, setUtgar] = useState('');
  const [anteckning, setAnteckning] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  async function spara() {
    setSparar(true); setFel(null);
    const payload = {
      namn: namn.trim(),
      utfardad_datum: utfardad || null,
      utgar_datum: utgar || null,
      anteckning: anteckning.trim() || null,
    };
    const r = await fetch(`/api/personal/${person.id}/certifikat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await r.json();
    if (!r.ok || !body.ok) { setFel(body.error || `HTTP ${r.status}`); setSparar(false); return; }
    onSparad();
  }

  return <BottomSheet titel={`Nytt certifikat — ${person.namn}`} onStäng={onStäng}>
    <InputFält label="Namn" value={namn} onChange={setNamn} placeholder="t.ex. Körkort BE, ADR, HLR"/>
    <InputFält label="Utfärdad" type="date" value={utfardad} onChange={setUtfardad}/>
    <InputFält label="Utgår" type="date" value={utgar} onChange={setUtgar}/>
    <InputFält label="Anteckning" value={anteckning} onChange={setAnteckning} textarea/>
    {fel && <div style={{ padding: 10, background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13, marginTop: 12 }}>{fel}</div>}
    <Knappar onAvbryt={onStäng} onSpara={spara} sparar={sparar} disabled={!namn.trim()}/>
  </BottomSheet>;
}

/* ── Delad bottom-sheet + inputs ─────────────────────────────────────── */

function BottomSheet({ titel, onStäng, children }: { titel: string; onStäng: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onStäng} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, background: '#1c1c1e', borderRadius: '16px 16px 0 0', padding: '12px 20px 28px', maxHeight: '92vh', overflowY: 'auto', color: '#fff', fontFamily: "-apple-system,BlinkMacSystemFont,system-ui,sans-serif" }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.2)', margin: '0 auto 16px' }} />
        <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700 }}>{titel}</h2>
        {children}
      </div>
    </div>
  );
}

function SektionTitel({ text }: { text: string }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(235,235,245,0.5)', textTransform: 'uppercase' as const, letterSpacing: 0.5, margin: '14px 0 8px' }}>{text}</div>;
}

function InputFält({ label, value, onChange, type = 'text', placeholder, textarea }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; textarea?: boolean;
}) {
  const inp = {
    width: '100%', minHeight: 44, padding: '10px 12px',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, color: '#fff', fontSize: 16, fontFamily: 'inherit',
    boxSizing: 'border-box' as const, outline: 'none',
    ...(textarea ? { minHeight: 80, resize: 'vertical' as const } : {}),
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'rgba(235,235,245,0.5)', marginBottom: 4, fontWeight: 500 }}>{label}</div>
      {textarea
        ? <textarea style={inp as any} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/>
        : <input style={inp as any} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/>
      }
    </div>
  );
}

function Knappar({ onAvbryt, onSpara, sparar, disabled }: { onAvbryt: () => void; onSpara: () => void; sparar: boolean; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
      <button onClick={onAvbryt}
        style={{ flex: 1, minHeight: 48, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
        Avbryt
      </button>
      <button onClick={onSpara} disabled={sparar || disabled}
        style={{ flex: 2, minHeight: 48, background: '#0a84ff', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: sparar || disabled ? 0.35 : 1 }}>
        {sparar ? 'Sparar…' : 'Spara'}
      </button>
    </div>
  );
}
