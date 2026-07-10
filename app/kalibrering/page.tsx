'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { KontrollResponse, StockRow, StamRow } from "@/app/api/kalibrering/kontroll/route";
import PageContainer from '@/components/PageContainer';

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
  object_name?: string | null;
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

// Pluralis: 1 = singular, 2+ = plural. "1 stock" / "2 stockar".
const antalText = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;
const stockText = (n: number) => antalText(n, 'stock', 'stockar');
const stamText = (n: number) => antalText(n, 'stam', 'stammar');

// === Delad avvikelse-klassificering (mall: Trend-fliken) =====================
// EN källa för hur en diameter-/längd-avvikelse klassas i hela kalibreringsvyn.
// Returnerar SEMANTISK status — inte en färg. Temat mappar status → ton-token,
// och CSS mappar ton-token → hex (på ett ställe per element).
//
// Trösklarna är EXAKT Trends valCls (rör inte Trend-komponenten):
//   diameter (mm): >6 röd · >4 orange · <−4 förLitet · annars ok   (tolerans ±4)
//   längd    (cm): >3 röd · >2 orange · <−2 förLitet · annars ok   (tolerans ±2)
//
// "För få kontroller"-skydd: om `antalKontroller` anges OCH understiger Trends
// tröskel (KONTROLL_TROSKEL = 10) → alltid 'ok', oavsett värde. Utelämnas
// `antalKontroller` (enskild kontroll, inte ett trend-aggregat) sker ingen
// dämpning — värdet klassas rent på tolerans.
type AvvikelseStatus = 'ok' | 'förLitet' | 'orange' | 'röd';
const KONTROLL_TROSKEL = 10; // = Trends TRADSLAG_TRESHOLD

const avvikelseStatus = (opts: {
  värde: number;
  enhet: 'dia' | 'len';
  antalKontroller?: number;
}): AvvikelseStatus => {
  const { värde, enhet, antalKontroller } = opts;
  if (antalKontroller != null && antalKontroller < KONTROLL_TROSKEL) return 'ok';
  if (enhet === 'dia') {
    return värde > 6 ? 'röd' : värde > 4 ? 'orange' : värde < -4 ? 'förLitet' : 'ok';
  }
  return värde > 3 ? 'röd' : värde > 2 ? 'orange' : värde < -2 ? 'förLitet' : 'ok';
};

