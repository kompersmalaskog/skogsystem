'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// === TYPES ===
interface Matpunkt {
  position: number;
  benamning: string;
  diameter_maskin: number;
  diameter_operator: number;
}

interface Stock {
  stock_nummer: number;
  sortiment: string;
  langd_maskin: number;
  langd_operator: number;
  matpunkter: Matpunkt[];
}

interface KontrollStam {
  id: string;
  datum: string;
  stam_nummer: number;
  tradslag: string;
  antal_stockar: number;
  typ: 'check' | 'calib' | 'missing';
  kalibrering: string | null;
  temperatur: number | null;
  volym_m3fub: number | null;
  stockar: Stock[];
}

interface HistoryEntry {
  stems?: { num: number; species: string; logs: number; lenDiff: number; diaDiff: number; temp: number }[];
  type: 'check' | 'calib' | 'missing';
  calib?: string;
  vol?: number;
}

// === HELPERS ===
function buildStem475(stam: KontrollStam): Record<number, {
  product: string;
  length: { m: number; o: number };
  profile: { pos: number; label: string; m: number; o: number }[];
}> {
  const result: Record<number, any> = {};
  stam.stockar.forEach(stock => {
    result[stock.stock_nummer] = {
      product: stock.sortiment,
      length: { m: stock.langd_maskin, o: stock.langd_operator },
      profile: stock.matpunkter
        .sort((a, b) => a.position - b.position)
        .map(mp => ({
          pos: mp.position,
          label: mp.benamning,
          m: mp.diameter_maskin,
          o: mp.diameter_operator,
        })),
    };
  });
  return result;
}

function buildHistoryData(stammar: KontrollStam[]): Record<number, HistoryEntry> {
  const result: Record<number, HistoryEntry> = {};
  stammar.forEach(s => {
    const day = new Date(s.datum).getDate();
    if (s.typ === 'missing') {
      result[day] = { type: 'missing', vol: s.volym_m3fub ?? undefined };
    } else {
      // Calculate average diffs from stockar
      let totalLenDiff = 0;
      let totalDiaDiff = 0;
      let diaCount = 0;
      s.stockar.forEach(stock => {
        totalLenDiff += stock.langd_maskin - stock.langd_operator;
        stock.matpunkter.forEach(mp => {
          if (mp.benamning !== 'Topp') {
            totalDiaDiff += mp.diameter_maskin - mp.diameter_operator;
            diaCount++;
          }
        });
      });
      const avgLenDiff = s.stockar.length > 0 ? Math.round(totalLenDiff / s.stockar.length) : 0;
      const avgDiaDiff = diaCount > 0 ? Math.round(totalDiaDiff / diaCount) : 0;

      result[day] = {
        type: s.typ as 'check' | 'calib',
        calib: s.kalibrering ?? undefined,
        stems: [{
          num: s.stam_nummer,
          species: s.tradslag,
          logs: s.antal_stockar,
          lenDiff: avgLenDiff,
          diaDiff: avgDiaDiff,
          temp: s.temperatur ?? 0,
        }],
      };
    }
  });
  return result;
}

function buildHistoryList(stammar: KontrollStam[]): { day: number; species?: string; stem?: number; diaDiff?: number; type: string }[] {
  return stammar
    .sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())
    .map(s => {
      const day = new Date(s.datum).getDate();
      if (s.typ === 'missing') {
        return { day, type: 'missing' };
      }
      let totalDiaDiff = 0;
      let diaCount = 0;
      s.stockar.forEach(stock => {
        stock.matpunkter.forEach(mp => {
          if (mp.benamning !== 'Topp') {
            totalDiaDiff += mp.diameter_maskin - mp.diameter_operator;
            diaCount++;
          }
        });
      });
      return {
        day,
        species: s.tradslag,
        stem: s.stam_nummer,
        diaDiff: diaCount > 0 ? Math.round(totalDiaDiff / diaCount) : 0,
        type: s.typ,
      };
    });
}

