'use client';
import { underTopbar, AVSTAND, FARG, FONT, RADIE, TNUM, TRAFFYTA, TYP, VIKT, kolumnRot, medSafeBotten } from '@/lib/design/tokens'; // layoutmått, inte avstånd (tokens: LAYOUT)

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import TuTabell from '@/components/maskinvy/TuTabell';
import { supabase } from '@/lib/supabase';
import {
  hämtaManuellRader, fetchAllTimeLassTid,
} from '@/lib/maskinvy/skotarvolym';
import {
  KLASSER, NK, getKlassIdx, JAMFORELSE_FARG, kvot, skillnadPct, valjJamforelseMaskiner,
  summeraPerMaskinObjekt, objektSkotningsavstand, volymPerObjekt,
  ORSAK_INGEN_G15, ORSAK_INGEN_MASKIN,
} from '@/lib/maskinvy/jamforelse';
import { fetchAll, getPeriodRange, fmtSv, fmtSvDelta, tint, type Period } from './OversiktShared';
import { useJamforelseMaskinRader } from './useJamforelseMaskiner';

// Maskinerna väljs ur dim_maskin per period (lib/maskinvy/jamforelse) — inga
// hårdkodade id:n. Avståndsklasserna delas med Skotare › Jämförelse.
const DIST_LABELS = KLASSER.map(k => k.short);

// Chart.js ur paketet — inte window.Chart, som bara finns om de gamla vyerna
// råkat ladda det (grafen var tom i ?ny=1).
ChartJS.register(...registerables);

// Plats NK i varje klass-array: tid/lass som inte kan få någon avståndsklass
// (flyttobjekt utan lass, lass utan körsträcka). Ingår i totalen, inte i diagrammet.
const UTAN_KLASS = NK;

type MetricId = 'm3fub_g15h' | 'm3fub_100m' | 'lass_g15h' | 'bransle_m3';

const METRICS: { id: MetricId; label: string; sublabel: string; unit: string; higherIsBetter: boolean }[] = [
  { id: 'm3fub_g15h', label: 'Produktion',   sublabel: 'Kubikmeter virke per timme',           unit: 'm³/G15h',   higherIsBetter: true },
  { id: 'm3fub_100m', label: 'Effektivitet', sublabel: 'Kubikmeter per 100m körsträcka',       unit: 'm³/100m',   higherIsBetter: true },
  { id: 'lass_g15h',  label: 'Turer',        sublabel: 'Antal lass per timme',                  unit: 'lass/G15h', higherIsBetter: true },
  { id: 'bransle_m3', label: 'Bränsle',      sublabel: 'Liter diesel per kubikmeter virke',    unit: 'l/m³',      higherIsBetter: false },
];

// Maskinfärgerna: samma som Skotare › Jämförelse (lila Elephant King, blå Wisent)
const COLOR_EK = JAMFORELSE_FARG.ek;
const COLOR_WI = JAMFORELSE_FARG.wisent;

interface ClassData {
  volym: number;
  g15h: number;
  distM: number;   // summa körsträcka (tur och retur), meter
  bransle: number;
  skift: number;
  lass: number;
}

function emptyClass(): ClassData {
  return { volym: 0, g15h: 0, distM: 0, bransle: 0, skift: 0, lass: 0 };
}

function addClass(a: ClassData, b: ClassData) {
  a.volym += b.volym; a.g15h += b.g15h; a.distM += b.distM;
  a.bransle += b.bransle; a.skift += b.skift; a.lass += b.lass;
}

/** Måttet för en uppsättning data — null när nämnaren saknas (aldrig division ändå). */
function computeMetric(d: ClassData | undefined, metric: MetricId): number | null {
  if (!d) return null;
  switch (metric) {
    case 'm3fub_g15h': return kvot(d.volym, d.g15h);
    case 'm3fub_100m': return kvot(d.volym, d.distM / 100);
    case 'lass_g15h':  return kvot(d.lass, d.g15h);
    case 'bransle_m3': return kvot(d.bransle, d.volym);
    default: return null;
  }
}