// Status → befintlig ton-token (det ENDA stället statusen blir en tema-token).
// CSS-klasserna .tone-ok/.cold/.hi/.hot äger själva hex-värdet.
type ToneToken = 'ok' | 'cold' | 'hi' | 'hot';
const STATUS_TON: Record<AvvikelseStatus, ToneToken> = {
  ok: 'ok', förLitet: 'cold', orange: 'hi', röd: 'hot',
};
// Bekvämlighet för className-bruk: värde → ton-token direkt.
const avvikelseTon = (
  värde: number, enhet: 'dia' | 'len', antalKontroller?: number,
): ToneToken => STATUS_TON[avvikelseStatus({ värde, enhet, antalKontroller })];

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
  const [activeTab, setActiveTab] = useState<'today' | 'trend' | 'calendar' | 'report'>('today');
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

  // === Trend-fliken: lazy fetch när användaren går dit, cache i ref ===
  type TrendMatstalle = { position_cm: number; snitt_mm: number; stddev_mm: number; n: number };
  type TrendKontrollPunkt = { filnamn: string; datum: string; dia_snitt_mm: number; len_snitt_cm: number; antal_stockar: number; object_name: string | null };
  type TrendKalibreringEv = { datum: string; maskin_id: string; tradslag: string | null; typ: string | null; orsak: string | null };
  type TrendTradslagData = { antal_kontroller: number; matstallen: TrendMatstalle[]; kontroller: TrendKontrollPunkt[] };
  type TrendData = { per_tradslag: Record<string, TrendTradslagData>; kalibreringar: TrendKalibreringEv[]; totalt: { antal_kontroller: number; antal_matpunkter: number } };
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [selectedTrendTradslag, setSelectedTrendTradslag] = useState<string | null>(null);
  const [trendUnit, setTrendUnit] = useState<'dia' | 'len'>('dia');
  const [trendPeriod, setTrendPeriod] = useState<'vecka' | 'manad' | 'kvartal' | 'ar'>('manad');
  // Anchor = en datum-sträng (ISO) inuti det fönster användaren tittar på.
  // null = "auto, använd senaste kontroll för aktuellt trädslag".
  const [trendAnchor, setTrendAnchor] = useState<string | null>(null);
  const trendFetchKeyRef = useRef<string | null>(null);

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

  // Öppna kalendern på månaden för senaste kontrollen (inte innevarande, som
  // ofta är tom). Körs en gång när data laddats; överskrivs inte om användaren
  // sen bläddrar bort.
  const calInitRef = useRef(false);
  useEffect(() => {
    if (calInitRef.current || allKalib.length === 0) return;
    calInitRef.current = true;
    setCalManad(allKalib[0].datum.slice(0, 7)); // "YYYY-MM"
  }, [allKalib]);

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

  // === Trend-fliken: lazy fetch när användaren öppnar fliken eller byter maskinfilter
  useEffect(() => {
    if (activeTab !== 'trend') return;
    const fetchKey = effectiveSelected; // 'all' eller maskin_id — invaliderar cache vid filterbyte
    if (trendFetchKeyRef.current === fetchKey && trendData && !trendError) return;
    let cancelled = false;
    setTrendLoading(true);
    setTrendError(null);
    const url = effectiveSelected === 'all'
      ? `/api/kalibrering/trend?key=skogsystem-debug`
      : `/api/kalibrering/trend?key=skogsystem-debug&maskin_id=${encodeURIComponent(effectiveSelected)}`;
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: TrendData & { ok?: boolean }) => {
        if (cancelled) return;
        setTrendData(data);
        trendFetchKeyRef.current = fetchKey;
        // Förvalt trädslag: det med flest kontroller
        const tradslagSorted = Object.entries(data.per_tradslag)
          .sort(([, a], [, b]) => b.antal_kontroller - a.antal_kontroller)
          .map(([k]) => k);
        if (tradslagSorted.length > 0 && (selectedTrendTradslag == null || !data.per_tradslag[selectedTrendTradslag])) {
          setSelectedTrendTradslag(tradslagSorted[0]);
        }
        setTrendLoading(false);
      })
      .catch(err => { if (!cancelled) { setTrendError(err?.message || 'Kunde inte ladda trenddata'); setTrendLoading(false); } });
    return () => { cancelled = true; };
    // selectedTrendTradslag är medvetet utelämnad — den är read-only-effekt på första laddning
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, effectiveSelected]);

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

      // stockMap används BARA för Senaste-kortet (latestStockar). Hämta därför
      // bara senaste kontrollens stockar via filnamn — komplett och billigt.
      // (Tidigare hämtades ALLA rader utan pagination → PostgREST kapade vid
      //  1000 av 4160 → senaste kontrollen undercountades.)
      const latestFilnamn = kalibRows[0].filnamn;
      const { data: stockRows, error: stockErr } = await supabase
        .from('detalj_kontroll_stock')
        .select('*')
        .eq('filnamn', latestFilnamn)
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

      // Per-stock distribution — delas av svärmen (visuellt) och big-tonen.
      // sDia tar max-absolut över mätpunkter + toppen (samma logik som
      // stocklistan längre ner — utan den missar man fel som bara dyker
      // upp i ett enskilt mätställe på en annars samlad stock).
      type StockSwarmEntry = { id: number; stam_nummer: number; stock_nummer: number; sLen: number; sDia: number };
      const stockDist: StockSwarmEntry[] = data.stockar.map((s) => {
        const sLen = s.langd_avvikelse_cm ?? 0;
        const mpA = s.matpunkter
          .filter((m) => m.diameter_maskin_mm != null && m.diameter_operator_mm != null)
          .map((m) => (m.diameter_maskin_mm as number) - (m.diameter_operator_mm as number));
        const sDia = [...mpA, s.dia_avvikelse_mm ?? 0].reduce(
          (a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0
        );
        return { id: s.id, stam_nummer: s.stam_nummer, stock_nummer: s.stock_nummer, sLen, sDia };
      });

      // Svärmens prickar + per-mått-talet färgas via delade avvikelseTon/
      // avvikelseStatus (se modulnivå). Prickarna: per stock. Talet: på SNITTET
      // (se nedan) — inte värsta stocken, så ett lugnt snitt förblir grått.

      // Status-raden räknar enskilda stockar utanför tolerans — snittet
      // kan se OK ut även när flera stockar är dåliga.
      const utanforLen = stockDist.filter((e) => Math.abs(e.sLen) > 2).length;
      const utanforDia = stockDist.filter((e) => Math.abs(e.sDia) > 4).length;
      const lenStatusTone: 'ok' | 'bad' = utanforLen === 0 ? 'ok' : 'bad';
      const diaStatusTone: 'ok' | 'bad' = utanforDia === 0 ? 'ok' : 'bad';
      const lenLabel = utanforLen === 0
        ? `Alla ${data.stockar.length} inom tolerans`
        : `${utanforLen} av ${data.stockar.length} stockar utanför`;
      const diaLabel = utanforDia === 0
        ? `Alla ${data.stockar.length} inom tolerans`
        : `${utanforDia} av ${data.stockar.length} stockar utanför`;

      // Svärm-position: avvikelse → procent. Clipp till [4,96] så dotter
      // aldrig sitter på kanten även vid extrema värden.
      const swarmX = (val: number, max: number) => {
        const clipped = Math.max(-max, Math.min(max, val));
        const pct = ((clipped + max) / (max * 2)) * 100;
        return Math.max(4, Math.min(96, pct));
      };
      // Deterministisk vertikal jitter — hash på (stam·100+stock) så samma
      // stock alltid hamnar på samma höjd även vid omrender.
      const swarmY = (e: StockSwarmEntry) => {
        const h = (e.stam_nummer * 100 + e.stock_nummer) * 37;
        return 24 + (h % 52);
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
          mpAvvik.length === 1 ? 50 : 15 + ((pos - minPos) / range) * 70;
        // Y-skala: ±8 mm avvikelse → ±40% från mitten = 10-90% av container.
        // Clampa till 8-92% så markörens ring + label får plats vid kanten.
        const yPctFor = (avvik: number) => {
          const clamped = Math.max(-8, Math.min(8, avvik));
          const raw = 50 - (clamped / 8) * 40;
          return Math.max(8, Math.min(92, raw));
        };
        // Per mätpunkt-klassning via delade avvikelseTon (diameter, mm) — visar
        // riktning (för litet/för stort) i den gemensamma skalan.

        // Diagnos baserad på riktnings-konsensus. En mening, mänskligt språk.
        // Outlier = |avvikelse| > 4 mm (Skogforsks branschstandard).
        type DiagnosTone = 'ok' | 'warn' | 'bad';
        type Diagnos = { tone: DiagnosTone; text: string } | null;
        const buildDiagnos = (): Diagnos => {
          if (!hasMp) return null;
          const outliers = mpAvvik.filter((p) => Math.abs(p.avvikelse) > 4);
          if (outliers.length === 0) {
            return { tone: 'ok', text: 'Mätningen är samlad, inom tolerans.' };
          }
          if (outliers.length === 1) {
            const o = outliers[0];
            return {
              tone: 'warn',
              text:
                `Punkten ${fmtAvvikelse(o.avvikelse, 'mm')} mm vid ${o.position_cm} cm sticker ut. ` +
                `Annars samlat. Kontrollera anliggning vid den grovleken.`,
            };
          }
          const signs = outliers.map((o) => Math.sign(o.avvikelse));
          const allSame = signs.every((s) => s === signs[0]);
          if (allSame) {
            const avg = outliers.reduce((a, o) => a + o.avvikelse, 0) / outliers.length;
            const dir = avg > 0 ? 'grovt' : 'smalt';
            return {
              tone: 'bad',
              text:
                `Drar systematiskt åt ${dir} — ${Math.round(Math.abs(avg))} mm i snitt på ` +
                `${outliers.length} av ${mpAvvik.length} punkter. Tyder på kalibreringsfel — ` +
                `men bekräfta med fler stammar innan du justerar.`,
            };
          }
          return {
            tone: 'bad',
            text:
              `Spretigt — ${outliers.length} av ${mpAvvik.length} punkter pekar olika håll. ` +
              `Tyder på mekaniskt problem (givare/mäthjul/anliggning). ` +
              `Kalibrering hjälper inte mot spridning.`,
          };
        };
        const diagnos = buildDiagnos();

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
                  <div className={`kalib-tol-value ${diagnos?.tone === 'bad' ? 'bad' : diagnos?.tone === 'warn' ? 'warn' : ''}`}>
                    {hasMp && maxAvvikPos !== null
                      ? `störst fel: ${fmtAvvikelse(maxAvvik, 'mm')} mm vid ${maxAvvikPos} cm`
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
                        const cls = avvikelseTon(p.avvikelse, 'dia');
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
                    {diagnos && (
                      <div className={`kalib-stock-diagnos ${diagnos.tone}`}>
                        {diagnos.text}
                      </div>
                    )}
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
                      const cls = avvikelseTon(p.avvikelse, 'dia');
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

      // === Nivå 2 — stammen som den ligger, stockar rot→topp ===
      // Mellan översikten och detaljmodalen. Tryck på stock → nivå 3.
      const openStamVy = (stamNummer: number) => {
        const stamStockar = data.stockar
          .filter((st) => st.stam_nummer === stamNummer)
          .sort((a, b) => a.stock_nummer - b.stock_nummer);
        if (stamStockar.length === 0) return;

        // Alla stam-nummer i kontrollen (för pillarna)
        const alleStammar = Array.from(
          new Set(data.stockar.map((st) => st.stam_nummer)),
        ).sort((a, b) => a - b);

        // Sortimentsmix + total längd för subtitle
        const sortimentSet = new Set(
          stamStockar.map((st) => st.sortiment_namn).filter((x): x is string => !!x),
        );
        const sortimentText = Array.from(sortimentSet).join(' · ') || '–';
        const totalCm = stamStockar.reduce((a, st) => a + (st.maskin_langd_cm ?? 0), 0);
        const totalM = (totalCm / 100).toFixed(1);

        // Skala för stock-storlek — relativ inom stammen så förhållandena
        // syns men inga absoluta px-värden tappar sig i extrema fall.
        const maxLangd = Math.max(...stamStockar.map((st) => st.maskin_langd_cm ?? 0), 1);
        const maxDia = Math.max(...stamStockar.map((st) => st.maskin_toppdia_mm ?? 0), 1);

        // Per-stock klassning via delade avvikelseTon (diameter). 'null' =
        // saknad mätning (streckad kontur), annars gemensamma ton-skalan.
        const stockDivCls = (
          avvik: number | null,
        ): ToneToken | 'null' => (avvik == null ? 'null' : avvikelseTon(avvik, 'dia'));

        // === Stamhållning — planområden i den täta diameterprofilen ===
        // Profil finns bara för kontrollstammar (758 i prod). Hela sektionen
        // göms när profilen saknas (ingen tom ruta).
        const stamData = data.stammar.find((st) => st.stam_nummer === stamNummer);
        const profile = (stamData?.stem_diameter_profile ?? [])
          .slice()
          .sort((a, b) => a.position_cm - b.position_cm);
        const hasProfile = profile.length > 1;

        type Plan = { startCm: number; endCm: number; lengthCm: number; diameterMm: number };
        // Algoritm (Skogforsks grunddefinition): icke-minskande sträcka ≥ 30 cm.
        // För varje punkt i — j går framåt så länge dia[j] >= dia[j-1].
        // Sträckan [i, j-1] är planområde om endCm - startCm >= 30.
        const findPlanomraden = (): Plan[] => {
          if (!hasProfile) return [];
          const out: Plan[] = [];
          let i = 0;
          while (i < profile.length - 1) {
            let j = i + 1;
            while (j < profile.length && profile[j].diameter_mm >= profile[j - 1].diameter_mm) {
              j++;
            }
            const startCm = profile[i].position_cm;
            const endCm = profile[j - 1].position_cm;
            const length = endCm - startCm;
            if (length >= 30) {
              out.push({
                startCm,
                endCm,
                lengthCm: length,
                diameterMm: profile[i].diameter_mm,
              });
            }
            i = j;
          }
          return out;
        };
        const planer = findPlanomraden();

        // Mappa planområden till stockar — planet börjar/slutar vid pos på STAMMEN,
        // stockarna har egen kumulativ längd. Ett plan kan sträcka sig över flera
        // stockar; varje stock samlar de segment som faller inom sina gränser.
        type PlanSegment = {
          startInStockCm: number;
          endInStockCm: number;
          diameterMm: number;
          lengthCm: number;
        };
        const stockGränser: number[] = [0];
        for (const st of stamStockar) {
          stockGränser.push(stockGränser[stockGränser.length - 1] + (st.maskin_langd_cm ?? 0));
        }
        const planerPerStock: PlanSegment[][] = stamStockar.map(() => []);
        for (const p of planer) {
          let i = 0;
          while (i < stamStockar.length && stockGränser[i + 1] <= p.startCm) i++;
          while (i < stamStockar.length && stockGränser[i] < p.endCm) {
            const sStart = stockGränser[i];
            const sEnd = stockGränser[i + 1];
            planerPerStock[i].push({
              startInStockCm: Math.max(0, p.startCm - sStart),
              endInStockCm: Math.min(sEnd - sStart, p.endCm - sStart),
              diameterMm: p.diameterMm,
              lengthCm: p.lengthCm,
            });
            i++;
          }
        }

        pushModal({
          title: `Stam ${stamNummer}`,
          subtitle: `${stockText(stamStockar.length)} · ${sortimentText} · ${totalM} m`,
          body: (
            <>
              {alleStammar.length > 1 && (
                <div className="kalib-stam-vaxlare">
                  {alleStammar.map((n) => (
                    <button
                      key={n}
                      className={`kalib-stam-pill ${n === stamNummer ? 'active' : ''}`}
                      onClick={() => {
                        if (n !== stamNummer) {
                          popModal();
                          openStamVy(n);
                        }
                      }}
                    >
                      Stam {n}
                    </button>
                  ))}
                </div>
              )}

              {planer.length > 0 && (
                <div className="kalib-stam-explain">
                  Stockens färg = hur mycket den drar. Streckade fält = där
                  mätorganen tappar kontakt och diametern fastnar.
                </div>
              )}

              <div className="kalib-stam-virket">
                {stamStockar.map((st, idx) => {
                  // Form-färg = stockens egen diameteravvikelse, samma diverging-
                  // skala som svärmen i nivå 1 och lollipop i nivå 3. sDia =
                  // max abs över mätpunkter + topp (en mätpunkt som sticker ut
                  // ska kunna färga stocken röd även om toppen är mild).
                  const mpA = st.matpunkter
                    .filter((m) => m.diameter_maskin_mm != null && m.diameter_operator_mm != null)
                    .map((m) => (m.diameter_maskin_mm as number) - (m.diameter_operator_mm as number));
                  const hasAvvikData = mpA.length > 0 || st.dia_avvikelse_mm != null;
                  const sDia = [...mpA, st.dia_avvikelse_mm ?? 0].reduce(
                    (a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0
                  );
                  const formCls = hasAvvikData ? stockDivCls(sDia) : stockDivCls(null);

                  // Äkta proportioner: bredd = längd relativt längsta stocken
                  // (längsta = 100 %, halva längden = 50 %). Hela raden är
                  // tryckyta, så tunna staplar skadar inte träffbarheten.
                  const widthPct = ((st.maskin_langd_cm ?? maxLangd) / maxLangd) * 100;
                  const heightPx = 16 + ((st.maskin_toppdia_mm ?? maxDia) / maxDia) * 18;
                  const lenM = st.maskin_langd_cm != null
                    ? (st.maskin_langd_cm / 100).toFixed(1).replace('.', ',')
                    : '–';
                  const avvikText = hasAvvikData
                    ? `${fmtAvvikelse(sDia, 'mm')} mm`
                    : 'mätning saknas';
                  const stockLenCm = st.maskin_langd_cm ?? 0;
                  const segments = planerPerStock[idx] ?? [];
                  return (
                    <div
                      key={st.id}
                      className="kalib-stam-stock-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => openStockDetalj(st, data.stammar)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openStockDetalj(st, data.stammar);
                        }
                      }}
                    >
                      <div
                        className={`kalib-stam-stock-form ${formCls}`}
                        style={{
                          width: `${widthPct}%`,
                          height: `${heightPx}px`,
                          borderRadius: `${heightPx / 2}px`,
                        }}
                      >
                        {stockLenCm > 0 && segments.map((seg, j) => (
                          <div
                            key={j}
                            className="kalib-stam-stock-plan-overlay"
                            style={{
                              left: `${(seg.startInStockCm / stockLenCm) * 100}%`,
                              width: `${((seg.endInStockCm - seg.startInStockCm) / stockLenCm) * 100}%`,
                            }}
                          />
                        ))}
                      </div>
                      <div className="kalib-stam-stock-label">
                        Stock {st.stock_nummer} · {st.sortiment_namn ?? '–'} · {lenM} m · {avvikText}
                      </div>
                    </div>
                  );
                })}
              </div>

              {planer.length > 0 && (
                <div className="kalib-card kalib-stamhallning-detalj">
                  <div className="kalib-stamhallning-list">
                    <div className="kalib-stamhallning-row kalib-stamhallning-head">
                      <span className="kalib-stamhallning-pos">Läge på stammen</span>
                      <span className="kalib-stamhallning-len">Längd</span>
                      <span className="kalib-stamhallning-dia">Diameter</span>
                    </div>
                    {planer.map((p, idx) => {
                      const startM = (p.startCm / 100).toFixed(1).replace('.', ',');
                      const endM = (p.endCm / 100).toFixed(1).replace('.', ',');
                      return (
                        <div key={idx} className="kalib-stamhallning-row">
                          <span className="kalib-stamhallning-pos">{startM} – {endM} m</span>
                          <span className="kalib-stamhallning-len">{p.lengthCm} cm</span>
                          <span className="kalib-stamhallning-dia">{p.diameterMm} mm</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ),
        });
      };

      pushModal({
        title: 'Kontroll',
        subtitle: `${datumStr} · ${cap(k.tradslag ?? '')} · ${stockText(k.antal_kontrollstockar ?? data.stockar.length)}`,
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
                <div className={`kalib-tol-value tone-${avvikelseTon(lenSnitt, 'len')}`}>
                  {fmtAvvikelse(lenSnitt, 'cm')} cm
                </div>
              </div>
              <div className="kalib-swarm" aria-label="Stockfördelning längd">
                <div className="kalib-swarm-tol" />
                <div className="kalib-swarm-zero" />
                {stockDist.map((e) => (
                  <div
                    key={e.id}
                    className={`kalib-swarm-dot tone-${avvikelseTon(e.sLen, 'len')}`}
                    style={{ left: `${swarmX(e.sLen, 4)}%`, top: `${swarmY(e)}%` }}
                    title={`Stam ${e.stam_nummer}·${e.stock_nummer}: ${fmtAvvikelse(e.sLen, 'cm')} cm`}
                  />
                ))}
                <div
                  className="kalib-swarm-snitt"
                  style={{ left: `${swarmX(lenSnitt, 4)}%` }}
                  title={`Snitt: ${fmtAvvikelse(lenSnitt, 'cm')} cm`}
                />
              </div>
              <div className="kalib-swarm-scale">
                <span>−4</span><span>±2 tolerans</span><span>+4 cm</span>
              </div>
              <div className={`kalib-tol-status tone-${lenStatusTone}`}>
                <span className="kalib-tol-status-dot" />
                {lenLabel}
              </div>
            </div>

            <div className="kalib-card">
              <div className="kalib-tol-header">
                <div className="kalib-tol-label">Diameter</div>
                <div className={`kalib-tol-value tone-${avvikelseTon(diaSnitt, 'dia')}`}>
                  {fmtAvvikelse(diaSnitt, 'mm')} mm
                </div>
              </div>
              <div className="kalib-swarm" aria-label="Stockfördelning diameter">
                <div className="kalib-swarm-tol" />
                <div className="kalib-swarm-zero" />
                {stockDist.map((e) => (
                  <div
                    key={e.id}
                    className={`kalib-swarm-dot tone-${avvikelseTon(e.sDia, 'dia')}`}
                    style={{ left: `${swarmX(e.sDia, 8)}%`, top: `${swarmY(e)}%` }}
                    title={`Stam ${e.stam_nummer}·${e.stock_nummer}: ${fmtAvvikelse(e.sDia, 'mm')} mm`}
                  />
                ))}
                <div
                  className="kalib-swarm-snitt"
                  style={{ left: `${swarmX(diaSnitt, 8)}%` }}
                  title={`Snitt: ${fmtAvvikelse(diaSnitt, 'mm')} mm`}
                />
              </div>
              <div className="kalib-swarm-scale">
                <span>−8</span><span>±4 tolerans</span><span>+8 mm</span>
              </div>
              <div className={`kalib-tol-status tone-${diaStatusTone}`}>
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
                const sLenTon = avvikelseTon(sLen, 'len');

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
                const sDiaTon = avvikelseTon(sDia, 'dia');

                // Raden bär varningen: dess ton = värsta måttet (delad skala).
                const tonRank: Record<ToneToken, number> = { ok: 0, cold: 1, hi: 2, hot: 3 };
                const worstTon: ToneToken =
                  tonRank[sDiaTon] >= tonRank[sLenTon] ? sDiaTon : sLenTon;
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openStamVy(s.stam_nummer)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openStamVy(s.stam_nummer);
                      }
                    }}
                    className={`kalib-stock-row tone-${worstTon}`}
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
                      <span className={`kalib-stock-row-len tone-${sLenTon}`}>
                        {fmtAvvikelse(sLen, 'cm')} cm
                      </span>
                      <span className={`kalib-stock-row-dia tone-${sDiaTon}`}>
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
  // Antal stockar utanför tolerans (delad skala: dia ±4 mm, längd ±2 cm).
  // Bär den lågmälda summeringen på Senaste — hero-talet färgas separat på snittet.
  const latestUtanfor = latestStockar.filter(
    (s) => avvikelseTon(s.dia_avvikelse_mm ?? 0, 'dia') !== 'ok'
        || avvikelseTon(s.langd_avvikelse_cm ?? 0, 'len') !== 'ok'
  ).length;

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

  // Avvikelsefärg kommer ENBART från delade avvikelseStatus/avvikelseTon
  // (modulnivå). De gamla lenOut/diaOut/stockLenCls/stockDiaCls är borttagna.

  // === Modals ===
  const openStockModal = (stock: DetaljKontrollStock) => {
    const lenDiff = stock.langd_avvikelse_cm;
    const diaDiff = stock.dia_avvikelse_mm;
    const lenTon = avvikelseTon(lenDiff, 'len');
    const diaTon = avvikelseTon(diaDiff, 'dia');
    const badgeText = (t: ToneToken) => (t === 'ok' ? 'Inom' : t === 'cold' ? 'Under' : 'Utanför');
    const maskinW = Math.max(180, stock.maskin_langd_cm * 0.7);
    const maskinH = Math.max(28, stock.maskin_toppdia_mm * 0.22);
    const operatorW = Math.max(180, stock.operator_langd_cm * 0.7);
    const operatorH = Math.max(28, stock.operator_toppdia_mm * 0.22);
    const stockBorderClass = diaTon === 'ok' ? '' : `stock-ton-${diaTon}`;

    pushModal({
      title: `Stock ${stock.stock_nummer}`,
      subtitle: `Stam ${stock.stam_nummer} • ${stock.kontroll_datum}`,
      body: (
        <>
          <div className="kalib-stock-compare">
            <div className="kalib-stock-compare-row">
              <div className="kalib-stock-compare-label">Maskin</div>
              <div className={`kalib-log-body ${stockBorderClass}`} style={{ width: maskinW, height: maskinH }}>
                <span className="kalib-log-num">{stock.maskin_langd_cm} cm</span>
              </div>
            </div>
            <div className="kalib-stock-compare-row">
              <div className="kalib-stock-compare-label">Operatör</div>
              <div className="kalib-log-body" style={{ width: operatorW, height: operatorH }}>
                <span className="kalib-log-num">{stock.operator_langd_cm} cm</span>
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
              <div className={`kalib-summary-value tone-${lenTon}`}>{fmtAvvikelse(lenDiff, 'cm')} cm</div>
              <div className={`kalib-diff-badge tone-${lenTon}`}>{badgeText(lenTon)}</div>
            </div>
            <div className="kalib-summary-item">
              <div className="kalib-summary-label">Topp ⌀ maskin</div>
              <div className="kalib-summary-value">{stock.maskin_toppdia_mm} mm</div>
              <div className="kalib-summary-hint">op: {stock.operator_toppdia_mm} mm</div>
            </div>
            <div className="kalib-summary-item">
              <div className="kalib-summary-label">Dia (M−O)</div>
              <div className={`kalib-summary-value tone-${diaTon}`}>{fmtAvvikelse(diaDiff, 'mm')} mm</div>
              <div className={`kalib-diff-badge tone-${diaTon}`}>{badgeText(diaTon)}</div>
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
              <div className="kalib-total-item"><div className="kalib-total-label">Längd (M−O)</div><div className={`kalib-total-value tone-${avvikelseTon(data.lenDiff, 'len', data.count)}`}>{fmtAvvikelse(data.lenDiff, 'cm')}<span className="kalib-total-unit"> cm</span></div></div>
              <div className="kalib-total-item"><div className="kalib-total-label">Dia (M−O)</div><div className={`kalib-total-value tone-${avvikelseTon(data.diaDiff, 'dia', data.count)}`}>{fmtAvvikelse(data.diaDiff, 'mm')}<span className="kalib-total-unit"> mm</span></div></div>
            </div>
          </div>
          <div className="kalib-modal-section-header"><div className="kalib-modal-section-title">Senaste kontroller</div></div>
          <div className="kalib-overview-grid">
            {speciesKalibs.map(k => {
              const d = new Date(k.datum);
              const cls = avvikelseTon(k.dia_avvikelse_snitt_mm, 'dia');
              return (
                <div key={k.id} className="kalib-overview-log" onClick={() => openKontrollFull(k.filnamn)}>
                  <div className="kalib-overview-num">{d.getDate()}</div>
                  <div className="kalib-overview-info">
                    <div className="kalib-overview-title">{d.toLocaleDateString('sv-SE')}</div>
                    <div className="kalib-overview-meta">{stockText(k.antal_kontrollstockar)} • {k.status === 'VARNING' ? 'Varning' : 'Inom'}</div>
                  </div>
                  <div className={`kalib-diff-badge tone-${cls}`}>{fmtAvvikelse(k.dia_avvikelse_snitt_mm, 'mm')} mm</div>
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
                {m.volym_m3sub.toFixed(2)} m³fub{m.status === 'inaktiv' ? ' · Inaktiv' : m.huvudtyp ? ` · ${m.huvudtyp}` : ''}
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
  const verdictWithinTolerance =
    avvikelseStatus({ värde: avgLenReport, enhet: 'len' }) === 'ok'
    && avvikelseStatus({ värde: avgDiaReport, enhet: 'dia' }) === 'ok';

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
        .kalib-pill{height:44px;padding:0 18px;border-radius:999px;font-size:14px;font-weight:500;color:#8E8E93;background:transparent;border:none;cursor:pointer;font-family:inherit;transition:background 0.15s,color 0.15s}
        .kalib-pill.active{background:#fff;color:#000;font-weight:600}

        /* Läsbredd 880 centrerad (som tidigare PageContainer bred). ≥1000px får
           de breda vyerna (Trend/Rapport/Kalender, klass .wide) mer bredd —
           Senaste stannar 880. Under 1000px är .wide oförändrad (880). */
        .kalib-container{width:100%;max-width:880px;margin-inline:auto;padding:24px clamp(16px,4vw,24px) 32px;box-sizing:border-box}
        @media(min-width:1000px){
          .kalib-container.wide{max-width:1320px}
        }

        .kalib-page-header{margin:0 0 24px}
        .kalib-page-title{font-size:28px;font-weight:600;letter-spacing:-0.02em;line-height:1.15;margin:0 0 6px;color:#fff}
        .kalib-page-subtitle{font-size:15px;color:#8E8E93;margin:0}

        .kalib-card{background:#1C1C1E;border-radius:14px;padding:20px;margin-bottom:12px;border:1px solid rgba(255,255,255,0.06)}
        .kalib-section-title{font-size:17px;font-weight:600;margin:0 0 4px;color:#fff}
        .kalib-section-subtitle{font-size:13px;color:#8E8E93;margin:0 0 18px}

        .kalib-hero-metrics{display:flex;gap:12px;margin-bottom:16px}
        .kalib-hero-metric{flex:1;text-align:center;padding:20px 12px;background:rgba(255,255,255,0.04);border-radius:12px}
        .kalib-hero-metric-value{font-size:36px;font-weight:700;line-height:1;margin-bottom:6px;letter-spacing:-0.02em;color:#fff}
        /* Hero-talet färgas på SNITTET via delade skalan. ok = vitt (tyst). */
        .kalib-hero-metric-value.tone-ok{color:#fff}
        .kalib-hero-metric-value.tone-cold{color:#0A84FF}
        .kalib-hero-metric-value.tone-hi{color:#FF9F0A}
        .kalib-hero-metric-value.tone-hot{color:#FF453A}
        /* Lågmäld summeringsrad på Senaste — ersätter gröna/röda info-rutan. */
        .kalib-lugn-rad{display:flex;align-items:center;gap:8px;margin-top:16px;font-size:13px;color:#8E8E93;line-height:1.4}
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

        /* Stem-viz fyller kolumnen (ingen horisontell scroll) — blocken flex-
           delar bredden proportionellt mot längd (inline flex-grow per stock). */
        .kalib-stem-viz{padding:8px 0 16px}
        .kalib-stem-viz-inner{display:flex;align-items:flex-end;gap:6px;width:100%}
        .kalib-stem-label{font-size:11px;color:#8E8E93;padding:0 2px;align-self:center;flex:0 0 auto}
        .kalib-log-block{display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:transform 0.15s;min-width:0}
        .kalib-log-block:active{transform:scale(0.96)}
        .kalib-log-body{width:100%;min-width:4px;background:#2C2C2E;border-radius:6px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.06);overflow:hidden}
        .kalib-log-body.warn-stock{border:1.5px solid #8E8E93}
        .kalib-log-body.bad-stock{border:1.5px solid #FF3B30}
        /* Senaste stem-block via delade skalan (ok = ingen kant, tyst) */
        .kalib-log-body.stock-ton-cold{border:1.5px solid #0A84FF}
        .kalib-log-body.stock-ton-hi{border:1.5px solid #FF9F0A}
        .kalib-log-body.stock-ton-hot{border:1.5px solid #FF453A}
        .kalib-log-num{color:#fff;font-size:14px;font-weight:600}
        .kalib-log-info{text-align:center;min-width:0;max-width:100%}
        .kalib-log-length{font-size:12px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .kalib-log-product{font-size:10px;color:#8E8E93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

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
        /* === Trend-fliken — kurva + tidsfilter + auto-mening === */
        .kalib-trend-pills{display:flex;gap:8px;margin:0 0 10px;flex-wrap:wrap}
        .kalib-trend-pill{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:22px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:#fff;font-size:14px;font-weight:500;cursor:pointer;transition:background 0.12s}
        .kalib-trend-pill:hover{background:rgba(255,255,255,0.10)}
        .kalib-trend-pill.active{background:#fff;color:#000;border-color:#fff}
        .kalib-trend-pill-count{font-size:12px;opacity:0.7;font-variant-numeric:tabular-nums}
        .kalib-trend-pill.active .kalib-trend-pill-count{opacity:0.55}

        /* iOS-segmenterad kontroll: enhetväxling (Dia/Längd) och fönsterbredd */
        .kalib-trend-seg{display:flex;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.06);border-radius:9px;padding:2px;margin:0 0 10px;width:100%}
        .kalib-trend-seg-btn{flex:1;min-height:44px;padding:0 4px;border-radius:7px;border:none;background:transparent;color:#8E8E93;font-size:13px;font-weight:500;cursor:pointer;transition:background 0.12s,color 0.12s;display:flex;align-items:center;justify-content:center}
        .kalib-trend-seg-btn:hover{color:#fff}
        .kalib-trend-seg-btn.active{background:#3A3A3C;color:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.4)}

        /* Bläddringsrad: pilar + fönsteretikett. Som månads-navigatorn i Kalendern. */
        .kalib-trend-nav{display:flex;align-items:center;justify-content:space-between;padding:6px 0;margin:0 0 6px}
        .kalib-trend-nav-btn{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.06);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.12s}
        .kalib-trend-nav-btn:hover:not(:disabled){background:rgba(255,255,255,0.12)}
        .kalib-trend-nav-btn:disabled{background:rgba(255,255,255,0.03);cursor:default}
        .kalib-trend-nav-label{font-size:16px;font-weight:600;color:#fff;letter-spacing:-0.01em;font-variant-numeric:tabular-nums}

        .kalib-trend-too-few{font-size:13px;color:#FF9F0A;background:rgba(255,159,10,0.10);padding:10px 12px;border-radius:8px;margin:8px 0 14px;line-height:1.4}
        .kalib-trend-empty{font-size:13px;color:#8E8E93;padding:16px;text-align:center}

        /* Trendkurvan: SVG-polyline + HTML-punkter ovanpå för klick/tooltip.
           Plot-rutan är egen container så att xPctFor/yPct mappar 1:1 mot
           både SVG:ns viewBox (0..100) och HTML-positionerna (left/top:%). */
        .kalib-curve{margin:14px 0 0}
        .kalib-curve.muted{opacity:0.55}
        .kalib-curve-row{display:flex;height:200px}
        .kalib-curve-yaxis{flex:0 0 30px;position:relative}
        .kalib-curve-yaxis span{position:absolute;right:4px;transform:translateY(-50%);font-size:10px;color:#666;font-variant-numeric:tabular-nums}
        .kalib-curve-plot{flex:1;position:relative;background:rgba(255,255,255,0.02);border-radius:8px}
        .kalib-curve-tol{position:absolute;left:0;right:0;background:rgba(255,255,255,0.035);border-top:1px dashed rgba(255,255,255,0.18);border-bottom:1px dashed rgba(255,255,255,0.18);pointer-events:none}
        .kalib-curve-zero{position:absolute;left:0;right:0;height:1px;background:rgba(255,255,255,0.32);pointer-events:none}
        .kalib-curve-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
        .kalib-curve-dot{position:absolute;width:10px;height:10px;border-radius:50%;background:#8E8E93;transform:translate(-50%,-50%);box-shadow:0 0 0 2px rgba(0,0,0,0.55);pointer-events:none}
        .kalib-curve-dot.tone-ok{background:#8E8E93}
        .kalib-curve-dot.tone-cold{background:#0A84FF}
        .kalib-curve-dot.tone-hi{background:#FF9F0A}
        .kalib-curve-dot.tone-hot{background:#FF453A}
        .kalib-curve-kalib{position:absolute;top:0;bottom:0;width:1px;background:repeating-linear-gradient(to bottom,rgba(255,255,255,0.45) 0 3px,transparent 3px 6px);transform:translateX(-0.5px);pointer-events:none}
        .kalib-curve-kalib-tag{position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-size:10px;color:#8E8E93;background:#1C1C1E;padding:1px 5px;border-radius:3px;line-height:1.3;white-space:nowrap}

        .kalib-curve-xaxis{display:flex;height:24px;margin-top:8px}
        .kalib-curve-xaxis-spacer{flex:0 0 30px}
        .kalib-curve-xaxis-inner{flex:1;position:relative}
        .kalib-curve-xaxis-inner span{position:absolute;transform:translateX(-50%);font-size:11px;color:#8E8E93;font-variant-numeric:tabular-nums;white-space:nowrap;top:0}

        .kalib-curve-mening{font-size:14px;color:#fff;line-height:1.45;padding:10px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-top:14px}

        /* === Kontroll-lista under kurvan: dag-grupperade kort, Apple-rent === */
        /* Topprad: lugn orientering, ingen rubrik-stor stil. */
        .kalib-trend-list-top{font-size:14px;font-weight:500;color:#fff;margin:14px 0 4px;padding:0 4px;letter-spacing:-0.01em}
        .kalib-trend-list-top-tertiary{font-size:12px;font-weight:400;color:#8E8E93;margin-left:2px}

        /* Tom-stat: bara text, ingen tom låda. */
        .kalib-trend-list-empty{font-size:13px;color:#8E8E93;text-align:center;padding:24px 12px;line-height:1.4}

        /* Dag-grupp: mjuk rubrik + ett kort som rymmer alla dagens rader. */
        .kalib-trend-day{margin-top:14px}
        .kalib-trend-day-header{font-size:12px;font-weight:500;color:#8E8E93;padding:0 4px 6px;letter-spacing:-0.005em}
        .kalib-trend-day-card{background:#1C1C1E;border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden}

        /* Rad: knapp som tar hela bredden, 12px gap, 12/14 padding, separerad
           med 0.5px botten-border utom på sista. */
        .kalib-trend-row{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;background:transparent;border:none;border-bottom:0.5px solid rgba(255,255,255,0.08);cursor:pointer;text-align:left;font-family:inherit;color:inherit;transition:background 0.12s}
        .kalib-trend-row:hover:not(:disabled){background:rgba(255,255,255,0.04)}
        .kalib-trend-row:active:not(:disabled){background:rgba(255,255,255,0.07)}
        .kalib-trend-row:disabled{opacity:0.6;cursor:wait}
        .kalib-trend-row.last{border-bottom:none}

        /* Färgprick 8×8 — diverging-skala, samma värden som nivå 1/2/3. */
        .kalib-trend-row-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;background:#B4B2A9}
        .kalib-trend-row-dot.tone-ok{background:#B4B2A9}
        .kalib-trend-row-dot.tone-cold{background:#378ADD}
        .kalib-trend-row-dot.tone-hi{background:#EF9F27}
        .kalib-trend-row-dot.tone-hot{background:#E24B4A}

        /* Mittenkolumn: objektnamn + meta staplade, ellipsis vid truncate. */
        /* Namn tar bara sin naturliga bredd (växer inte) → värdet sitter intill
           namnet i stället för ytterst höger; chevron skjuts ut med margin-auto. */
        .kalib-trend-row-info{flex:0 1 auto;min-width:0}
        .kalib-trend-row-chev{margin-left:auto;flex-shrink:0;display:flex;align-items:center}
        .kalib-trend-row-name{font-size:14px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .kalib-trend-row-meta{font-size:12px;color:#8E8E93;margin-top:2px}

        /* Värde: grå inom tolerans, annars samma färg som pricken. */
        .kalib-trend-row-val{font-size:14px;font-weight:500;flex-shrink:0;font-variant-numeric:tabular-nums;color:#8E8E93}
        .kalib-trend-row-val.tone-ok{color:#8E8E93}
        .kalib-trend-row-val.tone-cold{color:#378ADD}
        .kalib-trend-row-val.tone-hi{color:#EF9F27}
        .kalib-trend-row-val.tone-hot{color:#E24B4A}

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
        .kalib-cal-summary-grid.two{grid-template-columns:repeat(2,1fr)}
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

        /* Rutnätet cappas vid 7×64 + gap → cellerna blir max 64px och rutnätet
           centreras. Telefon (smalare) fyller bredden; iPad slutar blåsa upp. */
        .kalib-cal-weekdays{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;max-width:484px;margin:0 auto 8px;text-align:center;font-size:11px;color:#8E8E93;font-weight:500}
        .kalib-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;max-width:484px;margin-inline:auto}
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
        /* Nyckeltal färgas efter värde: 0 = grått (lugn), >0 = rött */
        .kalib-report-metric-value.tone-muted{color:#8E8E93}
        .kalib-report-metric-value.tone-hot{color:#FF453A}
        .kalib-report-metric-label{font-size:11px;color:#8E8E93;margin-top:8px}
        .kalib-report-results{display:flex;flex-direction:column;gap:14px;margin-bottom:18px}
        .kalib-report-result{display:flex;align-items:center;gap:14px}
        .kalib-report-result-label{width:72px;font-size:13px;color:#8E8E93}
        .kalib-report-result-value{width:72px;text-align:right;font-size:14px;font-weight:600;color:#fff}
        .kalib-report-result-value.bad{color:#FF3B30}
        /* Reglaget borttaget → talet är huvudsignalen, färgat via delade skalan */
        /* Värdet sitter intill etiketten (inget flex:1 som slänger det längst ut) */
        .kalib-report-result-value.big{width:auto;text-align:left;font-size:20px;letter-spacing:-0.01em}
        .kalib-report-result-value.tone-ok{color:#8E8E93}
        .kalib-report-result-value.tone-cold{color:#0A84FF}
        .kalib-report-result-value.tone-hi{color:#FF9F0A}
        .kalib-report-result-value.tone-hot{color:#FF453A}
        .kalib-species-table{border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.06)}
        .kalib-table-header{display:grid;grid-template-columns:1fr 60px 70px 80px 24px;padding:10px 14px;background:rgba(255,255,255,0.04);font-size:11px;color:#8E8E93;font-weight:500}
        .kalib-table-row{display:grid;grid-template-columns:1fr 60px 70px 80px 24px;padding:14px;border-top:0.5px solid #2C2C2E;font-size:13px;cursor:pointer;color:#fff;align-items:center}
        .kalib-table-chev{display:flex;align-items:center;justify-content:flex-end}
        .kalib-table-row > span.bad{color:#FF3B30;font-weight:600}
        /* Tabellceller via delade skalan (ok = grått; Björk <10 kontroller → grått) */
        .kalib-table-row > span.tone-ok{color:#8E8E93}
        .kalib-table-row > span.tone-cold{color:#0A84FF;font-weight:600}
        .kalib-table-row > span.tone-hi{color:#FF9F0A;font-weight:600}
        .kalib-table-row > span.tone-hot{color:#FF453A;font-weight:600}
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
        .kalib-summary-value.tone-ok{color:#fff}
        .kalib-summary-value.tone-cold{color:#0A84FF}
        .kalib-summary-value.tone-hi{color:#FF9F0A}
        .kalib-summary-value.tone-hot{color:#FF453A}
        .kalib-summary-hint{font-size:10px;color:#8E8E93;margin-top:2px}

        .kalib-diff-badge{font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;display:inline-block;margin-top:4px}
        .kalib-diff-badge.good{color:#fff;background:rgba(255,255,255,0.08)}
        .kalib-diff-badge.warn{color:#8E8E93;background:rgba(255,255,255,0.04)}
        .kalib-diff-badge.bad{color:#FF3B30;background:rgba(255,59,48,0.12)}
        /* Badge via delade skalan (ok = neutral grå) */
        .kalib-diff-badge.tone-ok{color:#8E8E93;background:rgba(255,255,255,0.06)}
        .kalib-diff-badge.tone-cold{color:#0A84FF;background:rgba(10,132,255,0.12)}
        .kalib-diff-badge.tone-hi{color:#FF9F0A;background:rgba(255,159,10,0.12)}
        .kalib-diff-badge.tone-hot{color:#FF453A;background:rgba(255,69,58,0.12)}

        .kalib-total-summary{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:18px}
        .kalib-total-title{font-size:12px;font-weight:600;color:#8E8E93;margin-bottom:14px}
        .kalib-total-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
        .kalib-total-grid.two-col{grid-template-columns:repeat(2,1fr)}
        .kalib-total-item{text-align:center}
        .kalib-total-label{font-size:11px;color:#8E8E93;margin-bottom:4px}
        .kalib-total-value{font-size:24px;font-weight:600;color:#fff;letter-spacing:-0.01em}
        .kalib-total-value.bad{color:#FF3B30}
        .kalib-total-value.tone-ok{color:#fff}
        .kalib-total-value.tone-cold{color:#0A84FF}
        .kalib-total-value.tone-hi{color:#FF9F0A}
        .kalib-total-value.tone-hot{color:#FF453A}
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
        /* Legacy binär-klasser (kvar för stocklistan i samma modal) */
        .kalib-tol-value.warn{color:#FF9500}
        .kalib-tol-value.bad{color:#FF3B30}
        /* Diverging tone-* — samma språk som lollipop i nivå 3 */
        .kalib-tol-value.tone-ok{color:#fff}
        .kalib-tol-value.tone-cold{color:#0A84FF}
        .kalib-tol-value.tone-hi{color:#FF9F0A}
        .kalib-tol-value.tone-hot{color:#FF453A}

        /* === Stock-svärm: en dot per stock, färg per diverging-skala === */
        .kalib-swarm{position:relative;height:64px;border-radius:8px;background:rgba(255,255,255,0.025);margin:8px 0 6px;overflow:visible}
        .kalib-swarm-tol{position:absolute;top:0;bottom:0;left:25%;right:25%;background:rgba(255,255,255,0.04);border-left:1px dashed rgba(255,255,255,0.14);border-right:1px dashed rgba(255,255,255,0.14)}
        .kalib-swarm-zero{position:absolute;top:4px;bottom:4px;left:50%;width:1px;background:rgba(255,255,255,0.35);transform:translateX(-0.5px)}
        .kalib-swarm-dot{position:absolute;width:10px;height:10px;border-radius:50%;transform:translate(-50%,-50%);background:#8E8E93;box-shadow:0 0 0 2px rgba(0,0,0,0.55)}
        .kalib-swarm-dot.tone-ok{background:#8E8E93}
        .kalib-swarm-dot.tone-cold{background:#0A84FF}
        .kalib-swarm-dot.tone-hi{background:#FF9F0A}
        .kalib-swarm-dot.tone-hot{background:#FF453A}
        .kalib-swarm-snitt{position:absolute;bottom:0;width:2px;height:14px;background:rgba(255,255,255,0.85);transform:translateX(-50%);border-radius:1px;pointer-events:none}
        .kalib-swarm-snitt::after{content:'';position:absolute;bottom:14px;left:50%;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:4px solid rgba(255,255,255,0.85);transform:translateX(-50%)}
        .kalib-swarm-scale{display:flex;justify-content:space-between;font-size:11px;color:#8E8E93;margin:2px 0 12px;padding:0 2px;font-variant-numeric:tabular-nums}
        .kalib-swarm-scale span:nth-child(2){opacity:0.7}

        .kalib-tol-status{font-size:13px;font-weight:500;display:flex;align-items:center;gap:8px}
        .kalib-tol-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        /* Status: grå = ok (ingen onödig grön), röd = utanför */
        .kalib-tol-status.tone-ok{color:#8E8E93}
        .kalib-tol-status.tone-ok .kalib-tol-status-dot{background:#8E8E93}
        .kalib-tol-status.tone-bad{color:#FF3B30}
        .kalib-tol-status.tone-bad .kalib-tol-status-dot{background:#FF3B30}

        .kalib-stockar-list{display:flex;flex-direction:column;gap:6px}
        .kalib-stock-row{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;cursor:pointer;transition:background 0.12s,border-color 0.12s,transform 0.12s}
        .kalib-stock-row:hover{background:rgba(255,255,255,0.07)}
        .kalib-stock-row:active{transform:scale(0.99)}
        /* Raden bär varningen — kant/bakgrund via delade ton-skalan (ok = tyst) */
        .kalib-stock-row.tone-cold{border-color:rgba(10,132,255,0.35)}
        .kalib-stock-row.tone-hi{border-color:rgba(255,159,10,0.40)}
        .kalib-stock-row.tone-hot{border-color:rgba(255,69,58,0.40);background:rgba(255,69,58,0.06)}
        .kalib-stock-row.tone-hot:hover{background:rgba(255,69,58,0.10)}
        .kalib-stock-row-num{width:44px;height:36px;background:rgba(255,255,255,0.06);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;flex-shrink:0;font-variant-numeric:tabular-nums}
        .kalib-stock-row-info{flex:1;min-width:0}
        .kalib-stock-row-title{font-size:14px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .kalib-stock-row-meta{font-size:12px;color:#8E8E93;margin-top:2px}
        .kalib-stock-row-diff{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;min-width:70px;text-align:right}
        .kalib-stock-row-len,.kalib-stock-row-dia{font-size:12px;font-weight:600;color:#fff}
        /* Stockvärdena i delade skalan: ok = grått (tyst), annars ton-färg */
        .kalib-stock-row-len.tone-ok,.kalib-stock-row-dia.tone-ok{color:#8E8E93}
        .kalib-stock-row-len.tone-cold,.kalib-stock-row-dia.tone-cold{color:#0A84FF}
        .kalib-stock-row-len.tone-hi,.kalib-stock-row-dia.tone-hi{color:#FF9F0A}
        .kalib-stock-row-len.tone-hot,.kalib-stock-row-dia.tone-hot{color:#FF453A}

        /* === Detaljmodal: rotstock-tagg, lollipop-graf, mätpunkter-lista === */
        .kalib-stock-tag-row{display:flex;justify-content:flex-end;margin:0 0 12px}
        .kalib-stock-tag{font-size:10px;font-weight:700;letter-spacing:0.5px;padding:3px 8px;border-radius:4px;background:rgba(255,255,255,0.08);color:#8E8E93}

        .kalib-stock-mo-line{font-size:13px;color:#8E8E93;margin-top:6px}

        .kalib-lollipop{position:relative;height:150px;margin:14px 0 4px;background:rgba(255,255,255,0.02);border-radius:8px}
        .kalib-lollipop-tol-band{position:absolute;left:0;right:0;top:30%;height:40%;background:rgba(255,255,255,0.035);border-top:1px dashed rgba(255,255,255,0.20);border-bottom:1px dashed rgba(255,255,255,0.20)}
        .kalib-lollipop-zero-line{position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,0.32)}
        .kalib-lollipop-stem{position:absolute;width:2px;background:rgba(255,255,255,0.4);transform:translateX(-1px)}
        .kalib-lollipop-marker{position:absolute;width:14px;height:14px;border-radius:50%;background:#8E8E93;transform:translate(-50%,-50%);box-shadow:0 0 0 2px #1C1C1E,0 0 0 3px rgba(255,255,255,0.3);transition:left 0.3s,top 0.3s}
        .kalib-lollipop-marker.ok{background:#8E8E93}
        .kalib-lollipop-marker.cold{background:#0A84FF}
        .kalib-lollipop-marker.hi{background:#FF9F0A}
        .kalib-lollipop-marker.hot{background:#FF453A}
        .kalib-lollipop-label{position:absolute;transform:translateX(-50%);font-size:11px;font-weight:600;color:#fff;white-space:nowrap;font-variant-numeric:tabular-nums;pointer-events:none}
        .kalib-lollipop-label.ok{color:#8E8E93}
        .kalib-lollipop-label.cold{color:#0A84FF}
        .kalib-lollipop-label.hi{color:#FF9F0A}
        .kalib-lollipop-label.hot{color:#FF453A}

        .kalib-lollipop-axis{display:flex;justify-content:space-between;margin-top:6px;padding:0 16px;font-size:11px;color:#8E8E93}

        .kalib-mp-list{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;font-variant-numeric:tabular-nums}
        .kalib-mp-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:0.5px solid rgba(255,255,255,0.08)}
        .kalib-mp-row:last-child{border-bottom:none}
        .kalib-mp-pos{width:60px;font-size:13px;color:#8E8E93;flex-shrink:0}
        .kalib-mp-vals{flex:1;font-size:13px;color:#fff}
        .kalib-mp-diff{font-size:13px;font-weight:600;color:#fff;flex-shrink:0;min-width:44px;text-align:right}
        .kalib-mp-diff.ok{color:#8E8E93}
        .kalib-mp-diff.cold{color:#0A84FF}
        .kalib-mp-diff.hi{color:#FF9F0A}
        .kalib-mp-diff.hot{color:#FF453A}

        /* === Nivå 2: stammen som den ligger, stockar rot→topp === */
        .kalib-stam-vaxlare{display:flex;gap:6px;margin:0 0 14px;justify-content:center;flex-wrap:wrap}
        .kalib-stam-pill{height:32px;padding:0 14px;border-radius:16px;background:rgba(255,255,255,0.06);color:#8E8E93;border:none;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:background 0.12s,color 0.12s}
        .kalib-stam-pill.active{background:#fff;color:#000;font-weight:600}

        .kalib-stam-virket{display:flex;flex-direction:column;gap:18px;padding:8px 0 4px}
        .kalib-stam-stock-row{display:flex;flex-direction:column;align-items:center;cursor:pointer;transition:transform 0.12s,opacity 0.12s}
        .kalib-stam-stock-row:hover{opacity:0.92}
        .kalib-stam-stock-row:active{transform:scale(0.97)}
        .kalib-stam-stock-form{position:relative;overflow:hidden;background:#8E8E93;border:1px solid rgba(255,255,255,0.10);transition:background 0.15s;box-shadow:inset 0 1px 0 rgba(255,255,255,0.08),inset 0 -1px 0 rgba(0,0,0,0.15)}
        .kalib-stam-stock-form.ok{background:#8E8E93}
        .kalib-stam-stock-form.cold{background:#0A84FF}
        .kalib-stam-stock-form.hi{background:#FF9F0A}
        .kalib-stam-stock-form.hot{background:#FF453A}
        .kalib-stam-stock-form.null{background:transparent;border:1.5px dashed rgba(255,255,255,0.25);box-shadow:none}
        .kalib-stam-stock-label{font-size:12px;color:#8E8E93;margin-top:8px;font-variant-numeric:tabular-nums;text-align:center;line-height:1.3}

        /* Stamhållning — planområden markerade som röda fält på stockarna */
        .kalib-stam-explain{font-size:13px;line-height:1.5;color:#8E8E93;padding:12px 14px;background:rgba(255,255,255,0.04);border-radius:10px;margin:0 0 14px;border:1px solid rgba(255,255,255,0.06)}
        /* Planområde-overlay: mörk diagonalskraffering + mörka sidokanter.
           Syns mot vilken stockfärg som helst (grå/blå/orange/röd) utan att
           förväxlas med stockens egen avvikelsefärg. */
        .kalib-stam-stock-plan-overlay{position:absolute;top:0;bottom:0;pointer-events:none;background-image:repeating-linear-gradient(-45deg,rgba(0,0,0,0.55) 0 3px,transparent 3px 7px);border-left:1.5px solid rgba(0,0,0,0.75);border-right:1.5px solid rgba(0,0,0,0.75)}
        .kalib-stamhallning-detalj{margin-top:14px;padding:14px 16px}
        .kalib-stamhallning-list{display:flex;flex-direction:column;gap:1px;border-radius:10px;overflow:hidden}
        .kalib-stamhallning-row{display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(255,255,255,0.04);font-size:13px;font-variant-numeric:tabular-nums}
        /* Kolumnrubriker: liten grå versal-rad, ingen tabular-siffra */
        .kalib-stamhallning-head{background:transparent;padding:2px 12px 4px;font-size:11px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase}
        .kalib-stamhallning-head .kalib-stamhallning-pos,
        .kalib-stamhallning-head .kalib-stamhallning-len,
        .kalib-stamhallning-head .kalib-stamhallning-dia{color:#8E8E93}
        .kalib-stamhallning-pos{flex:1;color:#fff}
        .kalib-stamhallning-len{color:#8E8E93;min-width:54px;text-align:right}
        .kalib-stamhallning-dia{color:#8E8E93;min-width:60px;text-align:right}

        /* Diagnos-mening under lollipop — en mening, mänskligt språk, färgton matchar allvar */
        .kalib-stock-diagnos{font-size:13px;line-height:1.5;padding:12px 14px;border-radius:10px;margin:14px 0 4px}
        .kalib-stock-diagnos.ok{background:rgba(255,255,255,0.04);color:#fff;border:1px solid rgba(255,255,255,0.06)}
        .kalib-stock-diagnos.warn{background:rgba(255,159,10,0.10);color:#fff;border:1px solid rgba(255,159,10,0.28)}
        .kalib-stock-diagnos.bad{background:rgba(255,69,58,0.10);color:#fff;border:1px solid rgba(255,69,58,0.32)}

        /* === DEL 2: selektiv bredd-layout ============================= */
        /* Legend-dubbletten i kalendern är dold tills ≥1000px (inline visas). */
        .kalib-cal-legend--side{display:none}

        @media(min-width:1000px){
          /* TREND — kontroller+kurva sticky vänster (~55%), lista höger (~45%).
             top klarar de två sticky-barerna (nav + filter). */
          .kalib-trend-layout{display:flex;gap:24px;align-items:flex-start}
          .kalib-trend-left{flex:0 0 55%;position:sticky;top:calc(180px + env(safe-area-inset-top));align-self:flex-start}
          .kalib-trend-right{flex:1 1 0;min-width:0}

          /* RAPPORT — per-trädslag-tabellen fördelar kolumnerna jämnt så varje
             värde sitter under sin rubrik (löser högerklumpen). */
          .kalib-table-header,.kalib-table-row{grid-template-columns:2fr 1fr 1fr 1fr 40px}

          /* KALENDER — rutnät vänster, sammanfattning+legend höger sidopanel. */
          .kalib-cal-layout{display:flex;gap:24px;align-items:flex-start}
          .kalib-cal-layout .kalib-cal-gridcard{order:1;flex:1 1 0;min-width:0}
          .kalib-cal-layout .kalib-cal-summary{order:2;flex:0 0 300px;align-self:flex-start}
          .kalib-cal-legend--inline{display:none}
          .kalib-cal-legend--side{display:block;margin-top:16px;border-top:0.5px solid #2C2C2E;padding-top:14px}
        }

        @media(max-width:480px){
          .kalib-page-title{font-size:28px}
          .kalib-hero-metric-value{font-size:32px}
          .kalib-container{padding-top:20px}
          .kalib-report-metrics{grid-template-columns:repeat(2,1fr)}
        }
      `}</style>

      <div className="kalib-page">
        <nav className="kalib-nav">
          <button className={`kalib-pill ${activeTab === 'today' ? 'active' : ''}`} onClick={() => setActiveTab('today')}>Senaste</button>
          <button className={`kalib-pill ${activeTab === 'trend' ? 'active' : ''}`} onClick={() => setActiveTab('trend')}>Trend</button>
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

        <PageContainer width="full">
        <div className={`kalib-container ${activeTab !== 'today' ? 'wide' : ''}`}>
          {activeTab === 'today' && latestKalib && (
            <>
              <header className="kalib-page-header">
                <h1 className="kalib-page-title">{cap(latestKalib.tradslag) || latestKalib.maskin_id}</h1>
                <p className="kalib-page-subtitle">{stockText(latestKalib.antal_kontrollstockar)} • {new Date(latestKalib.datum).toLocaleDateString('sv-SE')} • {latestKalib.maskin_id}</p>
              </header>

              {partialBanner}

              <div className="kalib-card">
                <div className="kalib-section-title" style={{ marginBottom: 18 }}>Avvikelse från operatör</div>
                <div className="kalib-hero-metrics">
                  <div className="kalib-hero-metric">
                    <div className={`kalib-hero-metric-value tone-${avvikelseTon(latestKalib.langd_avvikelse_snitt_cm, 'len')}`}>
                      {fmtAvvikelse(latestKalib.langd_avvikelse_snitt_cm, 'cm')}
                    </div>
                    <div className="kalib-hero-metric-label">Längd (cm)</div>
                    <div className="kalib-hero-metric-hint">min {fmtAvvikelse(latestKalib.langd_avvikelse_min_cm, 'cm')} / max {fmtAvvikelse(latestKalib.langd_avvikelse_max_cm, 'cm')}</div>
                  </div>
                  <div className="kalib-hero-metric">
                    <div className={`kalib-hero-metric-value tone-${avvikelseTon(latestKalib.dia_avvikelse_snitt_mm, 'dia')}`}>
                      {fmtAvvikelse(latestKalib.dia_avvikelse_snitt_mm, 'mm')}
                    </div>
                    <div className="kalib-hero-metric-label">Diameter (mm)</div>
                    <div className="kalib-hero-metric-hint">min {fmtAvvikelse(latestKalib.dia_avvikelse_min_mm, 'mm')} / max {fmtAvvikelse(latestKalib.dia_avvikelse_max_mm, 'mm')}</div>
                  </div>
                </div>
                {latestUtanfor === 0 ? (
                  <div className="kalib-lugn-rad">
                    <MSym name="check" size={16} color="#8E8E93" />
                    <span>Allt inom tolerans.</span>
                  </div>
                ) : (
                  <div className="kalib-lugn-rad">
                    <MSym name="info" size={16} color="#8E8E93" />
                    <span>{latestUtanfor} av {stockText(latestStockar.length)} utanför — se stockarna nedan.</span>
                  </div>
                )}
              </div>

              {latestStockar.length > 0 && (
                <div className="kalib-card">
                  <div className="kalib-section-title">Stockar</div>
                  <div className="kalib-section-subtitle">{cap(latestKalib.tradslag)} • {stockText(latestStockar.length)} • {(totalLatestLen / 100).toFixed(1)} meter</div>
                  <div className="kalib-stem-viz">
                    <div className="kalib-stem-viz-inner">
                      <span className="kalib-stem-label">Rot</span>
                      {latestStockar.map(stock => {
                        // Bredd = proportionell mot längd via flex-grow (basis 0), så
                        // hela raden fyller kolumnen utan att spilla ut. Höjd =
                        // proportionell mot toppdiameter (tjockare stock ser tjockare ut).
                        const lenUnit = Math.max(1, stock.maskin_langd_cm || 1);
                        const baseH = Math.max(18, stock.maskin_toppdia_mm * 0.18);
                        const ton = avvikelseTon(stock.dia_avvikelse_mm ?? 0, 'dia');
                        const borderCls = ton === 'ok' ? '' : `stock-ton-${ton}`;
                        return (
                          <div key={stock.id} className="kalib-log-block" style={{ flex: `${lenUnit} 1 0` }} onClick={() => openStockModal(stock)}>
                            <div className={`kalib-log-body ${borderCls}`} style={{ height: baseH }}>
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

          {activeTab === 'trend' && (
            <>
              {partialBanner}
              {trendLoading && (
                <div className="kalib-card" style={{ textAlign: 'center', color: '#8E8E93' }}>
                  Laddar trenddata…
                </div>
              )}
              {trendError && !trendLoading && (
                <div className="kalib-info-box neutral" style={{ marginBottom: 12 }}>
                  <span className="kalib-info-icon"><MSym name="error" size={20} color="#8E8E93" /></span>
                  <div className="kalib-info-content">
                    <div className="kalib-info-title">Kunde inte ladda trend</div>
                    <div className="kalib-info-text">{trendError}</div>
                  </div>
                </div>
              )}
              {!trendLoading && !trendError && trendData && (() => {
                const TRADSLAG_TRESHOLD = 10;  // Skogforsk: ~10-15 kontroller behövs för pålitligt mönster
                const tradslagAll = Object.entries(trendData.per_tradslag)
                  .sort(([, a], [, b]) => b.antal_kontroller - a.antal_kontroller);
                const trCurrentKey = selectedTrendTradslag ?? tradslagAll[0]?.[0] ?? null;
                const trCurrent = trCurrentKey ? trendData.per_tradslag[trCurrentKey] : null;
                const enough = trCurrent ? trCurrent.antal_kontroller >= TRADSLAG_TRESHOLD : false;

                // Diverging-klassning — exakt samma trösklar som nivå 1/2/3.
                type DivCls2 = 'cold' | 'ok' | 'hi' | 'hot';
                const valCls = (v: number): DivCls2 => {
                  if (trendUnit === 'dia') {
                    return v > 6 ? 'hot' : v > 4 ? 'hi' : v < -4 ? 'cold' : 'ok';
                  }
                  return v > 3 ? 'hot' : v > 2 ? 'hi' : v < -2 ? 'cold' : 'ok';
                };
                const tol = trendUnit === 'dia' ? 4 : 2;
                const unitTxt = trendUnit === 'dia' ? 'mm' : 'cm';
                const Y_MAX = trendUnit === 'dia' ? 12 : 6;
                const yPct = (v: number) => {
                  const c = Math.max(-Y_MAX, Math.min(Y_MAX, v));
                  return 50 - (c / Y_MAX) * 45;
                };
                const yAxisLabels = trendUnit === 'dia'
                  ? [{ v: 8, t: '+8' }, { v: 4, t: '+4' }, { v: 0, t: '0' }, { v: -4, t: '−4' }, { v: -8, t: `−8 ${unitTxt}` }]
                  : [{ v: 4, t: '+4' }, { v: 2, t: '+2' }, { v: 0, t: '0' }, { v: -2, t: '−2' }, { v: -4, t: `−4 ${unitTxt}` }];

                // === FÖNSTER-MODELL: filtret bestämmer hur BRETT tidsfönster man ser,
                // inte hur kontroller klumpas. Inom fönstret är varje dag = en punkt
                // (dag-snitt om flera kontroller samma dag), placerad på sin riktiga
                // x-position i tiden.
                const isoWeek = (d: Date): number => {
                  const tmp = new Date(d);
                  tmp.setHours(0, 0, 0, 0);
                  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
                  const firstThursday = new Date(tmp.getFullYear(), 0, 4);
                  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
                  return 1 + Math.round((tmp.getTime() - firstThursday.getTime()) / (7 * 86400000));
                };
                const startOfWeek = (d: Date): Date => {
                  const x = new Date(d);
                  x.setHours(0, 0, 0, 0);
                  const day = (x.getDay() + 6) % 7; // mån=0
                  x.setDate(x.getDate() - day);
                  return x;
                };
                const windowRange = (anchor: Date): { start: Date; end: Date } => {
                  if (trendPeriod === 'vecka') {
                    const s = startOfWeek(anchor);
                    return { start: s, end: new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7) };
                  }
                  if (trendPeriod === 'manad') {
                    return {
                      start: new Date(anchor.getFullYear(), anchor.getMonth(), 1),
                      end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1),
                    };
                  }
                  if (trendPeriod === 'kvartal') {
                    const qStart = Math.floor(anchor.getMonth() / 3) * 3;
                    return {
                      start: new Date(anchor.getFullYear(), qStart, 1),
                      end: new Date(anchor.getFullYear(), qStart + 3, 1),
                    };
                  }
                  // ar
                  return {
                    start: new Date(anchor.getFullYear(), 0, 1),
                    end: new Date(anchor.getFullYear() + 1, 0, 1),
                  };
                };
                const windowLabel = (anchor: Date): string => {
                  if (trendPeriod === 'vecka') return `Vecka ${isoWeek(anchor)} · ${anchor.getFullYear()}`;
                  if (trendPeriod === 'manad') {
                    const months = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];
                    return `${months[anchor.getMonth()]} ${anchor.getFullYear()}`;
                  }
                  if (trendPeriod === 'kvartal') return `Q${Math.floor(anchor.getMonth() / 3) + 1} ${anchor.getFullYear()}`;
                  return `${anchor.getFullYear()}`;
                };
                const shiftWindow = (anchor: Date, delta: -1 | 1): Date => {
                  const x = new Date(anchor);
                  if (trendPeriod === 'vecka') x.setDate(x.getDate() + delta * 7);
                  else if (trendPeriod === 'manad') x.setMonth(x.getMonth() + delta);
                  else if (trendPeriod === 'kvartal') x.setMonth(x.getMonth() + delta * 3);
                  else x.setFullYear(x.getFullYear() + delta);
                  return x;
                };

                // Anchor: explicit (efter bläddring) eller auto = senaste kontrollen
                // för aktuellt trädslag. Kontroller är sorterade datum desc, så [0] = senaste.
                const defaultAnchor: Date = trCurrent && trCurrent.kontroller.length > 0
                  ? new Date(trCurrent.kontroller[0].datum)
                  : new Date();
                const anchor: Date = trendAnchor ? new Date(trendAnchor) : defaultAnchor;
                const range = windowRange(anchor);
                const startMs = range.start.getTime();
                const endMs = range.end.getTime();
                const winLabel = windowLabel(anchor);

                // Filtrera kontroller inom fönstret + gruppera per dag (dag-snitt om flera samma dag)
                type CurvePoint = { key: string; label: string; ts: number; avg: number; n: number; filnamns: string[] };
                const curvePoints: CurvePoint[] = (() => {
                  if (!trCurrent) return [];
                  const dayBuckets = new Map<string, { ts: number; vals: number[]; filnamns: string[] }>();
                  for (const k of trCurrent.kontroller) {
                    const d = new Date(k.datum);
                    const t = d.getTime();
                    if (t < startMs || t >= endMs) continue;
                    const v = trendUnit === 'dia' ? k.dia_snitt_mm : k.len_snitt_cm;
                    const dayKey = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
                    const dayTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
                    const b = dayBuckets.get(dayKey);
                    if (b) { b.vals.push(v); b.filnamns.push(k.filnamn); }
                    else dayBuckets.set(dayKey, { ts: dayTs, vals: [v], filnamns: [k.filnamn] });
                  }
                  const arr: CurvePoint[] = [];
                  dayBuckets.forEach((b, key) => {
                    arr.push({
                      key,
                      label: new Date(b.ts).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }),
                      ts: b.ts,
                      avg: b.vals.reduce((a, c) => a + c, 0) / b.vals.length,
                      n: b.vals.length,
                      filnamns: b.filnamns,
                    });
                  });
                  arr.sort((a, b) => a.ts - b.ts);
                  return arr;
                })();

                // X-position baserat på faktiskt datum inom fönstret (4-96% för marginal)
                const xPctFor = (ts: number) => {
                  const range = endMs - startMs;
                  if (range <= 0) return 50;
                  const raw = ((ts - startMs) / range) * 100;
                  return Math.max(4, Math.min(96, raw));
                };

                // SVG polyline (om vi har minst 2 punkter)
                const polylinePoints = curvePoints.length >= 2
                  ? curvePoints.map((p) => `${xPctFor(p.ts).toFixed(2)},${yPct(p.avg).toFixed(2)}`).join(' ')
                  : '';

                // Auto-mening: ärlig sammanfattning av FÖNSTRET
                const autoMening = (): string => {
                  if (curvePoints.length === 0) return '';
                  if (curvePoints.length === 1) {
                    const p = curvePoints[0];
                    return `Enstaka kontroll ${p.label}: ${fmtAvvikelse(p.avg, unitTxt as 'mm' | 'cm')} ${unitTxt}.`;
                  }
                  const allInTol = curvePoints.every((p) => Math.abs(p.avg) <= tol);
                  if (allInTol) return `Stabilt inom ±${tol} ${unitTxt} under ${winLabel.toLowerCase()}.`;
                  const peak = curvePoints.reduce((a, b) => Math.abs(b.avg) > Math.abs(a.avg) ? b : a);
                  const peakIdx = curvePoints.indexOf(peak);
                  const last = curvePoints[curvePoints.length - 1];
                  if (peak === last) {
                    const dir = peak.avg > 0 ? (trendUnit === 'dia' ? 'grovt' : 'långt') : (trendUnit === 'dia' ? 'klent' : 'kort');
                    return `Drar åt ${dir} senast — ${fmtAvvikelse(peak.avg, unitTxt as 'mm' | 'cm')} ${unitTxt} ${peak.label}.`;
                  }
                  const after = curvePoints.slice(peakIdx + 1);
                  const recovered = after.length > 0 && after.every((p) => Math.abs(p.avg) <= tol);
                  if (recovered) {
                    return `Drog iväg ${peak.label} (${fmtAvvikelse(peak.avg, unitTxt as 'mm' | 'cm')} ${unitTxt}), tillbaka inom tolerans efter det.`;
                  }
                  return `Värst ${peak.label}: ${fmtAvvikelse(peak.avg, unitTxt as 'mm' | 'cm')} ${unitTxt}.`;
                };

                // Kalibreringsmarkörer som faller inom fönstret
                const kalibMarkers: { ts: number; label: string }[] = trendData.kalibreringar
                  .filter((kev) => {
                    if (kev.tradslag && trCurrentKey && kev.tradslag.toLowerCase() !== trCurrentKey) return false;
                    const t = new Date(kev.datum).getTime();
                    return t >= startMs && t < endMs;
                  })
                  .map((kev) => ({
                    ts: new Date(kev.datum).getTime(),
                    label: new Date(kev.datum).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }),
                  }));

                // Bläddringshandlers
                const onPrev = () => setTrendAnchor(shiftWindow(anchor, -1).toISOString());
                const onNext = () => setTrendAnchor(shiftWindow(anchor, +1).toISOString());
                // Nästa-knapp = disabled om fönstret hamnar bortom dagens datum
                const nextRange = windowRange(shiftWindow(anchor, +1));
                const canGoNext = nextRange.start.getTime() <= Date.now();

                return (
                  <>
                    <div className="kalib-trend-layout">
                    <div className="kalib-trend-left">
                    {/* Trädslag-pillar */}
                    {tradslagAll.length > 0 && (
                      <div className="kalib-trend-pills">
                        {tradslagAll.map(([key, td]) => (
                          <button
                            key={key}
                            className={`kalib-trend-pill ${key === trCurrentKey ? 'active' : ''}`}
                            onClick={() => { setSelectedTrendTradslag(key); setTrendAnchor(null); }}
                          >
                            <span className="kalib-trend-pill-name">{cap(key)}</span>
                            <span className="kalib-trend-pill-count">{td.antal_kontroller}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Enhetväxling (Diameter / Längd) */}
                    <div className="kalib-trend-seg">
                      <button
                        className={`kalib-trend-seg-btn ${trendUnit === 'dia' ? 'active' : ''}`}
                        onClick={() => setTrendUnit('dia')}
                      >Diameter</button>
                      <button
                        className={`kalib-trend-seg-btn ${trendUnit === 'len' ? 'active' : ''}`}
                        onClick={() => setTrendUnit('len')}
                      >Längd</button>
                    </div>

                    {/* Tidsupplösning */}
                    <div className="kalib-trend-seg">
                      <button className={`kalib-trend-seg-btn ${trendPeriod === 'vecka' ? 'active' : ''}`} onClick={() => setTrendPeriod('vecka')}>Vecka</button>
                      <button className={`kalib-trend-seg-btn ${trendPeriod === 'manad' ? 'active' : ''}`} onClick={() => setTrendPeriod('manad')}>Månad</button>
                      <button className={`kalib-trend-seg-btn ${trendPeriod === 'kvartal' ? 'active' : ''}`} onClick={() => setTrendPeriod('kvartal')}>Kvartal</button>
                      <button className={`kalib-trend-seg-btn ${trendPeriod === 'ar' ? 'active' : ''}`} onClick={() => setTrendPeriod('ar')}>År</button>
                    </div>

                    {/* Bläddring inom fönstret */}
                    {trCurrent && (
                      <div className="kalib-trend-nav">
                        <button
                          className="kalib-trend-nav-btn"
                          onClick={onPrev}
                          aria-label="Föregående fönster"
                        >
                          <MSym name="chevron_left" size={22} color="#fff" />
                        </button>
                        <div className="kalib-trend-nav-label">{winLabel}</div>
                        <button
                          className="kalib-trend-nav-btn"
                          onClick={onNext}
                          disabled={!canGoNext}
                          aria-label="Nästa fönster"
                        >
                          <MSym name="chevron_right" size={22} color={canGoNext ? '#fff' : '#3A3A3C'} />
                        </button>
                      </div>
                    )}

                    {/* Trendkurva */}
                    {trCurrent && (
                      <div className="kalib-card">
                        <div className="kalib-section-title">
                          {trendUnit === 'dia' ? 'Diameter' : 'Längd'} · {cap(trCurrentKey ?? '')}
                        </div>
                        <div className="kalib-section-subtitle">
                          {curvePoints.length === 0
                            ? 'Inga kontroller i fönstret'
                            : `${curvePoints.reduce((a, p) => a + p.n, 0)} kontroller · ${curvePoints.length} dag${curvePoints.length === 1 ? '' : 'ar'}`}
                        </div>

                        {!enough && (
                          <div className="kalib-trend-too-few">
                            För få kontroller för pålitligt mönster ({trCurrent.antal_kontroller} av minst {TRADSLAG_TRESHOLD}).
                            Färgerna är dämpade tills det finns mer data.
                          </div>
                        )}

                        {curvePoints.length === 0 ? (
                          <div className="kalib-trend-empty">
                            Inga kontroller i {winLabel.toLowerCase()}. Bläddra ‹ › för att se andra perioder.
                          </div>
                        ) : (
                          <>
                            <div className={`kalib-curve ${enough ? '' : 'muted'}`}>
                              <div className="kalib-curve-row">
                                <div className="kalib-curve-yaxis">
                                  {yAxisLabels.map((l) => (
                                    <span key={l.t} style={{ top: `${yPct(l.v)}%` }}>{l.t}</span>
                                  ))}
                                </div>
                                <div className="kalib-curve-plot">
                                  {/* Toleranszon */}
                                  <div
                                    className="kalib-curve-tol"
                                    style={{ top: `${yPct(tol)}%`, bottom: `${100 - yPct(-tol)}%` }}
                                  />
                                  {/* Nollinje */}
                                  <div className="kalib-curve-zero" style={{ top: `${yPct(0)}%` }} />
                                  {/* Kalibreringsmarkörer (lodräta streckade linjer) */}
                                  {kalibMarkers.map((m, i) => (
                                    <div
                                      key={`kev-${i}`}
                                      className="kalib-curve-kalib"
                                      style={{ left: `${xPctFor(m.ts)}%` }}
                                      title={`Kalibrering ${m.label}`}
                                    >
                                      <span className="kalib-curve-kalib-tag">⚙ {m.label}</span>
                                    </div>
                                  ))}
                                  {/* SVG-linje — fyller hela plot-rutan, viewBox 0..100 i båda axlar */}
                                  {polylinePoints && (
                                    <svg className="kalib-curve-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                                      <polyline
                                        points={polylinePoints}
                                        fill="none"
                                        stroke="rgba(255,255,255,0.5)"
                                        strokeWidth="1.5"
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                        vectorEffect="non-scaling-stroke"
                                      />
                                    </svg>
                                  )}
                                  {/* Punkter */}
                                  {curvePoints.map((p) => {
                                    const cls = enough ? valCls(p.avg) : 'ok';
                                    return (
                                      <div
                                        key={p.key}
                                        className={`kalib-curve-dot tone-${cls}`}
                                        style={{ left: `${xPctFor(p.ts)}%`, top: `${yPct(p.avg)}%` }}
                                        title={`${p.label}: ${fmtAvvikelse(p.avg, unitTxt as 'mm' | 'cm')} ${unitTxt}${p.n > 1 ? ` (snitt av ${p.n} kontroller)` : ''}`}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                              {/* X-axeletiketter: fönstrets ändar + jämn fördelning */}
                              <div className="kalib-curve-xaxis">
                                <div className="kalib-curve-xaxis-spacer" />
                                <div className="kalib-curve-xaxis-inner">
                                  {(() => {
                                    // Generera lagom täta etiketter beroende på fönstertyp
                                    const labels: { x: number; label: string }[] = [];
                                    const startD = new Date(startMs);
                                    if (trendPeriod === 'vecka') {
                                      // Mån-Sön: visa varje dag
                                      const days = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön'];
                                      for (let i = 0; i < 7; i++) {
                                        const ts = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate() + i, 12).getTime();
                                        labels.push({ x: xPctFor(ts), label: days[i] });
                                      }
                                    } else if (trendPeriod === 'manad') {
                                      // Visa dag-tal var 5:e dag
                                      for (let dag = 1; dag <= 31; dag += 5) {
                                        const ts = new Date(startD.getFullYear(), startD.getMonth(), dag, 12).getTime();
                                        if (ts >= endMs) break;
                                        labels.push({ x: xPctFor(ts), label: String(dag) });
                                      }
                                    } else if (trendPeriod === 'kvartal') {
                                      // 3 månadsnamn
                                      const months = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
                                      for (let m = 0; m < 3; m++) {
                                        const monthIdx = startD.getMonth() + m;
                                        const ts = new Date(startD.getFullYear(), monthIdx, 15).getTime();
                                        labels.push({ x: xPctFor(ts), label: months[monthIdx % 12] });
                                      }
                                    } else {
                                      // år: 12 månadsbokstäver eller var 2:a
                                      const months = ['J','F','M','A','M','J','J','A','S','O','N','D'];
                                      for (let m = 0; m < 12; m++) {
                                        const ts = new Date(startD.getFullYear(), m, 15).getTime();
                                        labels.push({ x: xPctFor(ts), label: months[m] });
                                      }
                                    }
                                    return labels.map((l, i) => (
                                      <span key={i} style={{ left: `${l.x}%` }}>{l.label}</span>
                                    ));
                                  })()}
                                </div>
                              </div>
                            </div>

                            {/* Auto-mening (klartext-sammanfattning) */}
                            <div className="kalib-curve-mening">{autoMening()}</div>
                          </>
                        )}
                      </div>
                    )}
                    </div>{/* /kalib-trend-left */}

                    <div className="kalib-trend-right">
                    {/* === Kontroll-lista för det valda fönstret === */}
                    {trCurrent && (() => {
                      // Enskilda kontroller inom [startMs, endMs), nyast först.
                      // Inom samma datum: filnamn desc som stabil fallback.
                      const inWindow = trCurrent.kontroller
                        .filter((k) => {
                          const t = new Date(k.datum).getTime();
                          return t >= startMs && t < endMs;
                        })
                        .sort((a, b) => {
                          const dt = new Date(b.datum).getTime() - new Date(a.datum).getTime();
                          if (dt !== 0) return dt;
                          return a.filnamn < b.filnamn ? 1 : a.filnamn > b.filnamn ? -1 : 0;
                        });

                      // Tom-stat: lugn text, ingen tom låda
                      if (inWindow.length === 0) {
                        const periodOrd =
                          trendPeriod === 'vecka' ? 'vecka'
                          : trendPeriod === 'manad' ? 'månad'
                          : trendPeriod === 'kvartal' ? 'kvartal'
                          : 'år';
                        return (
                          <div className="kalib-trend-list-empty">
                            Inga kontroller denna {periodOrd}
                          </div>
                        );
                      }

                      // Antal unika trakter
                      const trakterSet = new Set<string>();
                      for (const k of inWindow) {
                        if (k.object_name) trakterSet.add(k.object_name);
                      }
                      const trakterN = trakterSet.size;

                      // Gruppera per dag
                      type DayGroup = { dayKey: string; label: string; ts: number; items: typeof inWindow };
                      const weekdays = ['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag'];
                      const monthsLong = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
                      const dayMap = new Map<string, DayGroup>();
                      for (const k of inWindow) {
                        const d = new Date(k.datum);
                        const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                        const dayTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
                        const label = `${weekdays[d.getDay()]} ${d.getDate()} ${monthsLong[d.getMonth()]}`;
                        const g = dayMap.get(dayKey);
                        if (g) g.items.push(k);
                        else dayMap.set(dayKey, { dayKey, label, ts: dayTs, items: [k] });
                      }
                      const dayGroups = Array.from(dayMap.values()).sort((a, b) => b.ts - a.ts);

                      // Eget format med riktigt minustecken (Skogforsk-spec på listan)
                      const fmtList = (v: number): string => {
                        if (trendUnit === 'dia') {
                          const r = Math.round(v);
                          if (r === 0) return `0 ${unitTxt}`;
                          if (r > 0) return `+${r} ${unitTxt}`;
                          return `−${Math.abs(r)} ${unitTxt}`;
                        }
                        const r = Number(v.toFixed(1));
                        if (r === 0) return `0 ${unitTxt}`;
                        if (r > 0) return `+${r} ${unitTxt}`;
                        return `−${Math.abs(r)} ${unitTxt}`;
                      };

                      return (
                        <>
                          {/* Topprad — lugn orientering */}
                          <div className="kalib-trend-list-top">
                            <span className="kalib-trend-list-top-primary">{winLabel}</span>
                            <span className="kalib-trend-list-top-tertiary">
                              · {inWindow.length} kontroller · {trakterN} {trakterN === 1 ? 'trakt' : 'trakter'}
                            </span>
                          </div>

                          {dayGroups.map((g) => (
                            <div key={g.dayKey} className="kalib-trend-day">
                              <div className="kalib-trend-day-header">{g.label}</div>
                              <div className="kalib-trend-day-card">
                                {g.items.map((k, idx) => {
                                  const v = trendUnit === 'dia' ? k.dia_snitt_mm : k.len_snitt_cm;
                                  const cls = valCls(v);
                                  const isLast = idx === g.items.length - 1;
                                  return (
                                    <button
                                      key={k.filnamn}
                                      type="button"
                                      className={`kalib-trend-row ${isLast ? 'last' : ''}`}
                                      onClick={() => openKontrollFull(k.filnamn)}
                                      disabled={laddarKontroll === k.filnamn}
                                    >
                                      <span className={`kalib-trend-row-dot tone-${cls}`} aria-hidden="true" />
                                      <div className="kalib-trend-row-info">
                                        <div className="kalib-trend-row-name">{k.object_name || 'Okänd trakt'}</div>
                                        <div className="kalib-trend-row-meta">
                                          {cap(trCurrentKey ?? '')} · {k.antal_stockar} stock{k.antal_stockar === 1 ? '' : 'ar'}
                                        </div>
                                      </div>
                                      <span className={`kalib-trend-row-val tone-${cls}`}>
                                        {fmtList(v)}
                                      </span>
                                      <span className="kalib-trend-row-chev"><MSym name="chevron_right" size={16} color="#8E8E93" /></span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </>
                      );
                    })()}
                    </div>{/* /kalib-trend-right */}
                    </div>{/* /kalib-trend-layout */}

                    {trendData.totalt.antal_kontroller === 0 && (
                      <div className="kalib-info-box neutral">
                        <span className="kalib-info-icon"><MSym name="info" size={20} color="#8E8E93" /></span>
                        <div className="kalib-info-content">
                          <div className="kalib-info-title">Ingen trenddata</div>
                          <div className="kalib-info-text">Inga kontroller hittades för det här filtret.</div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
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
                    <div className="kalib-cal-layout">
                    <div className="kalib-card kalib-cal-summary">
                      {sf.produktionsdagar === 0 ? (
                        <>
                          <div className="kalib-cal-summary-big">Inga kontroller den här månaden</div>
                          <div className="kalib-cal-summary-sub">Bläddra ‹ › till en månad med produktion.</div>
                        </>
                      ) : (
                        <>
                          <div className="kalib-cal-summary-big">{sf.kompletta} av {sf.produktionsdagar} dagar kompletta</div>
                          <div className="kalib-cal-summary-sub">i {subManad}</div>
                          <div className="kalib-cal-summary-grid two">
                            <div className="kalib-cal-summary-item">
                              <div className="kalib-cal-summary-num" style={{ color: sf.saknas > 0 ? '#FF3B30' : '#8E8E93' }}>{sf.saknas}</div>
                              <div className="kalib-cal-summary-lbl">Saknas</div>
                            </div>
                            <div className="kalib-cal-summary-item">
                              <div className="kalib-cal-summary-num" style={{ color: sf.varningar > 0 ? '#FF3B30' : '#8E8E93' }}>{sf.varningar}</div>
                              <div className="kalib-cal-summary-lbl">Varningar</div>
                            </div>
                          </div>
                        </>
                      )}
                      {/* Legend i sidopanelen — bara ≥1000px (togglas mot inline nedan) */}
                      <div className="kalib-cal-legend kalib-cal-legend--side">
                        <div className="kalib-cal-legend-row"><span className="kalib-cal-legend-dot green" />Kontroll lämnad</div>
                        <div className="kalib-cal-legend-row"><span className="kalib-cal-legend-dot red" />Saknas</div>
                        <div className="kalib-cal-legend-row"><span className="kalib-cal-legend-dot red-ring" />Varning</div>
                      </div>
                    </div>

                    <div className="kalib-card kalib-cal-gridcard">
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
                      <div className="kalib-cal-legend kalib-cal-legend--inline">
                        <div className="kalib-cal-legend-row"><span className="kalib-cal-legend-dot green" />Kontroll lämnad</div>
                        <div className="kalib-cal-legend-row"><span className="kalib-cal-legend-dot red" />Saknas</div>
                        <div className="kalib-cal-legend-row"><span className="kalib-cal-legend-dot red-ring" />Varning</div>
                      </div>
                    </div>
                    </div>{/* /kalib-cal-layout */}
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
                    <div className={`kalib-report-metric-value ${filteredKalib.filter(k => k.status === 'VARNING').length > 0 ? 'tone-hot' : 'tone-muted'}`}>{filteredKalib.filter(k => k.status === 'VARNING').length}</div>
                    <div className="kalib-report-metric-label">Varningar</div>
                  </div>
                </div>
              </div>

              <div className="kalib-report-section">
                <div className="kalib-report-section-title">Avvikelse</div>
                <div className="kalib-report-results">
                  <div className="kalib-report-result">
                    <div className="kalib-report-result-label">Längd</div>
                    <div className={`kalib-report-result-value big tone-${avvikelseTon(avgLenReport, 'len')}`}>{fmtAvvikelse(avgLenReport, 'cm')} cm</div>
                  </div>
                  <div className="kalib-report-result">
                    <div className="kalib-report-result-label">Diameter</div>
                    <div className={`kalib-report-result-value big tone-${avvikelseTon(avgDiaReport, 'dia')}`}>{fmtAvvikelse(avgDiaReport, 'mm')} mm</div>
                  </div>
                </div>
                {verdictWithinTolerance ? (
                  <div className="kalib-lugn-rad">
                    <MSym name="check" size={16} color="#8E8E93" />
                    <span>Inom tolerans.</span>
                  </div>
                ) : (
                  <div className="kalib-lugn-rad">
                    <MSym name="info" size={16} color="#8E8E93" />
                    <span>Utanför tolerans — se avvikelserna ovan.</span>
                  </div>
                )}
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
                        <span className={`tone-${avvikelseTon(data.lenDiff, 'len', data.count)}`}>{fmtAvvikelse(data.lenDiff, 'cm')} cm</span>
                        <span className={`tone-${avvikelseTon(data.diaDiff, 'dia', data.count)}`}>{fmtAvvikelse(data.diaDiff, 'mm')} mm</span>
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
        </PageContainer>

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
