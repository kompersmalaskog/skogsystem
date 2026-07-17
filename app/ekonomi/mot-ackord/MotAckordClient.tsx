'use client';

// Mot ackord — jämför vad avräknade objekt gav på ackord mot vad samma
// arbete hade gett på timpeng. Bara intäktssida, ingen kostnad.
//
// GRUNDREGEL: allt bygger på AVRÄKNADE objekt = BÅDA
// dim_objekt.skordning_avslutad OCH skotning_avslutad satta. Perioden är
// när objektet AVRÄKNADES (skotning_avslutad), inte när arbetet utfördes —
// varje objekt räknas helt, en gång. Preliminära objekt (ett datum satt,
// ett saknas) är ALDRIG med i talen — de listas nedtonat.
//
// Gallring/timpeng-flaggade objekt ÄR timpeng — ingen jämförelse, bara en
// dämpad räknare.
//
// TRE FÄRGER, TRE BETYDELSER: grön = över timpeng, röd = under timpeng,
// bärnsten = preliminärt. Allt annat neutralt.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { hamtaExkluderadeObjektId } from '@/lib/objekt/exkludera';
import {
  type MaskinTimpris, type AcordPris, type AvstandConfig, type TraktBracket, type SortConfig,
  isValidOn, lookupAcordPris, traktTillagg, sortimentTillagg, skotAvstandKr,
  timpengForTidRows, ANTAGEN_MEDELSTAM, tillampaTimpengUndantag,
} from '@/lib/ekonomi/acord';
import { type PeriodType, getPeriodDates, getPeriodLabel, fetchAllRows } from '@/lib/ekonomi/period';
import EkonomiBottomNav from '../EkonomiBottomNav';

// Under så här många G15-timmar är ett kr/tim-tal brus, inte fakta.
// Ändras tröskeln: uppdatera även texten i (i)-sheeten.
const OSAKER_TIM = 15;

const GRON = '90,255,140';
const ROD = '255,90,90';
const BARNSTEN = '240,178,76';

type MaskinDel = {
  maskin_id: string;
  roll: 'skördare' | 'skotare';
  ackord: number;
  timpeng: number;
  timmar: number;
  timpris: number;        // gällande timpris vid avräkningsdatumet
};
type ObjektRad = {
  objekt_id: string;
  namn: string;
  volym: number;          // skördad m³fub, skotad som fallback (GROT)
  ackord: number;
  timpeng: number;
  diff: number;
  krPerM3: number | null; // null när volym saknas — visas som streck, aldrig 0
  timmarUtanPris: number; // G15-timmar utan giltig timprisrad — gör jämförelsen halt
  maskiner: MaskinDel[];
};
type MaskinAgg = {
  maskin_id: string;
  ackord: number;
  timpeng: number;
  timmar: number;
};

function formatKr(n: number) { return `${Math.round(n).toLocaleString('sv-SE')} kr`; }
function fmtDiff(n: number) { return `${n < 0 ? '−' : '+'}${Math.round(Math.abs(n)).toLocaleString('sv-SE')}`; }
function fmtTim(n: number) { return n.toFixed(1).replace('.', ','); }
function diffColor(n: number) { return n >= 0 ? `rgba(${GRON},0.9)` : `rgba(${ROD},0.9)`; }

