'use client';

// Ekonomiöversikten — svarar på EN fråga: "hur mycket körde vi in?"
// Total överst, per maskin därunder. Ingen kostnad, ingen vinst, ingen
// redigering — det hör hemma i andra flikar/steg.
//
// Intäkt räknas av acordmotorn (lib/ekonomi/acord.ts) med exakt samma väg
// som per-objekt-fliken: ackord löpande på volym, timpeng för gallring och
// timpeng-flaggade objekt. Vyn aggregerar bara.
//
// PRELIMINÄRT: ett ackordobjekt är avräknat först när BÅDA
// dim_objekt.skordning_avslutad och skotning_avslutad är satta. Preliminär
// intäkt ingår i summan men märks — dämpat, inte larmigt.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { hamtaExkluderadeObjektId, utanExkluderade } from '@/lib/objekt/exkludera';
import {
  type MaskinTimpris, type AcordPris, type AvstandConfig, type TraktBracket, type SortConfig,
  lookupAcordPris, traktTillagg, sortimentTillagg, skotAvstandKr,
  timpengForTidRows, ANTAGEN_MEDELSTAM, tillampaTimpengUndantag,
} from '@/lib/ekonomi/acord';
import { type PeriodType, getPeriodDates, getPeriodLabel, fetchAllRows } from '@/lib/ekonomi/period';
import EkonomiBottomNav from './EkonomiBottomNav';

type MaskinAgg = {
  maskin_id: string;
  maskin_namn: string;
  maskin_typ: 'Harvester' | 'Forwarder' | null;
  volym: number;          // skördad (harvester) resp. skotad (forwarder) m³fub
  intakt: number;
  prel: number;           // del av intäkten från ej slutavräknade ackordobjekt
  timmarUtanPris: number; // timpeng-timmar utan datumgiltig prisrad — ingår EJ i intäkten
};

function formatKr(n: number) { return `${Math.round(n).toLocaleString('sv-SE')} kr`; }
function formatVol(n: number) { return `${Math.round(n).toLocaleString('sv-SE')} m³fub`; }

