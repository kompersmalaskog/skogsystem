'use client';

import { useEffect, useMemo, useState } from 'react';

type Fordon = {
  id: string;
  namn: string;
  regnr: string | null;
  typ: 'lastbil' | 'bil' | 'slap' | 'king_cab' | 'skordare' | 'skotare' | 'annan';
  grupp: 'lastbil_slap' | 'bil' | 'maskin';
  besiktning_datum: string | null;
  forsakring_datum: string | null;
  skatt_datum: string | null;
  service_datum: string | null;
  service_timmar: number | null;
  nuvarande_timmar: number | null;
  service_km: number | null;
  nuvarande_km: number | null;
  anteckning: string | null;
};

const TYP_LABEL: Record<Fordon['typ'], string> = {
  lastbil: 'Lastbil',
  bil: 'Bil',
  slap: 'Släp',
  king_cab: 'King cab',
  skordare: 'Skördare',
  skotare: 'Skotare',
  annan: 'Övrigt',
};

const GRUPP_LABEL: Record<Fordon['grupp'], string> = {
  lastbil_slap: 'Lastbil & släp',
  bil: 'Bilar',
  maskin: 'Maskiner',
};

const GRUPP_ORDNING: Fordon['grupp'][] = ['lastbil_slap', 'bil', 'maskin'];

const MÅNAD_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function dagarKvar(datum: string | null): number | null {
  if (!datum) return null;
  const idag = new Date();
  idag.setHours(0, 0, 0, 0);
  const d = new Date(datum + 'T00:00:00');
  return Math.round((d.getTime() - idag.getTime()) / 86400000);
}

function fmtDatum(datum: string | null): string {
  if (!datum) return '—';
  const d = new Date(datum + 'T00:00:00');
  return `${d.getDate()} ${MÅNAD_KORT[d.getMonth()]}`;
}

type Status = 'ok' | 'varning' | 'kritisk';

function statusFör(datum: string | null): Status | null {
  const d = dagarKvar(datum);
  if (d == null) return null;
  if (d < 7) return 'kritisk';
  if (d < 30) return 'varning';
  return 'ok';
}

function värstaStatus(f: Fordon): Status | null {
  const statusar = [
    statusFör(f.besiktning_datum),
    statusFör(f.forsakring_datum),
    statusFör(f.skatt_datum),
    statusFör(f.service_datum),
  ].filter(Boolean) as Status[];
  if (statusar.includes('kritisk')) return 'kritisk';
  if (statusar.includes('varning')) return 'varning';
  if (statusar.length) return 'ok';
  return null;
}

function statusFärg(s: Status | null): string {
  if (s === 'kritisk') return '#ff453a';
  if (s === 'varning') return '#ff9f0a';
  if (s === 'ok') return '#34c759';
  return '#636366';
}

function nästaHändelse(f: Fordon): { label: string; datum: string; dagar: number } | null {
  const kandidater: { label: string; datum: string; dagar: number }[] = [];
  if (f.besiktning_datum) { const d = dagarKvar(f.besiktning_datum)!; kandidater.push({ label: 'Besiktning', datum: f.besiktning_datum, dagar: d }); }
  if (f.forsakring_datum) { const d = dagarKvar(f.forsakring_datum)!; kandidater.push({ label: 'Försäkring', datum: f.forsakring_datum, dagar: d }); }
  if (f.skatt_datum)      { const d = dagarKvar(f.skatt_datum)!;      kandidater.push({ label: 'Skatt', datum: f.skatt_datum, dagar: d }); }
  if (f.service_datum)    { const d = dagarKvar(f.service_datum)!;    kandidater.push({ label: 'Service', datum: f.service_datum, dagar: d }); }
  if (kandidater.length === 0) return null;
  kandidater.sort((a, b) => a.dagar - b.dagar);
  return kandidater[0];
}

