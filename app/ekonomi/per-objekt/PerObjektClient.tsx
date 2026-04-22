'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import EkonomiBottomNav from '../EkonomiBottomNav';

type PeriodType = 'D' | 'V' | 'M' | 'K' | 'A';

type MaskinTimpris = { maskin_id: string; maskin_namn: string | null; timpris: number; giltig_fran: string | null; giltig_till: string | null };
type AcordPris = { medelstam: number; pris_total: number; pris_skordare: number; pris_skotare: number; giltig_fran: string | null; giltig_till: string | null };
type AvstandConfig = { grundavstand_m: number; kr_per_100m: number; giltig_fran: string | null; giltig_till: string | null };
type TraktBracket = { fran_m3fub: number; till_m3fub: number | null; tillagg_kr_per_m3fub: number };
type SortConfig = { grundantal: number; kr_per_extra_sortiment: number };

type MaskinDel = {
  maskin_id: string;
  maskin_namn: string;
  maskin_typ: 'Harvester' | 'Forwarder' | null;
  volym: number;
  medelstam: number;
  grundpris: number;
  timmar: number;
  timpeng: number;
  acord: number;
  skillnad: number;
};
type ObjektRad = {
  objekt_id: string;
  objekt_namn: string;
  vo_nummer: string | null;
  huvudtyp: string | null;
  ar_gallring: boolean;
  ar_timpeng_override: boolean;  // admin har flaggat slutavverkning som timpeng
  behandla_som_timpeng: boolean; // härlett: gallring eller override
  volym_m3fub: number;
  sortiment_grupper: string[];
  sortiment_count: number;
  sortiment_kr_per_m3: number;
  trakt_kr_per_m3: number;
  trakt_bracket: string;
  timmar: number;
  timpeng: number;
  acord: number;
  skillnad: number;
  maskiner: MaskinDel[];
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function getPeriodDates(p: PeriodType, offset: number) {
  const now = new Date();
  if (p === 'D') {
    const d = new Date(now); d.setDate(now.getDate() + offset);
    return { start: fmtDate(d), end: fmtDate(d) };
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
    return { start: fmtDate(new Date(y, qi * 3, 1)), end: fmtDate(new Date(y, qi * 3 + 3, 0)) };
  }
  if (p === 'A') {
    const y = now.getFullYear() + offset;
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  const ms = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const me = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: fmtDate(ms), end: fmtDate(me) };
}

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

function isValidOn(d: string, giltig_fran: string | null, giltig_till: string | null) {
  if (giltig_fran && d < giltig_fran) return false;
  if (giltig_till && d > giltig_till) return false;
  return true;
}

function lookupNearest(medelstam: number, acord: AcordPris[]): AcordPris | null {
  if (!acord.length) return null;
  let best = acord[0];
  let bestDiff = Math.abs(acord[0].medelstam - medelstam);
  for (const p of acord) {
    const d = Math.abs(p.medelstam - medelstam);
    if (d < bestDiff) { bestDiff = d; best = p; }
  }
  return best;
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

function formatKr(n: number) { return `${Math.round(n).toLocaleString('sv-SE')} kr`; }
function formatTim(n: number) { return `${n.toFixed(1)} h`; }

export default function PerObjektClient() {
  const [period, setPeriod] = useState<PeriodType>('M');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rader, setRader] = useState<ObjektRad[]>([]);
  const [expandedObjektId, setExpandedObjektId] = useState<string | null>(null);
  const [togglingObjektId, setTogglingObjektId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);

      const [
        tidRows, prodRows, lassRows, sortRows,
        sortGruppRes, objRes, maskinRes, timprisRes,
        acordRes, avstandRes, sortTillaggRes, traktRes, flaggaRes,
      ] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase.from('fakt_tid')
            .select('datum, maskin_id, objekt_id, engine_time_sek')
            .gte('datum', start).lte('datum', end)
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase.from('fakt_produktion')
            .select('datum, maskin_id, objekt_id, volym_m3sub, stammar')
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
          supabase.from('fakt_sortiment')
            .select('objekt_id, sortiment_id')
            .gte('datum', start).lte('datum', end)
            .range(from, to)
        ),
        supabase.from('dim_sortiment_grupp').select('sortiment_id, grupp'),
        supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer, huvudtyp, atgard'),
        supabase.from('dim_maskin').select('maskin_id, modell, maskin_typ'),
        supabase.from('maskin_timpris').select('maskin_id, maskin_namn, timpris, giltig_fran, giltig_till'),
        supabase.from('acord_priser').select('medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till'),
        supabase.from('acord_skotningsavstand').select('grundavstand_m, kr_per_100m, giltig_fran, giltig_till').not('grundavstand_m', 'is', null),
        supabase.from('acord_sortiment_tillagg').select('grundantal, kr_per_extra_sortiment, giltig_fran, giltig_till').is('giltig_till', null).not('grundantal', 'is', null).order('giltig_fran', { ascending: false }).limit(1),
        supabase.from('acord_traktstorlek').select('fran_m3fub, till_m3fub, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('fran_m3fub'),
        supabase.from('objekt_ekonomi').select('objekt_id, rakna_som_timpeng'),
      ]);

      const objMap: Record<string, any> = {};
      for (const o of (objRes.data || [])) objMap[o.objekt_id] = o;
      const maskinMap: Record<string, any> = {};
      for (const m of (maskinRes.data || [])) maskinMap[m.maskin_id] = m;
      const timprisList: MaskinTimpris[] = timprisRes.data || [];
      const acordList: AcordPris[] = acordRes.data || [];
      const avstandList: AvstandConfig[] = (avstandRes.data || []).filter((a: any) => a.grundavstand_m != null && a.kr_per_100m != null);
      const traktBrackets: TraktBracket[] = traktRes.data || [];
      const sortConf: SortConfig | null = (sortTillaggRes.data && sortTillaggRes.data[0])
        ? { grundantal: Number(sortTillaggRes.data[0].grundantal), kr_per_extra_sortiment: Number(sortTillaggRes.data[0].kr_per_extra_sortiment) }
        : null;
      const flaggaMap: Record<string, boolean> = {};
      for (const f of (flaggaRes.data || [])) flaggaMap[f.objekt_id] = !!f.rakna_som_timpeng;
      const sortGruppMap: Record<string, string | null> = {};
      for (const g of (sortGruppRes.data || [])) sortGruppMap[g.sortiment_id] = g.grupp;

      // Pre-aggregera per objekt
      // 1) total m³fub (från skördardata — används för traktstorlek-bracket och medelstam)
      const objVol: Record<string, { vol: number; stammar: number }> = {};
      for (const r of prodRows) {
        if (!r.objekt_id) continue;
        if (!objVol[r.objekt_id]) objVol[r.objekt_id] = { vol: 0, stammar: 0 };
        objVol[r.objekt_id].vol += Number(r.volym_m3sub) || 0;
        objVol[r.objekt_id].stammar += Number(r.stammar) || 0;
      }

      // 2) Distinkta sortimentgrupper per objekt (grupp = null exkluderas)
      const objGrupper: Record<string, Set<string>> = {};
      for (const s of sortRows) {
        if (!s.objekt_id) continue;
        const g = sortGruppMap[s.sortiment_id];
        if (!g) continue;
        if (!objGrupper[s.objekt_id]) objGrupper[s.objekt_id] = new Set();
        objGrupper[s.objekt_id].add(g);
      }

      // 3) Traktstorlek-tillägg per objekt
      const objTrakt: Record<string, { kr_per_m3: number; bracket: string }> = {};
      for (const objekt_id of Object.keys(objVol)) {
        const v = objVol[objekt_id].vol;
        const br = traktBrackets.find(b =>
          Number(b.fran_m3fub) <= v && (b.till_m3fub == null || Number(b.till_m3fub) > v)
        );
        objTrakt[objekt_id] = {
          kr_per_m3: br ? Number(br.tillagg_kr_per_m3fub) : 0,
          bracket: br
            ? `${br.fran_m3fub}–${br.till_m3fub ?? '∞'}`
            : '—',
        };
      }

      // 4) Sortiment-tillägg per objekt (baseras på grupp-count)
      const objSortTillagg: Record<string, { count: number; kr_per_m3: number }> = {};
      for (const objekt_id of new Set([...Object.keys(objGrupper), ...Object.keys(objVol)])) {
        const count = objGrupper[objekt_id]?.size || 0;
        const extra = sortConf ? Math.max(0, count - sortConf.grundantal) * sortConf.kr_per_extra_sortiment : 0;
        objSortTillagg[objekt_id] = { count, kr_per_m3: extra };
      }

      // 5) Objektets medelstam (från skördare) — används av skotare
      const objMedelstam: Record<string, number> = {};
      for (const [objekt_id, v] of Object.entries(objVol)) {
        if (v.stammar > 0) objMedelstam[objekt_id] = v.vol / v.stammar;
      }

      // Tid per (objekt, maskin)
      type TidAgg = { timmar: number; timpeng: number };
      const tidAgg: Record<string, TidAgg> = {};
      for (const r of tidRows) {
        if (!r.objekt_id) continue;
        const key = `${r.objekt_id}|${r.maskin_id}`;
        if (!tidAgg[key]) tidAgg[key] = { timmar: 0, timpeng: 0 };
        const t = (r.engine_time_sek || 0) / 3600;
        tidAgg[key].timmar += t;
        const tp = timprisList.find(p => p.maskin_id === r.maskin_id && isValidOn(r.datum, p.giltig_fran, p.giltig_till));
        tidAgg[key].timpeng += t * (tp?.timpris || 0);
      }

      // Skördare (harvester): aggregera vol + stammar per (objekt, maskin)
      type HarvAgg = { vol: number; stammar: number };
      const harvAgg: Record<string, HarvAgg> = {};
      for (const r of prodRows) {
        if (!r.objekt_id) continue;
        const key = `${r.objekt_id}|${r.maskin_id}`;
        if (!harvAgg[key]) harvAgg[key] = { vol: 0, stammar: 0 };
        harvAgg[key].vol += Number(r.volym_m3sub) || 0;
        harvAgg[key].stammar += Number(r.stammar) || 0;
      }

      // Skotare (forwarder): aggregera vol + skotavstånd-tillägg per (objekt, maskin)
      type FwdAgg = { vol: number; skotavstand_kr: number };
      const fwdAgg: Record<string, FwdAgg> = {};
      for (const r of lassRows) {
        if (!r.objekt_id) continue;
        const key = `${r.objekt_id}|${r.maskin_id}`;
        if (!fwdAgg[key]) fwdAgg[key] = { vol: 0, skotavstand_kr: 0 };
        const vol = Number(r.volym_m3sub) || 0;
        fwdAgg[key].vol += vol;
        const cfg = avstandList.find(c => isValidOn(r.datum, c.giltig_fran, c.giltig_till));
        if (cfg) {
          const dist = r.korstracka_m || 0;
          const step = Math.max(0, Math.ceil((dist - cfg.grundavstand_m) / 100));
          fwdAgg[key].skotavstand_kr += step * cfg.kr_per_100m * vol;
        }
      }

      // Bygg maskinrader per objekt
      const maskinDelarPerObjekt: Record<string, MaskinDel[]> = {};

      function addMaskinDel(objekt_id: string, maskin_id: string, rad: Omit<MaskinDel, 'maskin_id' | 'maskin_namn' | 'maskin_typ'>) {
        const minfo = maskinMap[maskin_id];
        const tp = timprisList.find(p => p.maskin_id === maskin_id);
        const maskin_typ: 'Harvester' | 'Forwarder' | null = minfo?.maskin_typ || null;
        if (!maskinDelarPerObjekt[objekt_id]) maskinDelarPerObjekt[objekt_id] = [];
        maskinDelarPerObjekt[objekt_id].push({
          maskin_id,
          maskin_namn: tp?.maskin_namn || minfo?.modell || maskin_id,
          maskin_typ,
          ...rad,
        });
      }

      // Harvester-rader
      for (const [key, h] of Object.entries(harvAgg)) {
        const [objekt_id, maskin_id] = key.split('|');
        if (h.vol <= 0 || h.stammar <= 0) continue;
        const medelstam = h.vol / h.stammar;
        const a = lookupNearest(medelstam, acordList);
        const grundpris = a?.pris_skordare || 0;
        const extraKr = (objSortTillagg[objekt_id]?.kr_per_m3 || 0) + (objTrakt[objekt_id]?.kr_per_m3 || 0);
        const acord = h.vol * (grundpris + extraKr);
        const tidK = tidAgg[key] || { timmar: 0, timpeng: 0 };
        addMaskinDel(objekt_id, maskin_id, {
          volym: h.vol,
          medelstam,
          grundpris,
          timmar: tidK.timmar,
          timpeng: tidK.timpeng,
          acord,
          skillnad: acord - tidK.timpeng,
        });
      }

      // Forwarder-rader
      for (const [key, f] of Object.entries(fwdAgg)) {
        const [objekt_id, maskin_id] = key.split('|');
        if (f.vol <= 0) continue;
        const medelstam = objMedelstam[objekt_id] || 0.35;
        const a = lookupNearest(medelstam, acordList);
        const grundpris = a?.pris_skotare || 0;
        const extraKr = (objSortTillagg[objekt_id]?.kr_per_m3 || 0) + (objTrakt[objekt_id]?.kr_per_m3 || 0);
        const acord = f.vol * (grundpris + extraKr) + f.skotavstand_kr;
        const tidK = tidAgg[key] || { timmar: 0, timpeng: 0 };
        addMaskinDel(objekt_id, maskin_id, {
          volym: f.vol,
          medelstam,
          grundpris,
          timmar: tidK.timmar,
          timpeng: tidK.timpeng,
          acord,
          skillnad: acord - tidK.timpeng,
        });
      }

      // Samla till ObjektRad
      const objektRader: ObjektRad[] = [];
      for (const objekt_id of Object.keys(maskinDelarPerObjekt)) {
        const maskiner = maskinDelarPerObjekt[objekt_id].sort((a, b) => b.acord - a.acord);
        const o = objMap[objekt_id];
        const totalTimmar = maskiner.reduce((s, m) => s + m.timmar, 0);
        const totalTimpeng = maskiner.reduce((s, m) => s + m.timpeng, 0);
        const totalAcord = maskiner.reduce((s, m) => s + m.acord, 0);
        const sortInfo = objSortTillagg[objekt_id] || { count: 0, kr_per_m3: 0 };
        const traktInfo = objTrakt[objekt_id] || { kr_per_m3: 0, bracket: '—' };
        const ar_gallring = (o?.huvudtyp || '') === 'Gallring';
        const ar_timpeng_override = !!flaggaMap[objekt_id];
        const behandla_som_timpeng = ar_gallring || ar_timpeng_override;
        objektRader.push({
          objekt_id,
          objekt_namn: o?.object_name || o?.vo_nummer || objekt_id,
          vo_nummer: o?.vo_nummer || null,
          huvudtyp: o?.huvudtyp || null,
          ar_gallring,
          ar_timpeng_override,
          behandla_som_timpeng,
          volym_m3fub: objVol[objekt_id]?.vol || 0,
          sortiment_grupper: Array.from(objGrupper[objekt_id] || []).sort(),
          sortiment_count: sortInfo.count,
          sortiment_kr_per_m3: sortInfo.kr_per_m3,
          trakt_kr_per_m3: traktInfo.kr_per_m3,
          trakt_bracket: traktInfo.bracket,
          timmar: totalTimmar,
          timpeng: totalTimpeng,
          acord: totalAcord,
          skillnad: totalAcord - totalTimpeng,
          maskiner,
        });
      }

      setRader(objektRader);
    } catch (err) {
      console.error('PerObjekt: fetch error', err);
    }
    setLoading(false);
  }, [period, periodOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleTimpengOverride = async (objekt_id: string, ny_flagga: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTogglingObjektId(objekt_id);
    if (ny_flagga) {
      await supabase.from('objekt_ekonomi').upsert({
        objekt_id,
        rakna_som_timpeng: true,
        uppdaterad_tid: new Date().toISOString(),
      }, { onConflict: 'objekt_id' });
    } else {
      await supabase.from('objekt_ekonomi').delete().eq('objekt_id', objekt_id);
    }
    setTogglingObjektId(null);
    await fetchData();
  };

  const acordRader = rader
    .filter(r => !r.behandla_som_timpeng)
    .sort((a, b) => Math.abs(b.skillnad) - Math.abs(a.skillnad));
  const timpengRader = rader
    .filter(r => r.behandla_som_timpeng)
    .sort((a, b) => b.timpeng - a.timpeng);

  const acordSum = {
    timpeng: acordRader.reduce((s, r) => s + r.timpeng, 0),
    acord: acordRader.reduce((s, r) => s + r.acord, 0),
  };
  const acordSkillnad = acordSum.acord - acordSum.timpeng;
  const timpengSum = {
    timpeng: timpengRader.reduce((s, r) => s + r.timpeng, 0),
    volym: timpengRader.reduce((s, r) => s + r.volym_m3fub, 0),
    timmar: timpengRader.reduce((s, r) => s + r.timmar, 0),
  };

  const s = {
    page: { background: '#111110', minHeight: '100vh', paddingTop: 16, paddingBottom: 130, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
    filterBar: { display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: 8 } as const,
    periodBtn: { border: 'none', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '5px 12px', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#7a7a72', cursor: 'pointer' } as const,
    periodBtnActive: { background: 'rgba(90,255,140,0.15)', color: 'rgba(90,255,140,0.9)' } as const,
    arrow: { border: 'none', background: 'none', color: '#7a7a72', fontSize: 16, cursor: 'pointer', padding: '4px 8px' } as const,
    label: { fontSize: 12, fontWeight: 600, color: '#e8e8e4', minWidth: 120, textAlign: 'center' as const },
    card: { background: '#1a1a18', borderRadius: 14, padding: 16 } as const,
    kpiVal: { fontFamily: "'Fraunces', serif", fontSize: 26, lineHeight: 1, fontWeight: 500 },
    kpiLabel: { fontSize: 10, color: '#7a7a72', marginTop: 3, textTransform: 'uppercase' as const, letterSpacing: 0.6, fontWeight: 600 },
    pill: { display: 'inline-block', fontSize: 9, padding: '2px 8px', borderRadius: 999, fontWeight: 600, letterSpacing: 0.3 } as const,
  };

  return (
    <div style={s.page}>
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Per objekt</div>
        <div style={{ fontSize: 12, color: '#7a7a72', marginTop: 2 }}>Timpeng mot beräknad acord (produktionsdata × acordprislista).</div>
      </div>

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
          {/* Sammanfattning: två separata kort */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '16px 0' }}>
            {/* Acord-objekt */}
            <div style={s.card}>
              <div style={{ fontSize: 10, color: '#7a7a72', fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
                Acord-objekt ({acordRader.length})
              </div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: 'rgba(91,143,255,0.95)' }}>{formatKr(acordSum.acord)}</div>
              <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 2 }}>Acord</div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 11, color: '#7a7a72' }}>Timpeng</div>
                <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#e8e8e4' }}>{formatKr(acordSum.timpeng)}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                <div style={{ fontSize: 11, color: '#7a7a72' }}>Skillnad</div>
                <div style={{
                  fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  color: acordSkillnad >= 0 ? 'rgba(90,255,140,0.95)' : 'rgba(255,90,90,0.9)',
                }}>
                  {acordSkillnad >= 0 ? '+' : ''}{formatKr(acordSkillnad)}
                </div>
              </div>
            </div>
            {/* Timpeng-objekt */}
            <div style={s.card}>
              <div style={{ fontSize: 10, color: '#7a7a72', fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
                Timpeng-objekt ({timpengRader.length})
              </div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: 'rgba(90,255,140,0.95)' }}>{formatKr(timpengSum.timpeng)}</div>
              <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 2 }}>Timpeng</div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 11, color: '#7a7a72' }}>G15h</div>
                <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#e8e8e4' }}>{formatTim(timpengSum.timmar)}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                <div style={{ fontSize: 11, color: '#7a7a72' }}>Volym</div>
                <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#e8e8e4' }}>{Math.round(timpengSum.volym).toLocaleString('sv-SE')} m³</div>
              </div>
            </div>
          </div>

          {rader.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72', fontSize: 13 }}>
              Inga objekt med produktionsdata för vald period.
            </div>
          )}

          {/* Acord-objekt-sektion */}
          {acordRader.length > 0 && (
            <div style={s.sectionTitle as any}>Acord · {acordRader.length} objekt</div>
          )}
          {acordRader.map(r => renderObjektKort(r))}

          {/* Timpeng-objekt-sektion */}
          {timpengRader.length > 0 && (
            <div style={s.sectionTitle as any}>Timpeng · {timpengRader.length} objekt</div>
          )}
          {timpengRader.map(r => renderObjektKort(r))}

          <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 12, padding: '0 4px', lineHeight: 1.5 }}>
            Acord = volym × (grundpris + sortiment-tillägg + trakt-tillägg) + skotavstånd-tillägg (skotare). Grundpris slås upp per närmaste medelstam i acord_priser. Gallring räknas alltid som timpeng. Slutavverkning kan flaggas som timpeng manuellt.
          </div>
        </div>
      )}
      <EkonomiBottomNav />
    </div>
  );

  function renderObjektKort(r: ObjektRad) {
    const isExpanded = expandedObjektId === r.objekt_id;
    const isTimpengMode = r.behandla_som_timpeng;
    const isToggling = togglingObjektId === r.objekt_id;

    const typeBadge = r.ar_gallring ? (
      <span style={{ ...s.pill, color: 'rgba(255,179,64,0.95)', background: 'rgba(255,179,64,0.1)' } as any}>GALLRING</span>
    ) : r.huvudtyp === 'Slutavverkning' ? (
      <span style={{ ...s.pill, color: 'rgba(90,255,140,0.85)', background: 'rgba(90,255,140,0.08)' } as any}>SLUT</span>
    ) : (
      <span style={{ ...s.pill, color: '#7a7a72', background: 'rgba(255,255,255,0.05)' } as any}>OKÄND</span>
    );

    const modePill = isTimpengMode ? (
      <span style={{ ...s.pill, color: 'rgba(173,198,255,0.95)', background: 'rgba(91,143,255,0.12)' } as any}>TIMPENG</span>
    ) : null;

    return (
      <div key={r.objekt_id} style={{ ...s.card, marginBottom: 10, cursor: 'pointer' }}
        onClick={() => setExpandedObjektId(isExpanded ? null : r.objekt_id)}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
              {typeBadge}
              {modePill}
              <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.objekt_namn}</span>
            </div>
            <div style={{ fontSize: 11, color: '#7a7a72' }}>
              {r.vo_nummer ? `VO ${r.vo_nummer}` : ''}
              {r.volym_m3fub > 0 && <span>{r.vo_nummer ? ' · ' : ''}{Math.round(r.volym_m3fub).toLocaleString('sv-SE')} m³</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {isTimpengMode ? (
              <>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: 'rgba(90,255,140,0.95)' }}>
                  {formatKr(r.timpeng)}
                </div>
                <div style={{ fontSize: 10, color: '#7a7a72', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Timpeng</div>
              </>
            ) : (
              <>
                <div style={{
                  fontFamily: "'Fraunces', serif", fontSize: 20,
                  color: r.skillnad >= 0 ? 'rgba(90,255,140,0.95)' : 'rgba(255,90,90,0.9)',
                }}>
                  {r.skillnad >= 0 ? '+' : ''}{formatKr(r.skillnad)}
                </div>
                <div style={{ fontSize: 10, color: '#7a7a72', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Skillnad</div>
              </>
            )}
          </div>
        </div>

        {isTimpengMode ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 11 }}>
            <Metric label="G15h" value={formatTim(r.timmar)} color="#e8e8e4" />
            <Metric label="Timpeng" value={formatKr(r.timpeng)} color="rgba(90,255,140,0.95)" />
            <Metric label="Volym" value={`${Math.round(r.volym_m3fub).toLocaleString('sv-SE')} m³`} color="#e8e8e4" />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 11 }}>
            <Metric label="Timpeng" value={formatKr(r.timpeng)} color="#e8e8e4" sub={formatTim(r.timmar)} />
            <Metric label="Acord" value={formatKr(r.acord)} color="rgba(91,143,255,0.95)" />
            <Metric
              label="Skillnad"
              value={`${r.skillnad >= 0 ? '+' : ''}${formatKr(r.skillnad)}`}
              color={r.skillnad >= 0 ? 'rgba(90,255,140,0.95)' : 'rgba(255,90,90,0.9)'}
            />
          </div>
        )}

        {isExpanded && (
          <>
            {/* Beräkningsunderlag — bara meningsfullt i acord-läge */}
            {!isTimpengMode && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: '#7a7a72', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Beräkningsunderlag</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: 11, color: '#bfcab9' }}>
                  <div>
                    <span style={{ color: '#7a7a72' }}>Sortimentgrupper: </span>
                    <strong>{r.sortiment_count}</strong>
                    {r.sortiment_grupper.length > 0 && <span style={{ color: '#7a7a72' }}> ({r.sortiment_grupper.join(', ')})</span>}
                  </div>
                  <div><span style={{ color: '#7a7a72' }}>Sortiment-tillägg: </span><strong>{r.sortiment_kr_per_m3} kr/m³</strong></div>
                  <div><span style={{ color: '#7a7a72' }}>Traktstorlek-bracket: </span><strong>{r.trakt_bracket}</strong></div>
                  <div><span style={{ color: '#7a7a72' }}>Trakt-tillägg: </span><strong>{r.trakt_kr_per_m3} kr/m³</strong></div>
                </div>
              </div>
            )}

            {/* Per maskin */}
            {r.maskiner.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: '#7a7a72', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Per maskin</div>
                {r.maskiner.map(m => {
                  const isHarv = m.maskin_typ === 'Harvester';
                  return (
                    <div key={m.maskin_id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            ...s.pill,
                            color: isHarv ? 'rgba(90,255,140,0.85)' : 'rgba(91,143,255,0.9)',
                            background: isHarv ? 'rgba(90,255,140,0.08)' : 'rgba(91,143,255,0.1)',
                          } as any}>
                            {isHarv ? 'SKÖRD' : m.maskin_typ === 'Forwarder' ? 'SKOT' : 'MASK'}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{m.maskin_namn}</span>
                        </div>
                        {!isTimpengMode && (
                          <div style={{
                            fontSize: 13, fontFamily: "'Fraunces', serif", fontVariantNumeric: 'tabular-nums',
                            color: m.skillnad >= 0 ? 'rgba(90,255,140,0.95)' : 'rgba(255,90,90,0.9)',
                          }}>
                            {m.skillnad >= 0 ? '+' : ''}{formatKr(m.skillnad)}
                          </div>
                        )}
                        {isTimpengMode && (
                          <div style={{ fontSize: 13, fontFamily: "'Fraunces', serif", fontVariantNumeric: 'tabular-nums', color: 'rgba(90,255,140,0.95)' }}>
                            {formatKr(m.timpeng)}
                          </div>
                        )}
                      </div>
                      {isTimpengMode ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, fontSize: 10, color: '#7a7a72', fontVariantNumeric: 'tabular-nums' }}>
                          <div><span style={{ color: '#7a7a72' }}>G15h </span><span style={{ color: '#e8e8e4' }}>{formatTim(m.timmar)}</span></div>
                          <div><span style={{ color: '#7a7a72' }}>Timpeng </span><span style={{ color: '#e8e8e4' }}>{formatKr(m.timpeng)}</span></div>
                          <div style={{ textAlign: 'right' }}><span style={{ color: '#7a7a72' }}>m³ </span><span style={{ color: '#e8e8e4' }}>{Math.round(m.volym).toLocaleString('sv-SE')}</span></div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, fontSize: 10, color: '#7a7a72', fontVariantNumeric: 'tabular-nums' }}>
                            <div><span style={{ color: '#7a7a72' }}>G15h </span><span style={{ color: '#e8e8e4' }}>{formatTim(m.timmar)}</span></div>
                            <div><span style={{ color: '#7a7a72' }}>Timpeng </span><span style={{ color: '#e8e8e4' }}>{formatKr(m.timpeng)}</span></div>
                            <div><span style={{ color: '#7a7a72' }}>m³ </span><span style={{ color: '#e8e8e4' }}>{Math.round(m.volym).toLocaleString('sv-SE')}</span></div>
                            <div><span style={{ color: '#7a7a72' }}>Pris </span><span style={{ color: '#e8e8e4' }}>{m.grundpris.toFixed(0)} kr</span></div>
                            <div style={{ textAlign: 'right' }}><span style={{ color: '#7a7a72' }}>Acord </span><span style={{ color: 'rgba(91,143,255,0.9)' }}>{formatKr(m.acord)}</span></div>
                          </div>
                          <div style={{ fontSize: 9, color: '#4a4a44', marginTop: 3 }}>
                            medelstam {m.medelstam.toFixed(3)}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Toggle: bara tillgänglig för slutavverkning + okänd (inte gallring) */}
            {!r.ar_gallring && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  onClick={e => toggleTimpengOverride(r.objekt_id, !r.ar_timpeng_override, e)}
                  disabled={isToggling}
                  style={{
                    width: '100%',
                    background: r.ar_timpeng_override ? 'rgba(91,143,255,0.12)' : 'rgba(255,255,255,0.03)',
                    color: r.ar_timpeng_override ? 'rgba(173,198,255,0.95)' : '#bfcab9',
                    border: `1px solid ${r.ar_timpeng_override ? 'rgba(91,143,255,0.35)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600,
                    fontFamily: 'inherit', cursor: isToggling ? 'wait' : 'pointer',
                    opacity: isToggling ? 0.6 : 1,
                  }}>
                  {isToggling ? 'Sparar...' :
                    r.ar_timpeng_override
                      ? '← Återställ till acord-beräkning'
                      : 'Flagga detta objekt som timpeng →'}
                </button>
                <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 6, textAlign: 'center', lineHeight: 1.4 }}>
                  {r.ar_timpeng_override
                    ? 'Detta objekt räknas som timpeng trots att det är slutavverkning.'
                    : 'Vissa slutavverkningsobjekt körs på timpeng istället för acord. Flagga i så fall här.'}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }
}

function Metric({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: '#7a7a72', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: "'Fraunces', serif", color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: '#7a7a72', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}
