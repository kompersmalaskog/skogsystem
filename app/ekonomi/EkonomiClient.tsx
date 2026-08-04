'use client';

// Ekonomiöversikten — svarar på EN fråga: "hur mycket körde vi in?"
// Total överst, per maskin därunder. Ingen kostnad, ingen vinst, ingen
// redigering — det hör hemma i andra flikar/steg.
//
// Intäkt räknas av acordmotorn (lib/ekonomi/acord.ts) med exakt samma väg
// som per-objekt-fliken: ackord löpande på volym, timpeng för gallring och
// timpeng-flaggade objekt. Vyn aggregerar bara.
//
// PRELIMINÄRT: ett ackordobjekt är avräknat enligt centrala regeln i
// lib/objekt/avrakning (båda avslutsdatumen; egen skotning avräknas på
// skördningens avslut). Preliminär intäkt ingår i summan men märks —
// dämpat, inte larmigt.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { hamtaExkluderadeObjektId, utanExkluderade } from '@/lib/objekt/exkludera';
import { arSlutavraknad } from '@/lib/objekt/avrakning';
import { harledTyp } from '@/lib/objekt/typ';
import {
  type MaskinTimpris, type AcordPris, type AvstandConfig, type TraktBracket, type SortConfig,
  lookupAcordPris, traktTillagg, sortimentTillagg, skotAvstandKr,
  timpengForTidRows, ANTAGEN_MEDELSTAM, tillampaTimpengUndantag,
  fordelaSkotadVolymFrånDB, type SkotareManuellRad, ovrigtKrPerM3, type OvrigtRad,
} from '@/lib/ekonomi/acord';
import { type PeriodType, getPeriodDates, fetchAllRows } from '@/lib/ekonomi/period';
import {
  EkonomiSida, Periodvaxlare, Hero, MetaRad, Lista, ListRad,
  Laddar, FelRuta, Tomt, BARNSTEN,
} from './delade/mall';

