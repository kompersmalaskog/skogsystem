'use client';

import { useEffect, useMemo, useState } from 'react';

type Kategori = 'telefon' | 'friskvard' | 'forsakring' | 'leasing' | 'programvara' | 'ovrigt';

type Avtal = {
  id: string;
  namn: string;
  kategori: Kategori;
  leverantor: string | null;
  kopplad_till: string | null;
  start_datum: string | null;
  slut_datum: string | null;
  belopp_per_manad: number | null;
  belopp_per_ar: number | null;
  budget_total: number | null;
  budget_anvant: number | null;
  anteckning: string | null;
};

const KATEGORI_LABEL: Record<Kategori, string> = {
  telefon: 'Telefon',
  friskvard: 'Företagshälsovård',
  forsakring: 'Försäkring',
  leasing: 'Leasing & finansiering',
  programvara: 'Programvara',
  ovrigt: 'Övrigt',
};

const KATEGORI_ORDNING: Kategori[] = ['telefon', 'friskvard', 'forsakring', 'leasing', 'programvara', 'ovrigt'];

const MÅN_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

type Status = 'ok' | 'varning' | 'kritisk' | null;

function dagarKvar(datum: string | null): number | null {
  if (!datum) return null;
  const idag = new Date(); idag.setHours(0, 0, 0, 0);
  const d = new Date(datum + 'T00:00:00');
  return Math.round((d.getTime() - idag.getTime()) / 86400000);
}

