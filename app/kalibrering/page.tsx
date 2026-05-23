'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { KontrollResponse, StockRow, StamRow } from "@/app/api/kalibrering/kontroll/route";

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

// Konsekvent format för avvikelser. cm visas alltid med 1 decimal (+0.3, -1.5),
// mm visas alltid som heltal (+2, -1). null/undefined/NaN → '–'.
const fmtAvvikelse = (n: number | null | undefined, unit: 'cm' | 'mm'): string => {
  if (n == null || isNaN(n)) return '–';
  const sign = n > 0 ? '+' : '';
  if (unit === 'cm') return `${sign}${n.toFixed(1)}`;
  return `${sign}${Math.round(n)}`;
};

// iOS-mönster: dra ner på modalen för att stänga. Hela modalen är dragbar
// från övre 200px (handle + header). Resten behåller scroll. Hooken returnerar
// refs och touch-handlers att fästa på overlay + modal-element.
function useSwipeDownToClose(onClose: () => void) {
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = modalRef.current?.getBoundingClientRect();
    if (!rect) return;
    const touchY = e.touches[0].clientY;
    // Endast övre 200px av modalen triggar swipe — resten är scrollyta
    if (touchY - rect.top > 200) return;
    startYRef.current = touchY;
    startTimeRef.current = Date.now();
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startYRef.current == null) return;
    const deltaY = e.touches[0].clientY - startYRef.current;
    if (deltaY <= 0) return;
    if (modalRef.current) {
      modalRef.current.style.transition = 'none';
      modalRef.current.style.transform = `translateY(${deltaY}px)`;
    }
    if (overlayRef.current) {
      const opacity = Math.max(0.3, 1 - deltaY / 400);
      overlayRef.current.style.opacity = String(opacity);
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startYRef.current == null) return;
    const endY = e.changedTouches[0].clientY;
    const deltaY = endY - startYRef.current;
    const duration = Math.max(1, Date.now() - startTimeRef.current);
    const velocity = deltaY / duration;
    startYRef.current = null;

    const modal = modalRef.current;
    const overlay = overlayRef.current;

    if (deltaY > 100 || velocity > 0.5) {
      // Stäng — animera först ut, sedan unmount via state
      if (modal) {
        modal.style.transition = 'transform 0.25s cubic-bezier(0.2,0.8,0.2,1)';
        modal.style.transform = 'translateY(100%)';
      }
      if (overlay) {
        overlay.style.transition = 'opacity 0.25s';
        overlay.style.opacity = '0';
      }
      setTimeout(() => {
        onClose();
        if (modal) { modal.style.transform = ''; modal.style.transition = ''; }
        if (overlay) { overlay.style.opacity = ''; overlay.style.transition = ''; }
      }, 250);
    } else {
      // Snap tillbaka — låt CSS-transition fortsätta
      if (modal) {
        modal.style.transition = 'transform 0.2s cubic-bezier(0.2,0.8,0.2,1)';
        modal.style.transform = '';
        setTimeout(() => { if (modal) modal.style.transition = ''; }, 200);
      }
      if (overlay) {
        overlay.style.transition = 'opacity 0.2s';
        overlay.style.opacity = '';
        setTimeout(() => { if (overlay) overlay.style.transition = ''; }, 200);
      }
    }
  };

  return { modalRef, overlayRef, onTouchStart, onTouchMove, onTouchEnd };
}

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
  if (s === 'komplett') return 'Inom tolerans';
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
  type ModalEntry = { title: string; subtitle: string; body: React.ReactNode; parentLabel?: string };
  const [modalStack, setModalStack] = useState<ModalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const pushModal = (entry: Omit<ModalEntry, 'parentLabel'>) => {
    setModalStack(prev => prev.length === 0
      ? [entry]
      : [...prev, { ...entry, parentLabel: prev[prev.length - 1].title }]
    );
  };
  const popModal = () => setModalStack(prev => prev.slice(0, -1));
  const closeModal = () => setModalStack([]);

  const swipeMain = useSwipeDownToClose(closeModal);

  const [allKalib, setAllKalib] = useState<FaktKalibrering[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, DetaljKontrollStock[]>>({});
  const [historik, setHistorik] = useState<KalibHistorik[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  // Apple-kontrollmodal: filnamn som hämtas just nu, eller null
  const [laddarKontroll, setLaddarKontroll] = useState<string | null>(null);

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
  const swipeSheet = useSwipeDownToClose(() => setMaskinSheetOpen(false));

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setPartialError(null);
    try {
      const { data: kalibRows, error: kalibErr } = await supabase
        .from('fakt_kalibrering')
        .select('*')
        .order('datum', { ascending: false });

      if (kalibErr) {
        console.error('fakt_kalibrering error:', kalibErr);
        setFetchError('Kunde inte ladda kontrolldata. Dra ner för att uppdatera.');
        setLoading(false);
        return;
      }
      if (!kalibRows || kalibRows.length === 0) { setLoading(false); return; }

      setAllKalib(kalibRows);

      const { data: stockRows, error: stockErr } = await supabase
        .from('detalj_kontroll_stock')
        .select('*')
        .order('stock_nummer', { ascending: true });

      if (stockErr) {
        console.error('detalj_kontroll_stock error:', stockErr);
        setPartialError('Vissa data kunde inte laddas');
      }

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

      if (histErr) {
        console.error('fakt_kalibrering_historik error:', histErr);
        setPartialError('Vissa data kunde inte laddas');
      }
      setHistorik(histRows || []);
    } catch (err) {
      console.error('Fetch error:', err);
      setFetchError('Kunde inte ladda kontrolldata. Dra ner för att uppdatera.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // === Apple-kontrollmodal — datalager (fetch-then-push) ===
  const fetchKontroll = useCallback(
    async (filnamn: string): Promise<KontrollResponse | null> => {
      try {
        const res = await fetch(
          `/api/kalibrering/kontroll?filnamn=${encodeURIComponent(filnamn)}&key=skogsystem-debug`
        );
        if (!res.ok) {
          console.error(`fetchKontroll: HTTP ${res.status}`);
          return null;
        }
        return await res.json() as KontrollResponse;
      } catch (e) {
        console.error('fetchKontroll fel:', e);
        return null;
      }
    },
    []
  );

  const openKontrollFull = useCallback(
    async (filnamn: string) => {
      if (laddarKontroll) return;
      setLaddarKontroll(filnamn);
      const data = await fetchKontroll(filnamn);
      setLaddarKontroll(null);
      if (!data) {
        pushModal({
          title: 'Kunde inte ladda kontroll',
          subtitle: filnamn,
          body: (
            <div className="kalib-card" style={{ color: '#FF3B30' }}>
              Kontrolldata kunde inte hämtas. Försök igen.
            </div>
          ),
        });
        return;
      }
      // === Helpers för översiktsmodalen ===
      const k = data.kontroll;
      const datumStr = new Date(k.datum).toLocaleDateString('sv-SE', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
      const lenSnitt = k.langd_avvikelse_snitt_cm ?? 0;
      const diaSnitt = k.dia_avvikelse_snitt_mm ?? 0;
      // Snittets binära klassning — driver big-value-färgen och bandets marker.
      // Snittet är antingen inom eller utanför, ingen warn-zon.
      const lenCls: 'good' | 'bad' = Math.abs(lenSnitt) > 2 ? 'bad' : 'good';
      const diaCls: 'good' | 'bad' = Math.abs(diaSnitt) > 4 ? 'bad' : 'good';
      // Status-raden räknar enskilda stockar utanför tolerans — snittet
      // kan se OK ut även när flera stockar är dåliga.
      const utanforLen = data.stockar.filter(
        s => Math.abs(s.langd_avvikelse_cm ?? 0) > 2
      ).length;
      const utanforDia = data.stockar.filter(
        s => Math.abs(s.dia_avvikelse_mm ?? 0) > 4
      ).length;
      const lenStatusCls: 'good' | 'bad' = utanforLen === 0 ? 'good' : 'bad';
      const diaStatusCls: 'good' | 'bad' = utanforDia === 0 ? 'good' : 'bad';
      const lenLabel = utanforLen === 0
        ? `Alla ${data.stockar.length} inom tolerans`
        : `${utanforLen} stockar utanför`;
      const diaLabel = utanforDia === 0
        ? `Alla ${data.stockar.length} inom tolerans`
        : `${utanforDia} stockar utanför`;

      // Bandposition: avvikelse → procent. Clipp till [2,98] så markören
      // aldrig sitter på kanten även vid extrema värden.
      const bandPos = (val: number, max: number) => {
        const clipped = Math.max(-max, Math.min(max, val));
        const pct = ((clipped + max) / (max * 2)) * 100;
        return Math.max(2, Math.min(98, pct));
      };

      // Stem-val + mätare (tas från första stocken — enhetlig per fil i praktiken)
      const fs = data.stockar[0];
      const selText =
        fs?.stem_selection === 'Randomly selected stem' ? 'Slumpvald stam'
        : fs?.stem_selection === 'Manually by operator selected stem' ? 'Vald av operatör'
        : fs?.stem_selection ?? null;
      const measurer = fs?.measurer_name ?? null;

      const w = k.weather_at_harvest;
      const showSnow = (w?.snowfall_cm ?? 0) > 0;

      // === Detaljmodal för enskild stock — pushas ovanpå översikten ===
      const openStockDetalj = (s: StockRow, _stammar: StamRow[]) => {
        const sLen = s.langd_avvikelse_cm ?? 0;
        const sLenCls2: 'good' | 'bad' = Math.abs(sLen) > 2 ? 'bad' : 'good';

        // Mätpunkter med båda värdena, sorterade på position
        const mpAvvik = s.matpunkter
          .filter((m) => m.diameter_maskin_mm != null && m.diameter_operator_mm != null)
          .map((m) => ({
            position_cm: m.position_cm,
            avvikelse: (m.diameter_maskin_mm as number) - (m.diameter_operator_mm as number),
            mVal: m.diameter_maskin_mm as number,
            oVal: m.diameter_operator_mm as number,
          }))
          .sort((a, b) => a.position_cm - b.position_cm);
        const hasMp = mpAvvik.length > 0;
        const topAvvik = s.dia_avvikelse_mm ?? 0;

        // Max-avvikelse (med tecken) över mätpunkter + topp
        type DiaEntry = { avvik: number; pos: number | null };
        const allEntries: DiaEntry[] = hasMp
          ? [
              ...mpAvvik.map((p) => ({
                avvik: p.avvikelse,
                pos: p.position_cm as number | null,
              })),
              { avvik: topAvvik, pos: null },
            ]
          : [{ avvik: topAvvik, pos: null }];
        const maxEntry = allEntries.reduce((a, b) =>
          Math.abs(b.avvik) > Math.abs(a.avvik) ? b : a
        );
        const maxAvvik = maxEntry.avvik;
        const maxAvvikPos = maxEntry.pos;
        const maxCls: 'good' | 'warn' | 'bad' =
          Math.abs(maxAvvik) > 4 ? 'bad' : Math.abs(maxAvvik) > 3 ? 'warn' : 'good';

        // Subtitle-delar
        const sortText = s.sortiment_namn ?? '–';
        const lenM =
          s.maskin_langd_cm != null ? `${(s.maskin_langd_cm / 100).toFixed(1)} m` : '–';
        const mpCount = s.matpunkter.length;
        const mpText = mpCount === 1 ? '1 mätpunkt' : `${mpCount} mätpunkter`;

        // Lollipop X-skala: 10-90% mellan första och sista mätpunktens position_cm
        const minPos = hasMp ? mpAvvik[0].position_cm : 0;
        const maxPos = hasMp ? mpAvvik[mpAvvik.length - 1].position_cm : 1;
        const range = maxPos - minPos || 1;
        const xPctFor = (pos: number) =>
          mpAvvik.length === 1 ? 50 : 10 + ((pos - minPos) / range) * 80;
        // Y-skala: ±8 mm avvikelse → ±40% från mitten = 10-90% av container.
        // Clampa till 8-92% så markörens ring + label får plats vid kanten.
        const yPctFor = (avvik: number) => {
          const clamped = Math.max(-8, Math.min(8, avvik));
          const raw = 50 - (clamped / 8) * 40;
          return Math.max(8, Math.min(92, raw));
        };
        const mpClsFn = (a: number): 'good' | 'warn' | 'bad' =>
          Math.abs(a) > 4 ? 'bad' : Math.abs(a) > 3 ? 'warn' : 'good';

        pushModal({
          title: `Stock ${s.stock_nummer}`,
          subtitle: `${sortText} · ${lenM} · ${mpText}`,
          body: (
            <>
              {s.stock_nummer === 1 && (
                <div className="kalib-stock-tag-row">
                  <span className="kalib-stock-tag">ROTSTOCK</span>
                </div>
              )}

              <div className="kalib-card">
                <div className="kalib-tol-header">
                  <div className="kalib-tol-label">Längd</div>
                  <div className={`kalib-tol-value ${sLenCls2 === 'bad' ? 'bad' : ''}`}>
                    {fmtAvvikelse(sLen, 'cm')} cm
                  </div>
                </div>
                <div className="kalib-stock-mo-line">
                  Maskin {s.maskin_langd_cm ?? '–'} cm · Operatör {s.operator_langd_cm ?? '–'} cm
                </div>
              </div>

              <div className="kalib-card">
                <div className="kalib-tol-header">
                  <div className="kalib-tol-label">Diameter</div>
                  <div className={`kalib-tol-value ${maxCls === 'bad' ? 'bad' : maxCls === 'warn' ? 'warn' : ''}`}>
                    {hasMp && maxAvvikPos !== null
                      ? `max ${fmtAvvikelse(maxAvvik, 'mm')} mm @ ${maxAvvikPos} cm`
                      : `${fmtAvvikelse(maxAvvik, 'mm')} mm`}
                  </div>
                </div>

                {hasMp ? (
                  <>
                    <div className="kalib-lollipop">
                      <div className="kalib-lollipop-tol-band" />
                      <div className="kalib-lollipop-zero-line" />
                      {mpAvvik.flatMap((p, i) => {
                        const xP = xPctFor(p.position_cm);
                        const yP = yPctFor(p.avvikelse);
                        const cls = mpClsFn(p.avvikelse);
                        const above = p.avvikelse >= 0;
                        return [
                          <div
                            key={`stem-${i}`}
                            className="kalib-lollipop-stem"
                            style={{
                              left: `${xP}%`,
                              top: `${Math.min(50, yP)}%`,
                              height: `${Math.abs(yP - 50)}%`,
                            }}
                          />,
                          <div
                            key={`marker-${i}`}
                            className={`kalib-lollipop-marker ${cls}`}
                            style={{ left: `${xP}%`, top: `${yP}%` }}
                          />,
                          <div
                            key={`label-${i}`}
                            className={`kalib-lollipop-label ${cls}`}
                            style={{
                              left: `${xP}%`,
                              top: above
                                ? `calc(${yP}% - 18px)`
                                : `calc(${yP}% + 12px)`,
                            }}
                          >
                            {fmtAvvikelse(p.avvikelse, 'mm')}
                          </div>,
                        ];
                      })}
                    </div>
                    <div className="kalib-lollipop-axis">
                      <span>{minPos} cm</span>
                      <span>{maxPos} cm</span>
                    </div>
                  </>
                ) : (
                  <div className="kalib-stock-mo-line">
                    Endast toppmätning · Maskin {s.maskin_toppdia_mm ?? '–'} mm · Operatör{' '}
                    {s.operator_toppdia_mm ?? '–'} mm
                  </div>
                )}
              </div>

              {hasMp && (
                <>
                  <div className="kalib-modal-section-header">
                    <div className="kalib-modal-section-title">Per mätpunkt</div>
                  </div>
                  <div className="kalib-mp-list">
                    {mpAvvik.map((p, i) => {
                      const cls = mpClsFn(p.avvikelse);
                      return (
                        <div key={i} className="kalib-mp-row">
                          <div className="kalib-mp-pos">{p.position_cm} cm</div>
                          <div className="kalib-mp-vals">
                            Maskin {p.mVal} · Operatör {p.oVal}
                          </div>
                          <div className={`kalib-mp-diff ${cls}`}>
                            {fmtAvvikelse(p.avvikelse, 'mm')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ),
        });
      };

      pushModal({
        title: 'Kontroll',
        subtitle: `${datumStr} · ${cap(k.tradslag ?? '')} · ${k.antal_kontrollstockar ?? data.stockar.length} stockar`,
        body: (
          <>
            {(selText || measurer) && (
              <div className="kalib-pill-row">
                {selText && <span className="kalib-pill-tag">{selText}</span>}
                {measurer && <span className="kalib-pill-meta">{measurer}</span>}
              </div>
            )}

            {w && (
              <div className="kalib-weather-strip">
                {w.temperature_c != null && (
                  <div className="kalib-weather-item">
                    <MSym name="thermostat" size={18} color="#8E8E93" />
                    <span className={`kalib-weather-val ${w.is_freezing ? 'cold' : ''}`}>
                      {Math.round(w.temperature_c)}°
                    </span>
                  </div>
                )}
                {(() => {
                  const snow = w.snowfall_cm ?? 0;
                  const rain = w.precipitation_mm ?? 0;
                  const hasSnow = snow > 0;
                  const hasRain = !hasSnow && rain > 0;
                  const iconName = hasSnow ? 'weather_snowy' : 'water_drop';
                  const text = hasSnow ? `${snow.toFixed(1)} cm snö`
                    : hasRain ? `${rain.toFixed(1)} mm`
                    : 'Uppehåll';
                  return (
                    <div className="kalib-weather-item">
                      <MSym name={iconName} size={18} color="#8E8E93" />
                      <span className="kalib-weather-val">{text}</span>
                    </div>
                  );
                })()}
                {w.wind_speed_ms != null && (
                  <div className="kalib-weather-item">
                    <MSym name="air" size={18} color="#8E8E93" />
                    <span className="kalib-weather-val">{w.wind_speed_ms.toFixed(1)} m/s</span>
                  </div>
                )}
              </div>
            )}

            <div className="kalib-card">
              <div className="kalib-tol-header">
                <div className="kalib-tol-label">Längd</div>
                <div className={`kalib-tol-value ${lenCls === 'bad' ? 'bad' : lenCls === 'warn' ? 'warn' : ''}`}>
                  {fmtAvvikelse(lenSnitt, 'cm')} cm
                </div>
              </div>
              <div className="kalib-tol-band" aria-label="Toleransband längd">
                <div className="kalib-tol-zone-bad-l" />
                <div className="kalib-tol-zone-good" />
                <div className="kalib-tol-zone-bad-r" />
                <div className="kalib-tol-band-zero" />
                <div
                  className={`kalib-tol-band-marker ${lenCls}`}
                  style={{ left: `${bandPos(lenSnitt, 4)}%` }}
                />
              </div>
              <div className={`kalib-tol-status ${lenStatusCls}`}>
                <span className="kalib-tol-status-dot" />
                {lenLabel}
              </div>
            </div>

            <div className="kalib-card">
              <div className="kalib-tol-header">
                <div className="kalib-tol-label">Diameter</div>
                <div className={`kalib-tol-value ${diaCls === 'bad' ? 'bad' : diaCls === 'warn' ? 'warn' : ''}`}>
                  {fmtAvvikelse(diaSnitt, 'mm')} mm
                </div>
              </div>
              <div className="kalib-tol-band" aria-label="Toleransband diameter">
                <div className="kalib-tol-zone-bad-l" />
                <div className="kalib-tol-zone-good" />
                <div className="kalib-tol-zone-bad-r" />
                <div className="kalib-tol-band-zero" />
                <div
                  className={`kalib-tol-band-marker ${diaCls}`}
                  style={{ left: `${bandPos(diaSnitt, 8)}%` }}
                />
              </div>
              <div className={`kalib-tol-status ${diaStatusCls}`}>
                <span className="kalib-tol-status-dot" />
                {diaLabel}
              </div>
            </div>

            <div className="kalib-modal-section-header">
              <div className="kalib-modal-section-title">Stockar</div>
              <div className="kalib-modal-section-subtitle">
                {data.stockar.length} kontrollerade
              </div>
            </div>
            <div className="kalib-stockar-list">
              {data.stockar.map((s) => {
                const sLen = s.langd_avvikelse_cm ?? 0;
                const sLenCls = stockLenCls(sLen);

                // Max diameter-avvikelse över alla mätpunkter + toppen,
                // med tecknet på det värdet som har störst absolut värde.
                const mpAvvik = s.matpunkter
                  .filter(m => m.diameter_maskin_mm != null
                            && m.diameter_operator_mm != null)
                  .map(m => (m.diameter_maskin_mm as number)
                          - (m.diameter_operator_mm as number));
                const allaDiaAvvik = [...mpAvvik, s.dia_avvikelse_mm ?? 0];
                const sDia = allaDiaAvvik.reduce(
                  (a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0
                );
                // Striktare klassning för max-avvik: warn 3-4 mm, bad >4 mm
                const sDiaCls: 'good' | 'warn' | 'bad' =
                  Math.abs(sDia) > 4 ? 'bad'
                  : Math.abs(sDia) > 3 ? 'warn'
                  : 'good';

                const worst =
                  sLenCls === 'bad' || sDiaCls === 'bad' ? 'bad'
                  : sLenCls === 'warn' || sDiaCls === 'warn' ? 'warn'
                  : 'good';
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openStockDetalj(s, data.stammar)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openStockDetalj(s, data.stammar);
                      }
                    }}
                    className={`kalib-stock-row ${worst === 'bad' ? 'bad' : worst === 'warn' ? 'warn' : ''}`}
                  >
                    <div className="kalib-stock-row-num">{s.stam_nummer}·{s.stock_nummer}</div>
                    <div className="kalib-stock-row-info">
                      <div className="kalib-stock-row-title">
                        {s.sortiment_namn ?? '–'}
                      </div>
                      <div className="kalib-stock-row-meta">
                        {s.maskin_langd_cm != null ? `${s.maskin_langd_cm} cm` : '–'}
                        {' · '}
                        {s.maskin_toppdia_mm != null ? `⌀ ${s.maskin_toppdia_mm} mm` : '–'}
                      </div>
                    </div>
                    <div className="kalib-stock-row-diff">
                      <span className={`kalib-stock-row-len ${sLenCls}`}>
                        {fmtAvvikelse(sLen, 'cm')} cm
                      </span>
                      <span className={`kalib-stock-row-dia ${sDiaCls}`}>
                        {fmtAvvikelse(sDia, 'mm')} mm
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ),
      });
    },
    // pushModal är inte useCallback-stabil men det är OK — vi tar omräkning
    // av denna callback varje render hellre än att svälja exhaustive-deps.
    [laddarKontroll, fetchKontroll, pushModal]
  );

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

  // Per-stock tre-nivåklassning — återanvänds i översikt, jämförelse och stock-detaljmodalen
  const stockLenCls = (lenDiff: number): 'good' | 'warn' | 'bad' =>
    Math.abs(lenDiff) > 3 ? 'bad' : Math.abs(lenDiff) > 2 ? 'warn' : 'good';
  const stockDiaCls = (diaDiff: number): 'good' | 'warn' | 'bad' =>
    Math.abs(diaDiff) > 6 ? 'bad' : Math.abs(diaDiff) > 4 ? 'warn' : 'good';

  // === Modals ===
  const openStockModal = (stock: DetaljKontrollStock) => {
    const lenDiff = stock.langd_avvikelse_cm;
    const diaDiff = stock.dia_avvikelse_mm;
    const lenCls = stockLenCls(lenDiff);
    const diaCls = stockDiaCls(diaDiff);
    const maskinW = Math.max(180, stock.maskin_langd_cm * 0.7);
    const maskinH = Math.max(28, stock.maskin_toppdia_mm * 0.22);
    const operatorW = Math.max(180, stock.operator_langd_cm * 0.7);
    const operatorH = Math.max(28, stock.operator_toppdia_mm * 0.22);
    const stockBorderClass = diaCls === 'good' ? '' : diaCls === 'warn' ? 'warn-stock' : 'bad-stock';

    pushModal({
      title: `Stock ${stock.stock_nummer}`,
      subtitle: `Stam ${stock.stam_nummer} • ${stock.kontroll_datum}`,
      body: (
        <>
          <div className="kalib-stock-compare">
            <div className="kalib-stock-compare-row">
              <div className="kalib-stock-compare-label">Maskin</div>
              <div className={`kalib-log-body ${stockBorderClass}`} style={{ width: maskinW, height: maskinH }}>
                <span className="kalib-log-num">{stock.stock_nummer}</span>
              </div>
            </div>
            <div className="kalib-stock-compare-row">
              <div className="kalib-stock-compare-label">Operatör</div>
              <div className="kalib-log-body" style={{ width: operatorW, height: operatorH }}>
                <span className="kalib-log-num">{stock.stock_nummer}</span>
              </div>
            </div>
          </div>
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
              <div className={`kalib-summary-value ${lenCls === 'bad' ? 'bad' : ''}`}>{fmtAvvikelse(lenDiff, 'cm')} cm</div>
              <div className={`kalib-diff-badge ${lenCls}`}>{lenCls === 'good' ? 'Inom' : lenCls === 'warn' ? 'Nära gräns' : 'Utanför'}</div>
            </div>
            <div className="kalib-summary-item">
              <div className="kalib-summary-label">Topp ⌀ maskin</div>
              <div className="kalib-summary-value">{stock.maskin_toppdia_mm} mm</div>
              <div className="kalib-summary-hint">op: {stock.operator_toppdia_mm} mm</div>
            </div>
            <div className="kalib-summary-item">
              <div className="kalib-summary-label">Dia (M−O)</div>
              <div className={`kalib-summary-value ${diaCls === 'bad' ? 'bad' : ''}`}>{fmtAvvikelse(diaDiff, 'mm')} mm</div>
              <div className={`kalib-diff-badge ${diaCls}`}>{diaCls === 'good' ? 'Inom' : diaCls === 'warn' ? 'Nära gräns' : 'Utanför'}</div>
            </div>
          </div>
          {(stock.maskin_volym_sub != null && stock.operator_volym_sub != null) && (
            <div className="kalib-info-box neutral" style={{ marginTop: 16 }}>
              <span className="kalib-info-icon"><MSym name="inventory_2" size={20} color="#fff" /></span>
              <div className="kalib-info-content">
                <div className="kalib-info-title">Volym (m³fub)</div>
                <div className="kalib-info-text">Maskin: {stock.maskin_volym_sub?.toFixed(4)} • Operatör: {stock.operator_volym_sub?.toFixed(4)} • Diff: {stock.volym_avvikelse?.toFixed(4)}</div>
              </div>
            </div>
          )}
        </>
      )
    });
  };

  const openStemOverview = (kalib: FaktKalibrering) => {
    const stocks = (stockMap[kalib.filnamn] || []).sort((a, b) => a.stock_nummer - b.stock_nummer);
    const totalLen = stocks.reduce((a, s) => a + s.maskin_langd_cm, 0);

    pushModal({
      title: `Kontroll ${new Date(kalib.datum).toLocaleDateString('sv-SE')}`,
      subtitle: `${cap(kalib.tradslag)} • ${kalib.antal_kontrollstockar} stockar • ${kalib.status === 'VARNING' ? 'Varning' : 'Inom tolerans'}`,
      body: (
        <>
          <div className="kalib-total-summary">
            <div className="kalib-total-title">Snitt för kontrollen</div>
            <div className="kalib-total-grid">
              <div className="kalib-total-item"><div className="kalib-total-label">Total längd</div><div className="kalib-total-value">{(totalLen / 100).toFixed(1)}<span className="kalib-total-unit"> m</span></div></div>
              <div className="kalib-total-item"><div className="kalib-total-label">Längd (M−O)</div><div className={`kalib-total-value ${lenOut(kalib.langd_avvikelse_snitt_cm) ? 'bad' : ''}`}>{fmtAvvikelse(kalib.langd_avvikelse_snitt_cm, 'cm')}<span className="kalib-total-unit"> cm</span></div></div>
              <div className="kalib-total-item"><div className="kalib-total-label">Dia (M−O)</div><div className={`kalib-total-value ${diaOut(kalib.dia_avvikelse_snitt_mm) ? 'bad' : ''}`}>{fmtAvvikelse(kalib.dia_avvikelse_snitt_mm, 'mm')}<span className="kalib-total-unit"> mm</span></div></div>
            </div>
          </div>
          {stocks.length > 0 && (
            <>
              <div className="kalib-modal-section-header"><div className="kalib-modal-section-title">Per stock</div></div>
              <div className="kalib-overview-grid">
                {stocks.map(stock => {
                  const diaDiff = stock.dia_avvikelse_mm;
                  const cls = stockDiaCls(diaDiff);
                  return (
                    <div key={stock.id} className="kalib-overview-log" onClick={() => openStockModal(stock)}>
                      <div className="kalib-overview-num">{stock.stock_nummer}</div>
                      <div className="kalib-overview-info">
                        <div className="kalib-overview-title">Stock {stock.stock_nummer}</div>
                        <div className="kalib-overview-meta">{stock.maskin_langd_cm} cm • Topp ⌀{stock.maskin_toppdia_mm}</div>
                      </div>
                      <div className={`kalib-diff-badge ${cls}`}>{fmtAvvikelse(diaDiff, 'mm')} mm</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )
    });
  };

  const openSpeciesDetail = (species: string) => {
    const data = speciesData[species];
    if (!data) return;
    const name = species === 'gran' ? 'Gran' : species === 'tall' ? 'Tall' : species.charAt(0).toUpperCase() + species.slice(1);
    const speciesKalibs = filteredKalib.filter(k => k.tradslag.toLowerCase() === species).slice(0, 20);

    pushModal({
      title: name,
      subtitle: `${data.count} kontroller`,
      body: (
        <>
          <div className="kalib-total-summary">
            <div className="kalib-total-title">Snitt för {name.toLowerCase()}</div>
            <div className="kalib-total-grid two-col">
              <div className="kalib-total-item"><div className="kalib-total-label">Längd (M−O)</div><div className={`kalib-total-value ${lenOut(data.lenDiff) ? 'bad' : ''}`}>{fmtAvvikelse(data.lenDiff, 'cm')}<span className="kalib-total-unit"> cm</span></div></div>
              <div className="kalib-total-item"><div className="kalib-total-label">Dia (M−O)</div><div className={`kalib-total-value ${diaOut(data.diaDiff) ? 'bad' : ''}`}>{fmtAvvikelse(data.diaDiff, 'mm')}<span className="kalib-total-unit"> mm</span></div></div>
            </div>
          </div>
          <div className="kalib-modal-section-header"><div className="kalib-modal-section-title">Senaste kontroller</div></div>
          <div className="kalib-overview-grid">
            {speciesKalibs.map(k => {
              const d = new Date(k.datum);
              const cls = diaOut(k.dia_avvikelse_snitt_mm) ? 'bad' : 'good';
              return (
                <div key={k.id} className="kalib-overview-log" onClick={() => openKontrollFull(k.filnamn)}>
                  <div className="kalib-overview-num">{d.getDate()}</div>
                  <div className="kalib-overview-info">
                    <div className="kalib-overview-title">{d.toLocaleDateString('sv-SE')}</div>
                    <div className="kalib-overview-meta">{k.antal_kontrollstockar} stockar • {k.status === 'VARNING' ? 'Varning' : 'Inom'}</div>
                  </div>
                  <div className={`kalib-diff-badge ${cls}`}>{fmtAvvikelse(k.dia_avvikelse_snitt_mm, 'mm')} mm</div>
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
  };

  const openCalendarDayModal = (dag: CalDag) => {
    pushModal({
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
                {m.volym_m3sub.toFixed(2)} m³fub · {m.status === 'inaktiv' ? 'Inaktiv' : (m.huvudtyp ?? 'Okänd typ')}
              </div>
              {m.huvudtyp_okand && (
                <div className="kalib-day-maskin-info">
                  <MSym name="info" size={14} color="#8E8E93" />
                  <span>Objekttyp ej angiven</span>
                </div>
              )}
              {m.kontroller.length > 0 && (
                <div className="kalib-day-maskin-kontroller">
                  {m.kontroller.map(k => {
                    const full = allKalib.find(x => x.id === k.id);
                    return (
                      <div
                        key={k.id}
                        className="kalib-day-maskin-kontroll"
                        onClick={full ? () => openKontrollFull(full.filnamn) : undefined}
                        style={full ? { cursor: 'pointer' } : undefined}
                      >
                        {cap(k.tradslag ?? '')} · {kontrollStatusText(k.status)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
        </>
      ),
    });
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

  if (fetchError && allKalib.length === 0) {
    return (
      <>
        <style jsx global>{`
          .kalib-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',sans-serif;color:#8E8E93;text-align:center;padding:40px;background:#000}
          .kalib-empty-icon{margin-bottom:16px;color:#8E8E93}
          .kalib-empty-icon .material-symbols-outlined{font-size:64px}
          .kalib-empty-icon.error .material-symbols-outlined{font-size:24px;color:#FF3B30}
          .kalib-empty-title{font-size:22px;font-weight:600;color:#fff;margin-bottom:8px}
          .kalib-empty-text{font-size:15px;max-width:320px;color:#8E8E93}
          .kalib-empty-retry{margin-top:24px;height:44px;padding:0 24px;background:rgba(255,255,255,0.08);border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:500;font-family:inherit;cursor:pointer}
          .kalib-empty-retry:active{background:rgba(255,255,255,0.12)}
        `}</style>
        <div className="kalib-empty">
          <div className="kalib-empty-icon error"><span className="material-symbols-outlined">error_outline</span></div>
          <div className="kalib-empty-title">Kunde inte ladda kontrolldata</div>
          <div className="kalib-empty-text">{fetchError}</div>
          <button className="kalib-empty-retry" onClick={fetchData}>Försök igen</button>
        </div>
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

  const partialBanner = partialError ? (
    <div className="kalib-info-box warn" style={{ marginBottom: 16 }}>
      <span className="kalib-info-icon"><MSym name="warning" size={20} color="#FF3B30" /></span>
      <div className="kalib-info-content">
        <div className="kalib-info-title">{partialError}</div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <style jsx global>{`
        .kalib-page{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',sans-serif;background:#000;color:#fff;line-height:1.45;min-height:100vh;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
        .kalib-page *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}

        .kalib-nav{display:flex;justify-content:center;gap:8px;padding:12px 20px;background:rgba(0,0,0,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);position:sticky;top:calc(56px + env(safe-area-inset-top));z-index:100;border-bottom:0.5px solid #2C2C2E}
        .kalib-pill{height:38px;padding:0 18px;border-radius:999px;font-size:14px;font-weight:500;color:#8E8E93;background:transparent;border:none;cursor:pointer;font-family:inherit;transition:background 0.15s,color 0.15s}
        .kalib-pill.active{background:#fff;color:#000;font-weight:600}

        .kalib-container{max-width:680px;margin:0 auto;padding:24px 20px 32px}

        .kalib-page-header{margin:0 0 24px}
        .kalib-page-title{font-size:28px;font-weight:600;letter-spacing:-0.02em;line-height:1.15;margin:0 0 6px;color:#fff}
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
        .kalib-log-body.warn-stock{border:1.5px solid #8E8E93}
        .kalib-log-body.bad-stock{border:1.5px solid #FF3B30}
        .kalib-log-num{color:#fff;font-size:14px;font-weight:600}
        .kalib-log-info{text-align:center}
        .kalib-log-length{font-size:12px;font-weight:500;color:#fff}
        .kalib-log-product{font-size:10px;color:#8E8E93}

        .kalib-btn-stem{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:56px;padding:0 20px;margin-top:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;font-size:15px;font-weight:500;color:#fff;cursor:pointer;font-family:inherit}
        .kalib-btn-stem-arrow{color:#8E8E93;display:flex;align-items:center}

        .kalib-bars{display:flex;flex-direction:column;gap:18px}
        .kalib-bar-group{display:flex;align-items:flex-start;gap:10px;cursor:pointer}
        .kalib-bar-content{flex:1;min-width:0}
        .kalib-bar-chev{flex-shrink:0;display:flex;align-items:center;padding-top:2px}
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
        .kalib-table-header{display:grid;grid-template-columns:1fr 60px 70px 80px 24px;padding:10px 14px;background:rgba(255,255,255,0.04);font-size:11px;color:#8E8E93;font-weight:500}
        .kalib-table-row{display:grid;grid-template-columns:1fr 60px 70px 80px 24px;padding:14px;border-top:0.5px solid #2C2C2E;font-size:13px;cursor:pointer;color:#fff;align-items:center}
        .kalib-table-chev{display:flex;align-items:center;justify-content:flex-end}
        .kalib-table-row > span.bad{color:#FF3B30;font-weight:600}
        .kalib-report-footer{display:flex;justify-content:flex-end;padding-top:18px;border-top:0.5px solid #2C2C2E;margin-top:22px}
        .kalib-report-machine{text-align:right;font-size:13px;color:#fff}
        .kalib-report-machine-sub{font-size:11px;color:#8E8E93;margin-top:2px}

        .kalib-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:200;display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.25s}
        .kalib-modal-overlay.open{opacity:1;pointer-events:auto}
        .kalib-modal{background:#1C1C1E;width:100%;max-width:560px;max-height:88vh;border-radius:20px 20px 0 0;padding:10px 20px 28px;border:1px solid rgba(255,255,255,0.06);border-bottom:none;transform:translateY(100%);transition:transform 0.3s cubic-bezier(0.2,0.8,0.2,1);overflow-y:auto}
        .kalib-modal-overlay.open .kalib-modal{transform:translateY(0)}
        .kalib-modal-handle{width:36px;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;margin:0 auto 14px;touch-action:pan-y}
        .kalib-modal-header{touch-action:pan-y}
        .kalib-modal-back{display:inline-flex;align-items:center;gap:2px;background:none;border:none;color:#fff;font-size:15px;font-weight:400;font-family:inherit;cursor:pointer;padding:6px 0;margin:0 0 8px}

        .kalib-stock-compare{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
        .kalib-stock-compare-label{font-size:12px;color:#8E8E93;margin-bottom:4px}
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

        /* === Översiktsmodal: pill, väderstrip, toleransband, stockar-lista === */
        .kalib-pill-row{display:flex;align-items:center;gap:10px;margin:0 0 16px;padding:0 4px}
        .kalib-pill-tag{background:rgba(255,255,255,0.08);color:#fff;font-size:12px;font-weight:500;padding:4px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.06)}
        .kalib-pill-meta{font-size:13px;color:#8E8E93}

        .kalib-weather-strip{display:flex;align-items:center;gap:18px;padding:12px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;margin:0 0 16px;flex-wrap:wrap}
        .kalib-weather-item{display:flex;align-items:center;gap:6px}
        .kalib-weather-val{font-size:14px;font-weight:600;color:#fff}
        .kalib-weather-val.cold{color:#64D2FF}

        .kalib-tol-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}
        .kalib-tol-label{font-size:14px;color:#8E8E93;font-weight:500}
        .kalib-tol-value{font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.01em}
        .kalib-tol-value.warn{color:#FF9500}
        .kalib-tol-value.bad{color:#FF3B30}

        .kalib-tol-band{position:relative;height:10px;border-radius:5px;display:grid;grid-template-columns:1fr 2fr 1fr;background:rgba(255,255,255,0.04);margin:6px 0 14px}
        .kalib-tol-zone-bad-l{background:rgba(255,59,48,0.25);border-radius:5px 0 0 5px}
        .kalib-tol-zone-bad-r{background:rgba(255,59,48,0.25);border-radius:0 5px 5px 0}
        .kalib-tol-zone-good{background:rgba(52,199,89,0.22)}
        .kalib-tol-band-zero{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:rgba(255,255,255,0.35)}
        .kalib-tol-band-marker{position:absolute;top:50%;width:14px;height:14px;border-radius:50%;transform:translate(-50%,-50%);background:#fff;box-shadow:0 0 0 2px #1C1C1E,0 0 0 3px rgba(255,255,255,0.4);transition:left 0.3s cubic-bezier(0.2,0.8,0.2,1)}
        .kalib-tol-band-marker.bad{background:#FF3B30}

        .kalib-tol-status{font-size:13px;font-weight:500;display:flex;align-items:center;gap:8px}
        .kalib-tol-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        .kalib-tol-status.good{color:#34C759}
        .kalib-tol-status.good .kalib-tol-status-dot{background:#34C759}
        .kalib-tol-status.bad{color:#FF3B30}
        .kalib-tol-status.bad .kalib-tol-status-dot{background:#FF3B30}

        .kalib-stockar-list{display:flex;flex-direction:column;gap:6px}
        .kalib-stock-row{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;cursor:pointer;transition:background 0.12s,border-color 0.12s,transform 0.12s}
        .kalib-stock-row:hover{background:rgba(255,255,255,0.07)}
        .kalib-stock-row:active{transform:scale(0.99)}
        .kalib-stock-row.warn{border-color:rgba(255,149,0,0.35)}
        .kalib-stock-row.bad{border-color:rgba(255,59,48,0.4);background:rgba(255,59,48,0.06)}
        .kalib-stock-row.bad:hover{background:rgba(255,59,48,0.10)}
        .kalib-stock-row-num{width:44px;height:36px;background:rgba(255,255,255,0.06);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;flex-shrink:0;font-variant-numeric:tabular-nums}
        .kalib-stock-row-info{flex:1;min-width:0}
        .kalib-stock-row-title{font-size:14px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .kalib-stock-row-meta{font-size:12px;color:#8E8E93;margin-top:2px}
        .kalib-stock-row-diff{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;min-width:70px;text-align:right}
        .kalib-stock-row-len,.kalib-stock-row-dia{font-size:12px;font-weight:600;color:#fff}
        .kalib-stock-row-len.warn,.kalib-stock-row-dia.warn{color:#FF9500}
        .kalib-stock-row-len.bad,.kalib-stock-row-dia.bad{color:#FF3B30}

        /* === Detaljmodal: rotstock-tagg, lollipop-graf, mätpunkter-lista === */
        .kalib-stock-tag-row{display:flex;justify-content:flex-end;margin:0 0 12px}
        .kalib-stock-tag{font-size:10px;font-weight:700;letter-spacing:0.5px;padding:3px 8px;border-radius:4px;background:rgba(255,255,255,0.08);color:#8E8E93}

        .kalib-stock-mo-line{font-size:13px;color:#8E8E93;margin-top:6px}

        .kalib-lollipop{position:relative;height:150px;margin:14px 0 4px;background:rgba(255,255,255,0.02);border-radius:8px}
        .kalib-lollipop-tol-band{position:absolute;left:0;right:0;top:30%;height:40%;background:rgba(52,199,89,0.10)}
        .kalib-lollipop-zero-line{position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,0.18)}
        .kalib-lollipop-stem{position:absolute;width:2px;background:rgba(255,255,255,0.4);transform:translateX(-1px)}
        .kalib-lollipop-marker{position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;transform:translate(-50%,-50%);box-shadow:0 0 0 2px #1C1C1E,0 0 0 3px rgba(255,255,255,0.3);transition:left 0.3s,top 0.3s}
        .kalib-lollipop-marker.good{background:#34C759}
        .kalib-lollipop-marker.warn{background:#FF9500}
        .kalib-lollipop-marker.bad{background:#FF3B30}
        .kalib-lollipop-label{position:absolute;transform:translateX(-50%);font-size:11px;font-weight:600;color:#fff;white-space:nowrap;font-variant-numeric:tabular-nums;pointer-events:none}
        .kalib-lollipop-label.warn{color:#FF9500}
        .kalib-lollipop-label.bad{color:#FF3B30}

        .kalib-lollipop-axis{display:flex;justify-content:space-between;margin-top:6px;padding:0 8px;font-size:11px;color:#8E8E93}

        .kalib-mp-list{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;font-variant-numeric:tabular-nums}
        .kalib-mp-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:0.5px solid rgba(255,255,255,0.08)}
        .kalib-mp-row:last-child{border-bottom:none}
        .kalib-mp-pos{width:60px;font-size:13px;color:#8E8E93;flex-shrink:0}
        .kalib-mp-vals{flex:1;font-size:13px;color:#fff}
        .kalib-mp-diff{font-size:13px;font-weight:600;color:#fff;flex-shrink:0;min-width:44px;text-align:right}
        .kalib-mp-diff.warn{color:#FF9500}
        .kalib-mp-diff.bad{color:#FF3B30}

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
            <button className="kalib-filter-btn" onClick={() => { closeModal(); setMaskinSearchQ(''); setMaskinSheetOpen(true); }}>
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
                <h1 className="kalib-page-title">{cap(latestKalib.tradslag) || latestKalib.maskin_id}</h1>
                <p className="kalib-page-subtitle">{latestKalib.antal_kontrollstockar} stockar • {new Date(latestKalib.datum).toLocaleDateString('sv-SE')} • {latestKalib.maskin_id}</p>
              </header>

              {partialBanner}

              <div className="kalib-card">
                <div className="kalib-section-title" style={{ marginBottom: 18 }}>Avvikelse från operatör</div>
                <div className="kalib-hero-metrics">
                  <div className="kalib-hero-metric">
                    <div className={`kalib-hero-metric-value ${lenOut(latestKalib.langd_avvikelse_snitt_cm) ? 'bad' : ''}`}>
                      {fmtAvvikelse(latestKalib.langd_avvikelse_snitt_cm, 'cm')}
                    </div>
                    <div className="kalib-hero-metric-label">Längd (cm)</div>
                    <div className="kalib-hero-metric-hint">min {fmtAvvikelse(latestKalib.langd_avvikelse_min_cm, 'cm')} / max {fmtAvvikelse(latestKalib.langd_avvikelse_max_cm, 'cm')}</div>
                  </div>
                  <div className="kalib-hero-metric">
                    <div className={`kalib-hero-metric-value ${diaOut(latestKalib.dia_avvikelse_snitt_mm) ? 'bad' : ''}`}>
                      {fmtAvvikelse(latestKalib.dia_avvikelse_snitt_mm, 'mm')}
                    </div>
                    <div className="kalib-hero-metric-label">Diameter (mm)</div>
                    <div className="kalib-hero-metric-hint">min {fmtAvvikelse(latestKalib.dia_avvikelse_min_mm, 'mm')} / max {fmtAvvikelse(latestKalib.dia_avvikelse_max_mm, 'mm')}</div>
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
                  <div className="kalib-section-subtitle">{cap(latestKalib.tradslag)} • {latestStockar.length} stockar • {(totalLatestLen / 100).toFixed(1)} meter</div>
                  <div className="kalib-stem-viz">
                    <div className="kalib-stem-viz-inner">
                      <span className="kalib-stem-label">Rot</span>
                      {latestStockar.map(stock => {
                        const baseW = Math.max(60, stock.maskin_langd_cm * 0.5);
                        const baseH = Math.max(18, stock.maskin_toppdia_mm * 0.18);
                        const cls = stockDiaCls(stock.dia_avvikelse_mm);
                        const borderCls = cls === 'good' ? '' : cls === 'warn' ? 'warn-stock' : 'bad-stock';
                        return (
                          <div key={stock.id} className="kalib-log-block" onClick={() => openStockModal(stock)}>
                            <div className={`kalib-log-body ${borderCls}`} style={{ width: baseW, height: baseH }}>
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
                    <button
                      className="kalib-btn-stem"
                      onClick={() => openKontrollFull(latestKalib.filnamn)}
                      disabled={laddarKontroll === latestKalib.filnamn}
                      style={laddarKontroll === latestKalib.filnamn ? { opacity: 0.6 } : undefined}
                    >
                      <span>
                        {laddarKontroll === latestKalib.filnamn ? 'Laddar…' : 'Visa alla stockar'}
                      </span>
                      <span className="kalib-btn-stem-arrow"><MSym name="chevron_right" size={20} color="#8E8E93" /></span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <>
              {partialBanner}
              <div className="kalib-card">
                <div className="kalib-section-title">Per trädslag</div>
                <div className="kalib-bars">
                  {Object.entries(speciesData).map(([key, data]) => {
                    const name = key === 'gran' ? 'Gran' : key === 'tall' ? 'Tall' : key.charAt(0).toUpperCase() + key.slice(1);
                    const lenBad = lenOut(data.lenDiff);
                    const diaBad = diaOut(data.diaDiff);
                    return (
                      <div key={key} className="kalib-bar-group" onClick={() => openSpeciesDetail(key)}>
                        <div className="kalib-bar-content">
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
                            <span className={`kalib-bar-value ${lenBad ? 'bad' : ''}`}>{fmtAvvikelse(data.lenDiff, 'cm')} cm</span>
                          </div>
                          <div className="kalib-bar-row">
                            <span className="kalib-bar-label">Diameter</span>
                            <div className="kalib-bar-track">
                              <div className="kalib-bar-zero" />
                              <div className={`kalib-bar-fill ${data.diaDiff < 0 ? 'neg' : 'pos'} ${diaBad ? 'bad' : ''}`} style={{ width: `${Math.min(50, Math.abs(data.diaDiff) * 10)}%` }} />
                            </div>
                            <span className={`kalib-bar-value ${diaBad ? 'bad' : ''}`}>{fmtAvvikelse(data.diaDiff, 'mm')} mm</span>
                          </div>
                        </div>
                        <span className="kalib-bar-chev"><MSym name="chevron_right" size={18} color="#8E8E93" /></span>
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
                      <div key={k.id} className="kalib-list-item" onClick={() => openKontrollFull(k.filnamn)}>
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
                        <span className={`kalib-list-value ${isOut ? 'bad' : ''}`}>{fmtAvvikelse(k.dia_avvikelse_snitt_mm, 'mm')} mm</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </>
          )}

          {activeTab === 'calendar' && (
            <>
              {partialBanner}
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
            <>
            {partialBanner}
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
                    <div className={`kalib-report-result-value ${lenOut(avgLenReport) ? 'bad' : ''}`}>{fmtAvvikelse(avgLenReport, 'cm')} cm</div>
                  </div>
                  <div className="kalib-report-result">
                    <div className="kalib-report-result-label">Diameter</div>
                    <div className="kalib-report-result-bar">
                      <div className="kalib-report-bar-track">
                        <div className="kalib-report-bar-zero" />
                        <div className={`kalib-report-bar-fill ${diaOut(avgDiaReport) ? 'bad' : ''}`} style={{ width: `${Math.min(50, Math.abs(avgDiaReport) * 10)}%`, ...(avgDiaReport >= 0 ? { left: '50%' } : { right: '50%' }) }} />
                      </div>
                    </div>
                    <div className={`kalib-report-result-value ${diaOut(avgDiaReport) ? 'bad' : ''}`}>{fmtAvvikelse(avgDiaReport, 'mm')} mm</div>
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
                  <div className="kalib-table-header"><span></span><span>Kontroller</span><span>Längd</span><span>Diameter</span><span></span></div>
                  {Object.entries(speciesData).map(([key, data]) => {
                    const name = key === 'gran' ? 'Gran' : key === 'tall' ? 'Tall' : key.charAt(0).toUpperCase() + key.slice(1);
                    return (
                      <div key={key} className="kalib-table-row" onClick={() => openSpeciesDetail(key)}>
                        <span>{name}</span>
                        <span>{data.count}</span>
                        <span className={lenOut(data.lenDiff) ? 'bad' : ''}>{fmtAvvikelse(data.lenDiff, 'cm')} cm</span>
                        <span className={diaOut(data.diaDiff) ? 'bad' : ''}>{fmtAvvikelse(data.diaDiff, 'mm')} mm</span>
                        <span className="kalib-table-chev"><MSym name="chevron_right" size={18} color="#8E8E93" /></span>
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
            </>
          )}
        </div>

        {(() => {
          const top = modalStack[modalStack.length - 1];
          const isOpen = modalStack.length > 0;
          return (
            <div ref={swipeMain.overlayRef} className={`kalib-modal-overlay ${isOpen ? 'open' : ''}`} onClick={closeModal}>
              <div
                ref={swipeMain.modalRef}
                className="kalib-modal"
                onClick={e => e.stopPropagation()}
                onTouchStart={swipeMain.onTouchStart}
                onTouchMove={swipeMain.onTouchMove}
                onTouchEnd={swipeMain.onTouchEnd}
              >
                <div className="kalib-modal-handle" />
                {top?.parentLabel && (
                  <button className="kalib-modal-back" onClick={popModal}>
                    <MSym name="arrow_back_ios" size={20} color="#fff" />
                    <span>{top.parentLabel}</span>
                  </button>
                )}
                <div className="kalib-modal-header">
                  <div className="kalib-modal-title">{top?.title}</div>
                  <div className="kalib-modal-subtitle">{top?.subtitle}</div>
                </div>
                <div>{top?.body}</div>
                <button className="kalib-modal-close" onClick={closeModal}>Stäng</button>
              </div>
            </div>
          );
        })()}

        {/* === Maskin-filter sheet === */}
        <div ref={swipeSheet.overlayRef} className={`kalib-modal-overlay ${maskinSheetOpen ? 'open' : ''}`} onClick={() => setMaskinSheetOpen(false)}>
          <div
            ref={swipeSheet.modalRef}
            className="kalib-modal"
            onClick={e => e.stopPropagation()}
            onTouchStart={swipeSheet.onTouchStart}
            onTouchMove={swipeSheet.onTouchMove}
            onTouchEnd={swipeSheet.onTouchEnd}
          >
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
