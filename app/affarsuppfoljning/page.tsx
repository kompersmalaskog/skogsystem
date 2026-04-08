'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// ── Types ──
type BolagEntry = {
  key: string; name: string; volym: number; pct: number;
  inkopare: InkopareEntry[];
};
type InkopareEntry = {
  namn: string; initialer: string; bolag: string; volym: number; stammar: number;
  prod: number; antalObjekt: number;
  perAtgard: Record<string, number>;
  perTradslag: Record<string, number>;
  objekt: ObjektEntry[];
};
type ObjektEntry = {
  namn: string; vo_nummer: string; volym: number; stammar: number;
  atgard: string; certifiering: string; grot: boolean;
  skogsagare: string; kontakt_namn: string; kontakt_telefon: string;
  timmerPct: number; massaPct: number; kubbPct: number; energiPct: number;
  medelstam: number;
};

type PeriodType = 'V' | 'M' | 'K' | 'A';

// ── Helpers ──
function getPeriodDates(p: PeriodType, offset: number) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (p === 'V') {
    const day = now.getDay() || 7;
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1 + offset * 7);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: fmt(mon), end: fmt(sun) };
  }
  if (p === 'K') {
    const cq = Math.floor(now.getMonth() / 3);
    const tq = now.getFullYear() * 4 + cq + offset;
    const y = Math.floor(tq / 4);
    const qi = ((tq % 4) + 4) % 4;
    const qs = new Date(y, qi * 3, 1);
    const qe = new Date(y, qi * 3 + 3, 0);
    return { start: fmt(qs), end: fmt(qe) };
  }
  if (p === 'A') {
    const y = now.getFullYear() + offset;
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  const ms = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const me = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: fmt(ms), end: fmt(me) };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
function getPeriodLabel(p: PeriodType, offset: number) {
  const { start } = getPeriodDates(p, offset);
  const d = new Date(start);
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

// ── Component ──
export default function Affarsuppfoljning() {
  const [period, setPeriod] = useState<PeriodType>('M');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [filterTyp, setFilterTyp] = useState('');
  const [loading, setLoading] = useState(false);
  const [bolagData, setBolagData] = useState<BolagEntry[]>([]);
  const [allInkopare, setAllInkopare] = useState<InkopareEntry[]>([]);
  const [expandedBolag, setExpandedBolag] = useState<string | null>(null);
  const [expandedInk, setExpandedInk] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);

      const [prodRows, objRes, tradslagRes, sortimentRes, dimSortRes] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase.from('fakt_produktion')
            .select('objekt_id, volym_m3sub, stammar, tradslag_id')
            .gte('datum', start).lte('datum', end)
            .range(from, to)
        ),
        supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer, bolag, inkopare, huvudtyp, atgard, certifiering, grot_anpassad, skogsagare, kontakt_namn, kontakt_telefon, timpeng'),
        supabase.from('dim_tradslag').select('tradslag_id, namn'),
        fetchAllRows((from, to) =>
          supabase.from('fakt_sortiment')
            .select('objekt_id, sortiment_id, volym_m3sub')
            .gte('datum', start).lte('datum', end)
            .range(from, to)
        ),
        supabase.from('dim_sortiment').select('sortiment_id, namn'),
      ]);

      const objekter = objRes.data || [];
      const dimTradslag = tradslagRes.data || [];
      const dimSort = dimSortRes.data || [];

      // Filter by huvudtyp
      const filteredObjIds = new Set<string>();
      const objMap: Record<string, any> = {};
      for (const o of objekter) {
        objMap[o.objekt_id] = o;
        if (filterTyp) {
          const ht = (o.huvudtyp || '').toLowerCase();
          if (filterTyp === 'Slutavverkning' && !ht.includes('slutavverkning')) continue;
          if (filterTyp === 'Gallring' && !ht.includes('gallring')) continue;
        }
        filteredObjIds.add(o.objekt_id);
      }

      // Filter prod
      const filteredProd = prodRows.filter((r: any) => filteredObjIds.has(r.objekt_id));

      // Tradslag map
      const tsMap: Record<string, string> = {};
      for (const t of dimTradslag) {
        const n = (t.namn || '').toUpperCase();
        tsMap[t.tradslag_id] = n.includes('GRAN') ? 'Gran' : n.includes('TALL') ? 'Tall' : n.includes('BJORK') || n.includes('BJÖRK') ? 'Björk' : 'Övr. löv';
      }

      // Sortiment category map
      const sortCatMap: Record<string, string> = {};
      for (const s of dimSort) {
        const n = (s.namn || '').toLowerCase();
        if (n.includes('timmer') || n.includes('såg')) sortCatMap[s.sortiment_id] = 'Timmer';
        else if (n.includes('kubb')) sortCatMap[s.sortiment_id] = 'Kubb';
        else if (n.includes('massa')) sortCatMap[s.sortiment_id] = 'Massa';
        else sortCatMap[s.sortiment_id] = 'Energi';
      }

      // Sortiment per objekt
      const sortPerObj: Record<string, Record<string, number>> = {};
      for (const r of sortimentRes) {
        if (!filteredObjIds.has(r.objekt_id)) continue;
        if (!sortPerObj[r.objekt_id]) sortPerObj[r.objekt_id] = {};
        const cat = sortCatMap[r.sortiment_id] || 'Energi';
        sortPerObj[r.objekt_id][cat] = (sortPerObj[r.objekt_id][cat] || 0) + (r.volym_m3sub || 0);
      }

      // Aggregate per objekt
      type ObjAgg = { vol: number; st: number; perTs: Record<string, number> };
      const prodPerObj: Record<string, ObjAgg> = {};
      for (const r of filteredProd) {
        const oid = r.objekt_id || '';
        if (!prodPerObj[oid]) prodPerObj[oid] = { vol: 0, st: 0, perTs: {} };
        prodPerObj[oid].vol += r.volym_m3sub || 0;
        prodPerObj[oid].st += r.stammar || 0;
        const ts = tsMap[r.tradslag_id] || 'Övr. löv';
        prodPerObj[oid].perTs[ts] = (prodPerObj[oid].perTs[ts] || 0) + (r.volym_m3sub || 0);
      }

      // Group per inkopare
      type InkAgg = { namn: string; bolag: string; vol: number; st: number; perAtgard: Record<string, number>; perTs: Record<string, number>; objekt: ObjektEntry[] };
      const inkMap: Record<string, InkAgg> = {};
      for (const o of objekter) {
        if (!filteredObjIds.has(o.objekt_id)) continue;
        const pObj = prodPerObj[o.objekt_id];
        if (!pObj || pObj.vol <= 0) continue;
        const ink = (o.inkopare || '').trim() || 'Okänd';
        if (!inkMap[ink]) inkMap[ink] = { namn: ink, bolag: (o.bolag || '').trim(), vol: 0, st: 0, perAtgard: {}, perTs: {}, objekt: [] };
        const entry = inkMap[ink];
        entry.vol += pObj.vol;
        entry.st += pObj.st;
        const atg = (o.atgard || '').trim() || 'Övrigt';
        entry.perAtgard[atg] = (entry.perAtgard[atg] || 0) + pObj.vol;
        if (o.timpeng === true) entry.perAtgard['Timpeng'] = (entry.perAtgard['Timpeng'] || 0) + pObj.vol;
        for (const [ts, v] of Object.entries(pObj.perTs)) entry.perTs[ts] = (entry.perTs[ts] || 0) + v;

        // Sortiment for this object
        const sp = sortPerObj[o.objekt_id] || {};
        const spTotal = Object.values(sp).reduce((s, v) => s + v, 0);
        const medelstam = pObj.st > 0 ? pObj.vol / pObj.st : 0;

        entry.objekt.push({
          namn: o.object_name || o.vo_nummer || '',
          vo_nummer: o.vo_nummer || '',
          volym: Math.round(pObj.vol),
          stammar: Math.round(pObj.st),
          atgard: atg,
          certifiering: o.certifiering || '',
          grot: o.grot_anpassad === true,
          skogsagare: o.skogsagare || '',
          kontakt_namn: o.kontakt_namn || '',
          kontakt_telefon: o.kontakt_telefon || '',
          timmerPct: spTotal > 0 ? Math.round((sp['Timmer'] || 0) / spTotal * 100) : 0,
          massaPct: spTotal > 0 ? Math.round((sp['Massa'] || 0) / spTotal * 100) : 0,
          kubbPct: spTotal > 0 ? Math.round((sp['Kubb'] || 0) / spTotal * 100) : 0,
          energiPct: spTotal > 0 ? Math.round((sp['Energi'] || 0) / spTotal * 100) : 0,
          medelstam: parseFloat(medelstam.toFixed(3)),
        });
      }

      // Build inkopare list
      const inkList: InkopareEntry[] = Object.values(inkMap).map(ink => {
        const words = ink.namn.split(' ');
        const init = words.length >= 2 ? (words[0][0] + words[words.length - 1][0]).toUpperCase() : ink.namn.substring(0, 2).toUpperCase();
        return {
          namn: ink.namn, initialer: init, bolag: ink.bolag,
          volym: Math.round(ink.vol), stammar: Math.round(ink.st),
          prod: 0, antalObjekt: ink.objekt.length,
          perAtgard: Object.fromEntries(Object.entries(ink.perAtgard).map(([k, v]) => [k, Math.round(v)])),
          perTradslag: Object.fromEntries(Object.entries(ink.perTs).map(([k, v]) => [k, Math.round(v)])),
          objekt: ink.objekt.sort((a, b) => b.volym - a.volym),
        };
      }).filter(i => i.volym > 0).sort((a, b) => b.volym - a.volym);

      setAllInkopare(inkList);

      // Group per bolag
      const bolagMap = new Map<string, { name: string; vol: number; inkopare: InkopareEntry[] }>();
      for (const ink of inkList) {
        const bKey = (ink.bolag || 'Övrigt').toUpperCase();
        const bName = ink.bolag || 'Övrigt';
        if (!bolagMap.has(bKey)) bolagMap.set(bKey, { name: bName, vol: 0, inkopare: [] });
        const b = bolagMap.get(bKey)!;
        b.vol += ink.volym;
        b.inkopare.push(ink);
      }
      const totalVol = inkList.reduce((s, i) => s + i.volym, 0);
      const bolagList: BolagEntry[] = [...bolagMap.entries()].map(([key, b]) => ({
        key, name: b.name, volym: b.vol,
        pct: totalVol > 0 ? Math.round(b.vol / totalVol * 100) : 0,
        inkopare: b.inkopare,
      })).sort((a, b) => b.volym - a.volym);

      setBolagData(bolagList);
    } catch (err) {
      console.error('Affärsuppföljning: fetch error', err);
    }
    setLoading(false);
  }, [period, periodOffset, filterTyp]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalVol = bolagData.reduce((s, b) => s + b.volym, 0);

  // ── Styles ──
  const s = {
    page: { background: '#111110', minHeight: '100vh', paddingTop: 56, paddingBottom: 90, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
    filterBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' } as const,
    periodRow: { display: 'flex', alignItems: 'center', gap: 8 } as const,
    periodBtn: { border: 'none', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '5px 12px', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#7a7a72', cursor: 'pointer' } as const,
    periodBtnActive: { background: 'rgba(90,255,140,0.15)', color: 'rgba(90,255,140,0.9)' } as const,
    arrow: { border: 'none', background: 'none', color: '#7a7a72', fontSize: 16, cursor: 'pointer', padding: '4px 8px' } as const,
    label: { fontSize: 12, fontWeight: 600, color: '#e8e8e4', minWidth: 80, textAlign: 'center' as const },
    filterChips: { display: 'flex', gap: 6 } as const,
    chip: { border: 'none', borderRadius: 8, padding: '5px 14px', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' } as const,
    card: { background: '#1a1a18', borderRadius: 14, padding: 16, marginBottom: 10 } as const,
    sectionTitle: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginBottom: 10, marginTop: 20, padding: '0 16px' },
    bolagRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' } as const,
    prog: { height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' as const, margin: '4px 0 0' },
    progFill: { height: '100%', borderRadius: 2 },
    inkCard: { background: '#222220', borderRadius: 12, padding: 14, marginBottom: 8, cursor: 'pointer' } as const,
    objCard: { background: '#111110', borderRadius: 8, padding: 12, marginTop: 8 } as const,
    kpi: { textAlign: 'center' as const, flex: 1 },
    kpiVal: { fontFamily: "'Fraunces', serif", fontSize: 22, lineHeight: 1 },
    kpiLabel: { fontSize: 10, color: '#7a7a72', marginTop: 3 },
    frow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12 } as const,
    muted: { color: '#7a7a72', fontSize: 11 },
    badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  };

  return (
    <div style={s.page}>
      {/* Filter bar */}
      <div style={s.filterBar}>
        <div style={s.periodRow}>
          {(['V', 'M', 'K', 'A'] as PeriodType[]).map(p => (
            <button key={p} style={{ ...s.periodBtn, ...(period === p ? s.periodBtnActive : {}) }}
              onClick={() => { setPeriod(p); setPeriodOffset(0); }}>{p === 'A' ? 'År' : p}</button>
          ))}
          <button style={s.arrow} onClick={() => setPeriodOffset(o => o - 1)}>&#8249;</button>
          <span style={s.label}>{getPeriodLabel(period, periodOffset)}</span>
          <button style={s.arrow} onClick={() => setPeriodOffset(o => o + 1)}>&#8250;</button>
        </div>
        <div style={s.filterChips}>
          {['', 'Slutavverkning', 'Gallring'].map(f => (
            <button key={f} style={{ ...s.chip, background: filterTyp === f ? 'rgba(90,255,140,0.15)' : 'rgba(255,255,255,0.05)', color: filterTyp === f ? 'rgba(90,255,140,0.9)' : '#7a7a72' }}
              onClick={() => setFilterTyp(f)}>{f || 'Alla'}</button>
          ))}
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72' }}>Laddar...</div>}

      {!loading && (
        <div style={{ padding: '0 16px' }}>
          {/* Total KPIs */}
          <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
            <div style={{ ...s.card, flex: 1, textAlign: 'center' }}>
              <div style={s.kpiVal}>{totalVol.toLocaleString('sv')}</div>
              <div style={s.kpiLabel}>m³ totalt</div>
            </div>
            <div style={{ ...s.card, flex: 1, textAlign: 'center' }}>
              <div style={s.kpiVal}>{bolagData.length}</div>
              <div style={s.kpiLabel}>Bolag</div>
            </div>
            <div style={{ ...s.card, flex: 1, textAlign: 'center' }}>
              <div style={s.kpiVal}>{allInkopare.length}</div>
              <div style={s.kpiLabel}>Inköpare</div>
            </div>
          </div>

          {/* Bolag */}
          <div style={s.sectionTitle}>Volym per bolag</div>
          {bolagData.map(b => (
            <div key={b.key}>
              <div style={s.card} onClick={() => setExpandedBolag(expandedBolag === b.key ? null : b.key)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>
                    {b.name.substring(0, 4).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{b.name}</div>
                    <div style={s.muted}>{b.inkopare.length} inköpare</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20 }}>{b.volym.toLocaleString('sv')}</div>
                    <div style={s.muted}>m³ · {b.pct}%</div>
                  </div>
                </div>
                <div style={s.prog}><div style={{ ...s.progFill, width: `${b.pct}%`, background: 'rgba(90,255,140,0.5)' }} /></div>
              </div>

              {/* Expanded: inköpare */}
              {expandedBolag === b.key && (
                <div style={{ padding: '0 8px 8px' }}>
                  {b.inkopare.map(ink => (
                    <div key={ink.namn}>
                      <div style={s.inkCard} onClick={() => setExpandedInk(expandedInk === ink.namn ? null : ink.namn)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
                            {ink.initialer}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{ink.namn}</div>
                            <div style={s.muted}>{ink.antalObjekt} objekt</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18 }}>{ink.volym.toLocaleString('sv')}</div>
                            <div style={s.muted}>m³</div>
                          </div>
                        </div>
                        {/* Tradslag bar */}
                        <div style={{ display: 'flex', gap: 2, marginTop: 8, borderRadius: 2, overflow: 'hidden' }}>
                          {(['Gran', 'Tall', 'Björk', 'Övr. löv'] as const).filter(ts => (ink.perTradslag[ts] || 0) > 0).map(ts => {
                            const pct = ink.volym > 0 ? Math.round((ink.perTradslag[ts] || 0) / ink.volym * 100) : 0;
                            const colors: Record<string, string> = { 'Gran': 'rgba(90,255,140,0.5)', 'Tall': 'rgba(255,255,255,0.2)', 'Björk': 'rgba(91,143,255,0.4)', 'Övr. löv': 'rgba(255,179,64,0.3)' };
                            return <div key={ts} style={{ flex: pct, height: 4, background: colors[ts], borderRadius: 2 }} />;
                          })}
                        </div>
                      </div>

                      {/* Expanded: objekt */}
                      {expandedInk === ink.namn && (
                        <div style={{ padding: '0 8px 8px' }}>
                          {/* Atgard breakdown */}
                          <div style={{ ...s.card, padding: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: '#7a7a72', marginBottom: 8 }}>Åtgärd</div>
                            {Object.entries(ink.perAtgard).sort(([,a], [,b]) => b - a).map(([atg, vol]) => {
                              const pct = ink.volym > 0 ? Math.round(vol / ink.volym * 100) : 0;
                              return (
                                <div key={atg} style={s.frow}>
                                  <span>{atg}</span>
                                  <div style={{ flex: 1, margin: '0 12px' }}><div style={s.prog}><div style={{ ...s.progFill, width: `${pct}%`, background: 'rgba(90,255,140,0.5)' }} /></div></div>
                                  <span style={{ minWidth: 80, textAlign: 'right', fontSize: 11 }}>{vol.toLocaleString('sv')} m³ <span style={{ color: '#7a7a72' }}>{pct}%</span></span>
                                </div>
                              );
                            })}
                          </div>
                          {/* Tradslag breakdown */}
                          <div style={{ ...s.card, padding: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: '#7a7a72', marginBottom: 8 }}>Trädslag</div>
                            {(['Gran', 'Tall', 'Björk', 'Övr. löv'] as const).filter(ts => (ink.perTradslag[ts] || 0) > 0).map(ts => {
                              const v = ink.perTradslag[ts] || 0;
                              const pct = ink.volym > 0 ? Math.round(v / ink.volym * 100) : 0;
                              const colors: Record<string, string> = { 'Gran': 'rgba(90,255,140,0.5)', 'Tall': 'rgba(255,255,255,0.2)', 'Björk': 'rgba(91,143,255,0.4)', 'Övr. löv': 'rgba(255,179,64,0.3)' };
                              return (
                                <div key={ts} style={s.frow}>
                                  <span>{ts}</span>
                                  <div style={{ flex: 1, margin: '0 12px' }}><div style={s.prog}><div style={{ ...s.progFill, width: `${pct}%`, background: colors[ts] }} /></div></div>
                                  <span style={{ minWidth: 80, textAlign: 'right', fontSize: 11 }}>{v.toLocaleString('sv')} m³ <span style={{ color: '#7a7a72' }}>{pct}%</span></span>
                                </div>
                              );
                            })}
                          </div>
                          {/* Objekt list */}
                          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: '#7a7a72', marginBottom: 6, marginTop: 4, padding: '0 4px' }}>Objekt</div>
                          {ink.objekt.map(o => (
                            <div key={o.namn + o.vo_nummer} style={s.objCard}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 600 }}>{o.namn}</div>
                                  <div style={s.muted}>{o.vo_nummer ? `VO ${o.vo_nummer}` : ''} {o.atgard && <span style={{ ...s.badge, background: 'rgba(255,255,255,0.07)', color: '#7a7a72', marginLeft: 4 }}>{o.atgard}</span>}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18 }}>{o.volym.toLocaleString('sv')}</div>
                                  <div style={s.muted}>m³</div>
                                </div>
                              </div>
                              {/* Sortiment */}
                              <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderRadius: 2, overflow: 'hidden' }}>
                                {o.timmerPct > 0 && <div style={{ flex: o.timmerPct, height: 4, background: 'rgba(90,255,140,0.5)', borderRadius: 2 }} />}
                                {o.kubbPct > 0 && <div style={{ flex: o.kubbPct, height: 4, background: 'rgba(91,143,255,0.5)', borderRadius: 2 }} />}
                                {o.massaPct > 0 && <div style={{ flex: o.massaPct, height: 4, background: 'rgba(255,179,64,0.4)', borderRadius: 2 }} />}
                                {o.energiPct > 0 && <div style={{ flex: o.energiPct, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }} />}
                              </div>
                              <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#7a7a72', marginBottom: 8 }}>
                                {o.timmerPct > 0 && <span>Timmer {o.timmerPct}%</span>}
                                {o.kubbPct > 0 && <span>Kubb {o.kubbPct}%</span>}
                                {o.massaPct > 0 && <span>Massa {o.massaPct}%</span>}
                                {o.energiPct > 0 && <span>Energi {o.energiPct}%</span>}
                              </div>
                              {/* Details */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 11 }}>
                                <span style={{ color: '#7a7a72' }}>Stammar: <strong style={{ color: '#e8e8e4' }}>{o.stammar.toLocaleString('sv')}</strong></span>
                                <span style={{ color: '#7a7a72' }}>Medelstam: <strong style={{ color: '#e8e8e4' }}>{o.medelstam}</strong></span>
                                {o.certifiering && <span style={{ color: '#7a7a72' }}>Cert: <strong style={{ color: '#e8e8e4' }}>{o.certifiering}</strong></span>}
                                {o.grot && <span style={{ ...s.badge, background: 'rgba(90,255,140,0.1)', color: 'rgba(90,255,140,0.8)' }}>GROT</span>}
                                {o.skogsagare && <span style={{ color: '#7a7a72' }}>Markägare: <strong style={{ color: '#e8e8e4' }}>{o.skogsagare}</strong></span>}
                                {o.kontakt_namn && <span style={{ color: '#7a7a72' }}>{o.kontakt_namn} {o.kontakt_telefon}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {bolagData.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72' }}>Ingen data för vald period</div>
          )}
        </div>
      )}
    </div>
  );
}