// Intäkt per arbetstyp — vad kör vi in och på vilken sorts jobb. Byggd med
// EXAKT samma additioner som maskinAgg (annan grupperingsnyckel) — summan
// över typerna är per konstruktion hero-totalen.
type ArbetstypAgg = {
  typ: string;            // slutavverkning | gallring | grot | energiklippning | okant
  intakt: number;
  ackordKr: number;       // intäkt från ackordobjekt
  timpengKr: number;      // intäkt från timpeng-/gallringsobjekt
  skordadVol: number;     // avverkad volym (slutavverkningens enhet)
  timmar: number;         // periodens G15-timmar (timpeng-typernas enhet)
  ackordTimmar: number;
  timpengTimmar: number;
  ackordVol: number;      // skördad volym i ackorddelen (uppfällningen)
};

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
  const [avverkadVol, setAvverkadVol] = useState(0);     // heron: per objekt skördad, skotad som fallback
  const [skordatVol, setSkordatVol] = useState(0);
  const [skotatVol, setSkotatVol] = useState(0);
  const [prelObjektAntal, setPrelObjektAntal] = useState(0);
  const [antagenVol, setAntagenVol] = useState(0);       // skotad volym prissatt på antagen medelstam
  const [ackordUtanPrislista, setAckordUtanPrislista] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);        // (i)-sheeten med beräkningsförklaringen
  const [arbetstyper, setArbetstyper] = useState<ArbetstypAgg[]>([]);
  const [listVal, setListVal] = useState<'arbetstyp' | 'maskin'>('arbetstyp');
  const [oppenTyp, setOppenTyp] = useState<string | null>(null);   // uppfälld arbetstypsrad

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);

      const [
        tidRowsRaa, prodRowsRaa, lassRowsRaa, sortRowsRaa,
        sortGruppRes, objRes, maskinRes, timprisRes,
        acordRes, avstandRes, sortTillaggRes, traktRes,
        ovrigtRes,
        exkluderade,
      ] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase.from('fakt_tid')
            .select('datum, maskin_id, objekt_id, processing_sek, terrain_sek, other_work_sek')
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
        supabase.from('dim_objekt').select('objekt_id, object_name, huvudtyp, atgard, risskotning, timpeng, skordning_avslutad, skotning_avslutad, egen_skotning, skotad_volym_manuell, medelstam_manuell, sortiment_grupper_manuell, skotavstand_manuell, terrang_kr_manuell, timpeng_undantag_timmar_skordare, timpeng_undantag_timmar_skotare, timpeng_undantag_volym, timpeng_undantag_dra_skordare, timpeng_undantag_dra_skotare'),
        supabase.from('dim_maskin').select('maskin_id, modell, maskin_typ'),
        supabase.from('maskin_timpris').select('maskin_id, maskin_namn, timpris, giltig_fran, giltig_till'),
        supabase.from('acord_priser').select('medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till'),
        supabase.from('acord_skotningsavstand').select('grundavstand_m, kr_per_100m, giltig_fran, giltig_till').not('grundavstand_m', 'is', null),
        supabase.from('acord_sortiment_tillagg').select('grundantal, kr_per_extra_sortiment, giltig_fran, giltig_till').is('giltig_till', null).not('grundantal', 'is', null).order('giltig_fran', { ascending: false }).limit(1),
        supabase.from('acord_traktstorlek').select('fran_m3fub, till_m3fub, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('fran_m3fub'),
        supabase.from('acord_ovrigt').select('nyckel, varde, giltig_fran, giltig_till'),
        hamtaExkluderadeObjektId(),
      ]);

      // Ärligt fel även på engångshämtningarna — en tyst tom dim-tabell
      // skulle ge 0-priser som ser ut som fakta.
      for (const res of [sortGruppRes, objRes, maskinRes, timprisRes, acordRes, avstandRes, sortTillaggRes, traktRes, ovrigtRes]) {
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
      // Ackordgrund-overrides (dim_objekt.*_manuell, sätts i /redigering) —
      // NULL = auto. Samma regler som /ekonomi/mot-ackord.
      const grupperFor = (oid: string) => {
        const man = objMap[oid]?.sortiment_grupper_manuell;
        return man != null ? Number(man) : (objGrupper[oid]?.size || 0);
      };
      const medelstamOverride = (oid: string): number | null => {
        const man = Number(objMap[oid]?.medelstam_manuell);
        return man > 0 ? man : null;
      };
      // Kvalitetssäkring (alltid) + terräng (manuellt val, annars Normal = 0) —
      // taxor ur prislistan, uppslag på periodslutet. Funktion (inte map) så
      // även objekt utan produktion/sortiment (GROT/skotare-only) täcks.
      const ovrigtList: OvrigtRad[] = ovrigtRes.data || [];
      const ovrigKrFor = (oid: string) =>
        ovrigtKrPerM3('kvalitetssakring', ovrigtList, end)
        + (Number(objMap[oid]?.terrang_kr_manuell) || 0);

      const objSortTillaggKr: Record<string, number> = {};
      const objTraktKr: Record<string, number> = {};
      for (const objekt_id of Object.keys({ ...objGrupper, ...objVol })) {
        objSortTillaggKr[objekt_id] = sortimentTillagg(grupperFor(objekt_id), sortConf);
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
      // Skotarvolym: manuell korrigering (dim_objekt.skotad_volym_manuell)
      // gäller när satt — FPR-lassen läcker. Fördelningen kräver objektets
      // HELA historik (annars dubbelräknas volymen mellan perioder), så för
      // korrigerade objekt hämtas all lass/skotartid och periodens delar
      // filtreras fram. Skotavståndstillägget räknas alltid ur faktiska lass.
      // Samma motorfunktion som /ekonomi/mot-ackord — vyerna får aldrig visa
      // olika skotarvolym för samma objekt.
      const manuellObjekt = (objRes.data || []).filter((o: any) =>
        !exkluderade.has(o.objekt_id) && Number(o.skotad_volym_manuell) > 0);
      const manuellIds = new Set<string>(manuellObjekt.map((o: any) => o.objekt_id));
      const manuellPeriodDelar: Record<string, number> = {}; // `${objekt}|${maskin}` → volym i perioden
      if (manuellObjekt.length > 0) {
        const idList = manuellObjekt.map((o: any) => o.objekt_id);
        const [helaLass, helaTid, skotareManuellRes] = await Promise.all([
          fetchAllRows((from, to) =>
            supabase.from('fakt_lass')
              .select('datum, maskin_id, objekt_id, volym_m3sub')
              .in('objekt_id', idList).range(from, to)
          ),
          fetchAllRows((from, to) =>
            supabase.from('fakt_tid')
              .select('datum, maskin_id, objekt_id, processing_sek, terrain_sek, other_work_sek')
              .in('objekt_id', idList).range(from, to)
          ),
          supabase.from('skotare_objekt_manuell')
            .select('objekt_id, maskin_id, volym_m3')
            .in('objekt_id', idList),
        ]);
        const manuellRaderPerObjekt = new Map<string, SkotareManuellRad[]>();
        for (const r of (skotareManuellRes.data || [])) {
          const arr = manuellRaderPerObjekt.get(r.objekt_id) ?? [];
          arr.push({ maskin_id: r.maskin_id, volym_m3: r.volym_m3 });
          manuellRaderPerObjekt.set(r.objekt_id, arr);
        }
        for (const o of manuellObjekt) {
          const oLass = helaLass.filter((r: any) => r.objekt_id === o.objekt_id);
          const oTid = helaTid.filter((r: any) => r.objekt_id === o.objekt_id && maskinMap[r.maskin_id]?.maskin_typ === 'Forwarder');
          // Fallback till dim_objekt-värdet om skotare_objekt_manuell-fetch misslyckades
          const manuellRader = manuellRaderPerObjekt.get(o.objekt_id)
            ?? [{ maskin_id: null, volym_m3: Number(o.skotad_volym_manuell) }];
          const f = fordelaSkotadVolymFrånDB(manuellRader, oLass, oTid);
          for (const d of f.delar) {
            if (d.datum < start || d.datum > end) continue;
            const key = `${o.objekt_id}|${d.maskin_id}`;
            manuellPeriodDelar[key] = (manuellPeriodDelar[key] || 0) + d.volym;
          }
        }
      }

      const fwdAgg: Record<string, { vol: number; skotavstand_kr: number }> = {};
      for (const r of lassRows) {
        if (!r.objekt_id) continue;
        const key = `${r.objekt_id}|${r.maskin_id}`;
        if (!fwdAgg[key]) fwdAgg[key] = { vol: 0, skotavstand_kr: 0 };
        const vol = Number(r.volym_m3sub) || 0;
        if (!manuellIds.has(r.objekt_id)) fwdAgg[key].vol += vol;
        fwdAgg[key].skotavstand_kr += skotAvstandKr(r.datum, r.korstracka_m || 0, vol, avstandList);
      }
      for (const [key, vol] of Object.entries(manuellPeriodDelar)) {
        if (!fwdAgg[key]) fwdAgg[key] = { vol: 0, skotavstand_kr: 0 };
        fwdAgg[key].vol += vol;
      }

      // Manuellt skotavstånd (override): tillägget räknas på periodens skotade
      // volym med det angivna avståndet — ersätter per-lass-summan för objektet.
      // Prisuppslag på periodslutet (en config-rad i taget är det normala).
      for (const o of (objRes.data || [])) {
        const avst = Number(o.skotavstand_manuell);
        if (!(avst > 0) || exkluderade.has(o.objekt_id)) continue;
        for (const [key, f] of Object.entries(fwdAgg)) {
          if (key.split('|')[0] !== o.objekt_id) continue;
          f.skotavstand_kr = skotAvstandKr(end, avst, f.vol, avstandList);
        }
      }

      // ── Klassning & aggregering per maskin ──

      const somTimpeng = (objekt_id: string) => {
        const o = objMap[objekt_id];
        return (o?.huvudtyp || '') === 'Gallring' || o?.timpeng === true;
      };
      // Central avräkningsregel (lib/objekt/avrakning) — egen skotning
      // avräknas på skördningens avslut. Objekt utan dim-rad → preliminärt.
      const arAvraknad = (objekt_id: string) => arSlutavraknad(objMap[objekt_id]);

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

      // ── Arbetstyp per objekt — atgard-regexen FÖRST (energiklippning bär
      // huvudtyp='Gallring' men ÄR energiklippning; fältet sätts för hand så
      // matchningen tål stavningsvariation), sedan centrala typregeln
      // (lib/objekt/typ — risskotning-flaggan + huvudtyp). Omatchat → 'okant',
      // egen dämpad rad, aldrig tyst bortkastat.
      const arbetstypFor = (objekt_id: string): string => {
        const o = objMap[objekt_id];
        if (/energi.*klipp/i.test(String(o?.atgard || ''))) return 'energiklippning';
        return harledTyp(o?.risskotning, o?.huvudtyp) ?? 'okant';
      };
      const typAggMap: Record<string, ArbetstypAgg> = {};
      const typAgg = (objekt_id: string): ArbetstypAgg => {
        const t = arbetstypFor(objekt_id);
        return (typAggMap[t] ||= {
          typ: t, intakt: 0, ackordKr: 0, timpengKr: 0,
          skordadVol: 0, timmar: 0, ackordTimmar: 0, timpengTimmar: 0, ackordVol: 0,
        });
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
        const ta = typAgg(objekt_id);
        ta.skordadVol += h.vol;
        if (somTimpeng(objekt_id)) {
          m.intakt += tid?.timpeng || 0;
          m.timmarUtanPris += tid?.timmarUtanPris || 0;
          ta.intakt += tid?.timpeng || 0;
          ta.timpengKr += tid?.timpeng || 0;
          continue;
        }
        ackordRaderFinns = true;
        const medelstam = medelstamOverride(objekt_id) ?? (h.stammar > 0 ? h.vol / h.stammar : ANTAGEN_MEDELSTAM);
        const grundpris = lookupAcordPris(medelstam, acordList)?.pris_skordare || 0;
        const extraKr = (objSortTillaggKr[objekt_id] || 0) + (objTraktKr[objekt_id] || 0) + ovrigKrFor(objekt_id);
        const meta = objMap[objekt_id];
        const undTimpris = timprisList.find(p => p.maskin_id === maskin_id)?.timpris || 0;
        const und = tillampaTimpengUndantag(h.vol, meta?.timpeng_undantag_timmar_skordare, meta?.timpeng_undantag_dra_skordare !== false, meta?.timpeng_undantag_volym, undTimpris);
        const acord = und.volymEfterUndantag * (grundpris + extraKr) + und.undantagKr;
        m.intakt += acord;
        ta.intakt += acord;
        ta.ackordKr += acord;
        ta.ackordVol += h.vol;
        if (!arAvraknad(objekt_id)) { m.prel += acord; prelObjekt.add(objekt_id); }
      }

      // Skotardelar
      for (const [key, f] of Object.entries(fwdAgg)) {
        const [objekt_id, maskin_id] = key.split('|');
        if (f.vol <= 0) continue;
        const m = maskinAgg(maskin_id);
        m.volym += f.vol;
        const tid = tidAgg[key];
        const taF = typAgg(objekt_id);
        if (somTimpeng(objekt_id)) {
          m.intakt += tid?.timpeng || 0;
          m.timmarUtanPris += tid?.timmarUtanPris || 0;
          taF.intakt += tid?.timpeng || 0;
          taF.timpengKr += tid?.timpeng || 0;
          continue;
        }
        ackordRaderFinns = true;
        const msMan = medelstamOverride(objekt_id);
        const harMedelstam = msMan != null || objMedelstam[objekt_id] != null;
        if (!harMedelstam) antagenVolSum += f.vol;
        const medelstam = msMan ?? (objMedelstam[objekt_id] || ANTAGEN_MEDELSTAM);
        const grundpris = lookupAcordPris(medelstam, acordList)?.pris_skotare || 0;
        const extraKr = (objSortTillaggKr[objekt_id] || 0) + (objTraktKr[objekt_id] || 0) + ovrigKrFor(objekt_id);
        const metaF = objMap[objekt_id];
        const undTimprisF = timprisList.find(p => p.maskin_id === maskin_id)?.timpris || 0;
        const undF = tillampaTimpengUndantag(f.vol, metaF?.timpeng_undantag_timmar_skotare, metaF?.timpeng_undantag_dra_skotare !== false, metaF?.timpeng_undantag_volym, undTimprisF);
        const acord = undF.volymEfterUndantag * (grundpris + extraKr) + f.skotavstand_kr + undF.undantagKr;
        m.intakt += acord;
        taF.intakt += acord;
        taF.ackordKr += acord;
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
        const taT = typAgg(objekt_id);
        taT.intakt += tid.timpeng;
        taT.timpengKr += tid.timpeng;
      }

      // Periodens G15-timmar per arbetstyp (enheten för timpeng-typerna).
      // Alla objektets timmar räknas — utfört arbete, ackord- resp. timpeng-hink.
      for (const [key, tid] of Object.entries(tidAgg)) {
        const [objekt_id] = key.split('|');
        if (tid.timmar <= 0 || !objMap[objekt_id]) continue;
        const taH = typAgg(objekt_id);
        taH.timmar += tid.timmar;
        if (somTimpeng(objekt_id)) taH.timpengTimmar += tid.timmar;
        else taH.ackordTimmar += tid.timmar;
      }

      let skordat = 0, skotat = 0;
      for (const m of Object.values(agg)) {
        if (m.maskin_typ === 'Forwarder') skotat += m.volym;
        else skordat += m.volym;
      }

      // AVVERKAD volym för heron: skördad + skotad är SAMMA virke genom två
      // maskiner — aldrig summera dem per objekt. Per objekt: skördad om den
      // finns, annars skotad (GROT/skotare-only-objekt saknar skördardata
      // och skulle annars försvinna ur totalen).
      const objSkotadPeriod: Record<string, number> = {};
      for (const [key, f] of Object.entries(fwdAgg)) {
        const oid = key.split('|')[0];
        objSkotadPeriod[oid] = (objSkotadPeriod[oid] || 0) + f.vol;
      }
      let avverkad = 0;
      for (const oid of Object.keys({ ...objVol, ...objSkotadPeriod })) {
        const sk = objVol[oid]?.vol || 0;
        avverkad += sk > 0 ? sk : (objSkotadPeriod[oid] || 0);
      }

      setMaskiner(Object.values(agg).sort((a, b) => b.intakt - a.intakt));
      // Okänt sist, övriga på intäkt — summan av typerna är per konstruktion
      // exakt hero-totalen (samma additioner som maskinAgg, bara annan nyckel)
      setArbetstyper(Object.values(typAggMap).sort((a, b) =>
        (a.typ === 'okant' ? 1 : 0) - (b.typ === 'okant' ? 1 : 0) || b.intakt - a.intakt));
      setAvverkadVol(avverkad);
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

  return (
    <EkonomiSida>
      {/* Periodväxlare — vyns översta rad; titeln bor i TopBar. (i) öppnar förklaringen. */}
      <Periodvaxlare
        perioder={['D', 'V', 'M', 'K', 'A']}
        period={period}
        offset={periodOffset}
        onPeriod={p => { setPeriod(p); setPeriodOffset(0); }}
        onOffset={setPeriodOffset}
        onInfo={() => setInfoOpen(true)}
      />

      {loading && <Laddar />}

      {!loading && error && (
        <FelRuta titel="Kunde inte läsa ekonomidata" fel={error} onRetry={fetchData} />
      )}

      {!loading && !error && maskiner.length === 0 && (
        <Tomt>Ingen data för perioden</Tomt>
      )}

      {!loading && !error && maskiner.length > 0 && (
        <div style={{ padding: '0 16px' }}>
          {/* Hero — appens hjärta: talet ensamt, centrerat, benvitt (magnitud, inte signerat) */}
          <Hero
            etikett="Vi körde in"
            varde={formatKr(sumIntakt)}
            under={
              <div style={{ fontSize: 13, color: '#bfcab9', marginTop: 10 }}>
                {formatVol(avverkadVol)}
              </div>
            }
          />
          {/* Preliminärt — metarad, ingen pill. Bärnsten-ordet bär meningen. */}
          <MetaRad delar={[
            sumPrel > 0 && { text: `${formatKr(sumPrel)} preliminärt`, barnsten: true },
            sumPrel > 0 && { text: `${prelObjektAntal} objekt ej slutavräknade` },
          ]} />

          {/* Larmrader — bara vid trasig konfiguration (förklaringar bor i (i)-sheeten) */}
          {(ackordUtanPrislista || sumTimmarUtanPris > 0) && (
            <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 16, padding: '0 8px', lineHeight: 1.6, textAlign: 'center' }}>
              {ackordUtanPrislista && (
                <div>Ackordprislista saknas — ackordintäkten kan inte beräknas och visas som 0 kr. Lägg upp priser i Inställningar.</div>
              )}
              {sumTimmarUtanPris > 0 && (
                <div>{sumTimmarUtanPris.toFixed(1).replace('.', ',')} h timpeng saknar timpris och ingår inte i intäkten. Sätt timpris i Inställningar.</div>
              )}
            </div>
          )}

          {/* Listval: Per arbetstyp (standard — vad kör vi in och på vilken
              sorts jobb) eller Per maskin. Båda byggs av SAMMA intäkts-
              additioner — de kan inte visa olika total. Samma understrukna
              textstil som periodväxlaren. */}
          <div style={{ display: 'flex', gap: 14, marginTop: 32, marginBottom: 10, padding: '0 4px' }}>
            {([['arbetstyp', 'Per arbetstyp'], ['maskin', 'Per maskin']] as ['arbetstyp' | 'maskin', string][]).map(([v, label]) => {
              const aktiv = listVal === v;
              return (
                <button key={v} onClick={() => setListVal(v)} style={{
                  border: 'none', background: 'none', padding: '4px 0 3px',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  color: aktiv ? '#e8e8e4' : '#7a7a72',
                  borderBottom: aktiv ? '1.5px solid #e8e8e4' : '1.5px solid transparent',
                }}>{label}</button>
              );
            })}
          </div>

          {listVal === 'arbetstyp' && (() => {
            const TYP_NAMN: Record<string, string> = {
              slutavverkning: 'Slutavverkning', gallring: 'Gallring', grot: 'GROT',
              energiklippning: 'Energiklippning', okant: 'Okänt',
            };
            const totalIntakt = arbetstyper.reduce((s2, t) => s2 + t.intakt, 0);
            const fmtTim2 = (n: number) => `${Math.round(n).toLocaleString('sv-SE')} G15-tim`;
            const synliga = arbetstyper.filter(t => t.intakt > 0 || t.timmar > 0);
            return (
              <Lista>
                {synliga.map((t, i) => {
                  const blandad = t.ackordKr > 0 && t.timpengKr > 0;
                  const etikett = blandad ? 'ackord · viss timpeng' : (t.ackordKr > 0 ? 'ackord' : 'timpeng');
                  const andel = totalIntakt > 0 ? t.intakt / totalIntakt : 0;
                  const okand = t.typ === 'okant';
                  const oppen = oppenTyp === t.typ;
                  return (
                    <ListRad key={t.typ}
                      rubrik={<>
                        {TYP_NAMN[t.typ] || t.typ}
                        <span style={{ color: '#7a7a72', fontWeight: 400, fontSize: 11 }}> · {etikett}</span>
                      </>}
                      rubrikFarg={okand ? '#7a7a72' : '#e8e8e4'}
                      /* Rätt enhet per typ — avverkad volym för slutavverkning,
                         G15-timmar för timpeng-typerna. Aldrig hopblandad volym. */
                      detalj={t.typ === 'slutavverkning'
                        ? `${Math.round(t.skordadVol).toLocaleString('sv-SE')} m³fub avverkat`
                        : fmtTim2(t.timmar)}
                      tal={formatKr(t.intakt)}
                      talFarg={okand ? '#7a7a72' : '#e8e8e4'}
                      stapelAndel={andel}
                      chevron={blandad}
                      oppen={oppen && blandad}
                      onClick={blandad ? () => setOppenTyp(oppen ? null : t.typ) : undefined}
                      sista={i === synliga.length - 1}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
                        <span style={{ color: '#7a7a72' }}>
                          Ackord · {t.typ === 'slutavverkning'
                            ? `${Math.round(t.ackordVol).toLocaleString('sv-SE')} m³fub`
                            : fmtTim2(t.ackordTimmar)}
                        </span>
                        <span style={{ color: '#e8e8e4', fontVariantNumeric: 'tabular-nums' }}>{formatKr(t.ackordKr)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
                        <span style={{ color: '#7a7a72' }}>Timpeng · {fmtTim2(t.timpengTimmar)}</span>
                        <span style={{ color: '#e8e8e4', fontVariantNumeric: 'tabular-nums' }}>{formatKr(t.timpengKr)}</span>
                      </div>
                    </ListRad>
                  );
                })}
              </Lista>
            );
          })()}

          {listVal === 'maskin' && (() => {
            // Rollparentesen ur prisnamnet ersätts av metaradens roll-text
            const rensaNamn = (namn: string) => namn.replace(/\s*\((skördare|skotare)\)\s*$/i, '');
            const namnAntal: Record<string, number> = {};
            for (const m of maskiner) {
              const n = rensaNamn(m.maskin_namn);
              namnAntal[n] = (namnAntal[n] || 0) + 1;
            }
            const maxIntakt = maskiner.reduce((mx, m) => Math.max(mx, m.intakt), 0);
            // EN lista, inte fem kort — rader med hårfin avdelare, ingen efter sista.
            // Stapeln = andel av periodens största maskin, på RADENS bredd.
            return (
              <Lista>
                {maskiner.map((m, i) => {
                  const namn = rensaNamn(m.maskin_namn);
                  const roll = m.maskin_typ === 'Forwarder' ? 'skotare' : 'skördare';
                  const andel = maxIntakt > 0 ? Math.max(0, Math.min(1, m.intakt / maxIntakt)) : 0;
                  return (
                    <ListRad key={m.maskin_id}
                      rubrik={<>
                        {namn}
                        {/* Två maskiner kan dela prisnamn (två H8E) — maskin_id är det som faktiskt skiljer dem */}
                        {namnAntal[namn] > 1 && <span style={{ color: '#7a7a72', fontWeight: 400 }}> · {m.maskin_id}</span>}
                      </>}
                      detalj={`${roll} · ${formatVol(m.volym)}`}
                      tal={formatKr(m.intakt)}
                      undertal={m.prel > 0 ? <span style={{ color: `rgba(${BARNSTEN},0.75)` }}>{formatKr(m.prel)} prel.</span> : undefined}
                      stapelAndel={andel}
                      sista={i === maskiner.length - 1}
                    />
                  );
                })}
              </Lista>
            );
          })()}

        </div>
      )}

      {/* (i)-sheet — förklaringen bor här, inte som textvägg i vyn */}
      {infoOpen && (
        <>
          <div onClick={() => setInfoOpen(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
            background: '#1a1a18', borderRadius: '20px 20px 0 0',
            padding: '12px 20px calc(28px + env(safe-area-inset-bottom))', maxHeight: '80vh', overflowY: 'auto',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
            fontFamily: "'Geist', system-ui, sans-serif", color: '#e8e8e4',
          }}>
            <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '4px auto 18px' }} />
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>Hur mycket körde vi in?</div>
            <div style={{ fontSize: 12, color: '#7a7a72', marginBottom: 18 }}>Intäkt per maskin för perioden — ackord löpande, timpeng där det gäller.</div>

            <div style={{ fontSize: 13, lineHeight: 1.6, color: '#bfcab9', display: 'grid', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#7a7a72', marginBottom: 4 }}>Volym i perioden</div>
                Hero-talet visar AVVERKAD volym: per objekt räknas skördad volym, eller skotad där skördardata saknas (GROT) — aldrig båda, eftersom samma virke passerar båda maskinerna. Skördat {formatVol(skordatVol)} · Skotat {formatVol(skotatVol)} — de visas var för sig här av just det skälet. Där FPR-lassen är ofullständiga och en manuell skotad volym är satt används den, fördelad över skotarens registrerade tid.
                {antagenVol > 0 && (
                  <> {formatVol(antagenVol)} av det skotade saknar skördardata i perioden och prissätts med antagen medelstam {ANTAGEN_MEDELSTAM.toString().replace('.', ',')}.</>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#7a7a72', marginBottom: 4 }}>Ackord</div>
                Skördad volym × skördarpris och skotad volym × skotarpris, uppslaget per närmaste medelstam i prislistan, plus trakt-, sortiment- och skotningsavståndstillägg. Terräng- och flyttersättning ingår inte ännu.
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#7a7a72', marginBottom: 4 }}>Timpeng</div>
                Gallring och timpeng-flaggade objekt räknas som G15-timmar × maskinens timpris i stället för ackord.
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: `rgba(${BARNSTEN},0.85)`, marginBottom: 4 }}>Preliminärt</div>
                Ackordobjekt där skördning och skotning inte båda är avslutade. Beloppet ingår i summan men kan ändras tills objektet är slutavräknat. Timpeng är aldrig preliminärt.
              </div>
            </div>

            <button onClick={() => setInfoOpen(false)} style={{
              marginTop: 22, width: '100%', background: '#000', color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
              padding: '12px 14px', fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
            }}>Stäng</button>
          </div>
        </>
      )}
    </EkonomiSida>
  );
}
