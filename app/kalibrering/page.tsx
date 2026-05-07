'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// === TYPES (matching actual Supabase tables) ===
interface FaktKalibrering {
  id: number;
  datum: string;
  maskin_id: string;
  operator_id: string | null;
  tradslag: string;
  antal_kontrollstammar: number;
  antal_kontrollstockar: number;
  langd_avvikelse_snitt_cm: number;
  langd_avvikelse_min_cm: number;
  langd_avvikelse_max_cm: number;
  dia_avvikelse_snitt_mm: number;
  dia_avvikelse_min_mm: number;
  dia_avvikelse_max_mm: number;
  status: string;
  filnamn: string;
  skapad_tid: string;
}

interface DetaljKontrollStock {
  id: number;
  maskin_id: string;
  kontroll_datum: string;
  stam_nummer: number;
  stock_nummer: number;
  maskin_langd_cm: number;
  maskin_toppdia_mm: number;
  operator_langd_cm: number;
  operator_toppdia_mm: number;
  langd_avvikelse_cm: number;
  dia_avvikelse_mm: number;
  filnamn: string;
  skapad_tid: string;
  maskin_volym_sub: number | null;
  operator_volym_sub: number | null;
  volym_avvikelse: number | null;
  latitude: number | null;
  longitude: number | null;
  objekt_id: string | null;
}

interface KalibHistorik {
  id: number;
  datum: string;
  maskin_id: string;
  operator_id: string | null;
  tradslag: string;
  orsak: string;
  beskrivning: string;
  langd_justering_mm: number | null;
  dia_justering_mm: number | null;
  position_cm: number | null;
  filnamn: string;
  skapad_tid: string;
  typ: string;
}