export default function FordonsoversiktClient({ kanRedigera }: { kanRedigera: boolean }) {
  const [fordon, setFordon] = useState<Fordon[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [utvikt, setUtvikt] = useState<string | null>(null);
  const [visarForm, setVisarForm] = useState(false);
  const [redigerar, setRedigerar] = useState<Fordon | null>(null);

  async function hämta() {
    setLaddar(true); setFel(null);
    try {
      const r = await fetch('/api/fordon', { cache: 'no-store' });
      const body = await r.json();
      if (!r.ok || !body.ok) { setFel(body.error || `HTTP ${r.status}`); setFordon([]); }
      else setFordon(body.fordon || []);
    } catch (e: any) {
      setFel(e?.message || String(e));
    }
    setLaddar(false);
  }

  useEffect(() => { hämta(); }, []);

  const statistik = useMemo(() => {
    let utgangna = 0, inom30 = 0, ok = 0;
    for (const f of fordon) {
      const s = värstaStatus(f);
      if (s === 'kritisk') utgangna++;
      else if (s === 'varning') inom30++;
      else if (s === 'ok') ok++;
    }
    return { utgangna, inom30, ok };
  }, [fordon]);

  const grupper = useMemo(() => {
    const m: Record<string, Fordon[]> = {};
    for (const f of fordon) {
      if (!m[f.grupp]) m[f.grupp] = [];
      m[f.grupp].push(f);
    }
    // Sortera varje grupp på värsta status (kritisk först) sen nästa datum
    for (const g of Object.values(m)) {
      g.sort((a, b) => {
        const sA = värstaStatus(a);
        const sB = värstaStatus(b);
        const rank = (s: Status | null) => s === 'kritisk' ? 0 : s === 'varning' ? 1 : s === 'ok' ? 2 : 3;
        const diff = rank(sA) - rank(sB);
        if (diff) return diff;
        const nA = nästaHändelse(a)?.dagar ?? 9999;
        const nB = nästaHändelse(b)?.dagar ?? 9999;
        return nA - nB;
      });
    }
    return m;
  }, [fordon]);

  const s = {
    page: { background: '#000', minHeight: '100vh', color: '#fff', fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased' as const, paddingBottom: 40 },
    header: { padding: '20px 16px 8px' },
    titel: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 },
    underrad: { fontSize: 13, color: 'rgba(235,235,245,0.6)', marginTop: 2 },
    summaryCard: { margin: '16px', padding: 16, background: '#1c1c1e', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 6 },
    summaryItem: { textAlign: 'center' as const, flex: 1 },
    summaryVal: { fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 },
    summaryLabel: { fontSize: 11, color: 'rgba(235,235,245,0.6)', marginTop: 4, letterSpacing: 0.2, fontWeight: 500 },
    summaryDivider: { width: 1, height: 36, background: 'rgba(255,255,255,0.08)' },
    sektionTitel: { fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: 'rgba(235,235,245,0.6)', textTransform: 'uppercase' as const, padding: '20px 16px 8px' },
    lista: { background: '#1c1c1e', borderRadius: 12, margin: '0 16px', overflow: 'hidden' as const },
    rad: { minHeight: 56, padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', userSelect: 'none' as const, WebkitTapHighlightColor: 'transparent' as any },
    radHöger: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    namn: { fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: '#fff' },
    typRad: { fontSize: 13, color: 'rgba(235,235,245,0.6)', marginTop: 2 },
    nästaDatum: { fontSize: 15, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap' as const },
    nästaLabel: { fontSize: 11, color: 'rgba(235,235,245,0.5)', textAlign: 'right' as const, marginTop: 1 },
    prick: { width: 10, height: 10, borderRadius: '50%' as const, flexShrink: 0 },
    expand: { marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' },
    expandRad: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', fontSize: 15 },
    expandLabel: { color: 'rgba(235,235,245,0.8)' },
    expandVärde: { color: '#fff', fontVariantNumeric: 'tabular-nums' as const, textAlign: 'right' as const },
    expandKvar: { fontSize: 13, marginTop: 2 },
    tomTillstand: { textAlign: 'center' as const, padding: 40, color: 'rgba(235,235,245,0.5)', fontSize: 14 },
    addKnapp: { position: 'fixed' as const, right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, background: '#0a84ff', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', boxShadow: '0 4px 16px rgba(10,132,255,0.4)', lineHeight: 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' as const },
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.titel}>Fordonsöversikt</h1>
        <p style={s.underrad}>Besiktning, försäkring, skatt & service</p>
      </div>

      <div style={s.summaryCard}>
        <div style={s.summaryItem}>
          <div style={{ ...s.summaryVal, color: statistik.utgangna > 0 ? '#ff453a' : 'rgba(235,235,245,0.35)' }}>{statistik.utgangna}</div>
          <div style={s.summaryLabel}>Utgångna</div>
        </div>
        <div style={s.summaryDivider} />
        <div style={s.summaryItem}>
          <div style={{ ...s.summaryVal, color: statistik.inom30 > 0 ? '#ff9f0a' : 'rgba(235,235,245,0.35)' }}>{statistik.inom30}</div>
          <div style={s.summaryLabel}>Inom 30 dagar</div>
        </div>
        <div style={s.summaryDivider} />
        <div style={s.summaryItem}>
          <div style={{ ...s.summaryVal, color: '#34c759' }}>{statistik.ok}</div>
          <div style={s.summaryLabel}>OK</div>
        </div>
      </div>

      {laddar && <div style={s.tomTillstand}>Laddar…</div>}
      {!laddar && fel && <div style={{ ...s.tomTillstand, color: '#ff6b6b' }}>Fel: {fel}</div>}
      {!laddar && !fel && fordon.length === 0 && (
        <div style={s.tomTillstand}>
          Inga fordon registrerade{kanRedigera ? ' — tryck + för att lägga till' : ''}.
        </div>
      )}

      {GRUPP_ORDNING.map(g => {
        const lista = grupper[g];
        if (!lista || lista.length === 0) return null;
        return (
          <div key={g}>
            <div style={s.sektionTitel}>{GRUPP_LABEL[g]}</div>
            <div style={s.lista}>
              {lista.map((f, i) => {
                const status = värstaStatus(f);
                const nästa = nästaHändelse(f);
                const harUtvikt = utvikt === f.id;
                return (
                  <div
                    key={f.id}
                    style={{ ...s.rad, ...(i === 0 ? { borderTop: 'none' } : {}) }}
                    onClick={() => setUtvikt(u => u === f.id ? null : f.id)}
                  >
                    <div style={s.radHöger}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={s.namn}>{f.regnr || f.namn}</div>
                        <div style={s.typRad}>
                          {TYP_LABEL[f.typ]}
                          {f.regnr && f.namn ? ` · ${f.namn}` : ''}
                        </div>
                      </div>
                      {nästa && (
                        <div style={{ textAlign: 'right' as const }}>
                          <div style={s.nästaDatum}>{nästa.label} {fmtDatum(nästa.datum)}</div>
                          <div style={s.nästaLabel}>
                            {nästa.dagar < 0 ? `${Math.abs(nästa.dagar)} dagar sen` : nästa.dagar === 0 ? 'idag' : `om ${nästa.dagar} dagar`}
                          </div>
                        </div>
                      )}
                      <div style={{ ...s.prick, background: statusFärg(status) }} />
                    </div>

                    {harUtvikt && (
                      <div style={s.expand} onClick={e => e.stopPropagation()}>
                        <EventRad label="Besiktning" datum={f.besiktning_datum} />
                        <EventRad label="Försäkring" datum={f.forsakring_datum} />
                        <EventRad label="Skatt" datum={f.skatt_datum} />
                        {f.grupp === 'maskin' ? (
                          <ServiceRadTimmar service_timmar={f.service_timmar} nuvarande_timmar={f.nuvarande_timmar} />
                        ) : (
                          <ServiceRadKm service_datum={f.service_datum} service_km={f.service_km} nuvarande_km={f.nuvarande_km} />
                        )}
                        {f.anteckning && (
                          <div style={{ marginTop: 10, padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 13, color: 'rgba(235,235,245,0.8)', lineHeight: 1.4 }}>{f.anteckning}</div>
                        )}
                        {kanRedigera && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button
                              onClick={() => { setRedigerar(f); setVisarForm(true); }}
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
        <button style={s.addKnapp} onClick={() => { setRedigerar(null); setVisarForm(true); }} aria-label="Lägg till fordon">+</button>
      )}

      {visarForm && (
        <FordonForm
          befintligt={redigerar}
          onStäng={() => { setVisarForm(false); setRedigerar(null); }}
          onSparad={() => { setVisarForm(false); setRedigerar(null); hämta(); }}
        />
      )}
    </div>
  );
}

function EventRad({ label, datum }: { label: string; datum: string | null }) {
  const d = dagarKvar(datum);
  const status = statusFör(datum);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', fontSize: 15, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: 'rgba(235,235,245,0.8)' }}>{label}</span>
      <div style={{ textAlign: 'right' as const }}>
        <div style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' as const }}>{fmtDatum(datum)}</div>
        {d != null && (
          <div style={{ fontSize: 12, color: status === 'kritisk' ? '#ff453a' : status === 'varning' ? '#ff9f0a' : 'rgba(235,235,245,0.5)', marginTop: 1 }}>
            {d < 0 ? `${Math.abs(d)} dagar sen` : d === 0 ? 'idag' : `om ${d} dagar`}
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceRadTimmar({ service_timmar, nuvarande_timmar }: { service_timmar: number | null; nuvarande_timmar: number | null }) {
  if (service_timmar == null) {
    return <EventRad label="Service" datum={null} />;
  }
  const kvar = nuvarande_timmar != null ? service_timmar - nuvarande_timmar : null;
  const status: Status = kvar != null && kvar <= 20 ? 'kritisk' : kvar != null && kvar <= 100 ? 'varning' : 'ok';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', fontSize: 15, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: 'rgba(235,235,245,0.8)' }}>Service</span>
      <div style={{ textAlign: 'right' as const }}>
        <div style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' as const }}>{service_timmar} h</div>
        {kvar != null && (
          <div style={{ fontSize: 12, color: status === 'kritisk' ? '#ff453a' : status === 'varning' ? '#ff9f0a' : 'rgba(235,235,245,0.5)', marginTop: 1 }}>
            {nuvarande_timmar} h nu · {kvar >= 0 ? `${kvar} h kvar` : `${Math.abs(kvar)} h över`}
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceRadKm({ service_datum, service_km, nuvarande_km }: { service_datum: string | null; service_km: number | null; nuvarande_km: number | null }) {
  if (service_datum) return <EventRad label="Service" datum={service_datum} />;
  if (service_km == null) return <EventRad label="Service" datum={null} />;
  const kvar = nuvarande_km != null ? service_km - nuvarande_km : null;
  const status: Status = kvar != null && kvar <= 500 ? 'kritisk' : kvar != null && kvar <= 2000 ? 'varning' : 'ok';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', fontSize: 15, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: 'rgba(235,235,245,0.8)' }}>Service</span>
      <div style={{ textAlign: 'right' as const }}>
        <div style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' as const }}>{service_km.toLocaleString('sv-SE')} km</div>
        {kvar != null && (
          <div style={{ fontSize: 12, color: status === 'kritisk' ? '#ff453a' : status === 'varning' ? '#ff9f0a' : 'rgba(235,235,245,0.5)', marginTop: 1 }}>
            {nuvarande_km?.toLocaleString('sv-SE')} km nu · {kvar >= 0 ? `${kvar.toLocaleString('sv-SE')} km kvar` : `${Math.abs(kvar).toLocaleString('sv-SE')} km över`}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Formulär — minimal bottom-sheet ──────────────────────────────────── */

function FordonForm({ befintligt, onStäng, onSparad }: {
  befintligt: Fordon | null;
  onStäng: () => void;
  onSparad: () => void;
}) {
  const [namn, setNamn] = useState(befintligt?.namn || '');
  const [regnr, setRegnr] = useState(befintligt?.regnr || '');
  const [typ, setTyp] = useState<Fordon['typ']>(befintligt?.typ || 'bil');
  const [besiktning, setBesiktning] = useState(befintligt?.besiktning_datum || '');
  const [forsakring, setForsakring] = useState(befintligt?.forsakring_datum || '');
  const [skatt, setSkatt] = useState(befintligt?.skatt_datum || '');
  const [serviceDatum, setServiceDatum] = useState(befintligt?.service_datum || '');
  const [serviceTim, setServiceTim] = useState<string>(befintligt?.service_timmar?.toString() || '');
  const [nuTim, setNuTim] = useState<string>(befintligt?.nuvarande_timmar?.toString() || '');
  const [serviceKm, setServiceKm] = useState<string>(befintligt?.service_km?.toString() || '');
  const [nuKm, setNuKm] = useState<string>(befintligt?.nuvarande_km?.toString() || '');
  const [anteckning, setAnteckning] = useState(befintligt?.anteckning || '');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const grupp: Fordon['grupp'] =
    typ === 'lastbil' || typ === 'slap' || typ === 'king_cab' ? 'lastbil_slap' :
    typ === 'skordare' || typ === 'skotare' ? 'maskin' :
    'bil';

  const erMaskin = grupp === 'maskin';

  async function spara() {
    setSparar(true); setFel(null);
    try {
      const payload: any = {
        namn: namn.trim(),
        regnr: regnr.trim() || null,
        typ,
        grupp,
        besiktning_datum: besiktning || null,
        forsakring_datum: forsakring || null,
        skatt_datum: skatt || null,
        service_datum: serviceDatum || null,
        service_timmar: serviceTim ? parseInt(serviceTim) : null,
        nuvarande_timmar: nuTim ? parseInt(nuTim) : null,
        service_km: serviceKm ? parseInt(serviceKm) : null,
        nuvarande_km: nuKm ? parseInt(nuKm) : null,
        anteckning: anteckning.trim() || null,
      };
      const url = befintligt ? `/api/fordon/${befintligt.id}` : '/api/fordon';
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
    const r = await fetch(`/api/fordon/${befintligt.id}`, { method: 'DELETE' });
    if (r.ok) onSparad();
    else setSparar(false);
  }

  const inp = {
    width: '100%',
    minHeight: 44,
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    color: '#fff',
    fontSize: 16,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
    outline: 'none',
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
          {befintligt ? 'Redigera fordon' : 'Nytt fordon'}
        </h2>

        <div style={grp}>
          <div style={label}>Namn *</div>
          <input style={inp} value={namn} onChange={e => setNamn(e.target.value)} placeholder="t.ex. Volvo FH 540"/>
        </div>

        <div style={grp}>
          <div style={label}>Regnummer</div>
          <input style={inp} value={regnr} onChange={e => setRegnr(e.target.value.toUpperCase())} placeholder="ABC123"/>
        </div>

        <div style={grp}>
          <div style={label}>Typ *</div>
          <select style={inp as any} value={typ} onChange={e => setTyp(e.target.value as Fordon['typ'])}>
            <option value="bil">Bil</option>
            <option value="lastbil">Lastbil</option>
            <option value="slap">Släp</option>
            <option value="king_cab">King cab</option>
            <option value="skordare">Skördare</option>
            <option value="skotare">Skotare</option>
            <option value="annan">Övrigt</option>
          </select>
        </div>

        <div style={grp}>
          <div style={label}>Besiktning</div>
          <input style={inp as any} type="date" value={besiktning} onChange={e => setBesiktning(e.target.value)}/>
        </div>
        <div style={grp}>
          <div style={label}>Försäkring</div>
          <input style={inp as any} type="date" value={forsakring} onChange={e => setForsakring(e.target.value)}/>
        </div>
        <div style={grp}>
          <div style={label}>Skatt</div>
          <input style={inp as any} type="date" value={skatt} onChange={e => setSkatt(e.target.value)}/>
        </div>

        {erMaskin ? (
          <>
            <div style={grp}>
              <div style={label}>Nästa service (timmar)</div>
              <input style={inp as any} type="number" value={serviceTim} onChange={e => setServiceTim(e.target.value)} placeholder="t.ex. 12000"/>
            </div>
            <div style={grp}>
              <div style={label}>Nuvarande timmar</div>
              <input style={inp as any} type="number" value={nuTim} onChange={e => setNuTim(e.target.value)}/>
            </div>
          </>
        ) : (
          <>
            <div style={grp}>
              <div style={label}>Service datum</div>
              <input style={inp as any} type="date" value={serviceDatum} onChange={e => setServiceDatum(e.target.value)}/>
            </div>
            <div style={grp}>
              <div style={label}>Nästa service (km) — valfritt</div>
              <input style={inp as any} type="number" value={serviceKm} onChange={e => setServiceKm(e.target.value)}/>
            </div>
            <div style={grp}>
              <div style={label}>Nuvarande km</div>
              <input style={inp as any} type="number" value={nuKm} onChange={e => setNuKm(e.target.value)}/>
            </div>
          </>
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
            Ta bort fordon
          </button>
        )}
      </div>
    </div>
  );
}
