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

  // === Modals ===
  const openStockModal = (stock: DetaljKontrollStock) => {
    const lenDiff = stock.langd_avvikelse_cm;
    const diaDiff = stock.dia_avvikelse_mm;
    const lenCls = Math.abs(lenDiff) > 3 ? 'bad' : Math.abs(lenDiff) > 2 ? 'warn' : 'good';
    const diaCls = Math.abs(diaDiff) > 6 ? 'bad' : Math.abs(diaDiff) > 4 ? 'warn' : 'good';

    setModalContent({
      title: `Stock ${stock.stock_nummer}`,
      subtitle: `Stam #${stock.stam_nummer} • ${stock.kontroll_datum}`,
      body: (
        <>
          <div className="total-summary">
            <div className="total-title">Mätjämförelse</div>
            <div className="total-grid two-col">
              <div className="total-item">
                <div className="total-label">Längd maskin</div>
                <div className="total-value">{stock.maskin_langd_cm}<span className="total-unit"> cm</span></div>
              </div>
              <div className="total-item">
                <div className="total-label">Längd operatör</div>
                <div className="total-value">{stock.operator_langd_cm}<span className="total-unit"> cm</span></div>
              </div>
            </div>
          </div>
          <div className="summary-row" style={{ marginTop: '16px' }}>
            <div className="summary-item">
              <div className="summary-label">Längd (M−O)</div>
              <div className={`summary-value`}>{lenDiff >= 0 ? '+' : ''}{lenDiff} cm</div>
              <div className={`profile-diff ${lenCls}`} style={{ display: 'inline-block' }}>{lenCls === 'good' ? 'OK' : lenCls === 'warn' ? 'Nära gräns' : 'Utanför'}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Topp ⌀ maskin</div>
              <div className="summary-value">{stock.maskin_toppdia_mm} mm</div>
              <div className="summary-hint">op: {stock.operator_toppdia_mm} mm</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Dia (M−O)</div>
              <div className="summary-value">{diaDiff >= 0 ? '+' : ''}{diaDiff} mm</div>
              <div className={`profile-diff ${diaCls}`} style={{ display: 'inline-block' }}>{diaCls === 'good' ? 'OK' : diaCls === 'warn' ? 'Nära gräns' : 'Utanför'}</div>
            </div>
          </div>
          {(stock.maskin_volym_sub != null && stock.operator_volym_sub != null) && (
            <div className="info-box" style={{ marginTop: '16px' }}>
              <div className="info-box-icon">📦</div>
              <div className="info-box-content">
                <div className="info-box-title">Volym (m³sub)</div>
                <div className="info-box-text">Maskin: {stock.maskin_volym_sub?.toFixed(4)} • Operatör: {stock.operator_volym_sub?.toFixed(4)} • Diff: {stock.volym_avvikelse?.toFixed(4)}</div>
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
      subtitle: `${kalib.tradslag} • ${kalib.antal_kontrollstockar} stockar • ${kalib.status}`,
      body: (
        <>
          <div className="total-summary">
            <div className="total-title">Snitt för kontrollen</div>
            <div className="total-grid">
              <div className="total-item"><div className="total-label">Total längd</div><div className="total-value">{(totalLen / 100).toFixed(1)}<span className="total-unit"> m</span></div></div>
              <div className="total-item"><div className="total-label">Längd (M−O)</div><div className="total-value">{kalib.langd_avvikelse_snitt_cm >= 0 ? '+' : ''}{kalib.langd_avvikelse_snitt_cm}<span className="total-unit"> cm</span></div></div>
              <div className="total-item"><div className="total-label">Dia (M−O)</div><div className="total-value">{kalib.dia_avvikelse_snitt_mm >= 0 ? '+' : ''}{kalib.dia_avvikelse_snitt_mm}<span className="total-unit"> mm</span></div></div>
            </div>
          </div>
          {stocks.length > 0 && (
            <>
              <div className="modal-section-header"><div className="modal-section-title">Per stock</div><div className="modal-section-subtitle">Tryck för detaljer</div></div>
              <div className="overview-grid">
                {stocks.map(stock => {
                  const diaDiff = stock.dia_avvikelse_mm;
                  const cls = Math.abs(diaDiff) > 6 ? 'bad' : Math.abs(diaDiff) > 4 ? 'warn' : 'good';
                  return (
                    <div key={stock.id} className="overview-log" onClick={() => { setModalOpen(false); setTimeout(() => openStockModal(stock), 150); }}>
                      <div className="overview-log-num">{stock.stock_nummer}</div>
                      <div className="overview-log-info">
                        <div className="overview-log-title">Stock #{stock.stock_nummer}</div>
                        <div className="overview-log-meta">{stock.maskin_langd_cm} cm • Topp ⌀{stock.maskin_toppdia_mm}</div>
                      </div>
                      <div className={`overview-log-diff ${cls}`}>{diaDiff >= 0 ? '+' : ''}{diaDiff} mm</div>
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
      subtitle: `${dayKalibs.length} kontroll${dayKalibs.length > 1 ? 'er' : ''} • ${k.status}`,
      body: (
        <>
          <div className="total-summary">
            <div className="total-title">Dagens mätning</div>
            <div className="total-grid">
              <div className="total-item"><div className="total-label">Trädslag</div><div className="total-value small">{k.tradslag}</div></div>
              <div className="total-item"><div className="total-label">Längd (M−O)</div><div className="total-value">{k.langd_avvikelse_snitt_cm >= 0 ? '+' : ''}{k.langd_avvikelse_snitt_cm}<span className="total-unit"> cm</span></div></div>
              <div className="total-item"><div className="total-label">Dia (M−O)</div><div className="total-value">{k.dia_avvikelse_snitt_mm >= 0 ? '+' : ''}{k.dia_avvikelse_snitt_mm}<span className="total-unit"> mm</span></div></div>
            </div>
          </div>
          {stocks.length > 0 && (
            <>
              <div className="modal-section-header"><div className="modal-section-title">Stockar</div></div>
              <div className="overview-grid">
                {stocks.map(stock => (
                  <div key={stock.id} className="overview-log" onClick={() => { setModalOpen(false); setTimeout(() => openStockModal(stock), 150); }}>
                    <div className="overview-log-num">{stock.stock_nummer}</div>
                    <div className="overview-log-info">
                      <div className="overview-log-title">Stock #{stock.stock_nummer}</div>
                      <div className="overview-log-meta">{stock.maskin_langd_cm} cm • ⌀{stock.maskin_toppdia_mm}</div>
                    </div>
                    <div className="overview-log-diff">{stock.dia_avvikelse_mm >= 0 ? '+' : ''}{stock.dia_avvikelse_mm} mm</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {dayHistorik.length > 0 && (
            <>
              <div className="modal-section-header"><div className="modal-section-title">Kalibreringshistorik</div></div>
              {dayHistorik.map(h => (
                <div key={h.id} className="info-box" style={{ marginBottom: '8px' }}>
                  <div className="info-box-icon">⚙️</div>
                  <div className="info-box-content">
                    <div className="info-box-title">{h.typ === 'langd' ? 'Längdjustering' : 'Diameterjustering'} • {h.tradslag}</div>
                    <div className="info-box-text">
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
      title: name, subtitle: `${data.count} kontroller`,
      body: (
        <>
          <div className="total-summary">
            <div className="total-title">Snitt för {name}</div>
            <div className="total-grid two-col">
              <div className="total-item"><div className="total-label">Längd (M−O)</div><div className="total-value">{data.lenDiff >= 0 ? '+' : ''}{data.lenDiff}<span className="total-unit"> cm</span></div></div>
              <div className="total-item"><div className="total-label">Dia (M−O)</div><div className="total-value">{data.diaDiff >= 0 ? '+' : ''}{data.diaDiff}<span className="total-unit"> mm</span></div></div>
            </div>
          </div>
          <div className="modal-section-header"><div className="modal-section-title">Senaste kontroller</div></div>
          <div className="overview-grid">
            {speciesKalibs.map(k => {
              const d = new Date(k.datum);
              return (
                <div key={k.id} className="overview-log" onClick={() => { setModalOpen(false); setTimeout(() => openStemOverview(k), 150); }}>
                  <div className="overview-log-num">{d.getDate()}</div>
                  <div className="overview-log-info">
                    <div className="overview-log-title">{d.toLocaleDateString('sv-SE')}</div>
                    <div className="overview-log-meta">{k.antal_kontrollstockar} stockar • {k.status}</div>
                  </div>
                  <div className="overview-log-diff">{k.dia_avvikelse_snitt_mm >= 0 ? '+' : ''}{k.dia_avvikelse_snitt_mm} mm</div>
                </div>
              );
            })}
          </div>
          <div className="info-box"><div className="info-box-icon">📊</div><div className="info-box-content"><div className="info-box-title">Tillräckligt underlag?</div><div className="info-box-text">{data.count >= 5 ? `Ja, ${data.count} kontroller ger ett bra underlag.` : 'Fler kontroller behövs för att dra säkra slutsatser.'}</div></div></div>
        </>
      )
    });
    setModalOpen(true);
  };

  if (loading) {
    return (
      <>
        <style jsx global>{`
          .kalib-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;color:#86868b}
          .kalib-spinner{width:32px;height:32px;border:3px solid #e5e5ea;border-top-color:#0071e3;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:16px}
          @keyframes spin{to{transform:rotate(360deg)}}
        `}</style>
        <div className="kalib-loading"><div className="kalib-spinner" /><div>Laddar kontrolldata…</div></div>
      </>
    );
  }

  if (allKalib.length === 0) {
    return (
      <>
        <style jsx global>{`
          .kalib-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;color:#86868b;text-align:center;padding:40px}
          .kalib-empty-icon{font-size:64px;margin-bottom:16px}
          .kalib-empty-title{font-size:22px;font-weight:600;color:#1d1d1f;margin-bottom:8px}
          .kalib-empty-text{font-size:15px;max-width:320px}
        `}</style>
        <div className="kalib-empty"><div className="kalib-empty-icon">📏</div><div className="kalib-empty-title">Inga kontrollmätningar</div><div className="kalib-empty-text">När HQC-filer importeras visas kontrolldata här med jämförelser och statistik.</div></div>
      </>
    );
  }

  const reportDate = new Date(allKalib[0].datum).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <style jsx global>{`
        :root{--bg:#f5f5f7;--card:#ffffff;--text:#1d1d1f;--text-secondary:#86868b;--border:#d2d2d7;--blue:#0071e3;--green:#34c759;--orange:#ff9500;--red:#ff3b30;--purple:#af52de}
        .kalib-page{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;background:var(--bg);color:var(--text);line-height:1.47;min-height:100vh;-webkit-font-smoothing:antialiased}
        .nav{display:flex;justify-content:center;gap:8px;padding:12px 20px;background:rgba(255,255,255,0.8);backdrop-filter:blur(20px);position:sticky;top:0;z-index:100;border-bottom:0.5px solid var(--border)}
        .nav-pill{padding:8px 16px;border-radius:980px;font-size:14px;color:var(--text-secondary);background:transparent;border:none;cursor:pointer;transition:all 0.2s}
        .nav-pill.active{background:var(--text);color:white}
        .container{max-width:680px;margin:0 auto;padding:32px 20px 100px}
        .page-header{text-align:center;margin-bottom:40px}
        .page-eyebrow{font-size:12px;font-weight:600;color:var(--orange);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px}
        .page-title{font-size:40px;font-weight:600;letter-spacing:-0.02em;line-height:1.1;margin-bottom:8px}
        .page-subtitle{font-size:17px;color:var(--text-secondary)}
        .card{background:var(--card);border-radius:18px;padding:24px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.04)}
        .card-tight{padding:20px}
        .section-title{font-size:22px;font-weight:600;margin-bottom:4px}
        .section-subtitle{font-size:15px;color:var(--text-secondary);margin-bottom:20px}
        .hero-metrics{display:flex;gap:20px;margin-bottom:24px}
        .hero-metric{flex:1;text-align:center;padding:24px 16px;background:var(--bg);border-radius:16px}
        .hero-metric-value{font-size:44px;font-weight:600;line-height:1;margin-bottom:6px}
        .hero-metric-label{font-size:13px;color:var(--text-secondary);font-weight:500}
        .hero-metric-hint{font-size:12px;color:var(--text-secondary);margin-top:4px}
        .info-box{display:flex;gap:14px;padding:16px;background:#f0f5ff;border-radius:12px;margin-top:20px}
        .info-box.warm{background:#fff8f0}
        .info-box-icon{font-size:28px;line-height:1}
        .info-box-content{flex:1}
        .info-box-title{font-size:15px;font-weight:600;margin-bottom:2px}
        .info-box-text{font-size:14px;color:var(--text-secondary);line-height:1.4}
        .weather-box{display:flex;align-items:center;gap:14px;padding:16px;background:var(--bg);border-radius:12px;margin:20px 0}
        .weather-icon{font-size:32px}
        .weather-temp{font-weight:600;margin-bottom:2px}
        .weather-note{font-size:13px;color:var(--text-secondary)}
        .stem-viz{overflow-x:auto;padding:16px 0;margin:0 -24px;padding-left:24px;padding-right:24px}
        .stem-viz-inner{display:flex;align-items:flex-end;gap:6px;min-width:min-content}
        .stem-label{font-size:11px;color:var(--text-secondary);padding:0 8px}
        .log-block{display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:transform 0.2s}
        .log-block:active{transform:scale(0.95)}
        .log-body{background:linear-gradient(135deg,#8B4513 0%,#A0522D 50%,#8B4513 100%);border-radius:4px;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 2px 4px rgba(0,0,0,0.2),0 2px 4px rgba(0,0,0,0.1)}
        .log-num{color:rgba(255,255,255,0.9);font-size:14px;font-weight:600}
        .log-info{text-align:center}
        .log-length{font-size:12px;font-weight:600}
        .log-product{font-size:10px;color:var(--text-secondary)}
        .btn-stem-overview{display:flex;align-items:center;justify-content:space-between;width:100%;padding:16px 20px;margin-top:16px;background:var(--bg);border:none;border-radius:12px;font-size:15px;font-weight:500;color:var(--blue);cursor:pointer}
        .btn-arrow{font-size:18px}
        .simple-bars{display:flex;flex-direction:column;gap:20px}
        .bar-header{display:flex;justify-content:space-between;margin-bottom:10px}
        .bar-species{font-size:15px;font-weight:600}
        .bar-count{font-size:13px;color:var(--text-secondary)}
        .bar-row{display:flex;align-items:center;gap:12px;margin-bottom:8px}
        .bar-label{width:60px;font-size:13px;color:var(--text-secondary)}
        .bar-track{flex:1;height:8px;background:#e5e5ea;border-radius:4px;position:relative}
        .bar-zero{position:absolute;left:50%;top:0;bottom:0;width:1px;background:#c7c7cc}
        .bar-fill{position:absolute;top:0;bottom:0;border-radius:4px}
        .bar-fill.neg{right:50%;background:var(--blue)}
        .bar-fill.pos{left:50%;background:var(--orange)}
        .bar-value{width:60px;text-align:right;font-size:13px;font-weight:600}
        .bar-value.warn{color:var(--orange)}
        .simple-list{}
        .list-item{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:0.5px solid var(--border);cursor:pointer}
        .list-item:last-child{border-bottom:none}
        .list-date{width:40px;text-align:center}
        .list-day{display:block;font-size:18px;font-weight:600;line-height:1.1}
        .list-month{font-size:11px;color:var(--text-secondary)}
        .list-info{width:70px}
        .list-species{display:block;font-size:14px;font-weight:500}
        .list-stem{font-size:12px;color:var(--text-secondary)}
        .list-missing{font-size:13px;color:var(--orange)}
        .list-bar-container{flex:1;height:6px;background:#e5e5ea;border-radius:3px;overflow:hidden}
        .list-bar{height:100%;border-radius:3px}
        .list-bar.neg{background:var(--blue)}
        .list-bar.pos{background:var(--orange)}
        .list-calib-badge{flex:1;font-size:12px;color:var(--purple);background:#f3e8ff;padding:4px 10px;border-radius:6px;text-align:center}
        .list-value{width:50px;text-align:right;font-size:14px;font-weight:600}
        .list-value.warn{color:var(--orange)}
        .list-value.calib{color:var(--purple)}
        .mini-calendar{margin-top:16px}
        .mini-cal-header{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:11px;color:var(--text-secondary);margin-bottom:8px}
        .mini-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
        .mini-day{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:13px;border-radius:8px;cursor:pointer}
        .mini-day.empty{visibility:hidden}
        .mini-day.off{color:var(--text-secondary);cursor:default}
        .mini-day.check{background:rgba(52,199,89,0.2);color:var(--green);font-weight:600}
        .mini-day.calib{background:rgba(175,82,222,0.2);color:var(--purple);font-weight:600}
        .mini-day.warn{background:rgba(255,149,0,0.2);color:var(--orange);font-weight:600}
        .mini-day.today{box-shadow:inset 0 0 0 2px var(--text)}
        .mini-legend{display:flex;justify-content:center;gap:16px;margin-top:12px;font-size:11px;color:var(--text-secondary)}
        .mini-legend .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle}
        .dot.green{background:var(--green)}
        .dot.blue{background:var(--purple)}
        .dot.orange{background:var(--orange)}
        .report-page{background:var(--card);border-radius:18px;padding:32px 24px;box-shadow:0 4px 20px rgba(0,0,0,0.08)}
        .report-header{display:flex;align-items:center;gap:16px;padding-bottom:20px;border-bottom:1px solid var(--border);margin-bottom:24px}
        .report-logo{font-size:40px}
        .report-title-block{flex:1}
        .report-title{font-size:20px;font-weight:600}
        .report-subtitle{font-size:13px;color:var(--text-secondary)}
        .report-date{font-size:13px;color:var(--text-secondary);text-align:right}
        .report-section{margin-bottom:24px}
        .report-section-title{font-size:13px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
        .report-section-desc{font-size:13px;color:var(--text-secondary);margin-bottom:16px}
        .report-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .report-info-item{padding:12px 0;border-bottom:0.5px solid var(--border)}
        .report-info-label{font-size:12px;color:var(--text-secondary);margin-bottom:4px}
        .report-info-value{font-size:15px;font-weight:600}
        .report-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
        .report-metric{text-align:center;padding:16px 8px;background:var(--bg);border-radius:12px}
        .report-metric-value{font-size:28px;font-weight:700;line-height:1}
        .report-metric-unit{font-size:11px;color:var(--text-secondary);margin-top:2px}
        .report-metric-label{font-size:11px;color:var(--text-secondary);margin-top:8px}
        .report-results{display:flex;flex-direction:column;gap:16px;margin-bottom:20px}
        .report-result{display:flex;align-items:center;gap:16px}
        .report-result-label{width:70px;font-size:14px;color:var(--text-secondary)}
        .report-result-bar{flex:1}
        .report-bar-track{height:10px;background:#e5e5ea;border-radius:5px;position:relative;overflow:hidden}
        .report-bar-zero{position:absolute;left:50%;top:0;bottom:0;width:2px;background:#c7c7cc}
        .report-bar-fill{position:absolute;top:0;height:100%;border-radius:5px}
        .report-bar-fill.neg{right:50%;background:var(--blue)}
        .report-result-value{width:70px;text-align:right;font-size:15px;font-weight:600}
        .report-verdict{display:flex;align-items:center;gap:12px;padding:16px;border-radius:12px}
        .report-verdict.good{background:#e8f5e9}
        .report-verdict.warn{background:#fff3e0}
        .report-verdict-icon{width:32px;height:32px;border-radius:50%;background:var(--green);color:white;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600}
        .report-verdict-icon.warn-icon{background:var(--orange)}
        .report-verdict-title{font-size:15px;font-weight:600}
        .report-verdict-desc{font-size:13px;color:var(--text-secondary);margin-top:2px}
        .report-species-table{border-radius:12px;overflow:hidden;border:1px solid var(--border)}
        .report-table-header{display:grid;grid-template-columns:1fr 70px 70px 80px;padding:12px 16px;background:var(--bg);font-size:12px;color:var(--text-secondary)}
        .report-table-row{display:grid;grid-template-columns:1fr 70px 70px 80px;padding:12px 16px;border-top:1px solid var(--border);font-size:14px;cursor:pointer}
        .report-table-row:hover{background:var(--bg)}
        .report-footer{display:flex;justify-content:space-between;padding-top:20px;border-top:1px solid var(--border);margin-top:24px}
        .report-signature-name{font-size:15px;font-weight:500}
        .report-signature-role{font-size:12px;color:var(--text-secondary)}
        .report-machine{text-align:right;font-size:13px}
        .report-machine-sub{font-size:11px;color:var(--text-secondary)}
        .btn{padding:14px 24px;border-radius:12px;font-size:15px;font-weight:500;border:none;cursor:pointer}
        .btn-primary{background:var(--blue);color:white}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);backdrop-filter:blur(8px);z-index:200;display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.25s}
        .modal-overlay.open{opacity:1;pointer-events:auto}
        .modal{background:var(--card);width:100%;max-width:500px;max-height:85vh;border-radius:20px 20px 0 0;padding:20px 24px 34px;transform:translateY(100%);transition:transform 0.3s ease-out;overflow-y:auto}
        .modal-overlay.open .modal{transform:translateY(0)}
        .modal-handle{width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 16px}
        .modal-header{text-align:center;margin-bottom:20px}
        .modal-title{font-size:22px;font-weight:600}
        .modal-subtitle{font-size:14px;color:var(--text-secondary)}
        .modal-close{display:block;width:100%;padding:14px;margin-top:20px;background:var(--bg);border:none;border-radius:12px;font-size:15px;color:var(--text);cursor:pointer}
        .modal-section-header{margin:24px 0 12px}
        .modal-section-title{font-size:15px;font-weight:600}
        .modal-section-subtitle{font-size:13px;color:var(--text-secondary)}
        .profile-section{margin-bottom:20px}
        .profile-title{font-size:15px;font-weight:600;margin-bottom:4px}
        .profile-subtitle{font-size:13px;color:var(--text-secondary);margin-bottom:16px}
        .profile-chart{display:flex;align-items:flex-end;justify-content:space-around;height:120px;padding:0 8px}
        .profile-point{text-align:center}
        .profile-bar{width:28px;background:linear-gradient(180deg,var(--blue) 0%,#0056b3 100%);border-radius:4px 4px 0 0;margin:0 auto 6px}
        .profile-value{font-size:12px;font-weight:600}
        .profile-label{font-size:10px;color:var(--text-secondary);margin-top:2px}
        .profile-diff{font-size:11px;font-weight:600;padding:2px 4px;border-radius:4px;margin-top:4px}
        .profile-diff.good{background:rgba(52,199,89,0.15);color:var(--green)}
        .profile-diff.warn{background:rgba(255,149,0,0.15);color:var(--orange)}
        .profile-diff.bad{background:rgba(255,59,48,0.15);color:var(--red)}
        .profile-legend{display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);margin-top:8px}
        .summary-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px;background:var(--bg);border-radius:12px}
        .summary-item{text-align:center}
        .summary-label{font-size:11px;color:var(--text-secondary);margin-bottom:4px}
        .summary-value{font-size:18px;font-weight:600}
        .summary-diff{font-size:11px;color:var(--text-secondary)}
        .summary-hint{font-size:10px;color:var(--text-secondary)}
        .total-summary{background:linear-gradient(135deg,#f0f5ff 0%,#e8f0ff 100%);border:1.5px solid rgba(0,113,227,0.2);border-radius:14px;padding:20px}
        .total-summary.calib-style{background:linear-gradient(135deg,#f3e8ff 0%,#ede4ff 100%);border-color:rgba(175,82,222,0.2)}
        .total-title{font-size:12px;font-weight:600;color:var(--blue);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:16px}
        .total-title.calib-title{color:var(--purple)}
        .total-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .total-grid.two-col{grid-template-columns:repeat(2,1fr)}
        .total-item{text-align:center}
        .total-label{font-size:12px;color:var(--text-secondary);margin-bottom:4px}
        .total-value{font-size:28px;font-weight:600}
        .total-value.small{font-size:20px}
        .total-unit{font-size:14px;font-weight:400;color:var(--text-secondary)}
        .calib-value{font-size:24px;font-weight:600;text-align:center;margin:12px 0}
        .overview-grid{}
        .overview-log{display:flex;align-items:center;gap:12px;padding:14px;background:var(--bg);border-radius:12px;margin-bottom:8px;cursor:pointer}
        .overview-log-num{width:32px;height:32px;background:var(--card);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600}
        .overview-log-info{flex:1}
        .overview-log-title{font-size:14px;font-weight:500}
        .overview-log-meta{font-size:12px;color:var(--text-secondary)}
        .overview-log-diff{font-size:12px;font-weight:600;padding:2px 8px;border-radius:4px;background:var(--bg)}
        .overview-log-diff.good{color:var(--green);background:#e8f5e9}
        .overview-log-diff.warn{color:var(--orange);background:#fff3e0}
        .overview-log-diff.bad{color:var(--red);background:#ffebee}
        .overview-link{font-size:13px;color:var(--text-secondary)}
        @media(max-width:480px){.page-title{font-size:32px}.hero-metric-value{font-size:36px}.container{padding:24px 16px 100px}.report-metrics{grid-template-columns:repeat(2,1fr)}}
      `}</style>

      <div className="kalib-page">
        <nav className="nav">
          <button className={`nav-pill ${activeTab === 'today' ? 'active' : ''}`} onClick={() => setActiveTab('today')}>Senaste</button>
          <button className={`nav-pill ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>Historik</button>
          <button className={`nav-pill ${activeTab === 'report' ? 'active' : ''}`} onClick={() => setActiveTab('report')}>Rapport</button>
        </nav>

        <div className="container">
          {activeTab === 'today' && latestKalib && (
            <>
              <header className="page-header">
                <div className="page-eyebrow">Kontrollmätning</div>
                <h1 className="page-title">{latestKalib.tradslag}</h1>
                <p className="page-subtitle">{latestKalib.antal_kontrollstockar} stockar • {new Date(latestKalib.datum).toLocaleDateString('sv-SE')} • {latestKalib.maskin_id}</p>
              </header>
              <div className="card">
                <div className="section-title">Så mätte maskinen</div>
                <div className="section-subtitle">Snittavvikelse maskin jämfört med operatör</div>
                <div className="hero-metrics">
                  <div className="hero-metric">
                    <div className="hero-metric-value">{latestKalib.langd_avvikelse_snitt_cm >= 0 ? '+' : ''}{latestKalib.langd_avvikelse_snitt_cm}</div>
                    <div className="hero-metric-label">Längd (cm)</div>
                    <div className="hero-metric-hint">min {latestKalib.langd_avvikelse_min_cm} / max {latestKalib.langd_avvikelse_max_cm}</div>
                  </div>
                  <div className="hero-metric">
                    <div className="hero-metric-value">{latestKalib.dia_avvikelse_snitt_mm >= 0 ? '+' : ''}{latestKalib.dia_avvikelse_snitt_mm}</div>
                    <div className="hero-metric-label">Diameter (mm)</div>
                    <div className="hero-metric-hint">min {latestKalib.dia_avvikelse_min_mm} / max {latestKalib.dia_avvikelse_max_mm}</div>
                  </div>
                </div>
                {latestKalib.status === 'VARNING' ? (
                  <div className="info-box warm"><div className="info-box-icon">⚠️</div><div className="info-box-content"><div className="info-box-title">Varning</div><div className="info-box-text">Avvikelserna överstiger rekommenderade gränsvärden. Kontrollera kalibreringen.</div></div></div>
                ) : (
                  <div className="info-box"><div className="info-box-icon">✅</div><div className="info-box-content"><div className="info-box-title">OK</div><div className="info-box-text">Avvikelserna ligger inom godkända gränsvärden.</div></div></div>
                )}
              </div>
              {latestStockar.length > 0 && (
                <div className="card">
                  <div className="section-title">Stockar</div>
                  <div className="section-subtitle">{latestKalib.tradslag} • {latestStockar.length} stockar • {(totalLatestLen / 100).toFixed(1)} meter • Tryck för detaljer</div>
                  <div className="stem-viz">
                    <div className="stem-viz-inner">
                      <span className="stem-label">Rot</span>
                      {latestStockar.map(stock => {
                        const baseW = 40 + Math.min(60, stock.maskin_langd_cm / 8);
                        const baseH = 25 + Math.min(50, stock.maskin_toppdia_mm / 3);
                        return (
                          <div key={stock.id} className="log-block" onClick={() => openStockModal(stock)}>
                            <div className="log-body" style={{ width: baseW, height: baseH }}><span className="log-num">{stock.stock_nummer}</span></div>
                            <div className="log-info"><div className="log-length">{stock.maskin_langd_cm} cm</div><div className="log-product">⌀{stock.maskin_toppdia_mm}</div></div>
                          </div>
                        );
                      })}
                      <span className="stem-label">Topp</span>
                    </div>
                  </div>
                  <button className="btn-stem-overview" onClick={() => openStemOverview(latestKalib)}><span>Visa alla stockar</span><span className="btn-arrow">→</span></button>
                </div>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <>
              <header className="page-header">
                <div className="page-eyebrow">Historik</div>
                <h1 className="page-title">Hur mäter maskinen?</h1>
                <p className="page-subtitle">{allKalib.length} kontroller • {calibCount} med kalibreringar</p>
              </header>
              <div className="card">
                <div className="section-title">Per trädslag</div>
                <div className="section-subtitle">Viktad snittavvikelse (M − Operatör)</div>
                <div className="simple-bars">
                  {Object.entries(speciesData).map(([key, data]) => {
                    const name = key === 'gran' ? 'Gran' : key === 'tall' ? 'Tall' : key.charAt(0).toUpperCase() + key.slice(1);
                    return (
                      <div key={key} className="bar-group" onClick={() => openSpeciesDetail(key)} style={{ cursor: 'pointer' }}>
                        <div className="bar-header"><span className="bar-species">🌲 {name}</span><span className="bar-count">{data.count} kontroller</span></div>
                        <div className="bar-row"><span className="bar-label">Längd</span><div className="bar-track"><div className="bar-zero" /><div className={`bar-fill ${data.lenDiff < 0 ? 'neg' : 'pos'}`} style={{ width: `${Math.min(100, Math.abs(data.lenDiff) * 20)}%` }} /></div><span className="bar-value">{data.lenDiff >= 0 ? '+' : ''}{data.lenDiff} cm</span></div>
                        <div className="bar-row"><span className="bar-label">Diameter</span><div className="bar-track"><div className="bar-zero" /><div className={`bar-fill ${data.diaDiff < 0 ? 'neg' : 'pos'}`} style={{ width: `${Math.min(100, Math.abs(data.diaDiff) * 20)}%` }} /></div><span className={`bar-value ${Math.abs(data.diaDiff) > 3 ? 'warn' : ''}`}>{data.diaDiff >= 0 ? '+' : ''}{data.diaDiff} mm</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="card">
                <div className="section-title">Senaste kontrollerna</div>
                <div className="section-subtitle">Diameteravvikelse per kontroll</div>
                <div className="simple-list">
                  {historyList.map(({ kalib: k, date }) => {
                    const day = date.getDate();
                    const monthShort = date.toLocaleDateString('sv-SE', { month: 'short' });
                    const isWarn = k.status === 'VARNING';
                    return (
                      <div key={k.id} className={`list-item ${isWarn ? 'warn' : ''}`} onClick={() => openStemOverview(k)}>
                        <div className="list-date"><span className="list-day">{day}</span><span className="list-month">{monthShort}</span></div>
                        <div className="list-info"><span className="list-species">{k.tradslag}</span><span className="list-stem">{k.antal_kontrollstockar} stockar</span></div>
                        <div className="list-bar-container"><div className={`list-bar ${k.dia_avvikelse_snitt_mm < 0 ? 'neg' : 'pos'}`} style={{ width: `${Math.min(100, Math.abs(k.dia_avvikelse_snitt_mm) * 20)}%` }} /></div>
                        <span className={`list-value ${isWarn ? 'warn' : ''}`}>{k.dia_avvikelse_snitt_mm >= 0 ? '+' : ''}{k.dia_avvikelse_snitt_mm} mm</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="card">
                <div className="section-title">{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</div>
                <div className="mini-calendar">
                  <div className="mini-cal-header"><span>M</span><span>T</span><span>O</span><span>T</span><span>F</span><span>L</span><span>S</span></div>
                  <div className="mini-cal-grid">
                    {calendarDays.map((d, i) => {
                      if (d.day === null) return <div key={i} className="mini-day empty" />;
                      let cls = 'mini-day';
                      if (d.off) cls += ' off'; if (d.check) cls += ' check'; if (d.calib) cls += ' calib'; if (d.warn) cls += ' warn'; if (d.today) cls += ' today';
                      const clickable = d.check || d.calib || d.warn;
                      return <div key={i} className={cls} onClick={clickable ? () => openDayModal(d.day!) : undefined}>{d.day}</div>;
                    })}
                  </div>
                </div>
                <div className="mini-legend"><span><span className="dot green" />Kontroll</span><span><span className="dot blue" />Kalib.</span><span><span className="dot orange" />Varning</span></div>
              </div>
            </>
          )}

          {activeTab === 'report' && (
            <div className="report-page">
              <div className="report-header"><div className="report-logo">🌲</div><div className="report-title-block"><div className="report-title">Kvalitetsrapport</div><div className="report-subtitle">Kontrollmätning skördare</div></div><div className="report-date">{reportDate}</div></div>
              <div className="report-section">
                <div className="report-section-title">Nyckeltal</div>
                <div className="report-metrics">
                  <div className="report-metric"><div className="report-metric-value">{allKalib.length}</div><div className="report-metric-unit">st</div><div className="report-metric-label">Kontroller</div></div>
                  <div className="report-metric"><div className="report-metric-value">{totalStockar}</div><div className="report-metric-unit">st</div><div className="report-metric-label">Kontrollstockar</div></div>
                  <div className="report-metric"><div className="report-metric-value">{calibCount}</div><div className="report-metric-unit">st</div><div className="report-metric-label">Kalibreringar</div></div>
                  <div className="report-metric"><div className="report-metric-value">{allKalib.filter(k => k.status === 'VARNING').length}</div><div className="report-metric-unit">st</div><div className="report-metric-label">Varningar</div></div>
                </div>
              </div>
              <div className="report-section">
                <div className="report-section-title">Genomsnittlig avvikelse</div>
                <div className="report-section-desc">Maskin jämfört med operatör (viktat snitt)</div>
                <div className="report-results">
                  <div className="report-result"><div className="report-result-label">Längd</div><div className="report-result-bar"><div className="report-bar-track"><div className="report-bar-zero" /><div className={`report-bar-fill ${avgLenReport < 0 ? 'neg' : ''}`} style={{ width: `${Math.min(50, Math.abs(avgLenReport) * 10)}%`, ...(avgLenReport >= 0 ? { left: '50%' } : { right: '50%' }) }} /></div></div><div className="report-result-value">{avgLenReport >= 0 ? '+' : ''}{avgLenReport} cm</div></div>
                  <div className="report-result"><div className="report-result-label">Diameter</div><div className="report-result-bar"><div className="report-bar-track"><div className="report-bar-zero" /><div className={`report-bar-fill ${avgDiaReport < 0 ? 'neg' : ''}`} style={{ width: `${Math.min(50, Math.abs(avgDiaReport) * 10)}%`, ...(avgDiaReport >= 0 ? { left: '50%' } : { right: '50%' }) }} /></div></div><div className="report-result-value">{avgDiaReport >= 0 ? '+' : ''}{avgDiaReport} mm</div></div>
                </div>
                {(() => {
                  const withinTolerance = Math.abs(avgLenReport) <= 3 && Math.abs(avgDiaReport) <= 4;
                  return (
                    <div className={`report-verdict ${withinTolerance ? 'good' : 'warn'}`}>
                      <div className={`report-verdict-icon ${withinTolerance ? '' : 'warn-icon'}`}>{withinTolerance ? '✓' : '!'}</div>
                      <div className="report-verdict-text">
                        <div className="report-verdict-title">{withinTolerance ? 'Inom tolerans' : 'Utanför tolerans'}</div>
                        <div className="report-verdict-desc">{withinTolerance ? 'Avvikelserna ligger inom godkända gränsvärden' : 'Avvikelserna överstiger rekommenderade gränsvärden'}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="report-section">
                <div className="report-section-title">Per trädslag</div>
                <div className="report-species-table">
                  <div className="report-table-header"><span></span><span>Kontroller</span><span>Längd</span><span>Diameter</span></div>
                  {Object.entries(speciesData).map(([key, data]) => {
                    const name = key === 'gran' ? 'Gran' : key === 'tall' ? 'Tall' : key.charAt(0).toUpperCase() + key.slice(1);
                    return (
                      <div key={key} className="report-table-row" onClick={() => openSpeciesDetail(key)}>
                        <span>{name}</span><span>{data.count}</span><span>{data.lenDiff >= 0 ? '+' : ''}{data.lenDiff} cm</span><span>{data.diaDiff >= 0 ? '+' : ''}{data.diaDiff} mm</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {latestKalib && (
                <div className="report-footer">
                  <div><div className="report-signature-name">Kontrolldata</div><div className="report-signature-role">Automatiskt genererad från HQC-filer</div></div>
                  <div className="report-machine"><div>{latestKalib.maskin_id}</div><div className="report-machine-sub">{allKalib.length} kontroller totalt</div></div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`modal-overlay ${modalOpen ? 'open' : ''}`} onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header"><div className="modal-title">{modalContent?.title}</div><div className="modal-subtitle">{modalContent?.subtitle}</div></div>
            <div className="modal-body">{modalContent?.body}</div>
            <button className="modal-close" onClick={() => setModalOpen(false)}>Stäng</button>
          </div>
        </div>
      </div>
    </>
  );
}