const MSym = ({ name, size = 18, color }: { name: string; size?: number; color?: string }) => (
  <span
    className="material-symbols-outlined"
    aria-hidden="true"
    style={{ fontSize: size, lineHeight: 1, color, fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
  >
    {name}
  </span>
);

const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

// === Kalender-types som matchar /api/kalibrering/kalender response ===
type CalDagstatus = 'komplett' | 'saknas' | 'varning' | 'inaktiv';
type CalKontroll = { id: number; tradslag: string | null; status: string; filnamn: string | null };
type CalMaskin = {
  maskin_id: string;
  tillverkare: string | null;
  modell: string | null;
  status: CalDagstatus;
  volym_m3sub: number;
  huvudtyp: string | null;
  huvudtyp_okand: boolean;
  trosklar: { min_volym_m3sub: number };
  kontroller: CalKontroll[];
};

const maskinNamn = (m: { tillverkare?: string | null; modell?: string | null; maskin_id: string }) => {
  const t = (m.tillverkare ?? '').trim();
  const mod = (m.modell ?? '').trim();
  if (!t && !mod) return m.maskin_id;
  if (!mod) return t;
  if (!t) return mod;
  // Om modell börjar med tillverkare (case-insensitivt), släpp prefixet
  if (mod.toLowerCase().startsWith(t.toLowerCase())) return mod;
  return `${t} ${mod}`;
};
type CalDag = { datum: string; veckodag: number; status: CalDagstatus; maskiner: CalMaskin[] };
type CalSammanfattning = { produktionsdagar: number; kompletta: number; saknas: number; varningar: number; okand_huvudtyp_dagar: number };
type CalResponse = { manad: string; dagar: CalDag[]; sammanfattning: CalSammanfattning };

const padNum = (n: number) => String(n).padStart(2, '0');
const idagManad = () => { const d = new Date(); return `${d.getFullYear()}-${padNum(d.getMonth() + 1)}`; };
const idagStr = () => { const d = new Date(); return `${d.getFullYear()}-${padNum(d.getMonth() + 1)}-${padNum(d.getDate())}`; };
const manadNamn = (manad: string) => {
  const [y, m] = manad.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const stegManad = (manad: string, delta: number) => {
  const [y, m] = manad.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${padNum(d.getMonth() + 1)}`;
};
const dagrubrik = (datum: string) => {
  const d = new Date(datum + 'T00:00:00');
  const s = d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const dagstatusText = (s: CalDagstatus): string => {
  if (s === 'komplett') return 'Inom rutin';
  if (s === 'saknas') return 'Saknad kontrollstam';
  if (s === 'varning') return 'Varning från kontroll';
  return 'Inaktiv';
};
const maskinStatusText = (s: CalDagstatus): string => {
  if (s === 'komplett') return 'Kontroll lämnad';
  if (s === 'saknas') return 'Saknas';
  if (s === 'varning') return 'Varning';
  return 'Inaktiv';
};
const kontrollStatusText = (s: string) => {
  if (s === 'OK') return 'OK';
  if (s === 'VARNING') return 'Varning';
  if (s === 'FEL') return 'Fel';
  return s;
};

export default function KalibreringPage() {
  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'calendar' | 'report'>('today');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<{ title: string; subtitle: string; body: React.ReactNode } | null>(null);
  const [loading, setLoading] = useState(true);

  const [allKalib, setAllKalib] = useState<FaktKalibrering[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, DetaljKontrollStock[]>>({});
  const [historik, setHistorik] = useState<KalibHistorik[]>([]);

  // === Kalender-fliken: egen state + lazy fetch på tab-byte/manad-byte ===
  const [calManad, setCalManad] = useState<string>(idagManad);
  const [calData, setCalData] = useState<CalResponse | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);

  // Globalt maskinfilter — persistent över flikar
  const [selectedMaskinId, setSelectedMaskinId] = useState<string | 'all'>('all');
  const [alleMaskiner, setAlleMaskiner] = useState<{ maskin_id: string; tillverkare: string | null; modell: string | null; aktiv_till: string | null }[]>([]);
  const [maskinSheetOpen, setMaskinSheetOpen] = useState(false);
  const [maskinSearchQ, setMaskinSearchQ] = useState('');

  // Hämta alla skördare (även sålda) en gång vid mount — listan i sheet:n
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('dim_maskin')
      .select('maskin_id, tillverkare, modell, aktiv_till')
      .eq('maskin_typ', 'Harvester')
      .order('aktiv_till', { ascending: false, nullsFirst: true })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setAlleMaskiner(data as any);
      });
    return () => { cancelled = true; };
  }, []);

  // Faller tillbaka till 'all' om vald maskin inte längre finns
  const effectiveSelected: string | 'all' = selectedMaskinId === 'all' || alleMaskiner.some(m => m.maskin_id === selectedMaskinId)
    ? selectedMaskinId
    : 'all';

  const filterLabel = useMemo(() => {
    if (effectiveSelected === 'all') return 'Alla maskiner';
    const m = alleMaskiner.find(x => x.maskin_id === effectiveSelected);
    return m ? maskinNamn(m) : effectiveSelected;
  }, [effectiveSelected, alleMaskiner]);

  const aggregeraDagFiltrerat = (dag: CalDag, valdMaskinId: string | 'all'): CalDagstatus => {
    if (valdMaskinId === 'all') return dag.status;
    const m = dag.maskiner.find(x => x.maskin_id === valdMaskinId);
    if (!m) return 'inaktiv';
    return m.status;
  };

  // Sammanfattning omberäknad efter filter
  const filteredSammanfattning = useMemo<CalSammanfattning | null>(() => {
    if (!calData) return null;
    if (effectiveSelected === 'all') return calData.sammanfattning;
    const rader = calData.dagar.map(d => {
      const status = aggregeraDagFiltrerat(d, effectiveSelected);
      const m = d.maskiner.find(x => x.maskin_id === effectiveSelected);
      return { status, huvudtyp_okand: !!m?.huvudtyp_okand };
    });
    return {
      produktionsdagar: rader.filter(r => r.status !== 'inaktiv').length,
      kompletta: rader.filter(r => r.status === 'komplett').length,
      saknas: rader.filter(r => r.status === 'saknas').length,
      varningar: rader.filter(r => r.status === 'varning').length,
      okand_huvudtyp_dagar: rader.filter(r => r.huvudtyp_okand).length,
    };
  }, [calData, effectiveSelected]);

  useEffect(() => {
    if (activeTab !== 'calendar') return;
    if (calData?.manad === calManad && !calError) return; // har redan datan
    let cancelled = false;
    setCalLoading(true);
    setCalError(null);
    fetch(`/api/kalibrering/kalender?manad=${calManad}&key=skogsystem-debug`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: CalResponse) => { if (!cancelled) { setCalData(data); setCalLoading(false); } })
      .catch(err => { if (!cancelled) { setCalError(err?.message || 'Kunde inte ladda kalendern'); setCalLoading(false); } });
    return () => { cancelled = true; };
  }, [activeTab, calManad, calData, calError]);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: kalibRows, error: kalibErr } = await supabase
          .from('fakt_kalibrering')
          .select('*')
          .order('datum', { ascending: false });

        if (kalibErr) { console.error('fakt_kalibrering error:', kalibErr); setLoading(false); return; }
        if (!kalibRows || kalibRows.length === 0) { setLoading(false); return; }

        setAllKalib(kalibRows);

        const { data: stockRows, error: stockErr } = await supabase
          .from('detalj_kontroll_stock')
          .select('*')
          .order('stock_nummer', { ascending: true });

        if (stockErr) console.error('detalj_kontroll_stock error:', stockErr);

        const sMap: Record<string, DetaljKontrollStock[]> = {};
        (stockRows || []).forEach((s: DetaljKontrollStock) => {
          if (!sMap[s.filnamn]) sMap[s.filnamn] = [];
          sMap[s.filnamn].push(s);
        });
        setStockMap(sMap);

        const { data: histRows, error: histErr } = await supabase
          .from('fakt_kalibrering_historik')
          .select('*')
          .order('datum', { ascending: false });

        if (histErr) console.error('fakt_kalibrering_historik error:', histErr);
        setHistorik(histRows || []);
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // === Derived data ===
  // Senaste-fliken använder ALLTID hela datasetet (oberoende av filter)
  const latestKalib = allKalib.length > 0 ? allKalib[0] : null;
  const latestStockar = latestKalib ? (stockMap[latestKalib.filnamn] || []).sort((a, b) => a.stock_nummer - b.stock_nummer) : [];
  const totalLatestLen = latestStockar.reduce((a, s) => a + s.maskin_langd_cm, 0);

  // Filtrerade datakällor — Historik och Rapport räknar på dessa
  const filteredKalib = effectiveSelected === 'all' ? allKalib : allKalib.filter(k => k.maskin_id === effectiveSelected);
  const filteredHistorik = effectiveSelected === 'all' ? historik : historik.filter(h => h.maskin_id === effectiveSelected);

  // Per-species stats (weighted by antal_kontrollstockar) — Historik bars + Rapport tabell
  const speciesData: Record<string, { count: number; totalStockar: number; lenDiff: number; diaDiff: number }> = {};
  filteredKalib.forEach(k => {
    const key = k.tradslag.toLowerCase();
    if (!speciesData[key]) speciesData[key] = { count: 0, totalStockar: 0, lenDiff: 0, diaDiff: 0 };
    speciesData[key].count++;
    speciesData[key].totalStockar += k.antal_kontrollstockar;
    speciesData[key].lenDiff += k.langd_avvikelse_snitt_cm * k.antal_kontrollstockar;
    speciesData[key].diaDiff += k.dia_avvikelse_snitt_mm * k.antal_kontrollstockar;
  });
  Object.values(speciesData).forEach(v => {
    if (v.totalStockar > 0) {
      v.lenDiff = Math.round(v.lenDiff / v.totalStockar * 10) / 10;
      v.diaDiff = Math.round(v.diaDiff / v.totalStockar * 10) / 10;
    }
  });

  // Report averages (weighted) — Rapport
  const totalStockar = filteredKalib.reduce((a, k) => a + k.antal_kontrollstockar, 0);
  const avgLenReport = totalStockar > 0 ? Math.round(filteredKalib.reduce((a, k) => a + k.langd_avvikelse_snitt_cm * k.antal_kontrollstockar, 0) / totalStockar * 10) / 10 : 0;
  const avgDiaReport = totalStockar > 0 ? Math.round(filteredKalib.reduce((a, k) => a + k.dia_avvikelse_snitt_mm * k.antal_kontrollstockar, 0) / totalStockar * 10) / 10 : 0;

  // Unika kalibreringsjusteringar — Rapport
  const kalibFileSet = new Set(filteredHistorik.map(h => h.filnamn));
  const calibCount = kalibFileSet.size;

  // History list — Historik
  const historyList = filteredKalib.slice(0, 30).map(k => ({
    kalib: k,
    date: new Date(k.datum),
  }));

  // === Tolerans-trösklar (oförändrade) ===
  const TOL_LEN = 3; // cm – över denna = utanför
  const TOL_DIA = 4; // mm – över denna = utanför
  const lenOut = (v: number) => Math.abs(v) > TOL_LEN;
  const diaOut = (v: number) => Math.abs(v) > TOL_DIA;

  // === Modals ===
  const openStockModal = (stock: DetaljKontrollStock) => {
    const lenDiff = stock.langd_avvikelse_cm;
    const diaDiff = stock.dia_avvikelse_mm;
    const lenCls = Math.abs(lenDiff) > 3 ? 'bad' : Math.abs(lenDiff) > 2 ? 'warn' : 'good';
    const diaCls = Math.abs(diaDiff) > 6 ? 'bad' : Math.abs(diaDiff) > 4 ? 'warn' : 'good';

    setModalContent({
      title: `Stock ${stock.stock_nummer}`,
      subtitle: `Stam ${stock.stam_nummer} • ${stock.kontroll_datum}`,
      body: (
        <>
          <div className="kalib-total-summary">
            <div className="kalib-total-title">Mätjämförelse</div>
            <div className="kalib-total-grid two-col">
              <div className="kalib-total-item">
                <div className="kalib-total-label">Längd maskin</div>
                <div className="kalib-total-value">{stock.maskin_langd_cm}<span className="kalib-total-unit"> cm</span></div>
              </div>
              <div className="kalib-total-item">
                <div className="kalib-total-label">Längd operatör</div>
                <div className="kalib-total-value">{stock.operator_langd_cm}<span className="kalib-total-unit"> cm</span></div>
              </div>
            </div>
          </div>
          <div className="kalib-summary-row" style={{ marginTop: 16 }}>
            <div className="kalib-summary-item">
              <div className="kalib-summary-label">Längd (M−O)</div>
              <div className={`kalib-summary-value ${lenCls === 'bad' ? 'bad' : ''}`}>{lenDiff >= 0 ? '+' : ''}{lenDiff} cm</div>
              <div className={`kalib-diff-badge ${lenCls}`}>{lenCls === 'good' ? 'Inom' : lenCls === 'warn' ? 'Nära gräns' : 'Utanför'}</div>
            </div>
            <div className="kalib-summary-item">
              <div className="kalib-summary-label">Topp ⌀ maskin</div>
              <div className="kalib-summary-value">{stock.maskin_toppdia_mm} mm</div>
              <div className="kalib-summary-hint">op: {stock.operator_toppdia_mm} mm</div>
            </div>
            <div className="kalib-summary-item">
              <div className="kalib-summary-label">Dia (M−O)</div>
              <div className={`kalib-summary-value ${diaCls === 'bad' ? 'bad' : ''}`}>{diaDiff >= 0 ? '+' : ''}{diaDiff} mm</div>
              <div className={`kalib-diff-badge ${diaCls}`}>{diaCls === 'good' ? 'Inom' : diaCls === 'warn' ? 'Nära gräns' : 'Utanför'}</div>
            </div>
          </div>
          {(stock.maskin_volym_sub != null && stock.operator_volym_sub != null) && (
            <div className="kalib-info-box neutral" style={{ marginTop: 16 }}>
              <span className="kalib-info-icon"><MSym name="inventory_2" size={20} color="#fff" /></span>
              <div className="kalib-info-content">
                <div className="kalib-info-title">Volym (m³sub)</div>
                <div className="kalib-info-text">Maskin: {stock.maskin_volym_sub?.toFixed(4)} • Operatör: {stock.operator_volym_sub?.toFixed(4)} • Diff: {stock.volym_avvikelse?.toFixed(4)}</div>
              </div>
            </div>
          )}
        </>
      )
    });
    setModalOpen(true);
  };

  const openStemOverview = (kalib: FaktKalibrering) => {
    const stocks = (stockMap[kalib.filnamn] || []).sort((a, b) => a.stock_nummer - b.stock_nummer);
    const totalLen = stocks.reduce((a, s) => a + s.maskin_langd_cm, 0);

    setModalContent({
      title: `Kontroll ${new Date(kalib.datum).toLocaleDateString('sv-SE')}`,
      subtitle: `${cap(kalib.tradslag)} • ${kalib.antal_kontrollstockar} stockar • ${kalib.status === 'VARNING' ? 'Varning' : 'Inom tolerans'}`,
      body: (
        <>
          <div className="kalib-total-summary">
            <div className="kalib-total-title">Snitt för kontrollen</div>
            <div className="kalib-total-grid">
              <div className="kalib-total-item"><div className="kalib-total-label">Total längd</div><div className="kalib-total-value">{(totalLen / 100).toFixed(1)}<span className="kalib-total-unit"> m</span></div></div>
              <div className="kalib-total-item"><div className="kalib-total-label">Längd (M−O)</div><div className={`kalib-total-value ${lenOut(kalib.langd_avvikelse_snitt_cm) ? 'bad' : ''}`}>{kalib.langd_avvikelse_snitt_cm >= 0 ? '+' : ''}{kalib.langd_avvikelse_snitt_cm}<span className="kalib-total-unit"> cm</span></div></div>
              <div className="kalib-total-item"><div className="kalib-total-label">Dia (M−O)</div><div className={`kalib-total-value ${diaOut(kalib.dia_avvikelse_snitt_mm) ? 'bad' : ''}`}>{kalib.dia_avvikelse_snitt_mm >= 0 ? '+' : ''}{kalib.dia_avvikelse_snitt_mm}<span className="kalib-total-unit"> mm</span></div></div>
            </div>
          </div>
          {stocks.length > 0 && (
            <>
              <div className="kalib-modal-section-header"><div className="kalib-modal-section-title">Per stock</div><div className="kalib-modal-section-subtitle">Tryck för detaljer</div></div>
              <div className="kalib-overview-grid">
                {stocks.map(stock => {
                  const diaDiff = stock.dia_avvikelse_mm;
                  const cls = Math.abs(diaDiff) > 6 ? 'bad' : Math.abs(diaDiff) > 4 ? 'warn' : 'good';
                  return (
                    <div key={stock.id} className="kalib-overview-log" onClick={() => { setModalOpen(false); setTimeout(() => openStockModal(stock), 150); }}>
                      <div className="kalib-overview-num">{stock.stock_nummer}</div>
                      <div className="kalib-overview-info">
                        <div className="kalib-overview-title">Stock {stock.stock_nummer}</div>
                        <div className="kalib-overview-meta">{stock.maskin_langd_cm} cm • Topp ⌀{stock.maskin_toppdia_mm}</div>
                      </div>
                      <div className={`kalib-diff-badge ${cls}`}>{diaDiff >= 0 ? '+' : ''}{diaDiff} mm</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )
    });
    setModalOpen(true);
  };

  const openSpeciesDetail = (species: string) => {
    const data = speciesData[species];
    if (!data) return;
    const name = species === 'gran' ? 'Gran' : species === 'tall' ? 'Tall' : species.charAt(0).toUpperCase() + species.slice(1);
    const speciesKalibs = filteredKalib.filter(k => k.tradslag.toLowerCase() === species).slice(0, 20);

    setModalContent({
      title: name,
      subtitle: `${data.count} kontroller`,
      body: (
        <>
          <div className="kalib-total-summary">
            <div className="kalib-total-title">Snitt för {name.toLowerCase()}</div>
            <div className="kalib-total-grid two-col">
              <div className="kalib-total-item"><div className="kalib-total-label">Längd (M−O)</div><div className={`kalib-total-value ${lenOut(data.lenDiff) ? 'bad' : ''}`}>{data.lenDiff >= 0 ? '+' : ''}{data.lenDiff}<span className="kalib-total-unit"> cm</span></div></div>
              <div className="kalib-total-item"><div className="kalib-total-label">Dia (M−O)</div><div className={`kalib-total-value ${diaOut(data.diaDiff) ? 'bad' : ''}`}>{data.diaDiff >= 0 ? '+' : ''}{data.diaDiff}<span className="kalib-total-unit"> mm</span></div></div>
            </div>
          </div>
          <div className="kalib-modal-section-header"><div className="kalib-modal-section-title">Senaste kontroller</div></div>
          <div className="kalib-overview-grid">
            {speciesKalibs.map(k => {
              const d = new Date(k.datum);
              const cls = diaOut(k.dia_avvikelse_snitt_mm) ? 'bad' : 'good';
              return (
                <div key={k.id} className="kalib-overview-log" onClick={() => { setModalOpen(false); setTimeout(() => openStemOverview(k), 150); }}>
                  <div className="kalib-overview-num">{d.getDate()}</div>
                  <div className="kalib-overview-info">
                    <div className="kalib-overview-title">{d.toLocaleDateString('sv-SE')}</div>
                    <div className="kalib-overview-meta">{k.antal_kontrollstockar} stockar • {k.status === 'VARNING' ? 'Varning' : 'Inom'}</div>
                  </div>
                  <div className={`kalib-diff-badge ${cls}`}>{k.dia_avvikelse_snitt_mm >= 0 ? '+' : ''}{k.dia_avvikelse_snitt_mm} mm</div>
                </div>
              );
            })}
          </div>
          <div className="kalib-info-box neutral">
            <span className="kalib-info-icon"><MSym name="bar_chart" size={20} color="#fff" /></span>
            <div className="kalib-info-content">
              <div className="kalib-info-title">Tillräckligt underlag?</div>
              <div className="kalib-info-text">{data.count >= 5 ? `Ja, ${data.count} kontroller ger ett bra underlag.` : 'Fler kontroller behövs för att dra säkra slutsatser.'}</div>
            </div>
          </div>
        </>
      )
    });
    setModalOpen(true);
  };

  const openCalendarDayModal = (dag: CalDag) => {
    setModalContent({
      title: dagrubrik(dag.datum),
      subtitle: dagstatusText(dag.status),
      body: (
        <>
          {dag.maskiner.map(m => {
            const namn = maskinNamn(m);
            const visaIdRad = !namn.includes(m.maskin_id) && namn !== m.maskin_id;
            return (
            <div key={m.maskin_id} className={`kalib-day-maskin ${m.status === 'inaktiv' ? 'inaktiv' : ''}`}>
              <div className="kalib-day-maskin-header">
                <div>
                  <div className="kalib-day-maskin-namn">{namn}</div>
                  {visaIdRad && <div className="kalib-day-maskin-id">{m.maskin_id}</div>}
                </div>
                <span className={`kalib-status-badge ${m.status}`}>{maskinStatusText(m.status)}</span>
              </div>
              <div className="kalib-day-maskin-meta">
                {m.volym_m3sub} m³fub · {m.status === 'inaktiv' ? 'Inaktiv' : (m.huvudtyp ?? 'Okänd typ')}
              </div>
              {m.huvudtyp_okand && (
                <div className="kalib-day-maskin-info">
                  <MSym name="info" size={14} color="#8E8E93" />
                  <span>Objekttyp ej angiven</span>
                </div>
              )}
              {m.kontroller.length > 0 && (
                <div className="kalib-day-maskin-kontroller">
                  {m.kontroller.map(k => (
                    <div key={k.id} className="kalib-day-maskin-kontroll">
                      {cap(k.tradslag ?? '')} · {kontrollStatusText(k.status)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            );
          })}
        </>
      ),
    });
    setModalOpen(true);
  };

  if (loading) {
    return (
      <>
        <style jsx global>{`
          .kalib-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',sans-serif;color:#8E8E93;background:#000}
          .kalib-spinner{width:32px;height:32px;border:3px solid rgba(255,255,255,0.08);border-top-color:#fff;border-radius:50%;animation:kalibSpin 0.8s linear infinite;margin-bottom:16px}
          @keyframes kalibSpin{to{transform:rotate(360deg)}}
        `}</style>
        <div className="kalib-loading"><div className="kalib-spinner" /><div>Laddar kontrolldata…</div></div>
      </>
    );
  }

  if (allKalib.length === 0) {
    return (
      <>
        <style jsx global>{`
          .kalib-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',sans-serif;color:#8E8E93;text-align:center;padding:40px;background:#000}
          .kalib-empty-icon{margin-bottom:16px;color:#8E8E93}
          .kalib-empty-icon .material-symbols-outlined{font-size:64px}
          .kalib-empty-title{font-size:22px;font-weight:600;color:#fff;margin-bottom:8px}
          .kalib-empty-text{font-size:15px;max-width:320px;color:#8E8E93}
        `}</style>
        <div className="kalib-empty">
          <div className="kalib-empty-icon"><span className="material-symbols-outlined">straighten</span></div>
          <div className="kalib-empty-title">Inga kontrollmätningar</div>
          <div className="kalib-empty-text">När HQC-filer importeras visas kontrolldata här med jämförelser och statistik.</div>
        </div>
      </>
    );
  }

  const reportDate = new Date(allKalib[0].datum).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  const verdictWithinTolerance = !lenOut(avgLenReport) && !diaOut(avgDiaReport);

  return (
    <>
      <style jsx global>{`
        .kalib-page{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',sans-serif;background:#000;color:#fff;line-height:1.45;min-height:100vh;-webkit-font-smoothing:antialiased}
        .kalib-page *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}

        .kalib-nav{display:flex;justify-content:center;gap:8px;padding:12px 20px;background:rgba(0,0,0,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);position:sticky;top:calc(56px + env(safe-area-inset-top));z-index:100;border-bottom:0.5px solid #2C2C2E}
        .kalib-pill{height:38px;padding:0 18px;border-radius:999px;font-size:14px;font-weight:500;color:#8E8E93;background:transparent;border:none;cursor:pointer;font-family:inherit;transition:background 0.15s,color 0.15s}
        .kalib-pill.active{background:#fff;color:#000;font-weight:600}

        .kalib-container{max-width:680px;margin:0 auto;padding:24px 20px 32px}

        .kalib-page-header{margin:0 0 24px}
        .kalib-page-title{font-size:32px;font-weight:700;letter-spacing:-0.02em;line-height:1.1;margin:0 0 6px;color:#fff}
        .kalib-page-subtitle{font-size:15px;color:#8E8E93;margin:0}

        .kalib-card{background:#1C1C1E;border-radius:14px;padding:20px;margin-bottom:12px;border:1px solid rgba(255,255,255,0.06)}
        .kalib-section-title{font-size:17px;font-weight:600;margin:0 0 4px;color:#fff}
        .kalib-section-subtitle{font-size:13px;color:#8E8E93;margin:0 0 18px}

        .kalib-hero-metrics{display:flex;gap:12px;margin-bottom:16px}
        .kalib-hero-metric{flex:1;text-align:center;padding:20px 12px;background:rgba(255,255,255,0.04);border-radius:12px}
        .kalib-hero-metric-value{font-size:36px;font-weight:700;line-height:1;margin-bottom:6px;letter-spacing:-0.02em;color:#fff}
        .kalib-hero-metric-value.bad{color:#FF3B30}
        .kalib-hero-metric-label{font-size:14px;color:#8E8E93;font-weight:500}
        .kalib-hero-metric-hint{font-size:13px;color:#8E8E93;margin-top:4px}

        .kalib-info-box{display:flex;gap:12px;padding:14px 16px;border-radius:12px;align-items:center}
        .kalib-info-box.ok{background:rgba(52,199,89,0.1);border:1px solid rgba(52,199,89,0.2)}
        .kalib-info-box.warn{background:rgba(255,59,48,0.1);border:1px solid rgba(255,59,48,0.2)}
        .kalib-info-box.neutral{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06)}
        .kalib-info-icon{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:28px;height:28px}
        .kalib-info-content{flex:1}
        .kalib-info-title{font-size:14px;font-weight:600;margin-bottom:2px;color:#fff}
        .kalib-info-box.warn .kalib-info-title{color:#FF3B30}
        .kalib-info-text{font-size:13px;color:#8E8E93;line-height:1.4}

        .kalib-stem-viz{overflow-x:auto;padding:8px 0 16px;margin:0 -20px;padding-left:20px;padding-right:20px}
        .kalib-stem-viz-inner{display:flex;align-items:flex-end;gap:8px;min-width:min-content}
        .kalib-stem-label{font-size:11px;color:#8E8E93;padding:0 6px;align-self:center}
        .kalib-log-block{display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:transform 0.15s}
        .kalib-log-block:active{transform:scale(0.96)}
        .kalib-log-body{background:#2C2C2E;border-radius:6px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.06)}
        .kalib-log-num{color:#fff;font-size:14px;font-weight:600}
        .kalib-log-info{text-align:center}
        .kalib-log-length{font-size:12px;font-weight:500;color:#fff}
        .kalib-log-product{font-size:10px;color:#8E8E93}

        .kalib-btn-stem{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:56px;padding:0 20px;margin-top:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;font-size:15px;font-weight:500;color:#fff;cursor:pointer;font-family:inherit}
        .kalib-btn-stem-arrow{color:#8E8E93;display:flex;align-items:center}

        .kalib-bars{display:flex;flex-direction:column;gap:18px}
        .kalib-bar-group{cursor:pointer}
        .kalib-bar-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
        .kalib-bar-species{font-size:15px;font-weight:600;color:#fff}
        .kalib-bar-count{font-size:12px;color:#8E8E93}
        .kalib-bar-row{display:flex;align-items:center;gap:12px;margin-bottom:6px}
        .kalib-bar-label{width:64px;font-size:12px;color:#8E8E93}
        .kalib-bar-track{flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;position:relative;overflow:hidden}
        .kalib-bar-zero{position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.15)}
        .kalib-bar-fill{position:absolute;top:0;bottom:0;border-radius:3px;background:#fff}
        .kalib-bar-fill.bad{background:#FF3B30}
        .kalib-bar-fill.neg{right:50%}
        .kalib-bar-fill.pos{left:50%}
        .kalib-bar-value{width:64px;text-align:right;font-size:13px;font-weight:600;color:#fff}
        .kalib-bar-value.bad{color:#FF3B30}

        .kalib-list{}
        .kalib-list-item{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 0;border-bottom:0.5px solid #2C2C2E;cursor:pointer}
        .kalib-list-item:last-child{border-bottom:none}
        .kalib-list-date{width:48px;text-align:center;flex-shrink:0;white-space:nowrap;font-size:13px;color:#fff}
        .kalib-list-day{font-weight:600}
        .kalib-list-month{color:#8E8E93;margin-left:4px}
        .kalib-list-info{width:88px;flex-shrink:0}
        .kalib-list-species{display:block;font-size:14px;font-weight:500;color:#fff}
        .kalib-list-stem{font-size:12px;color:#8E8E93}
        .kalib-list-bar-container{flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;position:relative}
        .kalib-list-bar{height:100%;border-radius:3px;background:#fff}
        .kalib-list-bar.bad{background:#FF3B30}
        .kalib-list-value{width:70px;text-align:right;font-size:14px;font-weight:600;color:#fff;flex-shrink:0;white-space:nowrap}
        .kalib-list-value.bad{color:#FF3B30}

        /* === Kalender-fliken === */
        .kalib-cal-header{display:flex;align-items:center;justify-content:space-between;padding:10px 0;margin-bottom:14px}
        .kalib-cal-nav{width:44px;height:44px;border-radius:22px;background:#1C1C1E;border:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;font-family:inherit}
        .kalib-cal-nav:active{background:#2A2A2C}
        .kalib-cal-title{font-size:18px;font-weight:600;color:#fff;letter-spacing:-0.01em}

        .kalib-cal-summary{padding:20px}
        .kalib-cal-summary.skeleton .kalib-cal-summary-big,
        .kalib-cal-summary.skeleton .kalib-cal-summary-sub{background:rgba(255,255,255,0.04);border-radius:6px;color:transparent}
        .kalib-cal-summary-big{font-size:24px;font-weight:600;color:#fff;letter-spacing:-0.01em;line-height:1.2}
        .kalib-cal-summary-sub{font-size:13px;color:#8E8E93;margin-top:4px}
        .kalib-cal-summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px}
        .kalib-cal-summary-item{text-align:center;padding:12px 8px;background:rgba(255,255,255,0.04);border-radius:10px}
        .kalib-cal-summary-num{font-size:22px;font-weight:700;line-height:1;letter-spacing:-0.02em;color:#fff}
        .kalib-cal-summary-lbl{font-size:11px;color:#8E8E93;margin-top:6px}

        /* === Globalt maskinfilter — knappband + bottom-sheet === */
        .kalib-filter-row{position:sticky;top:calc(118px + env(safe-area-inset-top));z-index:90;background:rgba(0,0,0,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);padding:8px 20px;border-bottom:0.5px solid #2C2C2E}
        .kalib-filter-btn{display:flex;align-items:center;gap:10px;width:100%;height:44px;padding:0 16px;background:#1C1C1E;border:1px solid rgba(255,255,255,0.06);border-radius:12px;font-family:inherit;font-size:14px;font-weight:500;color:#fff;cursor:pointer}
        .kalib-filter-btn:active{background:#2A2A2C}
        .kalib-filter-label{flex:1;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

        .kalib-sheet-search{width:100%;height:44px;padding:0 14px;margin-bottom:12px;background:#2C2C2E;border:none;border-radius:10px;color:#fff;font-size:15px;outline:none;font-family:inherit}
        .kalib-sheet-search::placeholder{color:#8E8E93}
        .kalib-sheet-list{display:flex;flex-direction:column}
        .kalib-sheet-row{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:0 8px;background:transparent;border:none;border-bottom:0.5px solid #2C2C2E;text-align:left;cursor:pointer;font-family:inherit}
        .kalib-sheet-row:last-child{border-bottom:none}
        .kalib-sheet-row:active{background:rgba(255,255,255,0.04)}
        .kalib-sheet-check{display:flex;align-items:center;justify-content:center;width:24px;flex-shrink:0}
        .kalib-sheet-label{flex:1;font-size:15px;color:#fff;font-weight:500}
        .kalib-sheet-sold{color:#8E8E93;font-weight:400}

        .kalib-cal-weekdays{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:11px;color:#8E8E93;margin-bottom:8px;font-weight:500}
        .kalib-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
        .kalib-cal-cell{aspect-ratio:1;min-height:44px;display:flex;align-items:center;justify-content:center;border-radius:12px;position:relative;padding:8px;font-family:inherit}
        .kalib-cal-cell.empty{visibility:hidden}
        .kalib-cal-cell.clickable{cursor:pointer;min-height:56px}
        .kalib-cal-num{font-size:14px;font-weight:500;color:#fff}
        .kalib-cal-cell.komplett{background:rgba(52,199,89,0.15)}
        .kalib-cal-cell.saknas{background:rgba(255,59,48,0.15)}
        .kalib-cal-cell.saknas .kalib-cal-num{color:#FF3B30}
        .kalib-cal-cell.varning{background:rgba(255,59,48,0.15);border:1.5px solid #FF3B30}
        .kalib-cal-cell.varning .kalib-cal-num{color:#FF3B30}
        .kalib-cal-cell.inaktiv{background:transparent}
        .kalib-cal-cell.inaktiv .kalib-cal-num{color:#8E8E93}
        .kalib-cal-cell.today{box-shadow:inset 0 0 0 1.5px #fff}
        .kalib-cal-cell.skeleton{background:rgba(255,255,255,0.04)}

        .kalib-cal-legend{display:flex;flex-direction:column;gap:6px;margin-top:16px;font-size:11px;color:#8E8E93;align-items:flex-start}
        .kalib-cal-legend-row{display:flex;align-items:center;gap:8px}
        .kalib-cal-legend-dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0}
        .kalib-cal-legend-dot.green{background:#34C759}
        .kalib-cal-legend-dot.red{background:#FF3B30}
        .kalib-cal-legend-dot.red-ring{background:#FF3B30;box-shadow:0 0 0 2px rgba(255,59,48,0.3)}

        .kalib-status-badge{font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;white-space:nowrap;flex-shrink:0}
        .kalib-status-badge.komplett{color:#34C759;background:rgba(52,199,89,0.15)}
        .kalib-status-badge.saknas{color:#FF3B30;background:rgba(255,59,48,0.12)}
        .kalib-status-badge.varning{color:#FF3B30;background:rgba(255,59,48,0.12)}
        .kalib-status-badge.inaktiv{color:#8E8E93;background:rgba(255,255,255,0.04)}

        .kalib-day-maskin{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;margin-bottom:8px}
        .kalib-day-maskin.inaktiv{opacity:0.5}
        .kalib-day-maskin-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
        .kalib-day-maskin-namn{font-size:15px;font-weight:600;color:#fff}
        .kalib-day-maskin-id{font-size:12px;color:#8E8E93;margin-top:2px}
        .kalib-day-maskin-meta{font-size:13px;color:#fff}
        .kalib-day-maskin-info{display:flex;align-items:center;gap:6px;font-size:12px;color:#8E8E93;margin-top:4px}
        .kalib-day-maskin-kontroller{display:flex;flex-direction:column;gap:4px;margin-top:10px;padding-top:10px;border-top:0.5px solid #2C2C2E}
        .kalib-day-maskin-kontroll{font-size:13px;color:#8E8E93}

        .kalib-report{background:#1C1C1E;border-radius:14px;padding:24px 20px;border:1px solid rgba(255,255,255,0.06)}
        .kalib-report-header{display:flex;align-items:center;gap:14px;padding-bottom:18px;border-bottom:0.5px solid #2C2C2E;margin-bottom:20px}
        .kalib-report-title-block{flex:1}
        .kalib-report-title{font-size:18px;font-weight:600;color:#fff}
        .kalib-report-date{font-size:12px;color:#8E8E93;text-align:right}
        .kalib-report-section{margin-bottom:22px}
        .kalib-report-section-title{font-size:13px;font-weight:600;color:#fff;margin:0 0 4px}
        .kalib-report-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
        .kalib-report-metric{text-align:center;padding:14px 8px;background:rgba(255,255,255,0.04);border-radius:10px}
        .kalib-report-metric-value{font-size:24px;font-weight:700;line-height:1;color:#fff;letter-spacing:-0.02em}
        .kalib-report-metric-value.bad{color:#FF3B30}
        .kalib-report-metric-label{font-size:11px;color:#8E8E93;margin-top:8px}
        .kalib-report-results{display:flex;flex-direction:column;gap:14px;margin-bottom:18px}
        .kalib-report-result{display:flex;align-items:center;gap:14px}
        .kalib-report-result-label{width:72px;font-size:13px;color:#8E8E93}
        .kalib-report-result-bar{flex:1}
        .kalib-report-bar-track{height:8px;background:rgba(255,255,255,0.08);border-radius:4px;position:relative;overflow:hidden}
        .kalib-report-bar-zero{position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.15)}
        .kalib-report-bar-fill{position:absolute;top:0;height:100%;border-radius:4px;background:#fff}
        .kalib-report-bar-fill.bad{background:#FF3B30}
        .kalib-report-result-value{width:72px;text-align:right;font-size:14px;font-weight:600;color:#fff}
        .kalib-report-result-value.bad{color:#FF3B30}
        .kalib-verdict{display:flex;align-items:center;gap:12px;padding:14px;border-radius:12px}
        .kalib-verdict.good{background:rgba(52,199,89,0.1);border:1px solid rgba(52,199,89,0.2)}
        .kalib-verdict.bad{background:rgba(255,59,48,0.1);border:1px solid rgba(255,59,48,0.2)}
        .kalib-verdict-icon{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .kalib-verdict.good .kalib-verdict-icon{background:#34C759;color:#000}
        .kalib-verdict.bad .kalib-verdict-icon{background:#FF3B30;color:#fff}
        .kalib-verdict-title{font-size:14px;font-weight:600;color:#fff}
        .kalib-verdict.bad .kalib-verdict-title{color:#FF3B30}
        .kalib-verdict-desc{font-size:12px;color:#8E8E93;margin-top:2px}
        .kalib-species-table{border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.06)}
        .kalib-table-header{display:grid;grid-template-columns:1fr 70px 70px 80px;padding:10px 14px;background:rgba(255,255,255,0.04);font-size:11px;color:#8E8E93;font-weight:500}
        .kalib-table-row{display:grid;grid-template-columns:1fr 70px 70px 80px;padding:14px;border-top:0.5px solid #2C2C2E;font-size:13px;cursor:pointer;color:#fff;align-items:center}
        .kalib-table-row > span.bad{color:#FF3B30;font-weight:600}
        .kalib-report-footer{display:flex;justify-content:flex-end;padding-top:18px;border-top:0.5px solid #2C2C2E;margin-top:22px}
        .kalib-report-machine{text-align:right;font-size:13px;color:#fff}
        .kalib-report-machine-sub{font-size:11px;color:#8E8E93;margin-top:2px}

        .kalib-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:200;display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.25s}
        .kalib-modal-overlay.open{opacity:1;pointer-events:auto}
        .kalib-modal{background:#1C1C1E;width:100%;max-width:560px;max-height:88vh;border-radius:20px 20px 0 0;padding:10px 20px 28px;border:1px solid rgba(255,255,255,0.06);border-bottom:none;transform:translateY(100%);transition:transform 0.3s cubic-bezier(0.2,0.8,0.2,1);overflow-y:auto}
        .kalib-modal-overlay.open .kalib-modal{transform:translateY(0)}
        .kalib-modal-handle{width:36px;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;margin:0 auto 14px}
        .kalib-modal-header{text-align:center;margin-bottom:18px}
        .kalib-modal-title{font-size:20px;font-weight:600;color:#fff}
        .kalib-modal-subtitle{font-size:13px;color:#8E8E93;margin-top:2px}
        .kalib-modal-close{display:block;width:100%;min-height:56px;padding:0 14px;margin-top:16px;background:#2A2A2C;border:1px solid rgba(255,255,255,0.06);border-radius:12px;font-size:15px;font-weight:500;color:#fff;cursor:pointer;font-family:inherit}
        .kalib-modal-section-header{margin:22px 0 10px}
        .kalib-modal-section-title{font-size:14px;font-weight:600;color:#fff}
        .kalib-modal-section-subtitle{font-size:12px;color:#8E8E93;margin-top:2px}

        .kalib-summary-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:14px;background:rgba(255,255,255,0.04);border-radius:12px}
        .kalib-summary-item{text-align:center}
        .kalib-summary-label{font-size:11px;color:#8E8E93;margin-bottom:4px}
        .kalib-summary-value{font-size:17px;font-weight:600;color:#fff}
        .kalib-summary-value.bad{color:#FF3B30}
        .kalib-summary-hint{font-size:10px;color:#8E8E93;margin-top:2px}

        .kalib-diff-badge{font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;display:inline-block;margin-top:4px}
        .kalib-diff-badge.good{color:#fff;background:rgba(255,255,255,0.08)}
        .kalib-diff-badge.warn{color:#8E8E93;background:rgba(255,255,255,0.04)}
        .kalib-diff-badge.bad{color:#FF3B30;background:rgba(255,59,48,0.12)}

        .kalib-total-summary{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:18px}
        .kalib-total-title{font-size:12px;font-weight:600;color:#8E8E93;margin-bottom:14px}
        .kalib-total-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
        .kalib-total-grid.two-col{grid-template-columns:repeat(2,1fr)}
        .kalib-total-item{text-align:center}
        .kalib-total-label{font-size:11px;color:#8E8E93;margin-bottom:4px}
        .kalib-total-value{font-size:24px;font-weight:600;color:#fff;letter-spacing:-0.01em}
        .kalib-total-value.bad{color:#FF3B30}
        .kalib-total-value.small{font-size:18px}
        .kalib-total-unit{font-size:13px;font-weight:400;color:#8E8E93}

        .kalib-overview-grid{display:flex;flex-direction:column;gap:6px}
        .kalib-overview-log{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;cursor:pointer}
        .kalib-overview-num{width:32px;height:32px;background:rgba(255,255,255,0.06);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:#fff;flex-shrink:0}
        .kalib-overview-info{flex:1;min-width:0}
        .kalib-overview-title{font-size:14px;font-weight:500;color:#fff}
        .kalib-overview-meta{font-size:12px;color:#8E8E93;margin-top:2px}

        @media(max-width:480px){
          .kalib-page-title{font-size:28px}
          .kalib-hero-metric-value{font-size:32px}
          .kalib-container{padding:20px 16px 32px}
          .kalib-report-metrics{grid-template-columns:repeat(2,1fr)}
        }
      `}</style>

      <div className="kalib-page">
        <nav className="kalib-nav">
          <button className={`kalib-pill ${activeTab === 'today' ? 'active' : ''}`} onClick={() => setActiveTab('today')}>Senaste</button>
          <button className={`kalib-pill ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>Historik</button>
          <button className={`kalib-pill ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>Kalender</button>
          <button className={`kalib-pill ${activeTab === 'report' ? 'active' : ''}`} onClick={() => setActiveTab('report')}>Rapport</button>
        </nav>

        {activeTab !== 'today' && (
          <div className="kalib-filter-row">
            <button className="kalib-filter-btn" onClick={() => { setModalOpen(false); setMaskinSearchQ(''); setMaskinSheetOpen(true); }}>
              <MSym name="tune" size={16} color="#fff" />
              <span className="kalib-filter-label">{filterLabel}</span>
              <MSym name="expand_more" size={16} color="#8E8E93" />
            </button>
          </div>
        )}

        <div className="kalib-container">
          {activeTab === 'today' && latestKalib && (
            <>
              <header className="kalib-page-header">
                <h1 className="kalib-page-title">{cap(latestKalib.tradslag)}</h1>
                <p className="kalib-page-subtitle">{latestKalib.antal_kontrollstockar} stockar • {new Date(latestKalib.datum).toLocaleDateString('sv-SE')} • {latestKalib.maskin_id}</p>
              </header>

              <div className="kalib-card">
                <div className="kalib-section-title" style={{ marginBottom: 18 }}>Avvikelse från operatör</div>
                <div className="kalib-hero-metrics">
                  <div className="kalib-hero-metric">
                    <div className={`kalib-hero-metric-value ${lenOut(latestKalib.langd_avvikelse_snitt_cm) ? 'bad' : ''}`}>
                      {latestKalib.langd_avvikelse_snitt_cm >= 0 ? '+' : ''}{latestKalib.langd_avvikelse_snitt_cm}
                    </div>
                    <div className="kalib-hero-metric-label">Längd (cm)</div>
                    <div className="kalib-hero-metric-hint">min {latestKalib.langd_avvikelse_min_cm} / max {latestKalib.langd_avvikelse_max_cm}</div>
                  </div>
                  <div className="kalib-hero-metric">
                    <div className={`kalib-hero-metric-value ${diaOut(latestKalib.dia_avvikelse_snitt_mm) ? 'bad' : ''}`}>
                      {latestKalib.dia_avvikelse_snitt_mm >= 0 ? '+' : ''}{latestKalib.dia_avvikelse_snitt_mm}
                    </div>
                    <div className="kalib-hero-metric-label">Diameter (mm)</div>
                    <div className="kalib-hero-metric-hint">min {latestKalib.dia_avvikelse_min_mm} / max {latestKalib.dia_avvikelse_max_mm}</div>
                  </div>
                </div>
                {latestKalib.status === 'VARNING' ? (
                  <div className="kalib-info-box warn">
                    <span className="kalib-info-icon"><MSym name="warning" size={22} color="#FF3B30" /></span>
                    <div className="kalib-info-content">
                      <div className="kalib-info-title">Utanför tolerans</div>
                      <div className="kalib-info-text">Utanför tolerans. Kontrollera kalibreringen.</div>
                    </div>
                  </div>
                ) : (
                  <div className="kalib-info-box ok">
                    <span className="kalib-info-icon"><MSym name="check_circle" size={22} color="#34C759" /></span>
                    <div className="kalib-info-content">
                      <div className="kalib-info-title">Inom tolerans</div>
                      <div className="kalib-info-text">Allt inom tolerans.</div>
                    </div>
                  </div>
                )}
              </div>

              {latestStockar.length > 0 && (
                <div className="kalib-card">
                  <div className="kalib-section-title">Stockar</div>
                  <div className="kalib-section-subtitle">{cap(latestKalib.tradslag)} • {latestStockar.length} stockar • {(totalLatestLen / 100).toFixed(1)} meter • Tryck för detaljer</div>
                  <div className="kalib-stem-viz">
                    <div className="kalib-stem-viz-inner">
                      <span className="kalib-stem-label">Rot</span>
                      {latestStockar.map(stock => {
                        const baseW = 40 + Math.min(60, stock.maskin_langd_cm / 8);
                        const baseH = 25 + Math.min(50, stock.maskin_toppdia_mm / 3);
                        return (
                          <div key={stock.id} className="kalib-log-block" onClick={() => openStockModal(stock)}>
                            <div className="kalib-log-body" style={{ width: baseW, height: baseH }}>
                              <span className="kalib-log-num">{stock.stock_nummer}</span>
                            </div>
                            <div className="kalib-log-info">
                              <div className="kalib-log-length">{stock.maskin_langd_cm} cm</div>
                              <div className="kalib-log-product">⌀{stock.maskin_toppdia_mm}</div>
                            </div>
                          </div>
                        );
                      })}
                      <span className="kalib-stem-label">Topp</span>
                    </div>
                  </div>
                  {latestStockar.length > 1 && (
                    <button className="kalib-btn-stem" onClick={() => openStemOverview(latestKalib)}>
                      <span>Visa alla stockar</span>
                      <span className="kalib-btn-stem-arrow"><MSym name="chevron_right" size={20} color="#8E8E93" /></span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <>
              <div className="kalib-card">
                <div className="kalib-section-title">Per trädslag</div>
                <div className="kalib-bars">
                  {Object.entries(speciesData).map(([key, data]) => {
                    const name = key === 'gran' ? 'Gran' : key === 'tall' ? 'Tall' : key.charAt(0).toUpperCase() + key.slice(1);
                    const lenBad = lenOut(data.lenDiff);
                    const diaBad = diaOut(data.diaDiff);
                    return (
                      <div key={key} className="kalib-bar-group" onClick={() => openSpeciesDetail(key)}>
                        <div className="kalib-bar-header">
                          <span className="kalib-bar-species">{name}</span>
                          <span className="kalib-bar-count">{data.count} kontroller</span>
                        </div>
                        <div className="kalib-bar-row">
                          <span className="kalib-bar-label">Längd</span>
                          <div className="kalib-bar-track">
                            <div className="kalib-bar-zero" />
                            <div className={`kalib-bar-fill ${data.lenDiff < 0 ? 'neg' : 'pos'} ${lenBad ? 'bad' : ''}`} style={{ width: `${Math.min(50, Math.abs(data.lenDiff) * 10)}%` }} />
                          </div>
                          <span className={`kalib-bar-value ${lenBad ? 'bad' : ''}`}>{data.lenDiff >= 0 ? '+' : ''}{data.lenDiff} cm</span>
                        </div>
                        <div className="kalib-bar-row">
                          <span className="kalib-bar-label">Diameter</span>
                          <div className="kalib-bar-track">
                            <div className="kalib-bar-zero" />
                            <div className={`kalib-bar-fill ${data.diaDiff < 0 ? 'neg' : 'pos'} ${diaBad ? 'bad' : ''}`} style={{ width: `${Math.min(50, Math.abs(data.diaDiff) * 10)}%` }} />
                          </div>
                          <span className={`kalib-bar-value ${diaBad ? 'bad' : ''}`}>{data.diaDiff >= 0 ? '+' : ''}{data.diaDiff} mm</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="kalib-card">
                <div className="kalib-section-title">Senaste kontrollerna</div>
                <div className="kalib-list">
                  {historyList.map(({ kalib: k, date }) => {
                    const day = date.getDate();
                    const monthShort = date.toLocaleDateString('sv-SE', { month: 'short' }).replace('.', '');
                    const isOut = k.status === 'VARNING' || diaOut(k.dia_avvikelse_snitt_mm);
                    return (
                      <div key={k.id} className="kalib-list-item" onClick={() => openStemOverview(k)}>
                        <div className="kalib-list-date">
                          <span className="kalib-list-day">{day}</span>
                          <span className="kalib-list-month">{monthShort}</span>
                        </div>
                        <div className="kalib-list-info">
                          <span className="kalib-list-species">{cap(k.tradslag)}</span>
                          <span className="kalib-list-stem">{k.antal_kontrollstockar} stockar</span>
                        </div>
                        <div className="kalib-list-bar-container">
                          <div className={`kalib-list-bar ${isOut ? 'bad' : ''}`} style={{ width: `${Math.min(100, Math.abs(k.dia_avvikelse_snitt_mm) * 20)}%` }} />
                        </div>
                        <span className={`kalib-list-value ${isOut ? 'bad' : ''}`}>{k.dia_avvikelse_snitt_mm >= 0 ? '+' : ''}{k.dia_avvikelse_snitt_mm} mm</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </>
          )}

          {activeTab === 'calendar' && (
            <>
              <div className="kalib-cal-header">
                <button className="kalib-cal-nav" onClick={() => setCalManad(stegManad(calManad, -1))} aria-label="Föregående månad">
                  <MSym name="chevron_left" size={24} color="#fff" />
                </button>
                <div className="kalib-cal-title">{manadNamn(calManad)}</div>
                <button className="kalib-cal-nav" onClick={() => setCalManad(stegManad(calManad, 1))} aria-label="Nästa månad">
                  <MSym name="chevron_right" size={24} color="#fff" />
                </button>
              </div>

              {calError && !calLoading && (
                <div className="kalib-info-box neutral" style={{ marginBottom: 12 }}>
                  <span className="kalib-info-icon"><MSym name="error" size={20} color="#8E8E93" /></span>
                  <div className="kalib-info-content">
                    <div className="kalib-info-title">Kunde inte ladda kalendern</div>
                    <div className="kalib-info-text">{calError}</div>
                  </div>
                </div>
              )}

              {calLoading && (
                <>
                  <div className="kalib-card kalib-cal-summary skeleton">
                    <div className="kalib-cal-summary-big">&nbsp;</div>
                    <div className="kalib-cal-summary-sub">&nbsp;</div>
                  </div>
                  <div className="kalib-card">
                    <div className="kalib-cal-weekdays"><span>M</span><span>T</span><span>O</span><span>T</span><span>F</span><span>L</span><span>S</span></div>
                    <div className="kalib-cal-grid">
                      {Array.from({ length: 35 }).map((_, i) => (
                        <div key={i} className="kalib-cal-cell skeleton" />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {!calLoading && calData && filteredSammanfattning && (() => {
                const sf = filteredSammanfattning;
                const subManad = manadNamn(calManad).toLowerCase();
                const todayStr = idagStr();
                const leadingEmpty = calData.dagar.length > 0 ? calData.dagar[0].veckodag - 1 : 0;
                const totalCells = leadingEmpty + calData.dagar.length;
                const trailingEmpty = (7 - (totalCells % 7)) % 7;
                return (
                  <>
                    <div className="kalib-card kalib-cal-summary">
                      <div className="kalib-cal-summary-big">{sf.kompletta} av {sf.produktionsdagar} dagar kompletta</div>
                      <div className="kalib-cal-summary-sub">i {subManad}</div>
                      <div className="kalib-cal-summary-grid">
                        <div className="kalib-cal-summary-item">
                          <div className="kalib-cal-summary-num" style={{ color: '#FF3B30' }}>{sf.saknas}</div>
                          <div className="kalib-cal-summary-lbl">Saknas</div>
                        </div>
                        <div className="kalib-cal-summary-item">
                          <div className="kalib-cal-summary-num" style={{ color: '#FF3B30' }}>{sf.varningar}</div>
                          <div className="kalib-cal-summary-lbl">Varningar</div>
                        </div>
                        <div className="kalib-cal-summary-item">
                          <div className="kalib-cal-summary-num" style={{ color: '#8E8E93' }}>{sf.okand_huvudtyp_dagar}</div>
                          <div className="kalib-cal-summary-lbl">Okänd typ</div>
                        </div>
                      </div>
                    </div>

                    <div className="kalib-card">
                      <div className="kalib-cal-weekdays"><span>M</span><span>T</span><span>O</span><span>T</span><span>F</span><span>L</span><span>S</span></div>
                      <div className="kalib-cal-grid">
                        {Array.from({ length: leadingEmpty }).map((_, i) => (
                          <div key={`l${i}`} className="kalib-cal-cell empty" />
                        ))}
                        {calData.dagar.map(dag => {
                          const day = parseInt(dag.datum.slice(-2), 10);
                          const isToday = dag.datum === todayStr;
                          const cellStatus = aggregeraDagFiltrerat(dag, effectiveSelected);
                          const isClickable = cellStatus !== 'inaktiv';
                          const cls = `kalib-cal-cell ${cellStatus} ${isToday ? 'today' : ''} ${isClickable ? 'clickable' : ''}`.trim();
                          return (
                            <div
                              key={dag.datum}
                              className={cls}
                              onClick={isClickable ? () => openCalendarDayModal(dag) : undefined}
                            >
                              <span className="kalib-cal-num">{day}</span>
                            </div>
                          );
                        })}
                        {Array.from({ length: trailingEmpty }).map((_, i) => (
                          <div key={`t${i}`} className="kalib-cal-cell empty" />
                        ))}
                      </div>
                      <div className="kalib-cal-legend">
                        <div className="kalib-cal-legend-row"><span className="kalib-cal-legend-dot green" />Kontroll lämnad</div>
                        <div className="kalib-cal-legend-row"><span className="kalib-cal-legend-dot red" />Saknas</div>
                        <div className="kalib-cal-legend-row"><span className="kalib-cal-legend-dot red-ring" />Varning</div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {activeTab === 'report' && (
            <div className="kalib-report">
              <div className="kalib-report-header">
                <div className="kalib-report-title-block">
                  <div className="kalib-report-title">Kvalitetsrapport</div>
                </div>
                <div className="kalib-report-date">{reportDate}</div>
              </div>

              <div className="kalib-report-section">
                <div className="kalib-report-section-title">Nyckeltal</div>
                <div className="kalib-report-metrics">
                  <div className="kalib-report-metric">
                    <div className="kalib-report-metric-value">{filteredKalib.length}</div>
                    <div className="kalib-report-metric-label">Kontroller</div>
                  </div>
                  <div className="kalib-report-metric">
                    <div className="kalib-report-metric-value">{totalStockar}</div>
                    <div className="kalib-report-metric-label">Kontrollstockar</div>
                  </div>
                  <div className="kalib-report-metric">
                    <div className="kalib-report-metric-value">{calibCount}</div>
                    <div className="kalib-report-metric-label">Kalibreringar</div>
                  </div>
                  <div className="kalib-report-metric">
                    <div className={`kalib-report-metric-value ${filteredKalib.filter(k => k.status === 'VARNING').length > 0 ? 'bad' : ''}`}>{filteredKalib.filter(k => k.status === 'VARNING').length}</div>
                    <div className="kalib-report-metric-label">Varningar</div>
                  </div>
                </div>
              </div>

              <div className="kalib-report-section">
                <div className="kalib-report-section-title">Avvikelse</div>
                <div className="kalib-report-results">
                  <div className="kalib-report-result">
                    <div className="kalib-report-result-label">Längd</div>
                    <div className="kalib-report-result-bar">
                      <div className="kalib-report-bar-track">
                        <div className="kalib-report-bar-zero" />
                        <div className={`kalib-report-bar-fill ${lenOut(avgLenReport) ? 'bad' : ''}`} style={{ width: `${Math.min(50, Math.abs(avgLenReport) * 10)}%`, ...(avgLenReport >= 0 ? { left: '50%' } : { right: '50%' }) }} />
                      </div>
                    </div>
                    <div className={`kalib-report-result-value ${lenOut(avgLenReport) ? 'bad' : ''}`}>{avgLenReport >= 0 ? '+' : ''}{avgLenReport} cm</div>
                  </div>
                  <div className="kalib-report-result">
                    <div className="kalib-report-result-label">Diameter</div>
                    <div className="kalib-report-result-bar">
                      <div className="kalib-report-bar-track">
                        <div className="kalib-report-bar-zero" />
                        <div className={`kalib-report-bar-fill ${diaOut(avgDiaReport) ? 'bad' : ''}`} style={{ width: `${Math.min(50, Math.abs(avgDiaReport) * 10)}%`, ...(avgDiaReport >= 0 ? { left: '50%' } : { right: '50%' }) }} />
                      </div>
                    </div>
                    <div className={`kalib-report-result-value ${diaOut(avgDiaReport) ? 'bad' : ''}`}>{avgDiaReport >= 0 ? '+' : ''}{avgDiaReport} mm</div>
                  </div>
                </div>
                <div className={`kalib-verdict ${verdictWithinTolerance ? 'good' : 'bad'}`}>
                  <div className="kalib-verdict-icon">
                    <MSym name={verdictWithinTolerance ? 'check' : 'priority_high'} size={20} color={verdictWithinTolerance ? '#000' : '#fff'} />
                  </div>
                  <div>
                    <div className="kalib-verdict-title">{verdictWithinTolerance ? 'Inom tolerans' : 'Utanför tolerans'}</div>
                    <div className="kalib-verdict-desc">{verdictWithinTolerance ? 'Avvikelserna ligger inom godkända gränsvärden' : 'Avvikelserna överstiger rekommenderade gränsvärden'}</div>
                  </div>
                </div>
              </div>

              <div className="kalib-report-section">
                <div className="kalib-report-section-title">Per trädslag</div>
                <div className="kalib-species-table">
                  <div className="kalib-table-header"><span></span><span>Kontroller</span><span>Längd</span><span>Diameter</span></div>
                  {Object.entries(speciesData).map(([key, data]) => {
                    const name = key === 'gran' ? 'Gran' : key === 'tall' ? 'Tall' : key.charAt(0).toUpperCase() + key.slice(1);
                    return (
                      <div key={key} className="kalib-table-row" onClick={() => openSpeciesDetail(key)}>
                        <span>{name}</span>
                        <span>{data.count}</span>
                        <span className={lenOut(data.lenDiff) ? 'bad' : ''}>{data.lenDiff >= 0 ? '+' : ''}{data.lenDiff} cm</span>
                        <span className={diaOut(data.diaDiff) ? 'bad' : ''}>{data.diaDiff >= 0 ? '+' : ''}{data.diaDiff} mm</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {filteredKalib.length > 0 && (
                <div className="kalib-report-footer">
                  <div className="kalib-report-machine">
                    <div>{filteredKalib[0].maskin_id}</div>
                    <div className="kalib-report-machine-sub">{filteredKalib.length} kontroller totalt</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`kalib-modal-overlay ${modalOpen ? 'open' : ''}`} onClick={() => setModalOpen(false)}>
          <div className="kalib-modal" onClick={e => e.stopPropagation()}>
            <div className="kalib-modal-handle" />
            <div className="kalib-modal-header">
              <div className="kalib-modal-title">{modalContent?.title}</div>
              <div className="kalib-modal-subtitle">{modalContent?.subtitle}</div>
            </div>
            <div>{modalContent?.body}</div>
            <button className="kalib-modal-close" onClick={() => setModalOpen(false)}>Stäng</button>
          </div>
        </div>

        {/* === Maskin-filter sheet === */}
        <div className={`kalib-modal-overlay ${maskinSheetOpen ? 'open' : ''}`} onClick={() => setMaskinSheetOpen(false)}>
          <div className="kalib-modal" onClick={e => e.stopPropagation()}>
            <div className="kalib-modal-handle" />
            <div className="kalib-modal-header">
              <div className="kalib-modal-title">Maskin</div>
            </div>
            {alleMaskiner.length > 10 && (
              <input
                type="text"
                className="kalib-sheet-search"
                placeholder="Sök maskin"
                value={maskinSearchQ}
                onChange={e => setMaskinSearchQ(e.target.value)}
              />
            )}
            <div className="kalib-sheet-list">
              <button
                className="kalib-sheet-row"
                onClick={() => { setSelectedMaskinId('all'); setMaskinSheetOpen(false); }}
              >
                <span className="kalib-sheet-check">{selectedMaskinId === 'all' && <MSym name="check" size={20} color="#fff" />}</span>
                <span className="kalib-sheet-label">Alla maskiner</span>
              </button>
              {alleMaskiner
                .filter(m => {
                  if (!maskinSearchQ.trim()) return true;
                  return maskinNamn(m).toLowerCase().includes(maskinSearchQ.trim().toLowerCase());
                })
                .map(m => {
                  const isSold = m.aktiv_till !== null && m.aktiv_till < idagStr();
                  const namn = maskinNamn(m);
                  return (
                    <button
                      key={m.maskin_id}
                      className="kalib-sheet-row"
                      onClick={() => { setSelectedMaskinId(m.maskin_id); setMaskinSheetOpen(false); }}
                    >
                      <span className="kalib-sheet-check">{effectiveSelected === m.maskin_id && <MSym name="check" size={20} color="#fff" />}</span>
                      <span className="kalib-sheet-label">
                        {namn}
                        {isSold && <span className="kalib-sheet-sold"> (såld)</span>}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
