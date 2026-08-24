// Per-objekt-jämförelsen ackord mot timpeng — EN delad beräkning.
//
// Används av /ekonomi/mot-ackord (per objekt) och /ekonomi/per-klass
// (samma rader grupperade per medelstamklass). Vyerna får ALDRIG räkna
// själva — räknar två vyer olika för samma objekt är det en bugg, och
// den här filen finns för att göra den buggen omöjlig.
//
// Semantiken (se även kommentarerna i respektive block):
// - Urval: avräknade ackordobjekt (lib/objekt/avrakning), central
//   exkludera-regel, gallring/timpeng-flaggade utanför.
// - Hela objektets fakt-data (inget datumfilter) — objektet räknas helt,
//   en gång, i perioden det avräknades.
// - Ackord via acordmotorn: grundpris per närmaste medelstam + trakt-,
//   sortiment-, skotningsavstånds-, terräng- och kvalitetstillägg +
//   timpeng-undantag. Timpeng = G15 × timpris (manuell G15 när satt).
// - Halt jämförelse (timpris saknas / skotartid ofullständig) → objektet
//   får ejJamforbarOrsak och ska stå UTANFÖR talen i alla vyer.

import { supabase } from '@/lib/supabase';
import { hamtaExkluderadeObjektId } from '@/lib/objekt/exkludera';
import { arSlutavraknad, avrakningsdatum } from '@/lib/objekt/avrakning';
import {
  type MaskinTimpris, type AcordPris, type AvstandConfig, type TraktBracket, type SortConfig,
  isValidOn, lookupAcordPris, traktTillagg, sortimentTillagg, skotAvstandKr,
  timpengForTidRows, ANTAGEN_MEDELSTAM, tillampaTimpengUndantag,
  fordelaSkotadVolymFrånDB, type SkotareManuellRad, ovrigtKrPerM3, type OvrigtRad,
} from '@/lib/ekonomi/acord';
import { fetchAllRows } from '@/lib/ekonomi/period';
import { medelstamAuto, sortimentgrupperAuto, skotavstandVagtAuto } from '@/lib/ekonomi/ackordgrund';

// Under så här många G15-timmar är ett kr/tim- eller kr/m³-tal brus, inte
// fakta. Delas av kr/tim-märkningen (mot-ackord) och klass-märkningen
// (per-klass). Ändras tröskeln: uppdatera (i)-texterna i båda vyerna.
export const OSAKER_TIM = 15;

// Rimlighetsvakt (heuristik): en skotare gör normalt 15–40 m³/G15h.
// Implicerar skotarvolymen mer än så per timme kan tid- och volymsidan
// inte höra ihop (skotartiden ofullständig) → objektet kan inte jämföras.
export const MAX_SKOTAD_M3_PER_G15H = 60;

export type MaskinDel = {
  maskin_id: string;
  roll: 'skördare' | 'skotare';
  volym: number;          // delens ackordvolym (skördad resp. skotad m³fub)
  ackord: number;
  timpeng: number;
  timmar: number;
  timpris: number;        // gällande timpris vid avräkningsdatumet
  manuellTid: boolean;    // G15-timmarna är handsatta (redigeringsvyn), inte mätta
};
export type ObjektRad = {
  objekt_id: string;
  namn: string;
  volym: number;          // skördad m³fub, skotad som fallback (GROT)
  medelstam: number;      // objektets medelstam (override ?? mätt ?? antagen)
  klass: number | null;   // närmaste acord_priser-klass (prisuppslagets semantik)
  ackord: number;
  timpeng: number;
  diff: number;
  krPerM3: number | null; // null när volym saknas — visas som streck, aldrig 0
  egenSkotning: boolean;  // markägaren skotar — noll skotad volym är KORREKT
  ejJamforbarOrsak: string | null; // satt → objektet står utanför talen, med orsak
  // Ackordgrunden i läsläge — manuell=true renderas i bärnsten (färgregeln:
  // mätt i benvitt, manuellt/uppskattat i bärnsten)
  grund: { label: string; text: string; manuell: boolean }[];
  maskiner: MaskinDel[];
};

