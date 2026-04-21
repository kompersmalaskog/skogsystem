'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import EkonomiBottomNav from './EkonomiBottomNav';

type PeriodType = 'D' | 'V' | 'M' | 'K' | 'A';

type AcordPris = { medelstam: number; pris_total: number; pris_skordare: number; pris_skotare: number; giltig_fran: string | null; giltig_till: string | null };
type MaskinTimpris = { maskin_id: string; maskin_namn: string | null; timpris: number; giltig_fran: string | null; giltig_till: string | null };
type AvstandConfig = { grundavstand_m: number; kr_per_100m: number; giltig_fran: string | null; giltig_till: string | null };
type RowOverride = {
  id?: string;
  datum: string; maskin_id: string; objekt_id: string;
  volym: number | null;
  medelstam: number | null;
  pris_enhet: number | null;
  tillagg_kr: number | null;
  kommentar: string | null;
};
type ObjektMeta = { objekt_id: string; object_name: string | null; vo_nummer: string | null; huvudtyp: string | null; atgard: string | null; timpeng: boolean | null };
type MaskinMeta = { maskin_id: string; modell: string | null; maskin_typ: string | null };

type MaskinTypPart = 'Harvester' | 'Forwarder';
type RowTyp = 'Slutavverkning' | 'Gallring' | 'Okänt';

type DagRad = {
  datum: string;
  maskin_id: string;
  maskin_namn: string;
  maskin_typ: MaskinTypPart;
  objekt_id: string;
  objekt_namn: string;
  typ: RowTyp;
  // Effektiva värden (auto eller override)
  volym: number;
  medelstam: number;
  pris_enhet: number;        // kr/m³
  tillagg_kr: number;        // skotningsavstånd m.fl.
  intakt: number;            // beräknat från effektiva värden
  timmar: number;
  timpris: number;
  timpeng_belopp: number;
  diff: number;
  // Auto-värden (utan override) — för bottom sheetets jämförelse / återställ
  auto_volym: number;
  auto_medelstam: number;
  auto_pris_enhet: number;
  auto_tillagg_kr: number;
  // Override-status
  overridden: boolean;
  override: RowOverride | null;
};

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function getPeriodDates(p: PeriodType, offset: number) {
  const now = new Date();
  if (p === 'D') {
    const d = new Date(now); d.setDate(now.getDate() + offset);
    const s = fmtDate(d);
    return { start: s, end: s };
  }
  if (p === 'V') {
    const day = now.getDay() || 7;
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1 + offset * 7);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: fmtDate(mon), end: fmtDate(sun) };
  }
  if (p === 'K') {
    const cq = Math.floor(now.getMonth() / 3);
    const tq = now.getFullYear() * 4 + cq + offset;
    const y = Math.floor(tq / 4);
    const qi = ((tq % 4) + 4) % 4;
    const qs = new Date(y, qi * 3, 1);
    const qe = new Date(y, qi * 3 + 3, 0);
    return { start: fmtDate(qs), end: fmtDate(qe) };
  }
  if (p === 'A') {
    const y = now.getFullYear() + offset;
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  const ms = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const me = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: fmtDate(ms), end: fmtDate(me) };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

function getPeriodLabel(p: PeriodType, offset: number) {
  const { start } = getPeriodDates(p, offset);
  const d = new Date(start);
  if (p === 'D') return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  if (p === 'V') {
    const oj = new Date(d.getFullYear(), 0, 1);
    const wn = Math.ceil(((d.getTime() - oj.getTime()) / 86400000 + oj.getDay() + 1) / 7);
    return `V${wn} ${d.getFullYear()}`;
  }
  if (p === 'M') return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  if (p === 'K') return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  return `${d.getFullYear()}`;
}

async function fetchAllRows(queryFn: (from: number, to: number) => Promise<{ data: any[] | null }>): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await queryFn(offset, offset + PAGE - 1);
    const batch = data || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

function lookupAcordPris(medelstam: number, acord: AcordPris[]): AcordPris | null {
  if (!acord.length) return null;
  let best = acord[0];
  let bestDiff = Math.abs(acord[0].medelstam - medelstam);
  for (const p of acord) {
    const d = Math.abs(p.medelstam - medelstam);
    if (d < bestDiff) { bestDiff = d; best = p; }
  }
  return best;
}

function isValidOn(d: string, giltig_fran: string | null, giltig_till: string | null) {
  if (giltig_fran && d < giltig_fran) return false;
  if (giltig_till && d > giltig_till) return false;
  return true;
}

function formatKr(n: number) {
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}