export default function EkonomiClient() {
  const [period, setPeriod] = useState<PeriodType>('M');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maskiner, setMaskiner] = useState<MaskinAgg[]>([]);
  const [skordatVol, setSkordatVol] = useState(0);
  const [skotatVol, setSkotatVol] = useState(0);
  const [prelObjektAntal, setPrelObjektAntal] = useState(0);
  const [antagenVol, setAntagenVol] = useState(0);       // skotad volym prissatt på antagen medelstam
  const [ackordUtanPrislista, setAckordUtanPrislista] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);

      const [
        tidRowsRaa, prodRowsRaa, lassRowsRaa, sortRowsRaa,
        sortGruppRes, objRes, maskinRes, timprisRes,
        acordRes, avstandRes, sortTillaggRes, traktRes,
        exkluderade,
      ] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase.from('fakt_tid')
            .select('datum, maskin_id, objekt_id, processing_sek, terrain_sek')
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
        supabase.from('dim_objekt').select('objekt_id, object_name, huvudtyp, timpeng, skordning_avslutad, skotning_avslutad, timpeng_undantag_timmar_skordare, timpeng_undantag_timmar_skotare, timpeng_undantag_volym, timpeng_undantag_dra_skordare, timpeng_undantag_dra_skotare'),
        supabase.from('dim_maskin').select('maskin_id, modell, maskin_typ'),
        supabase.from('maskin_timpris').select('maskin_id, maskin_namn, timpris, giltig_fran, giltig_till'),
        supabase.from('acord_priser').select('medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till'),
        supabase.from('acord_skotningsavstand').select('grundavstand_m, kr_per_100m, giltig_fran, giltig_till').not('grundavstand_m', 'is', null),
        supabase.from('acord_sortiment_tillagg').select('grundantal, kr_per_extra_sortiment, giltig_fran, giltig_till').is('giltig_till', null).not('grundantal', 'is', null).order('giltig_fran', { ascending: false }).limit(1),
        supabase.from('acord_traktstorlek').select('fran_m3fub, till_m3fub, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('fran_m3fub'),
        hamtaExkluderadeObjektId(),
      ]);

      // Ärligt fel även på engångshämtningarna — en tyst tom dim-tabell
      // skulle ge 0-priser som ser ut som fakta.
      for (const res of [sortGruppRes, objRes, maskinRes, timprisRes, acordRes, avstandRes, sortTillaggRes, traktRes]) {
        if (res.error) throw new Error(res.error.message);
      }

      // Central exkludera-regel — Flyttobjekt/Service ska inte synas här
      const tidRows = utanExkluderade(tidRowsRaa, exkluderade);
      const prodRows = utanExkluderade(prodRowsRaa, exkluderade);
      const lassRows = utanExkluderade(lassRowsRaa, exkluderade);
      const sortRows = utanExkluderade(sortRowsRaa, exkluderade);

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
      const sortGruppMap: Record<string, string | null> = {};
      for (const g of (sortGruppRes.data || [])) sortGruppMap[g.sortiment_id] = g.grupp;

      // ── Samma pre-aggregering som per-objekt-fliken ──

      // Objektets totala skördade volym + medelstam (används av skotare & trakt-bracket)
      const objVol: Record<string, { vol: number; stammar: number }> = {};
      for (const r of prodRows) {
        if (!r.objekt_id) continue;
        if (!objVol[r.objekt_id]) objVol[r.objekt_id] = { vol: 0, stammar: 0 };
        objVol[r.objekt_id].vol += Number(r.volym_m3sub) || 0;
        objVol[r.objekt_id].stammar += Number(r.stammar) || 0;
      }
      const objMedelstam: Record<string, number> = {};
      for (const [objekt_id, v] of Object.entries(objVol)) {
        if (v.stammar > 0) objMedelstam[objekt_id] = v.vol / v.stammar;
      }

      // Distinkta sortimentgrupper per objekt → sortimenttillägg
      const objGrupper: Record<string, Set<string>> = {};
      for (const s of sortRows) {
        if (!s.objekt_id) continue;
        const g = sortGruppMap[s.sortiment_id];
        if (!g) continue;
        (objGrupper[s.objekt_id] ||= new Set()).add(g);
      }
      const objSortTillaggKr: Record<string, number> = {};
      const objTraktKr: Record<string, number> = {};
      for (const objekt_id of Object.keys({ ...objGrupper, ...objVol })) {
        objSortTillaggKr[objekt_id] = sortimentTillagg(objGrupper[objekt_id]?.size || 0, sortConf);
        objTraktKr[objekt_id] = traktTillagg(objVol[objekt_id]?.vol || 0, traktBrackets).krPerM3;
      }

      // G15-tid + timpeng per (objekt, maskin) via motorn (g15Sek inuti)
      const tidRowsPerKey: Record<string, any[]> = {};
      for (const r of tidRows) {
        if (!r.objekt_id) continue;
        (tidRowsPerKey[`${r.objekt_id}|${r.maskin_id}`] ||= []).push(r);
      }
      const tidAgg: Record<string, { timmar: number; timpeng: number; timmarUtanPris: number }> = {};
      for (const [key, rows] of Object.entries(tidRowsPerKey)) {
        const t = timpengForTidRows(rows, timprisList);
        tidAgg[key] = { timmar: t.timmar, timpeng: t.timpeng || 0, timmarUtanPris: t.timmarUtanPris };
      }

      // Produktion per (objekt, maskin)
      const harvAgg: Record<string, { vol: number; stammar: number }> = {};
      for (const r of prodRows) {
        if (!r.objekt_id) continue;
        const key = `${r.objekt_id}|${r.maskin_id}`;
        if (!harvAgg[key]) harvAgg[key] = { vol: 0, stammar: 0 };
        harvAgg[key].vol += Number(r.volym_m3sub) || 0;
        harvAgg[key].stammar += Number(r.stammar) || 0;
      }
      const fwdAgg: Record<string, { vol: number; skotavstand_kr: number }> = {};
      for (const r of lassRows) {
        if (!r.objekt_id) continue;
        const key = `${r.objekt_id}|${r.maskin_id}`;
        if (!fwdAgg[key]) fwdAgg[key] = { vol: 0, skotavstand_kr: 0 };
        const vol = Number(r.volym_m3sub) || 0;
        fwdAgg[key].vol += vol;
        fwdAgg[key].skotavstand_kr += skotAvstandKr(r.datum, r.korstracka_m || 0, vol, avstandList);
      }

      // ── Klassning & aggregering per maskin ──

      const somTimpeng = (objekt_id: string) => {
        const o = objMap[objekt_id];
        return (o?.huvudtyp || '') === 'Gallring' || o?.timpeng === true;
      };
      // Avräknat = BÅDA avslutsdatumen satta. Objekt utan dim-rad → preliminärt.
      const arAvraknad = (objekt_id: string) => {
        const o = objMap[objekt_id];
        return !!(o?.skordning_avslutad && o?.skotning_avslutad);
      };

      const agg: Record<string, MaskinAgg> = {};
      const maskinAgg = (maskin_id: string): MaskinAgg => {
        if (!agg[maskin_id]) {
          const minfo = maskinMap[maskin_id];
          const tp = timprisList.find(p => p.maskin_id === maskin_id);
          agg[maskin_id] = {
            maskin_id,
            maskin_namn: tp?.maskin_namn || minfo?.modell || maskin_id,
            maskin_typ: minfo?.maskin_typ || null,
            volym: 0, intakt: 0, prel: 0, timmarUtanPris: 0,
          };
        }
        return agg[maskin_id];
      };

      const prelObjekt = new Set<string>();
      let antagenVolSum = 0;
      let ackordRaderFinns = false;

      // Skördardelar
      for (const [key, h] of Object.entries(harvAgg)) {
        const [objekt_id, maskin_id] = key.split('|');
        if (h.vol <= 0) continue;
        const m = maskinAgg(maskin_id);
        m.volym += h.vol;
        const tid = tidAgg[key];
        if (somTimpeng(objekt_id)) {
          m.intakt += tid?.timpeng || 0;
          m.timmarUtanPris += tid?.timmarUtanPris || 0;
          continue;
        }
        ackordRaderFinns = true;
        const medelstam = h.stammar > 0 ? h.vol / h.stammar : ANTAGEN_MEDELSTAM;
        const grundpris = lookupAcordPris(medelstam, acordList)?.pris_skordare || 0;
        const extraKr = (objSortTillaggKr[objekt_id] || 0) + (objTraktKr[objekt_id] || 0);
        const meta = objMap[objekt_id];
        const undTimpris = timprisList.find(p => p.maskin_id === maskin_id)?.timpris || 0;
        const und = tillampaTimpengUndantag(h.vol, meta?.timpeng_undantag_timmar_skordare, meta?.timpeng_undantag_dra_skordare !== false, meta?.timpeng_undantag_volym, undTimpris);
        const acord = und.volymEfterUndantag * (grundpris + extraKr) + und.undantagKr;
        m.intakt += acord;
        if (!arAvraknad(objekt_id)) { m.prel += acord; prelObjekt.add(objekt_id); }
      }

      // Skotardelar
      for (const [key, f] of Object.entries(fwdAgg)) {
        const [objekt_id, maskin_id] = key.split('|');
        if (f.vol <= 0) continue;
        const m = maskinAgg(maskin_id);
        m.volym += f.vol;
        const tid = tidAgg[key];
        if (somTimpeng(objekt_id)) {
          m.intakt += tid?.timpeng || 0;
          m.timmarUtanPris += tid?.timmarUtanPris || 0;
          continue;
        }
        ackordRaderFinns = true;
        const harMedelstam = objMedelstam[objekt_id] != null;
        if (!harMedelstam) antagenVolSum += f.vol;
        const medelstam = objMedelstam[objekt_id] || ANTAGEN_MEDELSTAM;
        const grundpris = lookupAcordPris(medelstam, acordList)?.pris_skotare || 0;
        const extraKr = (objSortTillaggKr[objekt_id] || 0) + (objTraktKr[objekt_id] || 0);
        const metaF = objMap[objekt_id];
        const undTimprisF = timprisList.find(p => p.maskin_id === maskin_id)?.timpris || 0;
        const undF = tillampaTimpengUndantag(f.vol, metaF?.timpeng_undantag_timmar_skotare, metaF?.timpeng_undantag_dra_skotare !== false, metaF?.timpeng_undantag_volym, undTimprisF);
        const acord = undF.volymEfterUndantag * (grundpris + extraKr) + f.skotavstand_kr + undF.undantagKr;
        m.intakt += acord;
        if (!arAvraknad(objekt_id)) { m.prel += acord; prelObjekt.add(objekt_id); }
      }

      // Timpeng-objekt med TID men utan produktion/lass i perioden — betald
      // tid är intäkt även utan volymrader (t.ex. väghuggning, timkörning).
      for (const [key, tid] of Object.entries(tidAgg)) {
        const [objekt_id, maskin_id] = key.split('|');
        if (harvAgg[key] || fwdAgg[key]) continue;
        if (!somTimpeng(objekt_id) || tid.timmar <= 0) continue;
        const m = maskinAgg(maskin_id);
        m.intakt += tid.timpeng;
        m.timmarUtanPris += tid.timmarUtanPris;
      }

      let skordat = 0, skotat = 0;
      for (const m of Object.values(agg)) {
        if (m.maskin_typ === 'Forwarder') skotat += m.volym;
        else skordat += m.volym;
      }

      setMaskiner(Object.values(agg).sort((a, b) => b.intakt - a.intakt));
      setSkordatVol(skordat);
      setSkotatVol(skotat);
      setPrelObjektAntal(prelObjekt.size);
      setAntagenVol(antagenVolSum);
      setAckordUtanPrislista(ackordRaderFinns && acordList.length === 0);
    } catch (err: any) {
      console.error('Ekonomi: fetch error', err);
      setError(err?.message || String(err));
      setMaskiner([]);
    }
    setLoading(false);
  }, [period, periodOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sumIntakt = maskiner.reduce((s, m) => s + m.intakt, 0);
  const sumPrel = maskiner.reduce((s, m) => s + m.prel, 0);
  const sumTimmarUtanPris = maskiner.reduce((s, m) => s + m.timmarUtanPris, 0);

  // Styles — matchar övriga ekonomiflikar
  const s = {
    page: { background: '#111110', minHeight: '100vh', paddingTop: 24, paddingBottom: 120, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" } as const,
    filterBar: { display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: 8 } as const,
    periodBtn: { border: 'none', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '5px 12px', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#7a7a72', cursor: 'pointer' } as const,
    periodBtnActive: { background: 'rgba(90,255,140,0.15)', color: 'rgba(90,255,140,0.9)' } as const,
    arrow: { border: 'none', background: 'none', color: '#7a7a72', fontSize: 16, cursor: 'pointer', padding: '4px 8px' } as const,
    label: { fontSize: 12, fontWeight: 600, color: '#e8e8e4', minWidth: 120, textAlign: 'center' as const },
    card: { background: '#1a1a18', borderRadius: 14, padding: 16 } as const,
    sectionTitle: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#7a7a72', marginBottom: 10, marginTop: 20, padding: '0 4px' } as const,
    prel: { fontSize: 11, color: '#7a7a72' } as const,
  };

  return (
    <div style={s.page}>
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Ekonomi</div>
        <div style={{ fontSize: 12, color: '#7a7a72', marginTop: 2 }}>Hur mycket vi körde in — per maskin, över tid.</div>
      </div>

      {/* Periodväxlare */}
      <div style={{ ...s.filterBar, marginTop: 16 }}>
        {(['D', 'V', 'M', 'K', 'A'] as PeriodType[]).map(p => (
          <button key={p} style={{ ...s.periodBtn, ...(period === p ? s.periodBtnActive : {}) }}
            onClick={() => { setPeriod(p); setPeriodOffset(0); }}>
            {p === 'D' ? 'Dag' : p === 'V' ? 'Vecka' : p === 'M' ? 'Månad' : p === 'K' ? 'Kvartal' : 'År'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={s.arrow} aria-label="Föregående period" onClick={() => setPeriodOffset(o => o - 1)}>&#8249;</button>
        <span style={s.label}>{getPeriodLabel(period, periodOffset)}</span>
        <button style={s.arrow} aria-label="Nästa period" onClick={() => setPeriodOffset(o => o + 1)}>&#8250;</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72' }}>Laddar...</div>}

      {!loading && error && (
        <div style={{ margin: 16, padding: 14, background: 'rgba(255,90,90,0.08)', border: '1px solid rgba(255,90,90,0.3)', color: 'rgba(255,160,160,0.95)', borderRadius: 10, fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Kunde inte läsa ekonomidata</div>
          <div>{error}</div>
          <button onClick={fetchData} style={{ marginTop: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#e8e8e4', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
            Försök igen
          </button>
        </div>
      )}

      {!loading && !error && maskiner.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: '#7a7a72', fontSize: 13 }}>Ingen data för perioden</div>
      )}

      {!loading && !error && maskiner.length > 0 && (
        <div style={{ padding: '0 16px' }}>
          {/* Total */}
          <div style={{ ...s.card, margin: '16px 0 0' }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#7a7a72' }}>Vi körde in</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 36, lineHeight: 1.15, fontWeight: 500, color: 'rgba(90,255,140,0.95)', marginTop: 4 }}>
              {formatKr(sumIntakt)}
            </div>
            <div style={{ fontSize: 12, color: '#bfcab9', marginTop: 6 }}>
              Skördat {formatVol(skordatVol)} · Skotat {formatVol(skotatVol)}
            </div>
            {sumPrel > 0 && (
              <div style={{ ...s.prel, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                {formatKr(sumPrel)} preliminärt · {prelObjektAntal} objekt ej slutavräknade
              </div>
            )}
          </div>

          {/* Ärlighetsrader — bara när de gäller */}
          {(ackordUtanPrislista || antagenVol > 0 || sumTimmarUtanPris > 0) && (
            <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 10, padding: '0 4px', lineHeight: 1.6 }}>
              {ackordUtanPrislista && (
                <div>Ackordprislista saknas — ackordintäkten kan inte beräknas och visas som 0 kr. Lägg upp priser i Inställningar.</div>
              )}
              {antagenVol > 0 && (
                <div>{formatVol(antagenVol)} skotat utan skördardata i perioden — prissatt med antagen medelstam {ANTAGEN_MEDELSTAM.toString().replace('.', ',')}.</div>
              )}
              {sumTimmarUtanPris > 0 && (
                <div>{sumTimmarUtanPris.toFixed(1).replace('.', ',')} h timpeng saknar timpris och ingår inte i intäkten. Sätt timpris i Inställningar.</div>
              )}
            </div>
          )}

          {/* Per maskin */}
          <div style={s.sectionTitle}>Per maskin</div>
          {maskiner.map(m => {
            const isHarv = m.maskin_typ !== 'Forwarder';
            const badgeColor = isHarv ? 'rgba(90,255,140,0.85)' : 'rgba(91,143,255,0.9)';
            const badgeBg = isHarv ? 'rgba(90,255,140,0.08)' : 'rgba(91,143,255,0.1)';
            return (
              <div key={m.maskin_id} style={{ ...s.card, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                      padding: '2px 6px', borderRadius: 4, color: badgeColor, background: badgeBg, flexShrink: 0,
                    }}>
                      {isHarv ? 'SKÖRD' : 'SKOT'}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.maskin_namn}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 4 }}>{formatVol(m.volym)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: '#e8e8e4', fontVariantNumeric: 'tabular-nums' }}>
                    {formatKr(m.intakt)}
                  </div>
                  {m.prel > 0 && <div style={{ ...s.prel, marginTop: 2 }}>{formatKr(m.prel)} prel.</div>}
                </div>
              </div>
            );
          })}

          <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 12, padding: '0 4px', lineHeight: 1.5 }}>
            Ackord löpande per maskin via acordmotorn: skördad volym × pris_skordare resp. skotad volym × pris_skotare
            (närmaste medelstam) + trakt-, sortiment- och skotningsavståndstillägg. Gallring och timpeng-flaggade objekt
            räknas som timpeng (G15-timmar × timpris). Preliminärt = ackordobjekt där skördning och skotning inte båda är
            avslutade — ingår i summan. Terräng- och flyttersättning ingår inte ännu.
          </div>
        </div>
      )}

      <EkonomiBottomNav />
    </div>
  );
}