function buildSpeciesData(stammar: KontrollStam[]): Record<string, { count: number; lenDiff: number; diaDiff: number; stems: number[] }> {
  const species: Record<string, { totalLen: number; totalDia: number; diaCount: number; lenCount: number; stems: number[] }> = {};
  stammar.filter(s => s.typ !== 'missing').forEach(s => {
    const key = s.tradslag.toLowerCase();
    if (!species[key]) species[key] = { totalLen: 0, totalDia: 0, diaCount: 0, lenCount: 0, stems: [] };
    species[key].stems.push(s.stam_nummer);
    s.stockar.forEach(stock => {
      species[key].totalLen += stock.langd_maskin - stock.langd_operator;
      species[key].lenCount++;
      stock.matpunkter.forEach(mp => {
        if (mp.benamning !== 'Topp') {
          species[key].totalDia += mp.diameter_maskin - mp.diameter_operator;
          species[key].diaCount++;
        }
      });
    });
  });
  const result: Record<string, { count: number; lenDiff: number; diaDiff: number; stems: number[] }> = {};
  Object.entries(species).forEach(([key, v]) => {
    result[key] = {
      count: v.stems.length,
      lenDiff: v.lenCount > 0 ? Math.round(v.totalLen / v.lenCount * 10) / 10 : 0,
      diaDiff: v.diaCount > 0 ? Math.round(v.totalDia / v.diaCount * 10) / 10 : 0,
      stems: v.stems,
    };
  });
  return result;
}