type SheetNum = number | '';
type SheetState = {
  volym: SheetNum; medelstam: SheetNum; pris_enhet: SheetNum; tillagg_kr: SheetNum; kommentar: string;
};

export default function EkonomiClient() {
  const [period, setPeriod] = useState<PeriodType>('M');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rader, setRader] = useState<DagRad[]>([]);
  const [sheetRow, setSheetRow] = useState<DagRad | null>(null);
  const [sheetVals, setSheetVals] = useState<SheetState>({ volym: '', medelstam: '', pris_enhet: '', tillagg_kr: '', kommentar: '' });
  const [savingOverride, setSavingOverride] = useState(false);
  const [toast, setToast] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);

      const [prodRows, lassRows, tidRows, objRes, maskinRes, acordRes, timprisRes, avstandRes, overrideRes] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase.from('fakt_produktion')
            .select('datum, maskin_id, objekt_id, stammar, volym_m3sub')
            .gte('datum', start).lte('datum', end)
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase.from('fakt_lass')
            .select('datum, maskin_id, objekt_id, volym_m3sub, korstracka_m')
            .gte('datum', start).lte('datum', end)
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase.from('fakt_tid')
            .select('datum, maskin_id, engine_time_sek, processing_sek')
            .gte('datum', start).lte('datum', end)
            .range(from, to)
        ),
        supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer, huvudtyp, atgard, timpeng'),
        supabase.from('dim_maskin').select('maskin_id, modell, maskin_typ'),
        supabase.from('acord_priser').select('medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till'),
        supabase.from('maskin_timpris').select('maskin_id, maskin_namn, timpris, giltig_fran, giltig_till'),
        supabase.from('acord_skotningsavstand')
          .select('grundavstand_m, kr_per_100m, giltig_fran, giltig_till')
          .not('grundavstand_m', 'is', null),
        supabase.from('ekonomi_rad_override')
          .select('id, datum, maskin_id, objekt_id, volym, medelstam, pris_enhet, tillagg_kr, kommentar')
          .gte('datum', start).lte('datum', end),
      ]);

      const overrideMap: Record<string, RowOverride> = {};
      for (const o of (overrideRes.data || [])) {
        overrideMap[`${o.datum}|${o.maskin_id}|${o.objekt_id}`] = o;
      }

      const objMap: Record<string, ObjektMeta> = {};
      for (const o of (objRes.data || [])) objMap[o.objekt_id] = o;

      const maskinMap: Record<string, MaskinMeta> = {};
      for (const m of (maskinRes.data || [])) maskinMap[m.maskin_id] = m;

      const timprisList: MaskinTimpris[] = timprisRes.data || [];
      const acord: AcordPris[] = acordRes.data || [];
      const avstandList: AvstandConfig[] = (avstandRes.data || []).filter((a: any) => a.grundavstand_m != null && a.kr_per_100m != null);

      // Harvester production per (datum, maskin, objekt)
      type ProdAgg = { datum: string; maskin_id: string; objekt_id: string; volym: number; stammar: number };
      const prodMap: Record<string, ProdAgg> = {};
      for (const r of prodRows) {
        const key = `${r.datum}|${r.maskin_id}|${r.objekt_id}`;
        if (!prodMap[key]) prodMap[key] = { datum: r.datum, maskin_id: r.maskin_id, objekt_id: r.objekt_id, volym: 0, stammar: 0 };
        prodMap[key].volym += r.volym_m3sub || 0;
        prodMap[key].stammar += r.stammar || 0;
      }

      // Forwarder lass per (datum, maskin, objekt) — volume + skotningsavstånd-tillägg
      type LassAgg = { datum: string; maskin_id: string; objekt_id: string; volym: number; tillagg_skotningsavstand_kr: number };
      const lassMap: Record<string, LassAgg> = {};
      for (const r of lassRows) {
        const key = `${r.datum}|${r.maskin_id}|${r.objekt_id}`;
        if (!lassMap[key]) lassMap[key] = { datum: r.datum, maskin_id: r.maskin_id, objekt_id: r.objekt_id, volym: 0, tillagg_skotningsavstand_kr: 0 };
        const vol = r.volym_m3sub || 0;
        lassMap[key].volym += vol;
        // Skotningsavstånd: ceil(max(0, (dist - grund)/100)) × kr_per_100m × volym
        const cfg = avstandList.find(c => isValidOn(r.datum, c.giltig_fran, c.giltig_till));
        if (cfg) {
          const dist = r.korstracka_m || 0;
          const step = Math.max(0, Math.ceil((dist - cfg.grundavstand_m) / 100));
          lassMap[key].tillagg_skotningsavstand_kr += step * cfg.kr_per_100m * vol;
        }
      }

      // Day totals per machine for hour allocation
      const harvDayTot: Record<string, number> = {};
      for (const p of Object.values(prodMap)) {
        const k = `${p.datum}|${p.maskin_id}`;
        harvDayTot[k] = (harvDayTot[k] || 0) + p.volym;
      }
      const lassDayTot: Record<string, number> = {};
      for (const l of Object.values(lassMap)) {
        const k = `${l.datum}|${l.maskin_id}`;
        lassDayTot[k] = (lassDayTot[k] || 0) + l.volym;
      }

      // Object medelstam from harvester data (whole period) — used for forwarder lookup
      const objMedelstam: Record<string, number> = {};
      {
        const agg: Record<string, { vol: number; st: number }> = {};
        for (const p of Object.values(prodMap)) {
          if (!agg[p.objekt_id]) agg[p.objekt_id] = { vol: 0, st: 0 };
          agg[p.objekt_id].vol += p.volym;
          agg[p.objekt_id].st += p.stammar;
        }
        for (const [oid, v] of Object.entries(agg)) {
          if (v.st > 0) objMedelstam[oid] = v.vol / v.st;
        }
      }

      // Tid per (datum, maskin)
      const tidMap: Record<string, { timmar: number }> = {};
      for (const r of tidRows) {
        const k = `${r.datum}|${r.maskin_id}`;
        if (!tidMap[k]) tidMap[k] = { timmar: 0 };
        tidMap[k].timmar += (r.engine_time_sek || r.processing_sek || 0) / 3600;
      }

      const classifyObj = (oid: string): RowTyp => {
        const obj = objMap[oid];
        const ht = (obj?.huvudtyp || '').toLowerCase();
        const an = (obj?.object_name || '').toLowerCase();
        if (ht === 'gallring' || an.includes('gallring')) return 'Gallring';
        if (ht === 'slutavverkning' || an.includes('slutavverkning')) return 'Slutavverkning';
        return 'Okänt';
      };

      const buildRow = (
        datum: string,
        maskin_id: string,
        objekt_id: string,
        autoVolym: number,
        autoMedelstam: number,
        maskin_typ: MaskinTypPart,
        dayMaskinVolTot: number,
        autoTillaggKr: number = 0,
      ): DagRad => {
        const obj = objMap[objekt_id];
        const maskin = maskinMap[maskin_id];
        const timpris = timprisList.find(t =>
          t.maskin_id === maskin_id && isValidOn(datum, t.giltig_fran, t.giltig_till)
        );
        const timprisKr = timpris?.timpris || 0;

        const typ = classifyObj(objekt_id);
        const isSlut = typ === 'Slutavverkning';

        // Auto grundpris (per medelstam + maskintyp)
        const acordOnDate = acord.filter(a => isValidOn(datum, a.giltig_fran, a.giltig_till));
        const acordPris = isSlut ? lookupAcordPris(autoMedelstam, acordOnDate) : null;
        const autoPrisEnhet = isSlut
          ? (maskin_typ === 'Harvester' ? (acordPris?.pris_skordare || 0) : (acordPris?.pris_skotare || 0))
          : 0;

        // Override: kan ersätta valfritt av {volym, medelstam, pris_enhet, tillagg_kr}
        const ov = overrideMap[`${datum}|${maskin_id}|${objekt_id}`] || null;
        const volym = ov?.volym ?? autoVolym;
        const medelstam = ov?.medelstam ?? autoMedelstam;
        const pris_enhet = ov?.pris_enhet ?? autoPrisEnhet;
        const tillagg_kr = ov?.tillagg_kr ?? autoTillaggKr;

        // Timmar fördelas per maskin/dag proportionellt mot AUTO-volym (annars skulle override ändra timpeng för andra rader på samma dag)
        const andel = dayMaskinVolTot > 0 ? autoVolym / dayMaskinVolTot : 0;
        const timmar = (tidMap[`${datum}|${maskin_id}`]?.timmar || 0) * andel;
        const timpeng_belopp = timmar * timprisKr;

        const intakt = isSlut ? (volym * pris_enhet + tillagg_kr) : timpeng_belopp;
        const diff = isSlut ? intakt - timpeng_belopp : 0;

        const overridden = !!ov && (ov.volym != null || ov.medelstam != null || ov.pris_enhet != null || ov.tillagg_kr != null);

        return {
          datum,
          maskin_id,
          maskin_namn: timpris?.maskin_namn || maskin?.modell || maskin_id,
          maskin_typ,
          objekt_id,
          objekt_namn: obj?.object_name || obj?.vo_nummer || objekt_id || '—',
          typ,
          volym,
          medelstam: parseFloat(medelstam.toFixed(3)),
          pris_enhet,
          tillagg_kr,
          intakt,
          timmar: parseFloat(timmar.toFixed(2)),
          timpris: timprisKr,
          timpeng_belopp,
          diff,
          auto_volym: autoVolym,
          auto_medelstam: parseFloat(autoMedelstam.toFixed(3)),
          auto_pris_enhet: autoPrisEnhet,
          auto_tillagg_kr: autoTillaggKr,
          overridden,
          override: ov,
        };
      };

      const harvRader: DagRad[] = Object.values(prodMap)
        .filter(p => p.volym > 0 && p.stammar > 0)
        .map(p => {
          const medelstam = p.volym / p.stammar;
          const dayTot = harvDayTot[`${p.datum}|${p.maskin_id}`] || 0;
          return buildRow(p.datum, p.maskin_id, p.objekt_id, p.volym, medelstam, 'Harvester', dayTot);
        });

      const fwdRader: DagRad[] = Object.values(lassMap)
        .filter(l => l.volym > 0)
        .map(l => {
          const medelstam = objMedelstam[l.objekt_id] || 0.35; // fallback om ingen skördardata finns
          const dayTot = lassDayTot[`${l.datum}|${l.maskin_id}`] || 0;
          return buildRow(l.datum, l.maskin_id, l.objekt_id, l.volym, medelstam, 'Forwarder', dayTot, l.tillagg_skotningsavstand_kr);
        });

      const allRader: DagRad[] = [...harvRader, ...fwdRader].sort((a, b) => {
        if (a.datum !== b.datum) return a.datum.localeCompare(b.datum);
        if (a.maskin_typ !== b.maskin_typ) return a.maskin_typ === 'Harvester' ? -1 : 1;
        return a.maskin_namn.localeCompare(b.maskin_namn);
      });

      setRader(allRader);
    } catch (err) {
      console.error('Ekonomi: fetch error', err);
    }
    setLoading(false);
  }, [period, periodOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const flashToast = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2200); };

  const openSheet = (r: DagRad) => {
    setSheetRow(r);
    setSheetVals({
      volym: r.override?.volym ?? r.auto_volym,
      medelstam: r.override?.medelstam ?? r.auto_medelstam,
      pris_enhet: r.override?.pris_enhet ?? r.auto_pris_enhet,
      tillagg_kr: r.override?.tillagg_kr ?? r.auto_tillagg_kr,
      kommentar: r.override?.kommentar || '',
    });
  };
  const closeSheet = () => { setSheetRow(null); };

  const saveOverride = async () => {
    if (!sheetRow) return;
    setSavingOverride(true);
    const toNumOrAutoDiff = (v: SheetNum, auto: number): number | null =>
      v === '' ? null : (Number(v) === auto ? null : Number(v));
    const payload: any = {
      datum: sheetRow.datum,
      maskin_id: sheetRow.maskin_id,
      objekt_id: sheetRow.objekt_id,
      volym: toNumOrAutoDiff(sheetVals.volym, sheetRow.auto_volym),
      medelstam: toNumOrAutoDiff(sheetVals.medelstam, sheetRow.auto_medelstam),
      pris_enhet: toNumOrAutoDiff(sheetVals.pris_enhet, sheetRow.auto_pris_enhet),
      tillagg_kr: toNumOrAutoDiff(sheetVals.tillagg_kr, sheetRow.auto_tillagg_kr),
      kommentar: sheetVals.kommentar.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const allNull = payload.volym == null && payload.medelstam == null && payload.pris_enhet == null && payload.tillagg_kr == null && payload.kommentar == null;
    if (allNull) {
      // Inget avviker från auto — ta bort ev. befintlig override
      await supabase.from('ekonomi_rad_override')
        .delete()
        .eq('datum', sheetRow.datum)
        .eq('maskin_id', sheetRow.maskin_id)
        .eq('objekt_id', sheetRow.objekt_id);
      setSavingOverride(false);
      closeSheet();
      flashToast('Inga ändringar — override borttagen');
      await fetchData();
      return;
    }
    const { error } = await supabase.from('ekonomi_rad_override')
      .upsert(payload, { onConflict: 'datum,maskin_id,objekt_id' });
    setSavingOverride(false);
    if (error) { flashToast(`Fel: ${error.message}`); return; }
    closeSheet();
    flashToast('Override sparad');
    await fetchData();
  };

  const resetOverride = async () => {
    if (!sheetRow) return;
    setSavingOverride(true);
    const { error } = await supabase.from('ekonomi_rad_override')
      .delete()
      .eq('datum', sheetRow.datum)
      .eq('maskin_id', sheetRow.maskin_id)
      .eq('objekt_id', sheetRow.objekt_id);
    setSavingOverride(false);
    if (error) { flashToast(`Fel: ${error.message}`); return; }
    closeSheet();
    flashToast('Återställd till auto');
    await fetchData();
  };

  // Live-räknat intakt i sheetet
  const sheetIntakt = sheetRow && sheetRow.typ === 'Slutavverkning'
    ? (Number(sheetVals.volym || 0) * Number(sheetVals.pris_enhet || 0) + Number(sheetVals.tillagg_kr || 0))
    : (sheetRow?.timpeng_belopp || 0);

  const sumIntakt = rader.reduce((s, r) => s + r.intakt, 0);
  const sumTimpeng = rader.reduce((s, r) => s + r.timpeng_belopp, 0);
  // Kostnad: lönekostnad ej implementerat ännu — använd timpeng som proxy
  const sumKostnad = sumTimpeng;
  const sumVinst = sumIntakt - sumKostnad;
  // Vs-timpeng-jämförelsen gäller bara slutavverkningsrader (acord vs timpeng)
  const slutRader = rader.filter(r => r.typ === 'Slutavverkning');
  const sumIntaktSlut = slutRader.reduce((s, r) => s + r.intakt, 0);
  const sumTimpengSlut = slutRader.reduce((s, r) => s + r.timpeng_belopp, 0);
  const diffVsTimpeng = sumIntaktSlut - sumTimpengSlut;

  // Build per-day aggregation for chart
  const perDag = useMemo(() => {
    const m: Record<string, { datum: string; intakt: number; timpeng: number }> = {};
    for (const r of rader) {
      if (!m[r.datum]) m[r.datum] = { datum: r.datum, intakt: 0, timpeng: 0 };
      m[r.datum].intakt += r.intakt;
      m[r.datum].timpeng += r.timpeng_belopp;
    }
    return Object.values(m).sort((a, b) => a.datum.localeCompare(b.datum));
  }, [rader]);

  // Styles — matches affarsuppfoljning / app-wide convention
  const s = {
    page: { background: '#111110', minHeight: '100vh', paddingTop: 24, paddingBottom: 120, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
    filterBar: { display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: 8 } as const,
    periodBtn: { border: 'none', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '5px 12px', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#7a7a72', cursor: 'pointer' } as const,
    periodBtnActive: { background: 'rgba(90,255,140,0.15)', color: 'rgba(90,255,140,0.9)' } as const,
    arrow: { border: 'none', background: 'none', color: '#7a7a72', fontSize: 16, cursor: 'pointer', padding: '4px 8px' } as const,
    label: { fontSize: 12, fontWeight: 600, color: '#e8e8e4', minWidth: 120, textAlign: 'center' as const },
    card: { background: '#1a1a18', borderRadius: 14, padding: 16 } as const,
    kpiVal: { fontFamily: "'Fraunces', serif", fontSize: 26, lineHeight: 1, fontWeight: 500 },
    kpiLabel: { fontSize: 10, color: '#7a7a72', marginTop: 3, textTransform: 'uppercase' as const, letterSpacing: 0.6, fontWeight: 600 },
    sectionTitle: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginBottom: 10, marginTop: 20, padding: '0 4px' } as const,
    th: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.6, color: '#7a7a72', textAlign: 'left' as const, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
    td: { fontSize: 12, color: '#e8e8e4', padding: '10px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap' as const },
  };

  return (
    <div style={s.page}>
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Ekonomi</div>
        <div style={{ fontSize: 12, color: '#7a7a72', marginTop: 2 }}>Intäkt · kostnad · vinst. Acord vs timpeng.</div>
      </div>

      {/* Period picker */}
      <div style={{ ...s.filterBar, marginTop: 16 }}>
        {(['D', 'V', 'M', 'K', 'A'] as PeriodType[]).map(p => (
          <button key={p} style={{ ...s.periodBtn, ...(period === p ? s.periodBtnActive : {}) }}
            onClick={() => { setPeriod(p); setPeriodOffset(0); }}>
            {p === 'D' ? 'Dag' : p === 'V' ? 'Vecka' : p === 'M' ? 'Månad' : p === 'K' ? 'Kvartal' : 'År'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={s.arrow} onClick={() => setPeriodOffset(o => o - 1)}>&#8249;</button>
        <span style={s.label}>{getPeriodLabel(period, periodOffset)}</span>
        <button style={s.arrow} onClick={() => setPeriodOffset(o => o + 1)}>&#8250;</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72' }}>Laddar...</div>}

      {!loading && (
        <div style={{ padding: '0 16px' }}>
          {/* Summary card */}
          <div style={{ ...s.card, margin: '16px 0' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...s.kpiVal, color: 'rgba(90,255,140,0.95)' }}>{formatKr(sumIntakt)}</div>
                <div style={s.kpiLabel}>Intäkt</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...s.kpiVal, color: 'rgba(255,179,64,0.95)' }}>{formatKr(sumKostnad)}</div>
                <div style={s.kpiLabel}>Kostnad</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...s.kpiVal, color: sumVinst >= 0 ? '#e8e8e4' : 'rgba(255,90,90,0.9)' }}>{formatKr(sumVinst)}</div>
                <div style={s.kpiLabel}>Vinst</div>
              </div>
            </div>
            <div style={{
              marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)',
              fontSize: 12, color: '#bfcab9', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ color: '#7a7a72', fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase' }}>Vs timpeng</span>
              <span style={{ fontWeight: 600, color: diffVsTimpeng >= 0 ? 'rgba(90,255,140,0.95)' : 'rgba(255,90,90,0.9)' }}>
                {diffVsTimpeng >= 0 ? '+' : ''}{formatKr(diffVsTimpeng)}
                <span style={{ color: '#7a7a72', fontWeight: 400, marginLeft: 6 }}>
                  ({diffVsTimpeng >= 0 ? 'acord lönar sig' : 'timpeng lönar sig'})
                </span>
              </span>
            </div>
          </div>

          {/* Chart */}
          {perDag.length > 0 && (
            <>
              <div style={s.sectionTitle}>Intäkt vs timpeng per dag</div>
              <div style={{ ...s.card, padding: 14 }}>
                <LineChart perDag={perDag} />
                <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: '#bfcab9' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 2, background: 'rgba(90,255,140,0.8)' }} /> Intäkt
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 2, background: 'rgba(255,179,64,0.8)' }} /> Timpeng
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Daily table */}
          <div style={s.sectionTitle}>Per dag · maskin · objekt</div>
          <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}>
                <thead>
                  <tr>
                    <th style={s.th}>Datum</th>
                    <th style={s.th}>Maskin</th>
                    <th style={s.th}>Objekt</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>m³</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Intäkt</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Timpeng</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {rader.map((r, i) => {
                    const d = new Date(r.datum);
                    const datumLabel = `${d.getDate()} ${MONTH_NAMES[d.getMonth()].toLowerCase()}`;
                    const isSlut = r.typ === 'Slutavverkning';
                    const diffColor = r.diff >= 0 ? 'rgba(90,255,140,0.9)' : 'rgba(255,90,90,0.9)';
                    const isHarv = r.maskin_typ === 'Harvester';
                    const badgeColor = isHarv ? 'rgba(90,255,140,0.85)' : 'rgba(91,143,255,0.9)';
                    const badgeBg = isHarv ? 'rgba(90,255,140,0.08)' : 'rgba(91,143,255,0.1)';
                    return (
                      <tr key={i} onClick={() => openSheet(r)} style={{ cursor: 'pointer' }}>
                        <td style={s.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {r.overridden && (
                              <span
                                aria-label="Manuellt ändrad"
                                title={r.override?.kommentar || 'Manuellt ändrad'}
                                style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(91,143,255,0.95)', flexShrink: 0 }}
                              />
                            )}
                            <span>{datumLabel}</span>
                          </div>
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                              padding: '2px 6px', borderRadius: 4, color: badgeColor, background: badgeBg,
                            }}>
                              {isHarv ? 'SKÖRD' : 'SKOT'}
                            </span>
                            <span>{r.maskin_namn}</span>
                          </div>
                        </td>
                        <td style={s.td}>
                          <div>{r.objekt_namn}</div>
                          {r.typ === 'Gallring' && (
                            <div style={{ fontSize: 9, color: 'rgba(255,179,64,0.7)', marginTop: 2, letterSpacing: 0.3 }}>GALLRING</div>
                          )}
                        </td>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(r.volym).toLocaleString('sv-SE')}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatKr(r.intakt)}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#7a7a72' }}>{formatKr(r.timpeng_belopp)}</td>
                        {isSlut ? (
                          <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: diffColor, fontWeight: 600 }}>
                            {r.diff >= 0 ? '+' : ''}{formatKr(r.diff)}
                          </td>
                        ) : (
                          <td style={{ ...s.td, textAlign: 'right', color: '#7a7a72', fontStyle: 'italic', fontWeight: 500 }}>
                            Timpeng
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {rader.length === 0 && (
                    <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#7a7a72', padding: '32px 10px' }}>Ingen data för vald period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 12, padding: '0 4px', lineHeight: 1.5 }}>
            Slutavverkning: skördare använder <code style={{ fontFamily: 'inherit', color: '#bfcab9' }}>pris_skordare</code>,
            skotare använder <code style={{ fontFamily: 'inherit', color: '#bfcab9' }}>pris_skotare</code> — uppslag per närmaste medelstam.
            Skotningsavstånds-tillägg beräknas automatiskt per lass: <em>ceil((korstracka − grundavstånd)/100) × kr/100m × volym</em>.
            Gallring räknas alltid som timpeng (ingen acord). Skotarens medelstam ärvs från objektets skördardata.
            Timmar fördelas per maskin &amp; dag proportionellt mot volym per objekt. Lönekostnad ej implementerad — kostnadssiffran använder timpeng som proxy.
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 108, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(20,20,20,0.95)', color: '#e8e8e4',
          padding: '10px 16px', borderRadius: 10, fontSize: 12,
          border: '1px solid rgba(91,143,255,0.3)', zIndex: 100,
          fontFamily: "'Geist', system-ui, sans-serif",
        }}>{toast}</div>
      )}

      {/* Bottom sheet — manuell override */}
      {sheetRow && (
        <OverrideSheet
          row={sheetRow}
          vals={sheetVals}
          setVals={setSheetVals}
          sheetIntakt={sheetIntakt}
          saving={savingOverride}
          onClose={closeSheet}
          onSave={saveOverride}
          onReset={resetOverride}
        />
      )}

      <EkonomiBottomNav />
    </div>
  );
}