export default function MotAckordClient() {
  const [period, setPeriod] = useState<PeriodType>('M');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objektRader, setObjektRader] = useState<ObjektRad[]>([]);
  const [vantarNamn, setVantarNamn] = useState<string[]>([]);       // prel: ett datum satt, ett saknas
  const [timpengAntal, setTimpengAntal] = useState(0);              // timpeng-objekt avräknade i perioden
  // Objekt vars timpeng-sida är ofullständig (timmar utan giltigt timpris) —
  // en halt jämförelse kan byta tecken på hela heron, så de står UTANFÖR talen
  const [ejJamforbara, setEjJamforbara] = useState<{ namn: string; timmar: number }[]>([]);
  const [maskinNamnMap, setMaskinNamnMap] = useState<Record<string, { namn: string; typ: string | null }>>({});
  const [sheetObjekt, setSheetObjekt] = useState<ObjektRad | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [vantarOpen, setVantarOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);

      const [objRes, maskinRes, timprisRes, acordRes, avstandRes, sortTillaggRes, traktRes, sortGruppRes, exkluderade] = await Promise.all([
        supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer, huvudtyp, timpeng, skordning_avslutad, skotning_avslutad, timpeng_undantag_timmar_skordare, timpeng_undantag_timmar_skotare, timpeng_undantag_volym, timpeng_undantag_dra_skordare, timpeng_undantag_dra_skotare'),
        supabase.from('dim_maskin').select('maskin_id, modell, maskin_typ'),
        supabase.from('maskin_timpris').select('maskin_id, maskin_namn, timpris, giltig_fran, giltig_till'),
        supabase.from('acord_priser').select('medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till'),
        supabase.from('acord_skotningsavstand').select('grundavstand_m, kr_per_100m, giltig_fran, giltig_till').not('grundavstand_m', 'is', null),
        supabase.from('acord_sortiment_tillagg').select('grundantal, kr_per_extra_sortiment, giltig_fran, giltig_till').is('giltig_till', null).not('grundantal', 'is', null).order('giltig_fran', { ascending: false }).limit(1),
        supabase.from('acord_traktstorlek').select('fran_m3fub, till_m3fub, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('fran_m3fub'),
        supabase.from('dim_sortiment_grupp').select('sortiment_id, grupp'),
        hamtaExkluderadeObjektId(),
      ]);
      for (const res of [objRes, maskinRes, timprisRes, acordRes, avstandRes, sortTillaggRes, traktRes, sortGruppRes]) {
        if (res.error) throw new Error(res.error.message);
      }

      const alla = (objRes.data || []).filter((o: any) => !exkluderade.has(o.objekt_id));
      const arTimpengObj = (o: any) => (o.huvudtyp || '') === 'Gallring' || o.timpeng === true;
      const arAvraknad = (o: any) => !!(o.skordning_avslutad && o.skotning_avslutad);
      const iPerioden = (o: any) => o.skotning_avslutad >= start && o.skotning_avslutad <= end;

      // Urvalet: ackordobjekt avräknade i perioden
      const valda = alla.filter((o: any) => !arTimpengObj(o) && arAvraknad(o) && iPerioden(o));
      // Timpeng-objekt avräknade i perioden — ingen jämförelse, bara räknare
      const timpengIPeriod = alla.filter((o: any) => arTimpengObj(o) && arAvraknad(o) && iPerioden(o));
      // "Väntar på avräkning" — ena momentet klart, andra inte. Aldrig i talen.
      const vantar = alla.filter((o: any) => !arTimpengObj(o) && !arAvraknad(o) && (o.skordning_avslutad || o.skotning_avslutad));

      const maskinMap: Record<string, { namn: string; typ: string | null }> = {};
      const timprisList: MaskinTimpris[] = timprisRes.data || [];
      for (const m of (maskinRes.data || [])) {
        const tp = timprisList.find(p => p.maskin_id === m.maskin_id);
        maskinMap[m.maskin_id] = { namn: tp?.maskin_namn || m.modell || m.maskin_id, typ: m.maskin_typ || null };
      }

      if (valda.length === 0) {
        setObjektRader([]);
        setVantarNamn(vantar.map((o: any) => o.object_name || o.vo_nummer || o.objekt_id));
        setTimpengAntal(timpengIPeriod.length);
        setEjJamforbara([]);
        setMaskinNamnMap(maskinMap);
        setLoading(false);
        return;
      }

      const ids = valda.map((o: any) => o.objekt_id);

      // HELA objektets data — inget datumfilter; objektet räknas helt, en gång
      const [prodRows, lassRows, tidRows, sortRows] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase.from('fakt_produktion')
            .select('datum, maskin_id, objekt_id, volym_m3sub, stammar')
            .in('objekt_id', ids).range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase.from('fakt_lass')
            .select('datum, maskin_id, objekt_id, volym_m3sub, korstracka_m')
            .in('objekt_id', ids).range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase.from('fakt_tid')
            .select('datum, maskin_id, objekt_id, processing_sek, terrain_sek')
            .in('objekt_id', ids).range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase.from('fakt_sortiment')
            .select('objekt_id, sortiment_id')
            .in('objekt_id', ids).range(from, to)
        ),
      ]);

      const objMeta: Record<string, any> = {};
      for (const o of valda) objMeta[o.objekt_id] = o;
      const acordList: AcordPris[] = acordRes.data || [];
      const avstandList: AvstandConfig[] = (avstandRes.data || []).filter((a: any) => a.grundavstand_m != null && a.kr_per_100m != null);
      const traktBrackets: TraktBracket[] = traktRes.data || [];
      const sortConf: SortConfig | null = (sortTillaggRes.data && sortTillaggRes.data[0])
        ? { grundantal: Number(sortTillaggRes.data[0].grundantal), kr_per_extra_sortiment: Number(sortTillaggRes.data[0].kr_per_extra_sortiment) }
        : null;
      const sortGruppMap: Record<string, string | null> = {};
      for (const g of (sortGruppRes.data || [])) sortGruppMap[g.sortiment_id] = g.grupp;

      // ── Samma pre-aggregering som per-objekt-fliken (acordmotorns semantik) ──
      const objVol: Record<string, { vol: number; stammar: number }> = {};
      for (const r of prodRows) {
        if (!r.objekt_id) continue;
        (objVol[r.objekt_id] ||= { vol: 0, stammar: 0 });
        objVol[r.objekt_id].vol += Number(r.volym_m3sub) || 0;
        objVol[r.objekt_id].stammar += Number(r.stammar) || 0;
      }
      const objMedelstam: Record<string, number> = {};
      for (const [oid, v] of Object.entries(objVol)) if (v.stammar > 0) objMedelstam[oid] = v.vol / v.stammar;

      const objGrupper: Record<string, Set<string>> = {};
      for (const s2 of sortRows) {
        if (!s2.objekt_id) continue;
        const g = sortGruppMap[s2.sortiment_id];
        if (!g) continue;
        (objGrupper[s2.objekt_id] ||= new Set()).add(g);
      }
      const objSortKr: Record<string, number> = {};
      const objTraktKr: Record<string, number> = {};
      for (const oid of ids) {
        objSortKr[oid] = sortimentTillagg(objGrupper[oid]?.size || 0, sortConf);
        objTraktKr[oid] = traktTillagg(objVol[oid]?.vol || 0, traktBrackets).krPerM3;
      }

      const tidPerKey: Record<string, any[]> = {};
      for (const r of tidRows) {
        if (!r.objekt_id) continue;
        (tidPerKey[`${r.objekt_id}|${r.maskin_id}`] ||= []).push(r);
      }

      const harvAgg: Record<string, { vol: number; stammar: number }> = {};
      for (const r of prodRows) {
        if (!r.objekt_id) continue;
        const key = `${r.objekt_id}|${r.maskin_id}`;
        (harvAgg[key] ||= { vol: 0, stammar: 0 });
        harvAgg[key].vol += Number(r.volym_m3sub) || 0;
        harvAgg[key].stammar += Number(r.stammar) || 0;
      }
      const fwdAgg: Record<string, { vol: number; skotKr: number }> = {};
      for (const r of lassRows) {
        if (!r.objekt_id) continue;
        const key = `${r.objekt_id}|${r.maskin_id}`;
        (fwdAgg[key] ||= { vol: 0, skotKr: 0 });
        const vol = Number(r.volym_m3sub) || 0;
        fwdAgg[key].vol += vol;
        fwdAgg[key].skotKr += skotAvstandKr(r.datum, r.korstracka_m || 0, vol, avstandList);
      }

      // ── Maskindelar per objekt: ackord (motorn) + timpeng (G15 × timpris) ──
      const delar: Record<string, MaskinDel[]> = {};
      const utanPrisPerObjekt: Record<string, number> = {};

      const laggTill = (oid: string, mid: string, roll: 'skördare' | 'skotare', ackord: number) => {
        const t = timpengForTidRows(tidPerKey[`${oid}|${mid}`] || [], timprisList);
        utanPrisPerObjekt[oid] = (utanPrisPerObjekt[oid] || 0) + t.timmarUtanPris;
        const avrakningsdag = objMeta[oid]?.skotning_avslutad || '';
        const tp = timprisList.find(p => p.maskin_id === mid && isValidOn(avrakningsdag, p.giltig_fran, p.giltig_till))
          || timprisList.find(p => p.maskin_id === mid);
        (delar[oid] ||= []).push({
          maskin_id: mid, roll, ackord,
          timpeng: t.timpeng || 0,
          timmar: t.timmar,
          timpris: tp?.timpris || 0,
        });
      };

      for (const [key, h] of Object.entries(harvAgg)) {
        const [oid, mid] = key.split('|');
        if (h.vol <= 0) continue;
        const medelstam = h.stammar > 0 ? h.vol / h.stammar : ANTAGEN_MEDELSTAM;
        const grundpris = lookupAcordPris(medelstam, acordList)?.pris_skordare || 0;
        const extra = (objSortKr[oid] || 0) + (objTraktKr[oid] || 0);
        const meta = objMeta[oid];
        const undTp = timprisList.find(p => p.maskin_id === mid)?.timpris || 0;
        const und = tillampaTimpengUndantag(h.vol, meta?.timpeng_undantag_timmar_skordare, meta?.timpeng_undantag_dra_skordare !== false, meta?.timpeng_undantag_volym, undTp);
        laggTill(oid, mid, 'skördare', und.volymEfterUndantag * (grundpris + extra) + und.undantagKr);
      }
      for (const [key, f] of Object.entries(fwdAgg)) {
        const [oid, mid] = key.split('|');
        if (f.vol <= 0) continue;
        const medelstam = objMedelstam[oid] || ANTAGEN_MEDELSTAM;
        const grundpris = lookupAcordPris(medelstam, acordList)?.pris_skotare || 0;
        const extra = (objSortKr[oid] || 0) + (objTraktKr[oid] || 0);
        const meta = objMeta[oid];
        const undTp = timprisList.find(p => p.maskin_id === mid)?.timpris || 0;
        const und = tillampaTimpengUndantag(f.vol, meta?.timpeng_undantag_timmar_skotare, meta?.timpeng_undantag_dra_skotare !== false, meta?.timpeng_undantag_volym, undTp);
        laggTill(oid, mid, 'skotare', und.volymEfterUndantag * (grundpris + extra) + f.skotKr + und.undantagKr);
      }

      const rader: ObjektRad[] = valda.map((o: any) => {
        const m = (delar[o.objekt_id] || []).sort((a, b) => b.ackord - a.ackord);
        const ackord = m.reduce((s2, d) => s2 + d.ackord, 0);
        const timpeng = m.reduce((s2, d) => s2 + d.timpeng, 0);
        const skordadVol = objVol[o.objekt_id]?.vol || 0;
        const skotadVol = m.filter(d => d.roll === 'skotare')
          .reduce((s2, d) => s2 + (fwdAgg[`${o.objekt_id}|${d.maskin_id}`]?.vol || 0), 0);
        const volym = skordadVol > 0 ? skordadVol : skotadVol;
        const diff = ackord - timpeng;
        return {
          objekt_id: o.objekt_id,
          namn: o.object_name || o.vo_nummer || o.objekt_id,
          volym,
          ackord,
          timpeng,
          diff,
          krPerM3: volym > 0 ? diff / volym : null,
          timmarUtanPris: utanPrisPerObjekt[o.objekt_id] || 0,
          maskiner: m,
        };
      }).sort((a, b) => b.diff - a.diff);

      // Halt jämförelse (timmar utan timpris, t.ex. 2025-arbete före prislistans
      // start) skevar diffen med hela den saknade timpeng-sidan — ut ur talen.
      setObjektRader(rader.filter(o => o.timmarUtanPris <= 0.5));
      setEjJamforbara(rader.filter(o => o.timmarUtanPris > 0.5).map(o => ({ namn: o.namn, timmar: o.timmarUtanPris })));
      setVantarNamn(vantar.map((o: any) => o.object_name || o.vo_nummer || o.objekt_id));
      setTimpengAntal(timpengIPeriod.length);
      setMaskinNamnMap(maskinMap);
    } catch (err: any) {
      console.error('MotAckord: fetch error', err);
      setError(err?.message || String(err));
      setObjektRader([]);
    }
    setLoading(false);
  }, [period, periodOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Aggregat ──
  const sumDiff = objektRader.reduce((s2, o) => s2 + o.diff, 0);

  const maskinAgg: MaskinAgg[] = (() => {
    const agg: Record<string, MaskinAgg> = {};
    for (const o of objektRader) for (const d of o.maskiner) {
      (agg[d.maskin_id] ||= { maskin_id: d.maskin_id, ackord: 0, timpeng: 0, timmar: 0 });
      agg[d.maskin_id].ackord += d.ackord;
      agg[d.maskin_id].timpeng += d.timpeng;
      agg[d.maskin_id].timmar += d.timmar;
    }
    return Object.values(agg).sort((a, b) => (b.ackord - b.timpeng) - (a.ackord - a.timpeng));
  })();

  // Namnvisning — rollparentesen bort; maskin_id skiljer dubbletter (två H8E)
  const rensaNamn = (namn: string) => namn.replace(/\s*\((skördare|skotare)\)\s*$/i, '');
  const visaMaskin = (mid: string) => {
    const namn = rensaNamn(maskinNamnMap[mid]?.namn || mid);
    const dubblett = Object.entries(maskinNamnMap).some(([id, m]) => id !== mid && rensaNamn(m.namn) === namn);
    return { namn, id: dubblett ? mid : null };
  };

  const s = {
    page: { background: '#111110', minHeight: '100vh', paddingTop: 24, paddingBottom: 120, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
    filterBar: { display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: 8 } as const,
    periodBtn: { border: 'none', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '5px 12px', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#7a7a72', cursor: 'pointer' } as const,
    periodBtnActive: { background: 'rgba(255,255,255,0.12)', color: '#e8e8e4' } as const,
    arrow: { border: 'none', background: 'none', color: '#7a7a72', fontSize: 16, cursor: 'pointer', padding: '4px 8px' } as const,
    label: { fontSize: 12, fontWeight: 600, color: '#e8e8e4', minWidth: 104, textAlign: 'center' as const },
    card: { background: '#1a1a18', borderRadius: 14 } as const,
    sectionTitle: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginBottom: 10, marginTop: 32, padding: '0 4px' } as const,
    sheetH: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginBottom: 4 } as const,
  };

  const sheetShell = (onClose: () => void, children: React.ReactNode) => (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: '#1a1a18', borderRadius: '20px 20px 0 0',
        padding: '12px 20px calc(28px + env(safe-area-inset-bottom))', maxHeight: '80vh', overflowY: 'auto',
        borderTop: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
        fontFamily: "'Geist', system-ui, sans-serif", color: '#e8e8e4',
      }}>
        <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '4px auto 18px' }} />
        {children}
        <button onClick={onClose} style={{
          marginTop: 22, width: '100%', background: '#000', color: '#fff',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
          padding: '12px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
        }}>Stäng</button>
      </div>
    </>
  );

  return (
    <div style={s.page}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600&display=swap" />

      {/* Bara Månad/Kvartal/År — inget objekt avräknas på en dag */}
      <div style={s.filterBar}>
        {(['M', 'K', 'A'] as PeriodType[]).map(p => (
          <button key={p} style={{ ...s.periodBtn, ...(period === p ? s.periodBtnActive : {}) }}
            onClick={() => { setPeriod(p); setPeriodOffset(0); }}>
            {p === 'M' ? 'Månad' : p === 'K' ? 'Kvartal' : 'År'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={s.arrow} aria-label="Föregående period" onClick={() => setPeriodOffset(o => o - 1)}>&#8249;</button>
        <span style={s.label}>{getPeriodLabel(period, periodOffset)}</span>
        <button style={s.arrow} aria-label="Nästa period" onClick={() => setPeriodOffset(o => o + 1)}>&#8250;</button>
        <button aria-label="Om beräkningen" onClick={() => setInfoOpen(true)} style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(255,255,255,0.08)', border: 'none', color: '#7a7a72',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontStyle: 'italic', lineHeight: 1,
        }}>i</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72' }}>Laddar...</div>}

      {!loading && error && (
        <div style={{ margin: 16, padding: 14, background: `rgba(${ROD},0.08)`, border: `1px solid rgba(${ROD},0.3)`, color: 'rgba(255,160,160,0.95)', borderRadius: 10, fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Kunde inte läsa ackordsdata</div>
          <div>{error}</div>
          <button onClick={fetchData} style={{ marginTop: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#e8e8e4', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>Försök igen</button>
        </div>
      )}

      {!loading && !error && (
        <div style={{ padding: '0 16px' }}>
          {objektRader.length === 0 ? (
            /* Ärligt tomt — inte +0 kr som ser ut som fakta */
            <div style={{ textAlign: 'center', padding: '56px 16px 8px' }}>
              <div style={{ fontSize: 13, color: '#7a7a72' }}>
                Inga {ejJamforbara.length > 0 ? 'jämförbara ' : ''}avräknade objekt i {getPeriodLabel(period, periodOffset)}
              </div>
            </div>
          ) : (
            /* Hero — periodens totala överskott mot timpeng */
            <div style={{ textAlign: 'center', padding: '56px 8px 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: '#7a7a72' }}>
                {sumDiff >= 0 ? 'Över timpeng' : 'Under timpeng'}
              </div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 44, lineHeight: 1.1, fontWeight: 500, color: diffColor(sumDiff), marginTop: 10, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                {fmtDiff(sumDiff)} kr
              </div>
              <div style={{ fontSize: 13, color: '#bfcab9', marginTop: 10 }}>
                {objektRader.length} objekt avräknade
              </div>
            </div>
          )}

          {/* Preliminärt — bärnsten, aldrig i talen */}
          {vantarNamn.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 999,
                background: `rgba(${BARNSTEN},0.10)`, color: `rgba(${BARNSTEN},0.85)`,
                fontSize: 11, fontWeight: 500,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: `rgba(${BARNSTEN},0.8)`, flexShrink: 0 }} />
                {vantarNamn.length} preliminär{vantarNamn.length === 1 ? 't' : 'a'} objekt ej med
              </div>
            </div>
          )}

          {/* Halt jämförelse — nedtonat, utanför talen (annars byter heron tecken) */}
          {ejJamforbara.length > 0 && (
            <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 16, padding: '0 8px', lineHeight: 1.6, textAlign: 'center' }}>
              {ejJamforbara.map((o, i) => (
                <div key={i}>{o.namn} — {fmtTim(o.timmar)} h saknar timpris, kan inte jämföras ärligt. Står utanför talen.</div>
              ))}
            </div>
          )}

          {objektRader.length > 0 && (
            <>
              {/* Per objekt */}
              <div style={s.sectionTitle}>Per objekt</div>
              <div style={{ ...s.card, padding: '0 16px' }}>
                {objektRader.map((o, i) => (
                  <div key={o.objekt_id} onClick={() => setSheetObjekt(o)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', cursor: 'pointer',
                    borderBottom: i < objektRader.length - 1 ? '0.5px solid rgba(255,255,255,0.07)' : 'none',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8e4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.namn}</div>
                      <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 4 }}>{Math.round(o.volym).toLocaleString('sv-SE')} m³fub · {formatKr(o.ackord)} ackord</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: diffColor(o.diff), fontVariantNumeric: 'tabular-nums' }}>
                        {o.krPerM3 != null ? `${fmtDiff(o.krPerM3)} kr/m³` : '—'}
                      </div>
                      <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>{fmtDiff(o.diff)} kr</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Per maskin */}
              <div style={s.sectionTitle}>Per maskin</div>
              <div style={{ ...s.card, padding: '0 16px' }}>
                {maskinAgg.map((m, i) => {
                  const v = visaMaskin(m.maskin_id);
                  const diff = m.ackord - m.timpeng;
                  const krPerTim = m.timmar > 0 ? m.ackord / m.timmar : null;
                  const osaker = m.timmar < OSAKER_TIM;
                  return (
                    <div key={m.maskin_id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0',
                      borderBottom: i < maskinAgg.length - 1 ? '0.5px solid rgba(255,255,255,0.07)' : 'none',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8e4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.namn}{v.id && <span style={{ color: '#7a7a72', fontWeight: 400 }}> · {v.id}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 4 }}>
                          {krPerTim != null
                            ? <>ackord motsv. {Math.round(krPerTim).toLocaleString('sv-SE')} kr/tim · {fmtTim(m.timmar)} tim{osaker && ' — osäkert'}</>
                            : 'inga G15-timmar registrerade'}
                        </div>
                      </div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: diffColor(diff), fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                        {fmtDiff(diff)} kr
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Timpeng-objekt — ingen jämförelse */}
          {timpengAntal > 0 && (
            <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 16, padding: '0 4px', textAlign: 'center' }}>
              {timpengAntal} objekt avräknade på timpeng i perioden — ingen ackordjämförelse.
            </div>
          )}

          {/* Väntar på avräkning — EN nedtonad rad, expanderbar. Aldrig i talen. */}
          {vantarNamn.length > 0 && (
            <div style={{ ...s.card, marginTop: 24, padding: '0 16px' }}>
              <div onClick={() => setVantarOpen(v => !v)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0', cursor: 'pointer',
              }}>
                <span style={{ fontSize: 13, color: '#7a7a72', flex: 1 }}>Väntar på avräkning</span>
                <span style={{ fontSize: 13, color: '#7a7a72', fontVariantNumeric: 'tabular-nums' }}>{vantarNamn.length}</span>
                <span style={{ fontSize: 11, color: '#7a7a72', transform: vantarOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
              </div>
              {vantarOpen && (
                <div style={{ paddingBottom: 10, borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
                  {vantarNamn.map((n, i) => (
                    <div key={i} style={{ padding: '9px 0 0', fontSize: 12, color: '#7a7a72' }}>{n}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Objekt-detalj-sheet */}
      {sheetObjekt && sheetShell(() => setSheetObjekt(null), (() => {
        const o = sheetObjekt;
        const skordAckord = o.maskiner.filter(d => d.roll === 'skördare').reduce((x, d) => x + d.ackord, 0);
        const skotAckord = o.maskiner.filter(d => d.roll === 'skotare').reduce((x, d) => x + d.ackord, 0);
        const tot = skordAckord + skotAckord;
        return (
          <>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 2 }}>{o.namn}</div>
            <div style={{ fontSize: 12, color: '#7a7a72', marginBottom: 16 }}>
              {formatKr(o.ackord)} ackord · {formatKr(o.timpeng)} timpeng · <span style={{ color: diffColor(o.diff) }}>{fmtDiff(o.diff)} kr</span>
            </div>

            {tot > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={s.sheetH}>Fördelning av ackordet</div>
                <div style={{ fontSize: 13, color: '#bfcab9' }}>
                  Skördare {Math.round(skordAckord / tot * 100)} % · Skotare {Math.round(skotAckord / tot * 100)} %
                </div>
              </div>
            )}

            <div style={s.sheetH}>Per maskin — timpeng mot ackord i kr/tim</div>
            {o.maskiner.map(d => {
              const v = visaMaskin(d.maskin_id);
              const krPerTim = d.timmar > 0 ? d.ackord / d.timmar : null;
              const osaker = d.timmar < OSAKER_TIM;
              return (
                <div key={d.maskin_id} style={{ padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {v.namn}{v.id && <span style={{ color: '#7a7a72', fontWeight: 400 }}> · {v.id}</span>}
                    <span style={{ color: '#7a7a72', fontWeight: 400 }}> · {d.roll}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#bfcab9', marginTop: 3 }}>
                    {krPerTim != null ? (
                      <>timpeng {Math.round(d.timpris).toLocaleString('sv-SE')} → ackord motsv. <span style={{ color: diffColor(krPerTim - d.timpris) }}>{Math.round(krPerTim).toLocaleString('sv-SE')}</span> kr/tim</>
                    ) : (
                      <>inga G15-timmar — kr/tim kan inte räknas</>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>
                    {fmtTim(d.timmar)} tim{osaker && d.timmar > 0 && ' — osäkert'} · {formatKr(d.ackord)} ackord
                  </div>
                </div>
              );
            })}
          </>
        );
      })())}

      {/* (i)-sheet */}
      {infoOpen && sheetShell(() => setInfoOpen(false), (
        <>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>Mot ackord — hur räknas det?</div>
          <div style={{ fontSize: 12, color: '#7a7a72', marginBottom: 18 }}>Vad avräknade objekt gav på ackord, mot vad samma arbete hade gett på timpeng.</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: '#bfcab9', display: 'grid', gap: 14 }}>
            <div>
              <div style={s.sheetH}>Bara avräknade objekt</div>
              Ett objekt räknas när BÅDE skördning och skotning är avslutade, i den period skotningen avslutades. Hela objektet räknas då — allt arbete, oavsett när det utfördes. Preliminära objekt (ett moment kvar) står nedtonade under &quot;Väntar på avräkning&quot; och ingår aldrig i talen.
            </div>
            <div>
              <div style={s.sheetH}>Ackord</div>
              Skördad volym × skördarpris och skotad volym × skotarpris per närmaste medelstam, plus trakt-, sortiment- och skotningsavståndstillägg — samma motor som per-objekt-fliken. Terräng- och flyttersättning ingår inte ännu.
            </div>
            <div>
              <div style={s.sheetH}>Timpeng-jämförelsen</div>
              G15-timmar (processing + terräng) × maskinens timpris. Grönt = ackordet gav mer än timpeng, rött = mindre. Objektets kr/m³ = (ackord − timpeng) / skördad volym (skotad volym när skördardata saknas, t.ex. GROT).
            </div>
            <div>
              <div style={s.sheetH}>Osäkert-märkningen</div>
              kr/tim delar på timmar — under {OSAKER_TIM} G15-timmar är talet brus och märks &quot;osäkert&quot;. Gallring och timpeng-flaggade objekt körs redan på timpeng och har ingen jämförelse.
            </div>
            <div>
              <div style={s.sheetH}>Kan inte jämföras</div>
              Objekt med G15-timmar som saknar giltigt timpris (t.ex. arbete före prislistans start) får en halt timpeng-sida som kan vända hela resultatet — de står nedtonade utanför talen tills timpris finns för perioden.
            </div>
          </div>
        </>
      ))}

      <EkonomiBottomNav />
    </div>
  );
}