export default function KalibreringPage() {
  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'report'>('today');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<{ title: string; subtitle: string; body: React.ReactNode } | null>(null);
  const [loading, setLoading] = useState(true);

  // Data from Supabase
  const [todayStam, setTodayStam] = useState<KontrollStam | null>(null);
  const [allStammar, setAllStammar] = useState<KontrollStam[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch all kontroll_stammar sorted by date
        const { data: stammarRows, error: stamErr } = await supabase
          .from('kontroll_stammar')
          .select('*')
          .order('datum', { ascending: false });

        if (stamErr) { console.error('kontroll_stammar error:', stamErr); setLoading(false); return; }
        if (!stammarRows || stammarRows.length === 0) { setLoading(false); return; }

        // Fetch all stockar for these stammar
        const stamIds = stammarRows.map((s: any) => s.id);
        const { data: stockarRows, error: stockErr } = await supabase
          .from('kontroll_stockar')
          .select('*')
          .in('kontroll_stam_id', stamIds)
          .order('stock_nummer', { ascending: true });

        if (stockErr) console.error('kontroll_stockar error:', stockErr);

        // Fetch all matpunkter for these stockar
        const stockIds = (stockarRows || []).map((s: any) => s.id);
        let matpunkterRows: any[] = [];
        if (stockIds.length > 0) {
          const { data: mpRows, error: mpErr } = await supabase
            .from('kontroll_matpunkter')
            .select('*')
            .in('kontroll_stock_id', stockIds)
            .order('position', { ascending: true });
          if (mpErr) console.error('kontroll_matpunkter error:', mpErr);
          matpunkterRows = mpRows || [];
        }

        // Build matpunkter map: stock_id -> matpunkter[]
        const mpMap: Record<string, Matpunkt[]> = {};
        matpunkterRows.forEach((mp: any) => {
          if (!mpMap[mp.kontroll_stock_id]) mpMap[mp.kontroll_stock_id] = [];
          mpMap[mp.kontroll_stock_id].push({
            position: mp.position,
            benamning: mp.benamning,
            diameter_maskin: mp.diameter_maskin,
            diameter_operator: mp.diameter_operator,
          });
        });

        // Build stockar map: stam_id -> stockar[]
        const stockMap: Record<string, Stock[]> = {};
        (stockarRows || []).forEach((s: any) => {
          if (!stockMap[s.kontroll_stam_id]) stockMap[s.kontroll_stam_id] = [];
          stockMap[s.kontroll_stam_id].push({
            stock_nummer: s.stock_nummer,
            sortiment: s.sortiment,
            langd_maskin: s.langd_maskin,
            langd_operator: s.langd_operator,
            matpunkter: mpMap[s.id] || [],
          });
        });

        // Build full KontrollStam objects
        const stammar: KontrollStam[] = stammarRows.map((s: any) => ({
          id: s.id,
          datum: s.datum,
          stam_nummer: s.stam_nummer,
          tradslag: s.tradslag,
          antal_stockar: s.antal_stockar,
          typ: s.typ as 'check' | 'calib' | 'missing',
          kalibrering: s.kalibrering,
          temperatur: s.temperatur,
          volym_m3fub: s.volym_m3fub,
          stockar: stockMap[s.id] || [],
        }));

        setAllStammar(stammar);
        // Today's stem = most recent non-missing entry
        const today = stammar.find(s => s.typ !== 'missing');
        setTodayStam(today || null);
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Derived data
  const stem475 = todayStam ? buildStem475(todayStam) : {};
  const historyData = buildHistoryData(allStammar);
  const historyList = buildHistoryList(allStammar);
  const speciesData = buildSpeciesData(allStammar);

  // Report calculations
  const checkStammar = allStammar.filter(s => s.typ !== 'missing');
  const calibStammar = allStammar.filter(s => s.typ === 'calib');
  const totalVolym = allStammar.reduce((acc, s) => acc + (s.volym_m3fub ?? 0), 0);
  const kontrollFrekvens = checkStammar.length > 0 ? Math.round(totalVolym / checkStammar.length) : 0;

  // Overall average diffs for report
  let reportTotalLen = 0, reportLenCount = 0, reportTotalDia = 0, reportDiaCount = 0;
  checkStammar.forEach(s => {
    s.stockar.forEach(stock => {
      reportTotalLen += stock.langd_maskin - stock.langd_operator;
      reportLenCount++;
      stock.matpunkter.forEach(mp => {
        if (mp.benamning !== 'Topp') {
          reportTotalDia += mp.diameter_maskin - mp.diameter_operator;
          reportDiaCount++;
        }
      });
    });
  });
  const avgLenReport = reportLenCount > 0 ? Math.round(reportTotalLen / reportLenCount * 10) / 10 : 0;
  const avgDiaReport = reportDiaCount > 0 ? Math.round(reportTotalDia / reportDiaCount * 10) / 10 : 0;

  // Today hero metrics
  let todayLenDiff = 0, todayDiaDiff = 0;
  if (todayStam) {
    let tl = 0, td = 0, dc = 0, lc = 0;
    todayStam.stockar.forEach(stock => {
      tl += stock.langd_maskin - stock.langd_operator;
      lc++;
      stock.matpunkter.forEach(mp => {
        if (mp.benamning !== 'Topp') {
          td += mp.diameter_maskin - mp.diameter_operator;
          dc++;
        }
      });
    });
    todayLenDiff = lc > 0 ? Math.round(tl / lc) : 0;
    todayDiaDiff = dc > 0 ? Math.round(td / dc) : 0;
  }

  const todayTotalLen = todayStam ? todayStam.stockar.reduce((a, s) => a + s.langd_maskin, 0) : 0;

  // Calendar – build from allStammar for the month of the most recent entry
  const calendarMonth = allStammar.length > 0 ? new Date(allStammar[0].datum) : new Date();
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Monday=0
  const monthName = new Date(year, month).toLocaleDateString('sv-SE', { month: 'long' });

  const stamByDay: Record<number, KontrollStam> = {};
  allStammar.forEach(s => {
    const d = new Date(s.datum);
    if (d.getFullYear() === year && d.getMonth() === month) {
      stamByDay[d.getDate()] = s;
    }
  });

  const calendarDays: { day: number | null; check?: boolean; calib?: boolean; warn?: boolean; off?: boolean; today?: boolean }[] = [];
  for (let i = 0; i < firstDow; i++) calendarDays.push({ day: null });
  const todayDate = new Date();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (firstDow + d - 1) % 7;
    const isWeekend = dow >= 5;
    const stam = stamByDay[d];
    const isToday = todayDate.getFullYear() === year && todayDate.getMonth() === month && todayDate.getDate() === d;
    calendarDays.push({
      day: d,
      off: isWeekend && !stam,
      check: stam?.typ === 'check',
      calib: stam?.typ === 'calib',
      warn: stam?.typ === 'missing',
      today: isToday,
    });
  }

  const openLogModal = (logNum: number) => {
    const log = stem475[logNum];
    if (!log) return;
    const maxDia = Math.max(...log.profile.map(p => p.m));
    const minDia = Math.min(...log.profile.map(p => p.m));
    const lenDiff = log.length.m - log.length.o;
    const controlDias = log.profile.filter(p => p.label !== 'Topp');
    const avgDiff = Math.round(controlDias.reduce((a, p) => a + (p.m - p.o), 0) / controlDias.length);

    setModalContent({
      title: `Stock ${logNum}`,
      subtitle: `${log.product} • ${log.length.m} cm`,
      body: (
        <>
          <div className="profile-section">
            <div className="profile-title">Diameterprofil</div>
            <div className="profile-subtitle">Maskinens mätningar från rot till topp (mm)</div>
            <div className="profile-chart">
              {log.profile.map((p, i) => {
                const barHeight = 20 + ((p.m - minDia) / (maxDia - minDia || 1)) * 60;
                const isTop = p.label === 'Topp';
                const diff = !isTop ? p.m - p.o : null;
                const diffClass = diff !== null ? (Math.abs(diff) > 6 ? 'bad' : Math.abs(diff) > 4 ? 'warn' : 'good') : '';
                return (
                  <div key={i} className="profile-point">
                    <div className="profile-bar" style={{ height: `${barHeight}px` }} />
                    <div className="profile-value">{p.m}</div>
                    <div className="profile-label">{p.label}</div>
                    {diff !== null && <div className={`profile-diff ${diffClass}`}>{diff >= 0 ? '+' : ''}{diff}</div>}
                  </div>
                );
              })}
            </div>
            <div className="profile-legend"><span>← Rot</span><span>Topp →</span></div>
          </div>
          <div className="summary-row">
            <div className="summary-item"><div className="summary-label">Längd</div><div className="summary-value">{log.length.m} cm</div><div className="summary-diff">{lenDiff >= 0 ? '+' : ''}{lenDiff} vs op</div></div>
            <div className="summary-item"><div className="summary-label">Topp ⌀</div><div className="summary-value">{log.profile[log.profile.length - 1].m} mm</div></div>
            <div className="summary-item"><div className="summary-label">Dia (M−O)</div><div className="summary-value">{avgDiff >= 0 ? '+' : ''}{avgDiff} mm</div><div className="summary-hint">snitt</div></div>
          </div>
        </>
      )
    });
    setModalOpen(true);
  };

  const openStemOverview = () => {
    if (!todayStam) return;
    let totalLen = 0, totalLenDiff = 0;
    const allDiaDiffs: number[] = [];
    Object.values(stem475).forEach(log => {
      totalLen += log.length.m;
      totalLenDiff += (log.length.m - log.length.o);
      log.profile.forEach(p => { if (p.label !== 'Topp') allDiaDiffs.push(p.m - p.o); });
    });
    const avgDiaDiff = allDiaDiffs.length > 0 ? Math.round(allDiaDiffs.reduce((a, b) => a + b, 0) / allDiaDiffs.length) : 0;
    const avgLenDiff = Object.keys(stem475).length > 0 ? Math.round(totalLenDiff / Object.keys(stem475).length * 10) / 10 : 0;

    setModalContent({
      title: `Stam #${todayStam.stam_nummer}`,
      subtitle: `${todayStam.tradslag} • ${todayStam.antal_stockar} stockar • Alla mätpunkter`,
      body: (
        <>
          <div className="total-summary">
            <div className="total-title">Snitt för hela stammen</div>
            <div className="total-grid">
              <div className="total-item"><div className="total-label">Total längd</div><div className="total-value">{(totalLen/100).toFixed(1)}<span className="total-unit"> m</span></div></div>
              <div className="total-item"><div className="total-label">Längd (M−O)</div><div className="total-value">{avgLenDiff >= 0 ? '+' : ''}{avgLenDiff}<span className="total-unit"> cm</span></div></div>
              <div className="total-item"><div className="total-label">Dia (M−O)</div><div className="total-value">{avgDiaDiff >= 0 ? '+' : ''}{avgDiaDiff}<span className="total-unit"> mm</span></div></div>
            </div>
          </div>
          <div className="modal-section-header"><div className="modal-section-title">Per stock</div><div className="modal-section-subtitle">Tryck för detaljer</div></div>
          <div className="overview-grid">
            {Object.entries(stem475).map(([num, log]) => {
              const topDia = log.profile[log.profile.length - 1].m;
              const cDias = log.profile.filter(p => p.label !== 'Topp');
              const avg = cDias.length > 0 ? Math.round(cDias.reduce((a, p) => a + (p.m - p.o), 0) / cDias.length) : 0;
              const cls = Math.abs(avg) > 6 ? 'bad' : Math.abs(avg) > 4 ? 'warn' : 'good';
              return (
                <div key={num} className="overview-log" onClick={() => { setModalOpen(false); setTimeout(() => openLogModal(parseInt(num)), 150); }}>
                  <div className="overview-log-num">{num}</div>
                  <div className="overview-log-info"><div className="overview-log-title">{log.product}</div><div className="overview-log-meta">{log.length.m} cm • Topp ⌀{topDia}</div></div>
                  <div className={`overview-log-diff ${cls}`}>{avg >= 0 ? '+' : ''}{avg} mm</div>
                </div>
              );
            })}
          </div>
        </>
      )
    });
    setModalOpen(true);
  };

  const openDayModal = (day: number) => {
    const data = historyData[day];
    if (!data) return;

    if (data.type === 'missing') {
      setModalContent({
        title: `${day} ${monthName}`, subtitle: 'Ingen kontroll',
        body: (<div className="info-box warm"><div className="info-box-icon">⚠️</div><div className="info-box-content"><div className="info-box-title">Kontroll saknas</div><div className="info-box-text">{data.vol} m³fub producerades denna dag utan att en kontrollstam mättes.</div></div></div>)
      });
    } else if (data.type === 'calib') {
      const stem = data.stems![0];
      setModalContent({
        title: `${day} ${monthName}`, subtitle: 'Kalibrering utförd',
        body: (
          <>
            <div className="total-summary calib-style"><div className="total-title calib-title">Kalibrering</div><div className="calib-value">{data.calib}</div></div>
            <div className="weather-box"><div className="weather-icon">{stem.temp <= -10 ? '🥶' : stem.temp <= -5 ? '❄️' : '🌡️'}</div><div className="weather-info"><div className="weather-temp">{stem.temp}°C vid mätning</div><div className="weather-note">{stem.temp <= -10 ? 'Extrem kyla' : stem.temp <= -5 ? 'Kyla kan påverka mätningen' : 'Normal temperatur'}</div></div></div>
            <div className="modal-section-header"><div className="modal-section-title">Kontrollstam</div></div>
            <div className="overview-log"><div className="overview-log-num">{stem.num}</div><div className="overview-log-info"><div className="overview-log-title">Stam #{stem.num} • {stem.species}</div><div className="overview-log-meta">{stem.logs} stockar</div></div><div className="overview-log-diff">{stem.diaDiff >= 0 ? '+' : ''}{stem.diaDiff} mm</div></div>
          </>
        )
      });
    } else {
      const stem = data.stems![0];
      const isTodayStem = todayStam && stem.num === todayStam.stam_nummer;
      setModalContent({
        title: `${day} ${monthName}`, subtitle: '1 kontrollstam',
        body: (
          <>
            <div className="total-summary">
              <div className="total-title">Dagens mätning</div>
              <div className="total-grid">
                <div className="total-item"><div className="total-label">Trädslag</div><div className="total-value small">{stem.species}</div></div>
                <div className="total-item"><div className="total-label">Längd (M−O)</div><div className="total-value">{stem.lenDiff >= 0 ? '+' : ''}{stem.lenDiff}<span className="total-unit"> cm</span></div></div>
                <div className="total-item"><div className="total-label">Dia (M−O)</div><div className="total-value">{stem.diaDiff >= 0 ? '+' : ''}{stem.diaDiff}<span className="total-unit"> mm</span></div></div>
              </div>
            </div>
            <div className="weather-box"><div className="weather-icon">{stem.temp <= -10 ? '🥶' : stem.temp <= -5 ? '❄️' : '🌡️'}</div><div className="weather-info"><div className="weather-temp">{stem.temp}°C vid mätning</div><div className="weather-note">{stem.temp <= -10 ? 'Extrem kyla kan påverka mätningen' : stem.temp <= -5 ? 'Kyla kan påverka mätningen' : 'Normal temperatur'}</div></div></div>
            <div className="overview-log" onClick={isTodayStem ? openStemOverview : undefined}><div className="overview-log-num">#</div><div className="overview-log-info"><div className="overview-log-title">Stam #{stem.num}</div><div className="overview-log-meta">{stem.logs} stockar</div></div>{isTodayStem && <span className="overview-link">Visa →</span>}</div>
          </>
        )
      });
    }
    setModalOpen(true);
  };

  const openSpeciesDetail = (species: string) => {
    const data = speciesData[species];
    if (!data) return;
    const name = species === 'gran' ? 'Gran' : species === 'tall' ? 'Tall' : species.charAt(0).toUpperCase() + species.slice(1);
    setModalContent({
      title: name, subtitle: `${data.count} kontrollstammar`,
      body: (
        <>
          <div className="total-summary">
            <div className="total-title">Snitt för {name}</div>
            <div className="total-grid two-col">
              <div className="total-item"><div className="total-label">Längd (M−O)</div><div className="total-value">{data.lenDiff >= 0 ? '+' : ''}{data.lenDiff}<span className="total-unit"> cm</span></div></div>
              <div className="total-item"><div className="total-label">Dia (M−O)</div><div className="total-value">{data.diaDiff >= 0 ? '+' : ''}{data.diaDiff}<span className="total-unit"> mm</span></div></div>
            </div>
          </div>
          <div className="modal-section-header"><div className="modal-section-title">Stammar</div></div>
          <div className="overview-grid">
            {data.stems.map(stemNum => {
              const dayEntry = Object.entries(historyData).find(([, v]) => v.stems && v.stems[0].num === stemNum);
              if (!dayEntry) return null;
              const [day, dayData] = dayEntry;
              const stem = dayData.stems![0];
              return (
                <div key={stemNum} className="overview-log" onClick={() => openDayModal(parseInt(day))}>
                  <div className="overview-log-num">{day}</div>
                  <div className="overview-log-info"><div className="overview-log-title">Stam #{stem.num}</div><div className="overview-log-meta">{stem.logs} stockar • {stem.temp}°C</div></div>
                  <div className="overview-log-diff">{stem.diaDiff >= 0 ? '+' : ''}{stem.diaDiff} mm</div>
                </div>
              );
            })}
          </div>
          <div className="info-box"><div className="info-box-icon">📊</div><div className="info-box-content"><div className="info-box-title">Tillräckligt underlag?</div><div className="info-box-text">{data.count >= 5 ? `Ja, ${data.count} stammar ger ett bra underlag.` : 'Fler kontroller behövs för att dra säkra slutsatser.'}</div></div></div>
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

  if (allStammar.length === 0) {
    return (
      <>
        <style jsx global>{`
          .kalib-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;color:#86868b;text-align:center;padding:40px}
          .kalib-empty-icon{font-size:64px;margin-bottom:16px}
          .kalib-empty-title{font-size:22px;font-weight:600;color:#1d1d1f;margin-bottom:8px}
          .kalib-empty-text{font-size:15px;max-width:320px}
        `}</style>
        <div className="kalib-empty"><div className="kalib-empty-icon">📏</div><div className="kalib-empty-title">Inga kontrollmätningar</div><div className="kalib-empty-text">När kontrollstammar registreras visas de här med jämförelser och statistik.</div></div>
      </>
    );
  }

  // Format date for report
  const reportDate = allStammar.length > 0 ? new Date(allStammar[0].datum).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

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
          <button className={`nav-pill ${activeTab === 'today' ? 'active' : ''}`} onClick={() => setActiveTab('today')}>Idag</button>
          <button className={`nav-pill ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>Historik</button>
          <button className={`nav-pill ${activeTab === 'report' ? 'active' : ''}`} onClick={() => setActiveTab('report')}>Rapport</button>
        </nav>

        <div className="container">
          {activeTab === 'today' && todayStam && (
            <>
              <header className="page-header">
                <div className="page-eyebrow">Kontrollmätning</div>
                <h1 className="page-title">Stam #{todayStam.stam_nummer}</h1>
                <p className="page-subtitle">{todayStam.tradslag} • {todayStam.antal_stockar} stockar • Kontrollerad {new Date(todayStam.datum).toLocaleDateString('sv-SE')}</p>
              </header>
              <div className="card">
                <div className="section-title">Så mätte maskinen</div>
                <div className="section-subtitle">Jämfört med operatörens manuella mätning</div>
                <div className="hero-metrics">
                  <div className="hero-metric"><div className="hero-metric-value">{todayLenDiff >= 0 ? '+' : ''}{todayLenDiff}</div><div className="hero-metric-label">Längd (cm)</div><div className="hero-metric-hint">Maskin − Operatör</div></div>
                  <div className="hero-metric"><div className="hero-metric-value">{todayDiaDiff >= 0 ? '+' : ''}{todayDiaDiff}</div><div className="hero-metric-label">Diameter (mm)</div><div className="hero-metric-hint">Maskin − Operatör</div></div>
                </div>
                <div className="info-box"><div className="info-box-icon">📊</div><div className="info-box-content"><div className="info-box-title">En stam räcker inte</div><div className="info-box-text">För att veta om justering behövs måste du se trenden över flera kontroller.</div></div></div>
              </div>
              {todayStam.temperatur !== null && (
                <div className="card card-tight">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ fontSize: '32px' }}>{todayStam.temperatur <= -10 ? '🥶' : todayStam.temperatur <= -5 ? '❄️' : '🌡️'}</div>
                    <div><div style={{ fontWeight: 600, marginBottom: '2px' }}>{todayStam.temperatur}°C vid mätning</div><div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{todayStam.temperatur <= -5 ? 'Kyla kan påverka mätningen.' : 'Normal temperatur.'}</div></div>
                  </div>
                </div>
              )}
              <div className="card">
                <div className="section-title">Stammen</div>
                <div className="section-subtitle">{todayStam.tradslag} • {todayStam.antal_stockar} stockar • {(todayTotalLen / 100).toFixed(1)} meter • Tryck för detaljer</div>
                <div className="stem-viz">
                  <div className="stem-viz-inner">
                    <span className="stem-label">Rot</span>
                    {Object.entries(stem475).map(([n, log]) => {
                      const num = parseInt(n);
                      const baseW = 40 + Math.min(60, log.length.m / 8);
                      const baseH = 25 + Math.min(50, (log.profile[0]?.m ?? 200) / 6);
                      return (<div key={num} className="log-block" onClick={() => openLogModal(num)}><div className="log-body" style={{width: baseW, height: baseH}}><span className="log-num">{num}</span></div><div className="log-info"><div className="log-length">{log.length.m} cm</div><div className="log-product">{log.product}</div></div></div>);
                    })}
                    <span className="stem-label">Topp</span>
                  </div>
                </div>
                <button className="btn-stem-overview" onClick={openStemOverview}><span>Visa hela stammen</span><span className="btn-arrow">→</span></button>
                <div className="info-box"><div className="info-box-icon">👆</div><div className="info-box-content"><div className="info-box-title">Tryck på en stock för detaljer</div><div className="info-box-text">Eller &quot;Visa hela stammen&quot; för sammanfattning.</div></div></div>
              </div>
            </>
          )}

          {activeTab === 'history' && (
            <>
              <header className="page-header">
                <div className="page-eyebrow">Historik</div>
                <h1 className="page-title">Hur mäter maskinen?</h1>
                <p className="page-subtitle">{checkStammar.length} kontroller • {calibStammar.length} kalibreringar</p>
              </header>
              <div className="card">
                <div className="section-title">Per trädslag</div>
                <div className="section-subtitle">Hur maskinen mäter i snitt (M − Operatör)</div>
                <div className="simple-bars">
                  {Object.entries(speciesData).map(([key, data]) => {
                    const name = key === 'gran' ? 'Gran' : key === 'tall' ? 'Tall' : key.charAt(0).toUpperCase() + key.slice(1);
                    const emoji = key === 'tall' ? '🌲' : '🌲';
                    return (
                      <div key={key} className="bar-group" onClick={() => openSpeciesDetail(key)} style={{cursor:'pointer'}}>
                        <div className="bar-header"><span className="bar-species">{emoji} {name}</span><span className="bar-count">{data.count} stammar</span></div>
                        <div className="bar-row"><span className="bar-label">Längd</span><div className="bar-track"><div className="bar-zero"/><div className={`bar-fill ${data.lenDiff < 0 ? 'neg' : 'pos'}`} style={{width:`${Math.min(100, Math.abs(data.lenDiff) * 20)}%`}}/></div><span className="bar-value">{data.lenDiff >= 0 ? '+' : ''}{data.lenDiff} cm</span></div>
                        <div className="bar-row"><span className="bar-label">Diameter</span><div className="bar-track"><div className="bar-zero"/><div className={`bar-fill ${data.diaDiff < 0 ? 'neg' : 'pos'}`} style={{width:`${Math.min(100, Math.abs(data.diaDiff) * 20)}%`}}/></div><span className={`bar-value ${Math.abs(data.diaDiff) > 3 ? 'warn' : ''}`}>{data.diaDiff >= 0 ? '+' : ''}{data.diaDiff} mm</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="card">
                <div className="section-title">Senaste kontrollerna</div>
                <div className="section-subtitle">Diameter-avvikelse per dag</div>
                <div className="simple-list">
                  {historyList.map((item, i) => {
                    const monthShort = monthName.substring(0, 3);
                    return (
                      <div key={i} className={`list-item ${item.type==='calib'?'calib':''} ${item.type==='missing'?'warn':''}`} onClick={() => openDayModal(item.day)}>
                        <div className="list-date"><span className="list-day">{item.day}</span><span className="list-month">{monthShort}</span></div>
                        <div className="list-info">{item.type==='missing'?<span className="list-missing">Ingen kontroll</span>:<><span className="list-species">{item.species}</span><span className="list-stem">#{item.stem}</span></>}</div>
                        {item.type==='calib'?<div className="list-calib-badge">Kalibrering</div>:item.type!=='missing'?<div className="list-bar-container"><div className={`list-bar ${item.diaDiff!<0?'neg':'pos'}`} style={{width:`${Math.min(100,Math.abs(item.diaDiff!)*20)}%`}}/></div>:null}
                        <span className={`list-value ${item.type==='missing'?'warn':''} ${item.type==='calib'?'calib':''}`}>{item.type==='missing'?'—':item.type==='calib'?'⚙️':`${item.diaDiff!>=0?'+':''}${item.diaDiff} mm`}</span>
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
                    {calendarDays.map((d,i) => {
                      if(d.day===null) return <div key={i} className="mini-day empty"/>;
                      let cls='mini-day';
                      if(d.off)cls+=' off';if(d.check)cls+=' check';if(d.calib)cls+=' calib';if(d.warn)cls+=' warn';if(d.today)cls+=' today';
                      const clickable=d.check||d.calib||d.warn;
                      return <div key={i} className={cls} onClick={clickable?()=>openDayModal(d.day!):undefined}>{d.day}</div>;
                    })}
                  </div>
                </div>
                <div className="mini-legend"><span><span className="dot green"/>Kontroll</span><span><span className="dot blue"/>Kalib.</span><span><span className="dot orange"/>Saknas</span></div>
              </div>
            </>
          )}

          {activeTab === 'report' && (
            <div className="report-page">
              <div className="report-header"><div className="report-logo">🌲</div><div className="report-title-block"><div className="report-title">Kvalitetsrapport</div><div className="report-subtitle">Kontrollmätning skördare</div></div><div className="report-date">{reportDate}</div></div>
              <div className="report-section">
                <div className="report-section-title">Nyckeltal</div>
                <div className="report-metrics">
                  <div className="report-metric"><div className="report-metric-value">{Math.round(totalVolym)}</div><div className="report-metric-unit">m³fub</div><div className="report-metric-label">Total volym</div></div>
                  <div className="report-metric"><div className="report-metric-value">{checkStammar.length}</div><div className="report-metric-unit">st</div><div className="report-metric-label">Kontrollstammar</div></div>
                  <div className="report-metric"><div className="report-metric-value">{kontrollFrekvens}</div><div className="report-metric-unit">m³fub</div><div className="report-metric-label">Kontrollfrekvens</div></div>
                  <div className="report-metric"><div className="report-metric-value">{calibStammar.length}</div><div className="report-metric-unit">st</div><div className="report-metric-label">Kalibreringar</div></div>
                </div>
              </div>
              <div className="report-section">
                <div className="report-section-title">Genomsnittlig avvikelse</div>
                <div className="report-section-desc">Maskin jämfört med operatör</div>
                <div className="report-results">
                  <div className="report-result"><div className="report-result-label">Längd</div><div className="report-result-bar"><div className="report-bar-track"><div className="report-bar-zero"/><div className={`report-bar-fill ${avgLenReport < 0 ? 'neg' : ''}`} style={{width:`${Math.min(50, Math.abs(avgLenReport) * 10)}%`, ...(avgLenReport >= 0 ? {left:'50%'} : {right:'50%'})}}/></div></div><div className="report-result-value">{avgLenReport >= 0 ? '+' : ''}{avgLenReport} cm</div></div>
                  <div className="report-result"><div className="report-result-label">Diameter</div><div className="report-result-bar"><div className="report-bar-track"><div className="report-bar-zero"/><div className={`report-bar-fill ${avgDiaReport < 0 ? 'neg' : ''}`} style={{width:`${Math.min(50, Math.abs(avgDiaReport) * 10)}%`, ...(avgDiaReport >= 0 ? {left:'50%'} : {right:'50%'})}}/></div></div><div className="report-result-value">{avgDiaReport >= 0 ? '+' : ''}{avgDiaReport} mm</div></div>
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
                  <div className="report-table-header"><span></span><span>Stammar</span><span>Längd</span><span>Diameter</span></div>
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
              <button className="btn btn-primary" style={{width:'100%',marginTop:'24px'}}>Exportera PDF</button>
            </div>
          )}
        </div>

        <div className={`modal-overlay ${modalOpen?'open':''}`} onClick={()=>setModalOpen(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-handle"/>
            <div className="modal-header"><div className="modal-title">{modalContent?.title}</div><div className="modal-subtitle">{modalContent?.subtitle}</div></div>
            <div className="modal-body">{modalContent?.body}</div>
            <button className="modal-close" onClick={()=>setModalOpen(false)}>Stäng</button>
          </div>
        </div>
      </div>
    </>
  );
}