function OverrideSheet({
  row, vals, setVals, sheetIntakt, saving, onClose, onSave, onReset,
}: {
  row: DagRad;
  vals: SheetState;
  setVals: (s: SheetState) => void;
  sheetIntakt: number;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const d = new Date(row.datum);
  const datumLabel = `${d.getDate()} ${MONTH_NAMES[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
  const isSlut = row.typ === 'Slutavverkning';
  const formatKrLocal = (n: number) => `${Math.round(n).toLocaleString('sv-SE')} kr`;

  const field = (label: string, value: number | '', setter: (v: number | '') => void, hint: string, step = '1') => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: '#7a7a72', fontWeight: 600, letterSpacing: 0.3 }}>{label}</div>
        <div style={{ fontSize: 10, color: '#7a7a72' }}>auto: {hint}</div>
      </div>
      <input
        type="number" step={step} inputMode={step === '1' ? 'numeric' : 'decimal'}
        value={value}
        onChange={e => setter(e.target.value === '' ? '' : Number(e.target.value))}
        style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '10px 12px', color: '#e8e8e4', fontSize: 14,
          fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
          fontVariantNumeric: 'tabular-nums',
        }}
      />
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      }} />
      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: '#1a1a18', borderRadius: '20px 20px 0 0',
        padding: '12px 20px 28px', maxHeight: '85vh', overflowY: 'auto',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
        fontFamily: "'Geist', system-ui, sans-serif", color: '#e8e8e4',
      }}>
        {/* Grip */}
        <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '4px auto 16px' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>Manuell override</div>
            <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>
              {datumLabel} · {row.maskin_namn} · {row.objekt_namn}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.05)', border: 'none',
            width: 32, height: 32, borderRadius: 16, color: '#e8e8e4',
            fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 0,
          }}>×</button>
        </div>

        {row.overridden && (
          <div style={{
            margin: '0 0 14px', padding: '8px 12px',
            background: 'rgba(91,143,255,0.08)', border: '1px solid rgba(91,143,255,0.25)',
            borderRadius: 10, fontSize: 11, color: 'rgba(173,198,255,0.95)', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(91,143,255,0.95)' }} />
            Den här raden är manuellt ändrad.
          </div>
        )}

        {/* Fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('Volym (m³)', vals.volym, v => setVals({ ...vals, volym: v }), String(Math.round(row.auto_volym)))}
          {field('Medelstam', vals.medelstam, v => setVals({ ...vals, medelstam: v }), row.auto_medelstam.toFixed(3), '0.001')}
          {isSlut && field('Grundpris (kr/m³)', vals.pris_enhet, v => setVals({ ...vals, pris_enhet: v }), row.auto_pris_enhet.toFixed(2), '0.01')}
          {isSlut && field('Tillägg (kr)', vals.tillagg_kr, v => setVals({ ...vals, tillagg_kr: v }), Math.round(row.auto_tillagg_kr).toString(), '0.01')}
        </div>

        {/* Kommentar */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: '#7a7a72', fontWeight: 600, letterSpacing: 0.3, marginBottom: 4 }}>Kommentar (varför ändrades)</div>
          <textarea
            value={vals.kommentar}
            onChange={e => setVals({ ...vals, kommentar: e.target.value })}
            rows={3}
            placeholder="Valfritt — t.ex. 'Korrigering efter fältbesök 18 april'"
            style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '10px 12px', color: '#e8e8e4', fontSize: 13,
              fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical',
            }}
          />
        </div>

        {/* Live intakt */}
        <div style={{
          marginTop: 18, padding: '12px 14px',
          background: 'rgba(90,255,140,0.06)', border: '1px solid rgba(90,255,140,0.2)',
          borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 10, color: '#7a7a72', fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              {isSlut ? 'Total intäkt' : 'Intäkt (timpeng)'}
            </div>
            <div style={{ fontSize: 20, fontFamily: "'Fraunces', serif", color: 'rgba(90,255,140,0.95)', lineHeight: 1.1, marginTop: 2 }}>
              {formatKrLocal(sheetIntakt)}
            </div>
          </div>
          {isSlut && (
            <div style={{ fontSize: 10, color: '#7a7a72', textAlign: 'right', lineHeight: 1.5 }}>
              {Number(vals.volym || 0)} m³ × {Number(vals.pris_enhet || 0).toFixed(2)} kr<br />
              + {Math.round(Number(vals.tillagg_kr || 0))} kr tillägg
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            onClick={onReset}
            disabled={saving || !row.overridden}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.03)', color: row.overridden ? '#bfcab9' : '#4a4a44',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
              padding: '10px 14px', fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit', cursor: row.overridden && !saving ? 'pointer' : 'not-allowed',
              opacity: saving ? 0.6 : 1,
            }}>
            Återställ till auto
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              flex: 1, background: '#000', color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
              padding: '10px 14px', fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}>
            {saving ? 'Sparar...' : 'Spara'}
          </button>
        </div>
      </div>
    </>
  );
}

function LineChart({ perDag }: { perDag: { datum: string; intakt: number; timpeng: number }[] }) {
  const W = 640, H = 180, P = { t: 12, r: 12, b: 24, l: 48 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;

  const maxY = Math.max(1, ...perDag.map(d => Math.max(d.intakt, d.timpeng)));
  const yTick = (maxY / 3);

  const xOf = (i: number) => P.l + (perDag.length <= 1 ? iw / 2 : (i / (perDag.length - 1)) * iw);
  const yOf = (v: number) => P.t + ih - (v / maxY) * ih;

  const path = (key: 'intakt' | 'timpeng') =>
    perDag.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(d[key]).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      {/* Y gridlines */}
      {[0, 1, 2, 3].map(t => {
        const v = t * yTick;
        const y = yOf(v);
        return (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />
            <text x={P.l - 8} y={y + 3} fill="#7a7a72" fontSize="9" textAnchor="end" fontFamily="inherit">
              {Math.round(v / 1000)}k
            </text>
          </g>
        );
      })}
      {/* X labels — first, middle, last */}
      {perDag.length > 0 && [0, Math.floor(perDag.length / 2), perDag.length - 1].filter((v, i, arr) => arr.indexOf(v) === i).map(i => {
        const d = new Date(perDag[i].datum);
        return (
          <text key={i} x={xOf(i)} y={H - 6} fill="#7a7a72" fontSize="9" textAnchor="middle" fontFamily="inherit">
            {d.getDate()} {MONTH_NAMES[d.getMonth()].toLowerCase()}
          </text>
        );
      })}
      {/* Paths */}
      <path d={path('timpeng')} stroke="rgba(255,179,64,0.8)" strokeWidth="1.5" fill="none" />
      <path d={path('intakt')} stroke="rgba(90,255,140,0.9)" strokeWidth="1.5" fill="none" />
      {/* Points */}
      {perDag.map((d, i) => (
        <g key={i}>
          <circle cx={xOf(i)} cy={yOf(d.timpeng)} r="2" fill="rgba(255,179,64,0.9)" />
          <circle cx={xOf(i)} cy={yOf(d.intakt)} r="2" fill="rgba(90,255,140,0.95)" />
        </g>
      ))}
    </svg>
  );
}