export type JamforelseData = {
  rader: ObjektRad[];                                 // jämförbara, sorterade på diff
  ejJamforbara: { namn: string; orsak: string }[];
  vantarNamn: string[];                               // prel: vårt moment kvar
  timpengAntal: number;                               // timpeng-objekt avräknade i perioden
  maskinNamnMap: Record<string, { namn: string; typ: string | null }>;
};

const fmtTim = (n: number) => n.toFixed(1).replace('.', ',');

export async function hamtaObjektJamforelse(start: string, end: string): Promise<JamforelseData> {
  const [objRes, maskinRes, timprisRes, acordRes, avstandRes, sortTillaggRes, traktRes, sortGruppRes, ovrigtRes, exkluderade] = await Promise.all([
    supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer, huvudtyp, timpeng, skordning_avslutad, skotning_avslutad, egen_skotning, skotad_volym_manuell, medelstam_manuell, sortiment_grupper_manuell, skotavstand_manuell, skordning_g15_manuell, skotning_g15_manuell, terrang_kr_manuell, timpeng_undantag_timmar_skordare, timpeng_undantag_timmar_skotare, timpeng_undantag_volym, timpeng_undantag_dra_skordare, timpeng_undantag_dra_skotare'),
    supabase.from('dim_maskin').select('maskin_id, modell, maskin_typ'),
    supabase.from('maskin_timpris').select('maskin_id, maskin_namn, timpris, giltig_fran, giltig_till'),
    supabase.from('acord_priser').select('medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till'),
    supabase.from('acord_skotningsavstand').select('grundavstand_m, kr_per_100m, giltig_fran, giltig_till').not('grundavstand_m', 'is', null),
    supabase.from('acord_sortiment_tillagg').select('grundantal, kr_per_extra_sortiment, giltig_fran, giltig_till').is('giltig_till', null).not('grundantal', 'is', null).order('giltig_fran', { ascending: false }).limit(1),
    supabase.from('acord_traktstorlek').select('fran_m3fub, till_m3fub, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('fran_m3fub'),
    supabase.from('dim_sortiment_grupp').select('sortiment_id, grupp'),
    supabase.from('acord_ovrigt').select('nyckel, varde, giltig_fran, giltig_till'),
    hamtaExkluderadeObjektId(),
  ]);
  for (const res of [objRes, maskinRes, timprisRes, acordRes, avstandRes, sortTillaggRes, traktRes, sortGruppRes, ovrigtRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const alla = (objRes.data || []).filter((o: any) => !exkluderade.has(o.objekt_id));
  const arTimpengObj = (o: any) => (o.huvudtyp || '') === 'Gallring' || o.timpeng === true;
  const iPerioden = (o: any) => {
    const d = avrakningsdatum(o);
    return d != null && d >= start && d <= end;
  };

  // Urvalet: ackordobjekt avräknade i perioden (central avräkningsregel —
  // egen skotning avräknas på skördningens avslut)
  const valda = alla.filter((o: any) => !arTimpengObj(o) && arSlutavraknad(o) && iPerioden(o));
  const timpengIPeriod = alla.filter((o: any) => arTimpengObj(o) && arSlutavraknad(o) && iPerioden(o));
  const vantar = alla.filter((o: any) => !arTimpengObj(o) && !arSlutavraknad(o) && (o.skordning_avslutad || o.skotning_avslutad));

  const maskinNamnMap: Record<string, { namn: string; typ: string | null }> = {};
  const timprisList: MaskinTimpris[] = timprisRes.data || [];
  for (const m of (maskinRes.data || [])) {
    const tp = timprisList.find(p => p.maskin_id === m.maskin_id);
    maskinNamnMap[m.maskin_id] = { namn: tp?.maskin_namn || m.modell || m.maskin_id, typ: m.maskin_typ || null };
  }

  const bas: JamforelseData = {
    rader: [],
    ejJamforbara: [],
    vantarNamn: vantar.map((o: any) => o.object_name || o.vo_nummer || o.objekt_id),
    timpengAntal: timpengIPeriod.length,
    maskinNamnMap,
  };
  if (valda.length === 0) return bas;

  const ids = valda.map((o: any) => o.objekt_id);

  // HELA objektets data — inget datumfilter; objektet räknas helt, en gång
  const [prodRows, lassRows, tidRows, sortRows, skotareManuellRes] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from('fakt_produktion')
        .select('datum, maskin_id, objekt_id, volym_m3sub, stammar')
        .in('objekt_id', ids).order('id').range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase.from('fakt_lass')
        .select('datum, maskin_id, objekt_id, volym_m3sub, korstracka_m')
        .in('objekt_id', ids).order('id').range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase.from('fakt_tid')
        .select('datum, maskin_id, objekt_id, processing_sek, terrain_sek, other_work_sek')
        .in('objekt_id', ids).order('id').range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase.from('fakt_sortiment')
        .select('objekt_id, sortiment_id')
        .in('objekt_id', ids).order('id').range(from, to)
    ),
    supabase.from('skotare_objekt_manuell')
      .select('objekt_id, maskin_id, volym_m3, g15_timmar')
      .in('objekt_id', ids),
  ]);
  const manuellRaderPerObjekt = new Map<string, SkotareManuellRad[]>();
  const volymManuellPerObjekt = new Map<string, number>();
  const g15ManuellPerObjekt = new Map<string, number>();
  for (const r of (skotareManuellRes.data || [])) {
    const arr = manuellRaderPerObjekt.get(r.objekt_id) ?? [];
    arr.push({ maskin_id: r.maskin_id, volym_m3: r.volym_m3 });
    manuellRaderPerObjekt.set(r.objekt_id, arr);
    if (r.maskin_id === null) {
      if ((r.volym_m3 ?? 0) > 0) volymManuellPerObjekt.set(r.objekt_id, Number(r.volym_m3));
      if ((r.g15_timmar ?? 0) > 0) g15ManuellPerObjekt.set(r.objekt_id, Number(r.g15_timmar));
    }
  }

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

  // ── Pre-aggregering (acordmotorns semantik) ──
  const objVol: Record<string, { vol: number; stammar: number }> = {};
  for (const r of prodRows) {
    if (!r.objekt_id) continue;
    (objVol[r.objekt_id] ||= { vol: 0, stammar: 0 });
    objVol[r.objekt_id].vol += Number(r.volym_m3sub) || 0;
    objVol[r.objekt_id].stammar += Number(r.stammar) || 0;
  }
  // Auto-delvärdena via delade helpers (lib/ekonomi/ackordgrund) — samma
  // uträkningar visas som auto-värden i redigeringens Ackordgrund-fält
  // och får aldrig drifta från vad ekonomin räknar på.
  const objMedelstam: Record<string, number> = {};
  for (const [oid, v] of Object.entries(objVol)) {
    const ms = medelstamAuto(v.vol, v.stammar);
    if (ms != null) objMedelstam[oid] = ms;
  }

  const sortPerObjekt: Record<string, any[]> = {};
  for (const s2 of sortRows) { if (s2.objekt_id) (sortPerObjekt[s2.objekt_id] ||= []).push(s2); }
  // Ackordgrund-overrides (dim_objekt.*_manuell) ersätter mätt/beräknat.
  const grupperFor = (oid: string) => {
    const man = objMeta[oid]?.sortiment_grupper_manuell;
    return man != null ? Number(man) : sortimentgrupperAuto(sortPerObjekt[oid] || [], sortGruppMap);
  };
  const medelstamOverride = (oid: string): number | null => {
    const man = Number(objMeta[oid]?.medelstam_manuell);
    return man > 0 ? man : null;
  };

  const ovrigtList: OvrigtRad[] = ovrigtRes.data || [];

  const objSortKr: Record<string, number> = {};
  const objTraktKr: Record<string, number> = {};
  // Kvalitetssäkring (alltid, alla objekt) + terräng (manuellt kr-värde,
  // annars 0) — uppslag på avräkningsdagen
  const objOvrigKr: Record<string, number> = {};
  for (const oid of ids) {
    objSortKr[oid] = sortimentTillagg(grupperFor(oid), sortConf);
    objTraktKr[oid] = traktTillagg(objVol[oid]?.vol || 0, traktBrackets).krPerM3;
    const dag = avrakningsdatum(objMeta[oid]) || '';
    objOvrigKr[oid] = ovrigtKrPerM3('kvalitetssakring', ovrigtList, dag)
      + (Number(objMeta[oid]?.terrang_kr_manuell) || 0);
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
  // Skotarvolym per (objekt, maskin) via motorn — manuell korrigering
  // (skotad_volym_manuell) när satt, annars lass. Skotavståndstillägget
  // räknas alltid enbart ur faktiska lass.
  const fwdAgg: Record<string, { vol: number; skotKr: number }> = {};
  for (const r of lassRows) {
    if (!r.objekt_id) continue;
    const key = `${r.objekt_id}|${r.maskin_id}`;
    (fwdAgg[key] ||= { vol: 0, skotKr: 0 });
    fwdAgg[key].skotKr += skotAvstandKr(r.datum, r.korstracka_m || 0, Number(r.volym_m3sub) || 0, avstandList);
  }
  const lassPerObjekt: Record<string, any[]> = {};
  for (const r of lassRows) { if (r.objekt_id) (lassPerObjekt[r.objekt_id] ||= []).push(r); }
  const skotarTidPerObjekt: Record<string, any[]> = {};
  for (const r of tidRows) {
    if (!r.objekt_id || maskinNamnMap[r.maskin_id]?.typ !== 'Forwarder') continue;
    (skotarTidPerObjekt[r.objekt_id] ||= []).push(r);
  }
  const kundeInteFordela = new Set<string>();
  for (const o of valda) {
    const manuellRader = manuellRaderPerObjekt.get(o.objekt_id) ?? [];
    const f = fordelaSkotadVolymFrånDB(manuellRader, lassPerObjekt[o.objekt_id] || [], skotarTidPerObjekt[o.objekt_id] || []);
    if (f.kundeInteFordela) kundeInteFordela.add(o.objekt_id);
    for (const d of f.delar) {
      const key = `${o.objekt_id}|${d.maskin_id}`;
      (fwdAgg[key] ||= { vol: 0, skotKr: 0 });
      fwdAgg[key].vol += d.volym;
    }
  }
  const objSkotadVol: Record<string, number> = {};
  for (const [key, f] of Object.entries(fwdAgg)) {
    const oid = key.split('|')[0];
    objSkotadVol[oid] = (objSkotadVol[oid] || 0) + f.vol;
  }

  // Manuellt skotavstånd: tillägget räknas om på HELA maskinens skotarvolym
  // med det angivna avståndet — ersätter per-lass-summan för objektet.
  for (const o of valda) {
    const avst = Number(o.skotavstand_manuell);
    if (!(avst > 0)) continue;
    const dag = avrakningsdatum(o) || '';
    for (const [key, f] of Object.entries(fwdAgg)) {
      if (key.split('|')[0] !== o.objekt_id) continue;
      f.skotKr = skotAvstandKr(dag, avst, f.vol, avstandList);
    }
  }

  // ── Maskindelar per objekt: ackord (motorn) + timpeng (G15 × timpris) ──
  const delar: Record<string, MaskinDel[]> = {};
  const utanPrisPerObjekt: Record<string, number> = {};

  const laggTill = (oid: string, mid: string, roll: 'skördare' | 'skotare', volym: number, ackord: number) => {
    const avrakningsdag = avrakningsdatum(objMeta[oid]) || '';
    const tp = timprisList.find(p => p.maskin_id === mid && isValidOn(avrakningsdag, p.giltig_fran, p.giltig_till))
      || timprisList.find(p => p.maskin_id === mid);
    // G15-manuell (redigeringsvyn) ersätter mätt tid för timpeng-jämförelsen —
    // manuella timmar prissätts med avräkningsdagens timpris, inga pris-hål.
    const manuellTim = roll === 'skördare'
      ? Number(objMeta[oid]?.skordning_g15_manuell)
      : (g15ManuellPerObjekt.get(oid) ?? 0);
    if (manuellTim > 0) {
      (delar[oid] ||= []).push({
        maskin_id: mid, roll, volym, ackord,
        timpeng: manuellTim * (tp?.timpris || 0),
        timmar: manuellTim,
        timpris: tp?.timpris || 0,
        manuellTid: true,
      });
      return;
    }
    const t = timpengForTidRows(tidPerKey[`${oid}|${mid}`] || [], timprisList);
    utanPrisPerObjekt[oid] = (utanPrisPerObjekt[oid] || 0) + t.timmarUtanPris;
    (delar[oid] ||= []).push({
      maskin_id: mid, roll, volym, ackord,
      timpeng: t.timpeng || 0,
      timmar: t.timmar,
      timpris: tp?.timpris || 0,
      manuellTid: false,
    });
  };

  for (const [key, h] of Object.entries(harvAgg)) {
    const [oid, mid] = key.split('|');
    if (h.vol <= 0) continue;
    const medelstam = medelstamOverride(oid) ?? (h.stammar > 0 ? h.vol / h.stammar : ANTAGEN_MEDELSTAM);
    const grundpris = lookupAcordPris(medelstam, acordList)?.pris_skordare || 0;
    const extra = (objSortKr[oid] || 0) + (objTraktKr[oid] || 0) + (objOvrigKr[oid] || 0);
    const meta = objMeta[oid];
    const undTp = timprisList.find(p => p.maskin_id === mid)?.timpris || 0;
    const und = tillampaTimpengUndantag(h.vol, meta?.timpeng_undantag_timmar_skordare, meta?.timpeng_undantag_dra_skordare !== false, meta?.timpeng_undantag_volym, undTp);
    laggTill(oid, mid, 'skördare', h.vol, und.volymEfterUndantag * (grundpris + extra) + und.undantagKr);
  }
  for (const [key, f] of Object.entries(fwdAgg)) {
    const [oid, mid] = key.split('|');
    if (f.vol <= 0) continue;
    const medelstam = medelstamOverride(oid) ?? (objMedelstam[oid] || ANTAGEN_MEDELSTAM);
    const grundpris = lookupAcordPris(medelstam, acordList)?.pris_skotare || 0;
    const extra = (objSortKr[oid] || 0) + (objTraktKr[oid] || 0) + (objOvrigKr[oid] || 0);
    const meta = objMeta[oid];
    const undTp = timprisList.find(p => p.maskin_id === mid)?.timpris || 0;
    const und = tillampaTimpengUndantag(f.vol, meta?.timpeng_undantag_timmar_skotare, meta?.timpeng_undantag_dra_skotare !== false, meta?.timpeng_undantag_volym, undTp);
    laggTill(oid, mid, 'skotare', f.vol, und.volymEfterUndantag * (grundpris + extra) + f.skotKr + und.undantagKr);
  }

  const rader: ObjektRad[] = valda.map((o: any) => {
    const m = (delar[o.objekt_id] || []).sort((a, b) => b.ackord - a.ackord);
    const ackord = m.reduce((s2, d) => s2 + d.ackord, 0);
    const timpeng = m.reduce((s2, d) => s2 + d.timpeng, 0);
    const skordadVol = objVol[o.objekt_id]?.vol || 0;
    const skotadVol = objSkotadVol[o.objekt_id] || 0;
    const volym = skordadVol > 0 ? skordadVol : skotadVol;
    const diff = ackord - timpeng;

    // Halt jämförelse → utanför talen, med orsak. Ordningen: värsta först.
    const utanPris = utanPrisPerObjekt[o.objekt_id] || 0;
    const skotarTim = m.filter(d => d.roll === 'skotare').reduce((s2, d) => s2 + d.timmar, 0);
    let orsak: string | null = null;
    if (utanPris > 0.5) {
      orsak = `${fmtTim(utanPris)} h saknar timpris`;
    } else if (kundeInteFordela.has(o.objekt_id)) {
      orsak = `${Math.round(volymManuellPerObjekt.get(o.objekt_id) ?? 0)} m³ manuell skotad volym utan tids- eller lassdata att fördela på`;
    } else if (skotadVol > 0 && skotarTim < 1) {
      orsak = `${Math.round(skotadVol)} m³ skotat men under en timmes skotartid — skotartiden ofullständig`;
    } else if (skotarTim > 0 && skotadVol / skotarTim > MAX_SKOTAD_M3_PER_G15H) {
      orsak = `${Math.round(skotadVol)} m³ på ${fmtTim(skotarTim)} h = ${Math.round(skotadVol / skotarTim)} m³/tim (över ${MAX_SKOTAD_M3_PER_G15H}) — skotartiden ofullständig`;
    }

    // Ackordgrunden — färgregeln: mätt värde = benvitt, manuellt/uppskattat = bärnsten
    const egen = o.egen_skotning === true;
    const skotadManuell = (volymManuellPerObjekt.get(o.objekt_id) ?? 0) > 0;
    const avstManuell = Number(o.skotavstand_manuell) > 0;
    const msMan = medelstamOverride(o.objekt_id);
    const msAuto = objMedelstam[o.objekt_id];
    // Viktat snittavstånd ur faktiska lass — delad helper (ackordgrund)
    const lassAvst = skotavstandVagtAuto(lassPerObjekt[o.objekt_id] || []);
    const g15Sk = m.filter(d => d.roll === 'skördare');
    const g15St = m.filter(d => d.roll === 'skotare');
    const fmtM3 = (n: number) => Math.round(n).toLocaleString('sv-SE');
    const sumTim = (dd: MaskinDel[]) => dd.reduce((s2, d) => s2 + d.timmar, 0);
    const medelstam = msMan ?? msAuto ?? ANTAGEN_MEDELSTAM;
    const grund = [
      { label: 'Skördad volym', text: skordadVol > 0 ? `${fmtM3(skordadVol)} m³fub` : '—', manuell: false },
      {
        label: 'Skotad volym',
        text: egen ? '— egen skotning' : (skotadVol > 0 ? `${fmtM3(skotadVol)} m³fub${skotadManuell ? ' · manuell' : ''}` : '—'),
        manuell: skotadManuell,
      },
      {
        label: 'Medelstam',
        text: `${medelstam.toFixed(3).replace('.', ',')} m³${msMan != null ? ' · manuell' : (msAuto == null ? ' · antagen' : '')}`,
        manuell: msMan != null || msAuto == null,
      },
      {
        label: 'Sortimentgrupper',
        text: `${grupperFor(o.objekt_id)} st${o.sortiment_grupper_manuell != null ? ' · manuell' : ''}`,
        manuell: o.sortiment_grupper_manuell != null,
      },
      {
        label: 'Skotavstånd',
        text: avstManuell ? `${Math.round(Number(o.skotavstand_manuell))} m · manuell`
          : egen ? '— egen skotning'
          : lassAvst == null ? '— saknas i lassen'
          : skotadManuell ? `≈${Math.round(lassAvst)} m · uppskattat ur ofullständiga lass`
          : `${Math.round(lassAvst)} m`,
        manuell: avstManuell || (!egen && (lassAvst == null || skotadManuell)),
      },
      {
        label: 'G15 skördare',
        text: g15Sk.length ? `${fmtTim(sumTim(g15Sk))} h${g15Sk.some(d => d.manuellTid) ? ' · manuell' : ''}` : '—',
        manuell: g15Sk.some(d => d.manuellTid),
      },
      {
        label: 'G15 skotare',
        text: g15St.length ? `${fmtTim(sumTim(g15St))} h${g15St.some(d => d.manuellTid) ? ' · manuell' : ''}` : (egen ? '— egen skotning' : '—'),
        manuell: g15St.some(d => d.manuellTid),
      },
      {
        label: 'Terräng',
        text: Number(o.terrang_kr_manuell) > 0
          ? `Svår +${Number(o.terrang_kr_manuell).toLocaleString('sv-SE')} kr/m³ · manuell`
          : 'Normal · förval',
        manuell: Number(o.terrang_kr_manuell) > 0,
      },
      // Kvalitetssäkring/ForestLink — läggs på automatiskt, ALLTID. Läsrad
      // så admin ser att den är med; ändras bara i Inställningar (för alla).
      {
        label: 'Kvalitetssäkring',
        text: `${ovrigtKrPerM3('kvalitetssakring', ovrigtList, avrakningsdatum(o) || '').toLocaleString('sv-SE')} kr/m³ · alltid med`,
        manuell: false,
      },
    ];

    return {
      objekt_id: o.objekt_id,
      namn: o.object_name || o.vo_nummer || o.objekt_id,
      volym,
      medelstam,
      klass: lookupAcordPris(medelstam, acordList)?.medelstam ?? null,
      ackord,
      timpeng,
      diff,
      krPerM3: volym > 0 ? diff / volym : null,
      egenSkotning: egen,
      ejJamforbarOrsak: orsak,
      grund,
      maskiner: m,
    };
  }).sort((a, b) => b.diff - a.diff);

  return {
    ...bas,
    rader: rader.filter(o => !o.ejJamforbarOrsak),
    ejJamforbara: rader.filter(o => o.ejJamforbarOrsak).map(o => ({ namn: o.namn, orsak: o.ejJamforbarOrsak! })),
  };
}