/** Total över alla klasser — SUM/SUM, aldrig snitt av klassernas snitt. */
function totalData(data: ClassData[]): ClassData {
  const t = emptyClass();
  data.forEach(d => addClass(t, d));
  return t;
}

// ── SCORE CARD ────────────────────────────────────────────────────────────────
function ScoreCard({
  name, value, unit, isWinner, pctDiff, vol, isHigherBetter, orsak,
}: {
  name: string; value: number | null; unit: string; isWinner: boolean | null;
  pctDiff: number | null; vol: number; isHigherBetter: boolean; orsak: string | null;
}) {
  const goodDiff = pctDiff === null ? null : (isHigherBetter ? pctDiff >= 0 : pctDiff <= 0);
  const vinner = isWinner === true;

  return (
    <div style={{
      flex: 1,
      background: FARG.kort,
      border: `1px solid ${vinner ? tint(FARG.gron, 28) : FARG.linje}`,
      borderRadius: RADIE.kort,
      padding: AVSTAND.xl,
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Rank badge — bara när båda maskinerna har ett värde att jämföra */}
      {isWinner !== null && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs,
          ...TYP.meta, fontWeight: VIKT.halvfet, padding: `${AVSTAND.xs}px ${AVSTAND.s}px`, borderRadius: RADIE.stapel, marginBottom: AVSTAND.s,
          background: vinner ? tint(FARG.gron, 8) : 'transparent',
          border: `1px solid ${vinner ? tint(FARG.gron, 20) : FARG.linje}`,
          color: vinner ? FARG.gron : FARG.text3,
        }}>
          {vinner ? 'Bäst' : '2:a plats'}
        </div>
      )}

      {/* Name */}
      <div style={{ ...TYP.listtitel, marginBottom: AVSTAND.xs, color: vinner ? FARG.text : FARG.text2 }}>{name}</div>

      {/* Hero number */}
      <div style={{
        ...TYP.tal,
        marginTop: AVSTAND.m, marginBottom: AVSTAND.xs,
        color: vinner ? FARG.text : FARG.text2,
      }}>
        {value !== null ? fmtSv(value, 1) : '–'}
      </div>
      <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{unit}</div>
      <div style={{ ...TYP.meta, color: FARG.text3, marginBottom: AVSTAND.m }}>
        {value !== null ? 'summa / summa' : orsak}
      </div>

      {/* Diff badge */}
      <div style={{
        ...TYP.meta, fontWeight: VIKT.fet, marginBottom: AVSTAND.l,
        color: goodDiff ? FARG.gron : FARG.rod,
      }}>
        {pctDiff !== null ? `${fmtSvDelta(pctDiff)} ${goodDiff ? 'bättre' : 'sämre'}` : '–'}
      </div>

      {/* Data volume */}
      <div style={{
        paddingTop: AVSTAND.m, borderTop: `1px solid ${FARG.linje}`,
        ...TYP.meta, color: FARG.text3,
      }}>
        {vol > 0 ? (
          <span style={{ color: FARG.text2 }}>
            {fmtSv(vol, 0)} m³ data
          </span>
        ) : '–'}
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function Jamforelse() {
  const [metric, setMetric] = useState<MetricId>('m3fub_g15h');
  const [period, setPeriod] = useState<Period>('M');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [laddFel, setLaddFel] = useState(false);
  const [ekBred, setEkBred] = useState<ClassData[]>([]);
  const [ekSmal, setEkSmal] = useState<ClassData[]>([]);
  const [wi, setWi]         = useState<ClassData[]>([]);
  // Which EK config to show in comparison (bred or smal)
  const [ekConfig, setEkConfig] = useState<'bred' | 'smal'>('bred');
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);

  const { start, end, label } = getPeriodRange(period, offset);

  // Maskinerna ur dim_maskin för perioden — inga hårdkodade id:n.
  const { rader: maskinRader } = useJamforelseMaskinRader();
  const val = useMemo(
    () => (maskinRader ? valjJamforelseMaskiner(maskinRader, start, end) : null),
    [maskinRader, start, end],
  );
  const wiIds = val?.wisent ?? [];
  const ekIds = val?.ek ?? [];
  const idNyckel = val ? `${wiIds.join(',')}|${ekIds.join(',')}` : null;

  const loadData = useCallback(async () => {
    if (idNyckel === null) return;            // dim_maskin ännu inte läst
    setLoading(true);
    setLaddFel(false);
    const ids = [...wiIds, ...ekIds];
    const tom = () => Array.from({ length: NK + 1 }, () => emptyClass());
    if (ids.length === 0) {
      setEkBred(tom()); setEkSmal(tom()); setWi(tom()); setLoading(false);
      return;
    }

    // Lass och tid hämtas SEPARAT (aldrig joinade) och möts per maskin+objekt.
    // Volym = maskinens EGNA lass (fakt_lass), inte skördarens produktion på objektet.
    const [lassRows, tidRows, dimRes, objektRes] = await Promise.all([
      fetchAll('fakt_lass', 'maskin_id, objekt_id, datum, volym_m3sub, korstracka_m', ids, start, end),
      fetchAll('fakt_tid', 'maskin_id, objekt_id, datum, processing_sek, terrain_sek, other_work_sek, bransle_liter', ids, start, end),
      supabase.from('dim_objekt').select('objekt_id, vo_nummer'),
      supabase.from('objekt').select('vo_nummer, skotare_konfiguration'),
    ]);

    // Manuell korrigering via den delade funktionen, en maskin i taget (som övriga flikar).
    const volymId: Record<string, Map<string, number>> = {};
    await Promise.all(ids.map(async id => {
      const rader = await hämtaManuellRader(id).catch(() => []);
      if (!rader.some(r => (r.volym_m3 ?? 0) > 0)) return;
      const { lassRows: allL, tidRows: allT } = await fetchAllTimeLassTid([id]);
      volymId[id] = volymPerObjekt(allL, rader, allT, id, start, end).perObjekt;
    }));

    const voToKonfig: Record<string, string> = {};
    (objektRes.data || []).forEach((r: any) => { if (r.vo_nummer) voToKonfig[r.vo_nummer] = r.skotare_konfiguration || 'bred'; });
    const objIdToKonfig: Record<string, string> = {};
    (dimRes.data || []).forEach((r: any) => { if (r.vo_nummer && voToKonfig[r.vo_nummer]) objIdToKonfig[r.objekt_id] = voToKonfig[r.vo_nummer]; });

    const newEkBred = tom();
    const newEkSmal = tom();
    const newWi     = tom();
    const ekSet = new Set(ekIds);

    for (const sum of summeraPerMaskinObjekt(lassRows, tidRows)) {
      // Objektets klass = dess skotningsavstånd (enkelriktat, ur lassens körsträcka).
      // Objekt utan lass med körsträcka (t.ex. flyttobjektet) kan inte klassas, men
      // deras G15-timmar är maskinens timmar och hamnar i UTAN_KLASS så totalen stämmer.
      const avst = objektSkotningsavstand(sum);
      const ci = avst === null ? UTAN_KLASS : getKlassIdx(avst);
      const rattad = volymId[sum.maskin_id]?.get(sum.objekt_id);
      const d: ClassData = {
        volym: rattad ?? sum.volym, g15h: sum.g15h, distM: sum.korM,
        bransle: sum.bransle, skift: sum.dagar.size, lass: sum.lass,
      };
      if (ekSet.has(sum.maskin_id)) {
        const mal = (objIdToKonfig[sum.objekt_id] || 'bred') === 'smal' ? newEkSmal : newEkBred;
        addClass(mal[ci], d);
      } else {
        addClass(newWi[ci], d);
      }
    }

    setEkBred(newEkBred); setEkSmal(newEkSmal); setWi(newWi);
    setLoading(false);
    // wiIds/ekIds härleds ur idNyckel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idNyckel, start, end]);

  useEffect(() => {
    loadData().catch(() => { setLaddFel(true); setLoading(false); });
  }, [loadData]);

  // Draw bar chart
  useEffect(() => {
    if (loading || !chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const ekData = ekConfig === 'bred' ? ekBred : ekSmal;
    const ekVals = ekData.slice(0, NK).map(d => computeMetric(d, metric));
    const wiVals = wi.slice(0, NK).map(d => computeMetric(d, metric));
    const currentMetric = METRICS.find(m => m.id === metric)!;

    chartInstance.current = new (ChartJS as any)(chartRef.current, {
      type: 'bar',
      data: {
        labels: DIST_LABELS,
        datasets: [
          {
            label: `Elephant King (${ekConfig})`,
            data: ekVals,
            backgroundColor: COLOR_EK,
            borderRadius: RADIE.stapel,
          },
          {
            label: 'Wisent',
            data: wiVals,
            backgroundColor: COLOR_WI,
            borderRadius: RADIE.stapel,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: {
          legend: {
            position: 'top' as const,
            labels: {
              font: { family: FONT, size: TYP.micro.fontSize },
              boxWidth: AVSTAND.s, borderRadius: RADIE.stapel, padding: AVSTAND.l, color: FARG.text2,
            },
          },
          tooltip: {
            backgroundColor: FARG.upphojt,
            titleColor: FARG.text,
            bodyColor: FARG.text2,
            borderColor: FARG.linje,
            borderWidth: 1,
            padding: AVSTAND.m,
            callbacks: {
              label: (c: any) => ` ${c.dataset.label}: ${c.parsed.y > 0 ? fmtSv(c.parsed.y, 1) : '–'} ${currentMetric.unit}`,
              afterBody: (items: any[]) => {
                if (items.length < 2) return [];
                const v1 = items[0].parsed.y, v2 = items[1].parsed.y;
                if (!v1 || !v2) return [];
                const diff = skillnadPct(v1, v2);
                return diff === null ? [] : [`Skillnad: ${fmtSvDelta(diff)}`];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: FARG.tonad },
            ticks: { color: FARG.text2, font: { size: TYP.micro.fontSize, family: FONT } },
          },
          y: {
            grid: { color: FARG.tonad },
            ticks: { color: FARG.text2, font: { size: TYP.micro.fontSize, family: FONT } },
            beginAtZero: true,
            title: { display: true, text: currentMetric.unit, color: FARG.text2, font: { size: TYP.micro.fontSize, family: FONT } },
          },
        },
      },
    });

    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [loading, metric, ekConfig, ekBred, ekSmal, wi]);

  // Computed values — totalen är SUM/SUM över alla klasser, aldrig ett snitt av klassernas snitt
  const ekData = ekConfig === 'bred' ? ekBred : ekSmal;
  const ekTot = totalData(ekData);
  const wiTot = totalData(wi);
  const ekAvg = computeMetric(ekTot, metric);
  const wiAvg = computeMetric(wiTot, metric);
  const currentMetric = METRICS.find(m => m.id === metric)!;
  const ekVol = ekTot.volym;
  const wiVol = wiTot.volym;

  const bada = ekAvg !== null && wiAvg !== null;
  const ekWins: boolean | null = !bada ? null
    : (currentMetric.higherIsBetter ? ekAvg >= wiAvg : ekAvg <= wiAvg);
  const ekPct = skillnadPct(ekAvg, wiAvg);
  const wiPct = skillnadPct(wiAvg, ekAvg);

  // Tid/lass utan avståndsklass (t.ex. flyttobjekt utan lass): ingår i totalen ovan men inte i diagrammet.
  const utanKlassRader = [
    { kort: 'EK', d: ekData[UTAN_KLASS] },
    { kort: 'Wisent', d: wi[UTAN_KLASS] },
  ].filter(x => x.d && (x.d.g15h > 0 || x.d.lass > 0 || x.d.volym > 0));
  // Ett kort utan att något går att rita får aldrig stå tomt.
  const harKlassvarde = [ekData, wi].some(arr =>
    arr.slice(0, NK).some(d => { const v = computeMetric(d, metric); return v !== null && v > 0; }));

  // Orsaken när en maskin saknar värde — tomt ska aldrig vara en gåta.
  const orsakFor = (harMaskin: boolean, tot: ClassData): string | null => {
    if (!harMaskin) return ORSAK_INGEN_MASKIN;
    if (!(tot.g15h > 0) && (metric === 'm3fub_g15h' || metric === 'lass_g15h')) return ORSAK_INGEN_G15;
    if (!(tot.lass > 0)) return 'Inga lass med körsträcka i perioden';
    return 'Värde saknas i perioden';
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed', top: underTopbar(52), left: 0, right: 0, bottom: 0,
        background: FARG.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: FARG.text2, fontFamily: FONT, ...TYP.meta, zIndex: 1,
      }}>
        Laddar data...
      </div>
    );
  }

  const periodKnapp = (aktiv: boolean) => ({
    minHeight: TRAFFYTA.min, minWidth: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, border: 'none', borderRadius: RADIE.rad,
    fontFamily: 'inherit', ...TYP.meta, cursor: 'pointer',
    background: aktiv ? FARG.upphojt : 'transparent',
    color: aktiv ? FARG.text : FARG.text2,
    fontWeight: aktiv ? VIKT.halvfet : VIKT.normal,
  });
  const pilKnapp = { minHeight: TRAFFYTA.min, minWidth: TRAFFYTA.min, border: 'none', background: 'transparent', color: FARG.text2, fontFamily: 'inherit', ...TYP.rubrik, cursor: 'pointer' } as const;
  const tabellRubrik = { ...TYP.meta, color: FARG.text2, fontWeight: VIKT.halvfet } as const;

  return (
    <div style={{
      position: 'fixed', top: underTopbar(52), left: 0, right: 0, bottom: 0,
      overflow: 'auto', WebkitOverflowScrolling: 'touch' as const,
      background: FARG.bg, fontFamily: FONT, color: FARG.text, zIndex: 1,
    }}>
      <div style={{ ...kolumnRot('smal'), padding: `${AVSTAND.l}px ${AVSTAND.l}px 0`, paddingBottom: medSafeBotten(AVSTAND.xxl) }}>

      {/* TU för ALLA maskiner (skördare + skotare) — resten av fliken jämför
          bara de två skotarna. Egen komponent mot tokens (components/maskinvy). */}
      <TuTabell />

      {/* ── HEADER ── */}
      <div style={{ marginBottom: AVSTAND.xl }}>
        <div style={{ ...TYP.rubrik, marginBottom: AVSTAND.xs }}>
          Elephant King vs Wisent
        </div>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>
          Jämförelse per skotningsavstånd (enkel väg) · summa / summa
        </div>
      </div>

      {/* ── PERIOD ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: AVSTAND.xl, gap: AVSTAND.s, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: AVSTAND.xs }}>
          {(['V', 'M', 'K', 'Å'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setOffset(0); }}
              style={periodKnapp(period === p)}
            >{p}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
          <button
            onClick={() => setOffset(o => o - 1)}
            aria-label="Föregående period"
            style={pilKnapp}
          >‹</button>
          <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2, minWidth: AVSTAND.xxl * 4, textAlign: 'center' }}>
            {label}
          </span>
          <button
            onClick={() => setOffset(o => o + 1)}
            aria-label="Nästa period"
            style={pilKnapp}
          >›</button>
        </div>
      </div>

      {/* ── EK CONFIG SELECTOR ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, marginBottom: AVSTAND.xl }}>
        <span style={{ ...TYP.meta, color: FARG.text2, fontWeight: VIKT.halvfet }}>
          EK konfiguration:
        </span>
        <div style={{
          display: 'flex', gap: AVSTAND.xs, background: FARG.tonad,
          borderRadius: RADIE.rad, padding: AVSTAND.xs,
        }}>
          {(['bred', 'smal'] as const).map(cfg => (
            <button
              key={cfg}
              onClick={() => setEkConfig(cfg)}
              style={{
                minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, border: 'none', borderRadius: RADIE.rad, fontFamily: 'inherit',
                ...TYP.meta, fontWeight: VIKT.halvfet, cursor: 'pointer',
                background: ekConfig === cfg ? FARG.upphojt : 'transparent',
                color: ekConfig === cfg ? FARG.text : FARG.text2,
              }}
            >
              {cfg === 'bred' ? 'Breddat lastred' : 'Smalt lastred'}
            </button>
          ))}
        </div>
      </div>

      {/* ── METRIC TABS ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${FARG.linje}`, marginBottom: AVSTAND.xl, gap: AVSTAND.xl }}>
        {METRICS.map(m => (
          <button
            key={m.id}
            onClick={() => setMetric(m.id)}
            style={{
              padding: `0 0 ${AVSTAND.m}px`, border: 'none', background: 'none',
              fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
              borderBottom: `1px solid ${metric === m.id ? FARG.text : 'transparent'}`,
            }}
          >
            <div style={{ ...TYP.meta, fontWeight: VIKT.halvfet, color: metric === m.id ? FARG.text : FARG.text3, marginBottom: AVSTAND.xs }}>
              {m.label}
            </div>
            <div style={{ ...TYP.meta, color: metric === m.id ? FARG.text2 : FARG.text3 }}>
              {m.sublabel}
            </div>
          </button>
        ))}
      </div>

      {/* ── SCORE CARDS ── */}
      <div style={{ display: 'flex', gap: AVSTAND.m, marginBottom: AVSTAND.xl }}>
        <ScoreCard
          name={`Elephant King (${ekConfig})`}
          value={ekAvg}
          unit={currentMetric.unit}
          isWinner={ekWins}
          pctDiff={ekPct}
          vol={ekVol}
          isHigherBetter={currentMetric.higherIsBetter}
          orsak={orsakFor(ekIds.length > 0, ekTot)}
        />
        <ScoreCard
          name="Wisent"
          value={wiAvg}
          unit={currentMetric.unit}
          isWinner={ekWins === null ? null : !ekWins}
          pctDiff={wiPct}
          vol={wiVol}
          isHigherBetter={currentMetric.higherIsBetter}
          orsak={orsakFor(wiIds.length > 0, wiTot)}
        />
      </div>

      {utanKlassRader.length > 0 && (
        <div data-utan-klass style={{ ...TYP.meta, color: FARG.text3, marginBottom: AVSTAND.xl }}>
          Ingår i totalen men i ingen avståndsklass (tid på objekt utan lass, till exempel flytt):{' '}
          {utanKlassRader.map(x => `${x.kort} ${fmtSv(x.d.g15h, 1)} h G15`).join(' · ')}
        </div>
      )}

      {/* ── BAR CHART ── */}
      <div style={{
        background: FARG.kort, borderRadius: RADIE.kort, border: `1px solid ${FARG.linje}`,
        padding: AVSTAND.l, marginBottom: AVSTAND.m,
      }}>
        <div style={{ ...tabellRubrik, marginBottom: AVSTAND.l }}>
          {currentMetric.label} per avståndsklass
        </div>
        {harKlassvarde ? (
          <div style={{ height: AVSTAND.xxl * 9, position: 'relative' }}>
            <canvas ref={chartRef} />
          </div>
        ) : (
          <div data-graf-tom style={{ height: AVSTAND.xxl * 4, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYP.meta, color: FARG.text2, textAlign: 'center' }}>
            Inget värde att rita för {currentMetric.label.toLowerCase()} i perioden.
          </div>
        )}
      </div>

      {/* ── DETAILS TABLE ── */}
      <div style={{
        background: FARG.kort, borderRadius: RADIE.kort, border: `1px solid ${FARG.linje}`,
        overflow: 'hidden',
      }}>
        <div style={{
          ...tabellRubrik, padding: `${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.m}px`,
          borderBottom: `1px solid ${FARG.linje}`,
        }}>
          Detaljer per avståndsklass
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', ...TYP.meta }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${FARG.linje}` }}>
              <th style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, textAlign: 'left', ...tabellRubrik }}>
                Klass
              </th>
              <th style={{ padding: `${AVSTAND.m}px ${AVSTAND.m}px`, textAlign: 'right', ...tabellRubrik }}>
                <span style={{ display: 'inline-block', width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.stapel, background: COLOR_EK, marginRight: AVSTAND.xs, verticalAlign: 'middle' }} />
                EK {ekConfig}
              </th>
              <th style={{ padding: `${AVSTAND.m}px ${AVSTAND.m}px`, textAlign: 'right', ...tabellRubrik }}>
                <span style={{ display: 'inline-block', width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.stapel, background: COLOR_WI, marginRight: AVSTAND.xs, verticalAlign: 'middle' }} />
                Wisent
              </th>
              <th style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, textAlign: 'right', ...tabellRubrik }}>
                Skillnad
              </th>
            </tr>
          </thead>
          <tbody>
            {DIST_LABELS.map((label, i) => {
              const ekV = computeMetric(ekData[i], metric);
              const wiV = computeMetric(wi[i], metric);
              const diff = skillnadPct(ekV, wiV);
              const goodDiff = diff !== null && (currentMetric.higherIsBetter ? diff >= 0 : diff <= 0);

              return (
                <tr key={label} style={{ borderBottom: `1px solid ${FARG.linje}` }}>
                  <td style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, color: FARG.text2, fontWeight: VIKT.halvfet }}>
                    {label}
                    <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.xs }}>
                      {(ekData[i].skift + wi[i].skift)} skift
                    </div>
                  </td>
                  <td style={{ padding: `${AVSTAND.m}px ${AVSTAND.m}px`, textAlign: 'right', ...TNUM }}>
                    {ekV !== null && ekV > 0 ? (
                      <>
                        <span style={{ color: FARG.text, fontWeight: VIKT.halvfet }}>{fmtSv(ekV, 1)}</span>
                        <span style={{ ...TYP.meta, color: FARG.text3, marginLeft: AVSTAND.xs }}>{currentMetric.unit}</span>
                      </>
                    ) : <span style={{ color: FARG.text3 }}>–</span>}
                  </td>
                  <td style={{ padding: `${AVSTAND.m}px ${AVSTAND.m}px`, textAlign: 'right', ...TNUM }}>
                    {wiV !== null && wiV > 0 ? (
                      <>
                        <span style={{ color: FARG.text, fontWeight: VIKT.halvfet }}>{fmtSv(wiV, 1)}</span>
                        <span style={{ ...TYP.meta, color: FARG.text3, marginLeft: AVSTAND.xs }}>{currentMetric.unit}</span>
                      </>
                    ) : <span style={{ color: FARG.text3 }}>–</span>}
                  </td>
                  <td style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, textAlign: 'right' }}>
                    {diff !== null && ekV !== null && ekV > 0 && wiV !== null && wiV > 0 ? (
                      <span style={{
                        display: 'inline-block',
                        padding: `${AVSTAND.xs}px ${AVSTAND.s}px`, borderRadius: RADIE.stapel,
                        ...TYP.meta, fontWeight: VIKT.fet, ...TNUM,
                        background: goodDiff ? tint(FARG.gron, 8) : tint(FARG.rod, 8),
                        color: goodDiff ? FARG.gron : FARG.rod,
                      }}>
                        {fmtSvDelta(diff)}
                      </span>
                    ) : <span style={{ color: FARG.text3 }}>–</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