function fmtDatum(datum: string | null): string {
  if (!datum) return '—';
  const d = new Date(datum + 'T00:00:00');
  return `${d.getDate()} ${MÅN_KORT[d.getMonth()]}`;
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

function fmtKr(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}

export default function AvtalClient({ kanRedigera }: { kanRedigera: boolean }) {
  const [avtal, setAvtal] = useState<Avtal[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [utvikt, setUtvikt] = useState<string | null>(null);
  const [visarForm, setVisarForm] = useState(false);
  const [redigerar, setRedigerar] = useState<Avtal | null>(null);

  async function hämta() {
    setLaddar(true); setFel(null);
    try {
      const r = await fetch('/api/avtal', { cache: 'no-store' });
      const body = await r.json();
      if (!r.ok || !body.ok) { setFel(body.error || `HTTP ${r.status}`); setAvtal([]); }
      else setAvtal(body.avtal || []);
    } catch (e: any) {
      setFel(e?.message || String(e));
    }
    setLaddar(false);
  }
  useEffect(() => { hämta(); }, []);

  const statistik = useMemo(() => {
    let utgatt = 0, snart = 0, ok = 0;
    for (const a of avtal) {
      const s = statusFör(a.slut_datum);
      if (s == null) continue;
      if (s === 'kritisk') { const d = dagarKvar(a.slut_datum)!; if (d < 0) utgatt++; else snart++; }
      else if (s === 'varning') snart++;
      else if (s === 'ok') ok++;
    }
    return { utgatt, snart, ok };
  }, [avtal]);

  const friskvardSum = useMemo(() => {
    const rader = avtal.filter(a => a.kategori === 'friskvard');
    const total = rader.reduce((s, r) => s + (r.budget_total || 0), 0);
    const använt = rader.reduce((s, r) => s + (r.budget_anvant || 0), 0);
    return { total, använt, rader: rader.length };
  }, [avtal]);

  const perKategori = useMemo(() => {
    const m: Record<string, Avtal[]> = {};
    for (const a of avtal) {
      if (!m[a.kategori]) m[a.kategori] = [];
      m[a.kategori].push(a);
    }
    for (const lista of Object.values(m)) {
      lista.sort((a, b) => {
        const sA = statusFör(a.slut_datum);
        const sB = statusFör(b.slut_datum);
        const rank = (s: Status) => s === 'kritisk' ? 0 : s === 'varning' ? 1 : s === 'ok' ? 2 : 3;
        const diff = rank(sA) - rank(sB);
        if (diff) return diff;
        const dA = dagarKvar(a.slut_datum) ?? 9999;
        const dB = dagarKvar(b.slut_datum) ?? 9999;
        return dA - dB;
      });
    }
    return m;
  }, [avtal]);

  const s = {
    page: { background: '#000', minHeight: '100vh', color: '#fff', fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased' as const, paddingBottom: 40 },
    header: { padding: '20px 16px 8px' },
    titel: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 },
    underrad: { fontSize: 13, color: 'rgba(235,235,245,0.6)', marginTop: 2 },
    summaryCard: { margin: '16px 16px 8px', padding: 16, background: '#1c1c1e', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 6 },
    summaryItem: { textAlign: 'center' as const, flex: 1 },
    summaryVal: { fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 },
    summaryLabel: { fontSize: 11, color: 'rgba(235,235,245,0.6)', marginTop: 4, fontWeight: 500 },
    summaryDivider: { width: 1, height: 36, background: 'rgba(255,255,255,0.08)' },
    friskCard: { margin: '0 16px 8px', padding: 14, background: '#1c1c1e', borderRadius: 12 },
    sektionTitel: { fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: 'rgba(235,235,245,0.6)', textTransform: 'uppercase' as const, padding: '20px 16px 8px' },
    lista: { background: '#1c1c1e', borderRadius: 12, margin: '0 16px', overflow: 'hidden' as const },
    rad: { minHeight: 56, padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', userSelect: 'none' as const, WebkitTapHighlightColor: 'transparent' as any },
    radHöger: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    namn: { fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: '#fff' },
    underradLita: { fontSize: 13, color: 'rgba(235,235,245,0.6)', marginTop: 2 },
    beloppHöger: { fontSize: 15, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums' as const },
    prick: { width: 10, height: 10, borderRadius: '50%' as const, flexShrink: 0 },
    expand: { marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' },
    expandRad: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', fontSize: 15, borderBottom: '1px solid rgba(255,255,255,0.04)' },
    expandLabel: { color: 'rgba(235,235,245,0.8)' },
    expandVärde: { color: '#fff', fontVariantNumeric: 'tabular-nums' as const, textAlign: 'right' as const },
    addKnapp: { position: 'fixed' as const, right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, background: '#0a84ff', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', boxShadow: '0 4px 16px rgba(10,132,255,0.4)', lineHeight: 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' as const },
    tomTillstand: { textAlign: 'center' as const, padding: 40, color: 'rgba(235,235,245,0.5)', fontSize: 14 },
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.titel}>Avtal</h1>
        <p style={s.underrad}>Abonnemang, försäkring, leasing, budget</p>
      </div>

      <div style={s.summaryCard}>
        <div style={s.summaryItem}>
          <div style={{ ...s.summaryVal, color: statistik.utgatt > 0 ? '#ff453a' : 'rgba(235,235,245,0.35)' }}>{statistik.utgatt}</div>
          <div style={s.summaryLabel}>Utgångna</div>
        </div>
        <div style={s.summaryDivider} />
        <div style={s.summaryItem}>
          <div style={{ ...s.summaryVal, color: statistik.snart > 0 ? '#ff9f0a' : 'rgba(235,235,245,0.35)' }}>{statistik.snart}</div>
          <div style={s.summaryLabel}>Utgår snart</div>
        </div>
        <div style={s.summaryDivider} />
        <div style={s.summaryItem}>
          <div style={{ ...s.summaryVal, color: '#34c759' }}>{statistik.ok}</div>
          <div style={s.summaryLabel}>OK</div>
        </div>
      </div>

      {friskvardSum.rader > 0 && friskvardSum.total > 0 && (
        <div style={s.friskCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'rgba(235,235,245,0.6)', fontWeight: 500 }}>Friskvård totalt</span>
            <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' as const }}>
              {fmtKr(friskvardSum.använt)} av {fmtKr(friskvardSum.total)}
            </span>
          </div>
          <ProgressBar anvant={friskvardSum.använt} total={friskvardSum.total} />
        </div>
      )}

      {laddar && <div style={s.tomTillstand}>Laddar…</div>}
      {!laddar && fel && <div style={{ ...s.tomTillstand, color: '#ff6b6b' }}>Fel: {fel}</div>}
      {!laddar && !fel && avtal.length === 0 && (
        <div style={s.tomTillstand}>Inga avtal registrerade{kanRedigera ? ' — tryck + för att lägga till' : ''}.</div>
      )}

      {KATEGORI_ORDNING.map(kat => {
        const lista = perKategori[kat];
        if (!lista || lista.length === 0) return null;
        return (
          <div key={kat}>
            <div style={s.sektionTitel}>{KATEGORI_LABEL[kat]}</div>
            <div style={s.lista}>
              {lista.map((a, i) => {
                const status = statusFör(a.slut_datum);
                const harUtvikt = utvikt === a.id;
                const erFriskvard = a.kategori === 'friskvard';
                return (
                  <div
                    key={a.id}
                    style={{ ...s.rad, ...(i === 0 ? { borderTop: 'none' } : {}) }}
                    onClick={() => setUtvikt(u => u === a.id ? null : a.id)}
                  >
                    <div style={s.radHöger}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={s.namn}>{a.namn}</div>
                        <div style={s.underradLita}>
                          {[a.leverantor, a.kopplad_till].filter(Boolean).join(' · ') || KATEGORI_LABEL[kat]}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' as const, minWidth: 0 }}>
                        {erFriskvard && a.budget_total ? (
                          <>
                            <div style={s.beloppHöger}>{fmtKr(a.budget_anvant || 0)} / {fmtKr(a.budget_total)}</div>
                            <div style={{ fontSize: 11, color: 'rgba(235,235,245,0.5)', marginTop: 2 }}>använt</div>
                          </>
                        ) : a.belopp_per_manad ? (
                          <>
                            <div style={s.beloppHöger}>{fmtKr(a.belopp_per_manad)}</div>
                            <div style={{ fontSize: 11, color: 'rgba(235,235,245,0.5)', marginTop: 2 }}>/månad</div>
                          </>
                        ) : a.belopp_per_ar ? (
                          <>
                            <div style={s.beloppHöger}>{fmtKr(a.belopp_per_ar)}</div>
                            <div style={{ fontSize: 11, color: 'rgba(235,235,245,0.5)', marginTop: 2 }}>/år</div>
                          </>
                        ) : a.slut_datum ? (
                          <>
                            <div style={s.beloppHöger}>Slut {fmtDatum(a.slut_datum)}</div>
                            {dagarKvar(a.slut_datum) != null && (
                              <div style={{ fontSize: 11, color: 'rgba(235,235,245,0.5)', marginTop: 2 }}>
                                {dagarKvar(a.slut_datum)! < 0 ? `${Math.abs(dagarKvar(a.slut_datum)!)} dagar sen` : dagarKvar(a.slut_datum) === 0 ? 'idag' : `om ${dagarKvar(a.slut_datum)} dagar`}
                              </div>
                            )}
                          </>
                        ) : null}
                      </div>
                      <div style={{ ...s.prick, background: statusFärg(status) }} />
                    </div>

                    {erFriskvard && a.budget_total ? (
                      <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
                        <ProgressBar anvant={a.budget_anvant || 0} total={a.budget_total} />
                      </div>
                    ) : null}

                    {harUtvikt && (
                      <div style={s.expand} onClick={e => e.stopPropagation()}>
                        {a.leverantor && <DetaljRad label="Leverantör" värde={a.leverantor} />}
                        {a.kopplad_till && <DetaljRad label="Kopplad till" värde={a.kopplad_till} />}
                        {a.start_datum && <DetaljRad label="Startdatum" värde={fmtDatum(a.start_datum)} />}
                        {a.slut_datum && (
                          <DetaljRad label="Slutdatum" värde={fmtDatum(a.slut_datum)} status={statusFör(a.slut_datum)} dagar={dagarKvar(a.slut_datum)} />
                        )}
                        {a.belopp_per_manad != null && <DetaljRad label="Per månad" värde={fmtKr(a.belopp_per_manad)} />}
                        {a.belopp_per_ar != null && <DetaljRad label="Per år" värde={fmtKr(a.belopp_per_ar)} />}
                        {a.budget_total != null && (
                          <DetaljRad label="Budget" värde={`${fmtKr(a.budget_anvant || 0)} / ${fmtKr(a.budget_total)}`} />
                        )}
                        {a.anteckning && (
                          <div style={{ marginTop: 10, padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 13, color: 'rgba(235,235,245,0.8)', lineHeight: 1.4 }}>{a.anteckning}</div>
                        )}
                        {kanRedigera && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button
                              onClick={() => { setRedigerar(a); setVisarForm(true); }}
                              style={{ flex: 1, minHeight: 44, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Redigera
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {kanRedigera && (
        <button style={s.addKnapp} onClick={() => { setRedigerar(null); setVisarForm(true); }} aria-label="Lägg till avtal">+</button>
      )}

      {visarForm && (
        <AvtalForm
          befintligt={redigerar}
          onStäng={() => { setVisarForm(false); setRedigerar(null); }}
          onSparad={() => { setVisarForm(false); setRedigerar(null); hämta(); }}
        />
      )}
    </div>
  );
}

function ProgressBar({ anvant, total }: { anvant: number; total: number }) {
  const procent = total > 0 ? Math.min(100, Math.round((anvant / total) * 100)) : 0;
  const färg = procent >= 90 ? '#ff453a' : procent >= 70 ? '#ff9f0a' : '#34c759';
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${procent}%`, height: '100%', background: färg, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ fontSize: 11, color: 'rgba(235,235,245,0.5)', marginTop: 4, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }}>
        {procent}%
      </div>
    </div>
  );
}

function DetaljRad({ label, värde, status, dagar }: { label: string; värde: string; status?: Status; dagar?: number | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', fontSize: 15, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: 'rgba(235,235,245,0.8)' }}>{label}</span>
      <div style={{ textAlign: 'right' as const }}>
        <div style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' as const }}>{värde}</div>
        {dagar != null && (
          <div style={{ fontSize: 12, color: status === 'kritisk' ? '#ff453a' : status === 'varning' ? '#ff9f0a' : 'rgba(235,235,245,0.5)', marginTop: 1 }}>
            {dagar < 0 ? `${Math.abs(dagar)} dagar sen` : dagar === 0 ? 'idag' : `om ${dagar} dagar`}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Formulär ────────────────────────────────────────────────────────── */

function AvtalForm({ befintligt, onStäng, onSparad }: {
  befintligt: Avtal | null;
  onStäng: () => void;
  onSparad: () => void;
}) {
  const [namn, setNamn] = useState(befintligt?.namn || '');
  const [kategori, setKategori] = useState<Kategori>(befintligt?.kategori || 'telefon');
  const [leverantor, setLeverantor] = useState(befintligt?.leverantor || '');
  const [kopplad, setKopplad] = useState(befintligt?.kopplad_till || '');
  const [start, setStart] = useState(befintligt?.start_datum || '');
  const [slut, setSlut] = useState(befintligt?.slut_datum || '');
  const [perMan, setPerMan] = useState(befintligt?.belopp_per_manad?.toString() || '');
  const [perAr, setPerAr] = useState(befintligt?.belopp_per_ar?.toString() || '');
  const [budgetTot, setBudgetTot] = useState(befintligt?.budget_total?.toString() || '');
  const [budgetAnv, setBudgetAnv] = useState(befintligt?.budget_anvant?.toString() || '');
  const [anteckning, setAnteckning] = useState(befintligt?.anteckning || '');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const erFriskvard = kategori === 'friskvard';

  async function spara() {
    setSparar(true); setFel(null);
    try {
      const payload: any = {
        namn: namn.trim(),
        kategori,
        leverantor: leverantor.trim() || null,
        kopplad_till: kopplad.trim() || null,
        start_datum: start || null,
        slut_datum: slut || null,
        belopp_per_manad: perMan ? parseFloat(perMan) : null,
        belopp_per_ar: perAr ? parseFloat(perAr) : null,
        budget_total: budgetTot ? parseFloat(budgetTot) : null,
        budget_anvant: budgetAnv ? parseFloat(budgetAnv) : 0,
        anteckning: anteckning.trim() || null,
      };
      const url = befintligt ? `/api/avtal/${befintligt.id}` : '/api/avtal';
      const metod = befintligt ? 'PATCH' : 'POST';
      const r = await fetch(url, { method: metod, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await r.json();
      if (!r.ok || !body.ok) { setFel(body.error || `HTTP ${r.status}`); setSparar(false); return; }
      onSparad();
    } catch (e: any) {
      setFel(e?.message || String(e));
      setSparar(false);
    }
  }

  async function taBort() {
    if (!befintligt) return;
    if (!confirm(`Ta bort ${befintligt.namn}?`)) return;
    setSparar(true);
    const r = await fetch(`/api/avtal/${befintligt.id}`, { method: 'DELETE' });
    if (r.ok) onSparad();
    else setSparar(false);
  }

  const inp = {
    width: '100%', minHeight: 44, padding: '10px 12px',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, color: '#fff', fontSize: 16, fontFamily: 'inherit',
    boxSizing: 'border-box' as const, outline: 'none',
  };
  const label = { fontSize: 12, color: 'rgba(235,235,245,0.5)', marginBottom: 4, fontWeight: 500 };
  const grp = { marginBottom: 12 };

  return (
    <div onClick={onStäng} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, background: '#1c1c1e', borderRadius: '16px 16px 0 0', padding: '12px 20px 28px', maxHeight: '92vh', overflowY: 'auto', color: '#fff', fontFamily: "-apple-system,BlinkMacSystemFont,system-ui,sans-serif" }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.2)', margin: '0 auto 16px' }} />
        <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700 }}>
          {befintligt ? 'Redigera avtal' : 'Nytt avtal'}
        </h2>

        <div style={grp}>
          <div style={label}>Namn *</div>
          <input style={inp} value={namn} onChange={e => setNamn(e.target.value)} placeholder="t.ex. Telia Mobil Martin"/>
        </div>

        <div style={grp}>
          <div style={label}>Kategori *</div>
          <select style={inp as any} value={kategori} onChange={e => setKategori(e.target.value as Kategori)}>
            <option value="telefon">Telefon</option>
            <option value="friskvard">Företagshälsovård</option>
            <option value="forsakring">Försäkring</option>
            <option value="leasing">Leasing & finansiering</option>
            <option value="programvara">Programvara</option>
            <option value="ovrigt">Övrigt</option>
          </select>
        </div>

        <div style={grp}>
          <div style={label}>Leverantör</div>
          <input style={inp} value={leverantor} onChange={e => setLeverantor(e.target.value)} placeholder="t.ex. Telia"/>
        </div>
        <div style={grp}>
          <div style={label}>Kopplad till (person/maskin)</div>
          <input style={inp} value={kopplad} onChange={e => setKopplad(e.target.value)} placeholder="t.ex. Martin Lindqvist"/>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={grp}>
            <div style={label}>Startdatum</div>
            <input style={inp as any} type="date" value={start} onChange={e => setStart(e.target.value)}/>
          </div>
          <div style={grp}>
            <div style={label}>Slutdatum</div>
            <input style={inp as any} type="date" value={slut} onChange={e => setSlut(e.target.value)}/>
          </div>
        </div>

        {!erFriskvard && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={grp}>
              <div style={label}>Belopp/månad</div>
              <input style={inp as any} type="number" inputMode="decimal" value={perMan} onChange={e => setPerMan(e.target.value)}/>
            </div>
            <div style={grp}>
              <div style={label}>Belopp/år</div>
              <input style={inp as any} type="number" inputMode="decimal" value={perAr} onChange={e => setPerAr(e.target.value)}/>
            </div>
          </div>
        )}

        {erFriskvard && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={grp}>
              <div style={label}>Budget totalt</div>
              <input style={inp as any} type="number" inputMode="decimal" value={budgetTot} onChange={e => setBudgetTot(e.target.value)}/>
            </div>
            <div style={grp}>
              <div style={label}>Hittills använt</div>
              <input style={inp as any} type="number" inputMode="decimal" value={budgetAnv} onChange={e => setBudgetAnv(e.target.value)}/>
            </div>
          </div>
        )}

        <div style={grp}>
          <div style={label}>Anteckning</div>
          <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' as const }} value={anteckning} onChange={e => setAnteckning(e.target.value)}/>
        </div>

        {fel && <div style={{ padding: 10, background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{fel}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onStäng}
            style={{ flex: 1, minHeight: 48, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            Avbryt
          </button>
          <button onClick={spara} disabled={!namn.trim() || sparar}
            style={{ flex: 2, minHeight: 48, background: '#0a84ff', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: !namn.trim() || sparar ? 0.35 : 1 }}>
            {sparar ? 'Sparar…' : 'Spara'}
          </button>
        </div>
        {befintligt && (
          <button onClick={taBort} disabled={sparar}
            style={{ width: '100%', marginTop: 10, minHeight: 44, background: 'none', border: 'none', color: '#ff453a', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            Ta bort avtal
          </button>
        )}
      </div>
    </div>
  );
}
