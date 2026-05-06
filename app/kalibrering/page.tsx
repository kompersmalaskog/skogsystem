'use client';

import { useState, useEffect } from 'react';
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

export default function KalibreringPage() {
  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'report'>('today');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<{ title: string; subtitle: string; body: React.ReactNode } | null>(null);
  const [loading, setLoading] = useState(true);

  const [allKalib, setAllKalib] = useState<FaktKalibrering[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, DetaljKontrollStock[]>>({});
  const [historik, setHistorik] = useState<KalibHistorik[]>([]);

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
  const latestKalib = allKalib.length > 0 ? allKalib[0] : null;
  const latestStockar = latestKalib ? (stockMap[latestKalib.filnamn] || []).sort((a, b) => a.stock_nummer - b.stock_nummer) : [];
  const totalLatestLen = latestStockar.reduce((a, s) => a + s.maskin_langd_cm, 0);

  // Per-species stats (weighted by antal_kontrollstockar)
  const speciesData: Record<string, { count: number; totalStockar: number; lenDiff: number; diaDiff: number }> = {};
  allKalib.forEach(k => {
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

  // Report averages (weighted)
  const totalStockar = allKalib.reduce((a, k) => a + k.antal_kontrollstockar, 0);
  const avgLenReport = totalStockar > 0 ? Math.round(allKalib.reduce((a, k) => a + k.langd_avvikelse_snitt_cm * k.antal_kontrollstockar, 0) / totalStockar * 10) / 10 : 0;
  const avgDiaReport = totalStockar > 0 ? Math.round(allKalib.reduce((a, k) => a + k.dia_avvikelse_snitt_mm * k.antal_kontrollstockar, 0) / totalStockar * 10) / 10 : 0;

  // Unique calibration adjustments
  const kalibFileSet = new Set(historik.map(h => h.filnamn));
  const calibCount = kalibFileSet.size;

  // Calendar
  const calendarMonth = allKalib.length > 0 ? new Date(allKalib[0].datum) : new Date();
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const monthName = new Date(year, month).toLocaleDateString('sv-SE', { month: 'long' });

  // Group kalib by day
  const kalibByDay: Record<number, FaktKalibrering[]> = {};
  allKalib.forEach(k => {
    const d = new Date(k.datum);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!kalibByDay[day]) kalibByDay[day] = [];
      kalibByDay[day].push(k);
    }
  });

  const calendarDays: { day: number | null; check?: boolean; calib?: boolean; warn?: boolean; off?: boolean; today?: boolean }[] = [];
  for (let i = 0; i < firstDow; i++) calendarDays.push({ day: null });
  const todayDate = new Date();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (firstDow + d - 1) % 7;
    const isWeekend = dow >= 5;
    const dayKalibs = kalibByDay[d];
    const isToday = todayDate.getFullYear() === year && todayDate.getMonth() === month && todayDate.getDate() === d;
    const hasWarning = dayKalibs?.some(k => k.status === 'VARNING');
    const hasCalib = dayKalibs?.some(k => kalibFileSet.has(k.filnamn));
    calendarDays.push({
      day: d,
      off: isWeekend && !dayKalibs,
      check: !!dayKalibs && !hasWarning,
      warn: hasWarning,
      calib: hasCalib && !hasWarning,
      today: isToday,
    });
  }

  // History list
  const historyList = allKalib.slice(0, 30).map(k => ({
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
      subtitle: `${kalib.tradslag} • ${kalib.antal_kontrollstockar} stockar • ${kalib.status === 'VARNING' ? 'Varning' : 'Inom tolerans'}`,
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

  const openDayModal = (day: number) => {
    const dayKalibs = kalibByDay[day];
    if (!dayKalibs || dayKalibs.length === 0) return;
    const k = dayKalibs[0];
    const stocks = (stockMap[k.filnamn] || []).sort((a, b) => a.stock_nummer - b.stock_nummer);
    const dayHistorik = historik.filter(h => h.filnamn === k.filnamn);

    setModalContent({
      title: `${day} ${monthName}`,
      subtitle: `${dayKalibs.length} kontroll${dayKalibs.length > 1 ? 'er' : ''} • ${k.status === 'VARNING' ? 'Varning' : 'Inom tolerans'}`,
      body: (
        <>
          <div className="kalib-total-summary">
            <div className="kalib-total-title">Dagens mätning</div>
            <div className="kalib-total-grid">
              <div className="kalib-total-item"><div className="kalib-total-label">Trädslag</div><div className="kalib-total-value small">{k.tradslag}</div></div>
              <div className="kalib-total-item"><div className="kalib-total-label">Längd (M−O)</div><div className={`kalib-total-value ${lenOut(k.langd_avvikelse_snitt_cm) ? 'bad' : ''}`}>{k.langd_avvikelse_snitt_cm >= 0 ? '+' : ''}{k.langd_avvikelse_snitt_cm}<span className="kalib-total-unit"> cm</span></div></div>
              <div className="kalib-total-item"><div className="kalib-total-label">Dia (M−O)</div><div className={`kalib-total-value ${diaOut(k.dia_avvikelse_snitt_mm) ? 'bad' : ''}`}>{k.dia_avvikelse_snitt_mm >= 0 ? '+' : ''}{k.dia_avvikelse_snitt_mm}<span className="kalib-total-unit"> mm</span></div></div>
            </div>
          </div>
          {stocks.length > 0 && (
            <>
              <div className="kalib-modal-section-header"><div className="kalib-modal-section-title">Stockar</div></div>
              <div className="kalib-overview-grid">
                {stocks.map(stock => {
                  const cls = Math.abs(stock.dia_avvikelse_mm) > 6 ? 'bad' : Math.abs(stock.dia_avvikelse_mm) > 4 ? 'warn' : 'good';
                  return (
                    <div key={stock.id} className="kalib-overview-log" onClick={() => { setModalOpen(false); setTimeout(() => openStockModal(stock), 150); }}>
                      <div className="kalib-overview-num">{stock.stock_nummer}</div>
                      <div className="kalib-overview-info">
                        <div className="kalib-overview-title">Stock {stock.stock_nummer}</div>
                        <div className="kalib-overview-meta">{stock.maskin_langd_cm} cm • ⌀{stock.maskin_toppdia_mm}</div>
                      </div>
                      <div className={`kalib-diff-badge ${cls}`}>{stock.dia_avvikelse_mm >= 0 ? '+' : ''}{stock.dia_avvikelse_mm} mm</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {dayHistorik.length > 0 && (
            <>
              <div className="kalib-modal-section-header"><div className="kalib-modal-section-title">Kalibreringshistorik</div></div>
              {dayHistorik.map(h => (
                <div key={h.id} className="kalib-info-box neutral" style={{ marginBottom: 8 }}>
                  <span className="kalib-info-icon"><MSym name="tune" size={20} color="#fff" /></span>
                  <div className="kalib-info-content">
                    <div className="kalib-info-title">{h.typ === 'langd' ? 'Längdjustering' : 'Diameterjustering'} • {h.tradslag}</div>
                    <div className="kalib-info-text">
                      {h.typ === 'langd' ? `${h.langd_justering_mm} mm` : `${h.dia_justering_mm} mm`}
                      {h.position_cm ? ` vid ${h.position_cm} cm` : ''}
                      {h.orsak !== 'none' ? ` • ${h.orsak}` : ''}
                    </div>
                  </div>
                </div>
              ))}
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
    const speciesKalibs = allKalib.filter(k => k.tradslag.toLowerCase() === species).slice(0, 20);

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

        .kalib-nav{display:flex;justify-content:center;gap:8px;padding:12px 20px;background:rgba(0,0,0,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);position:sticky;top:0;z-index:100;border-bottom:0.5px solid #2C2C2E}
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
        .kalib-hero-metric-label{font-size:12px;color:#8E8E93;font-weight:500}
        .kalib-hero-metric-hint{font-size:11px;color:#8E8E93;margin-top:4px}

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
        .kalib-list-date{width:42px;text-align:center;flex-shrink:0}
        .kalib-list-day{display:block;font-size:18px;font-weight:600;line-height:1.1;color:#fff}
        .kalib-list-month{font-size:11px;color:#8E8E93}
        .kalib-list-info{width:88px;flex-shrink:0}
        .kalib-list-species{display:block;font-size:14px;font-weight:500;color:#fff}
        .kalib-list-stem{font-size:12px;color:#8E8E93}
        .kalib-list-bar-container{flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;position:relative}
        .kalib-list-bar{height:100%;border-radius:3px;background:#fff}
        .kalib-list-bar.bad{background:#FF3B30}
        .kalib-list-value{width:64px;text-align:right;font-size:14px;font-weight:600;color:#fff;flex-shrink:0}
        .kalib-list-value.bad{color:#FF3B30}

        .kalib-mini-cal{margin-top:12px}
        .kalib-mini-cal-header{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:11px;color:#8E8E93;margin-bottom:8px;font-weight:500}
        .kalib-mini-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
        .kalib-mini-day{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:13px;border-radius:8px;cursor:pointer;color:#fff;font-weight:500}
        .kalib-mini-day.empty{visibility:hidden}
        .kalib-mini-day.off{color:#48484A;cursor:default;font-weight:400}
        .kalib-mini-day.check{background:rgba(52,199,89,0.15);color:#34C759;font-weight:600}
        .kalib-mini-day.calib{background:rgba(255,255,255,0.08);color:#fff;font-weight:600}
        .kalib-mini-day.warn{background:rgba(255,59,48,0.15);color:#FF3B30;font-weight:600}
        .kalib-mini-day.today{box-shadow:inset 0 0 0 1.5px #fff}
        .kalib-mini-legend{display:flex;justify-content:center;gap:16px;margin-top:14px;font-size:11px;color:#8E8E93}
        .kalib-mini-legend .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
        .kalib-mini-legend .dot.green{background:#34C759}
        .kalib-mini-legend .dot.white{background:#fff}
        .kalib-mini-legend .dot.red{background:#FF3B30}

        .kalib-report{background:#1C1C1E;border-radius:14px;padding:24px 20px;border:1px solid rgba(255,255,255,0.06)}
        .kalib-report-header{display:flex;align-items:center;gap:14px;padding-bottom:18px;border-bottom:0.5px solid #2C2C2E;margin-bottom:20px}
        .kalib-report-logo{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;color:#fff}
        .kalib-report-logo .material-symbols-outlined{font-size:28px}
        .kalib-report-title-block{flex:1}
        .kalib-report-title{font-size:18px;font-weight:600;color:#fff}
        .kalib-report-subtitle{font-size:12px;color:#8E8E93}
        .kalib-report-date{font-size:12px;color:#8E8E93;text-align:right}
        .kalib-report-section{margin-bottom:22px}
        .kalib-report-section-title{font-size:13px;font-weight:600;color:#fff;margin:0 0 4px}
        .kalib-report-section-desc{font-size:12px;color:#8E8E93;margin:0 0 14px}
        .kalib-report-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
        .kalib-report-metric{text-align:center;padding:14px 8px;background:rgba(255,255,255,0.04);border-radius:10px}
        .kalib-report-metric-value{font-size:24px;font-weight:700;line-height:1;color:#fff;letter-spacing:-0.02em}
        .kalib-report-metric-value.bad{color:#FF3B30}
        .kalib-report-metric-unit{font-size:11px;color:#8E8E93;margin-top:2px}
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
        .kalib-report-footer{display:flex;justify-content:space-between;padding-top:18px;border-top:0.5px solid #2C2C2E;margin-top:22px}
        .kalib-report-sig-name{font-size:14px;font-weight:500;color:#fff}
        .kalib-report-sig-role{font-size:11px;color:#8E8E93;margin-top:2px}
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
          <button className={`kalib-pill ${activeTab === 'report' ? 'active' : ''}`} onClick={() => setActiveTab('report')}>Rapport</button>
        </nav>

        <div className="kalib-container">
          {activeTab === 'today' && latestKalib && (
            <>
              <header className="kalib-page-header">
                <h1 className="kalib-page-title">{latestKalib.tradslag}</h1>
                <p className="kalib-page-subtitle">{latestKalib.antal_kontrollstockar} stockar • {new Date(latestKalib.datum).toLocaleDateString('sv-SE')} • {latestKalib.maskin_id}</p>
              </header>

              <div className="kalib-card">
                <div className="kalib-section-title">Så mätte maskinen</div>
                <div className="kalib-section-subtitle">Snittavvikelse maskin jämfört med operatör</div>
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
                      <div className="kalib-info-text">Avvikelserna överstiger rekommenderade gränsvärden. Kontrollera kalibreringen.</div>
                    </div>
                  </div>
                ) : (
                  <div className="kalib-info-box ok">
                    <span className="kalib-info-icon"><MSym name="check_circle" size={22} color="#34C759" /></span>
                    <div className="kalib-info-content">
                      <div className="kalib-info-title">Inom tolerans</div>
                      <div className="kalib-info-text">Avvikelserna ligger inom godkända gränsvärden.</div>
                    </div>
                  </div>
                )}
              </div>

              {latestStockar.length > 0 && (
                <div className="kalib-card">
                  <div className="kalib-section-title">Stockar</div>
                  <div className="kalib-section-subtitle">{latestKalib.tradslag} • {latestStockar.length} stockar • {(totalLatestLen / 100).toFixed(1)} meter • Tryck för detaljer</div>
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
                  <button className="kalib-btn-stem" onClick={() => openStemOverview(latestKalib)}>
                    <span>Visa alla stockar</span>
                    <span className="kalib-btn-stem-arrow"><MSym name="chevron_right" size={20} color="#8E8E93" /></span>
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <>
              <header className="kalib-page-header">
                <h1 className="kalib-page-title">Hur mäter maskinen?</h1>
                <p className="kalib-page-subtitle">{allKalib.length} kontroller • {calibCount} med kalibreringar</p>
              </header>

              <div className="kalib-card">
                <div className="kalib-section-title">Per trädslag</div>
                <div className="kalib-section-subtitle">Viktad snittavvikelse (M − Operatör)</div>
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
                <div className="kalib-section-subtitle">Diameteravvikelse per kontroll</div>
                <div className="kalib-list">
                  {historyList.map(({ kalib: k, date }) => {
                    const day = date.getDate();
                    const monthShort = date.toLocaleDateString('sv-SE', { month: 'short' });
                    const isOut = k.status === 'VARNING' || diaOut(k.dia_avvikelse_snitt_mm);
                    return (
                      <div key={k.id} className="kalib-list-item" onClick={() => openStemOverview(k)}>
                        <div className="kalib-list-date">
                          <span className="kalib-list-day">{day}</span>
                          <span className="kalib-list-month">{monthShort}</span>
                        </div>
                        <div className="kalib-list-info">
                          <span className="kalib-list-species">{k.tradslag}</span>
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

              <div className="kalib-card">
                <div className="kalib-section-title">{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</div>
                <div className="kalib-mini-cal">
                  <div className="kalib-mini-cal-header"><span>M</span><span>T</span><span>O</span><span>T</span><span>F</span><span>L</span><span>S</span></div>
                  <div className="kalib-mini-cal-grid">
                    {calendarDays.map((d, i) => {
                      if (d.day === null) return <div key={i} className="kalib-mini-day empty" />;
                      let cls = 'kalib-mini-day';
                      if (d.off) cls += ' off';
                      if (d.check) cls += ' check';
                      if (d.calib) cls += ' calib';
                      if (d.warn) cls += ' warn';
                      if (d.today) cls += ' today';
                      const clickable = d.check || d.calib || d.warn;
                      return <div key={i} className={cls} onClick={clickable ? () => openDayModal(d.day!) : undefined}>{d.day}</div>;
                    })}
                  </div>
                </div>
                <div className="kalib-mini-legend">
                  <span><span className="dot green" />Kontroll</span>
                  <span><span className="dot white" />Kalibrering</span>
                  <span><span className="dot red" />Varning</span>
                </div>
              </div>
            </>
          )}

          {activeTab === 'report' && (
            <div className="kalib-report">
              <div className="kalib-report-header">
                <div className="kalib-report-logo"><MSym name="forest" size={28} color="#fff" /></div>
                <div className="kalib-report-title-block">
                  <div className="kalib-report-title">Kvalitetsrapport</div>
                  <div className="kalib-report-subtitle">Kontrollmätning skördare</div>
                </div>
                <div className="kalib-report-date">{reportDate}</div>
              </div>

              <div className="kalib-report-section">
                <div className="kalib-report-section-title">Nyckeltal</div>
                <div className="kalib-report-metrics">
                  <div className="kalib-report-metric">
                    <div className="kalib-report-metric-value">{allKalib.length}</div>
                    <div className="kalib-report-metric-unit">st</div>
                    <div className="kalib-report-metric-label">Kontroller</div>
                  </div>
                  <div className="kalib-report-metric">
                    <div className="kalib-report-metric-value">{totalStockar}</div>
                    <div className="kalib-report-metric-unit">st</div>
                    <div className="kalib-report-metric-label">Kontrollstockar</div>
                  </div>
                  <div className="kalib-report-metric">
                    <div className="kalib-report-metric-value">{calibCount}</div>
                    <div className="kalib-report-metric-unit">st</div>
                    <div className="kalib-report-metric-label">Kalibreringar</div>
                  </div>
                  <div className="kalib-report-metric">
                    <div className={`kalib-report-metric-value ${allKalib.filter(k => k.status === 'VARNING').length > 0 ? 'bad' : ''}`}>{allKalib.filter(k => k.status === 'VARNING').length}</div>
                    <div className="kalib-report-metric-unit">st</div>
                    <div className="kalib-report-metric-label">Varningar</div>
                  </div>
                </div>
              </div>

              <div className="kalib-report-section">
                <div className="kalib-report-section-title">Genomsnittlig avvikelse</div>
                <div className="kalib-report-section-desc">Maskin jämfört med operatör (viktat snitt)</div>
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

              {latestKalib && (
                <div className="kalib-report-footer">
                  <div>
                    <div className="kalib-report-sig-name">Kontrolldata</div>
                    <div className="kalib-report-sig-role">Automatiskt genererad från HQC-filer</div>
                  </div>
                  <div className="kalib-report-machine">
                    <div>{latestKalib.maskin_id}</div>
                    <div className="kalib-report-machine-sub">{allKalib.length} kontroller totalt</div>
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
      </div>
    </>
  );
}
