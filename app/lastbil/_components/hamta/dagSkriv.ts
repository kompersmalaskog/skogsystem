// Skrivningarna bakom Hämta-flödet — flyttdag och maskin_flytt, EXAKT som förarflödet (/maskinflytt) skrev dem. Inga schemaändringar.
//
// Flödet är frivilligt: "Lassa" skapar flytten, "Lassat av här" avslutar den, "Vägen hem" startar hemresan och "Klar" stänger rundan.
// Trycker föraren inte, tar lastbilens vikt hand om lasset (lib/lastbil/lass) — och trycker föraren, kopplar den matchningen lasset
// till den här flytten i stället för att skapa en till (hittaManuellFlytt, ±45 min, en flytt = ett lass).
//
// Dagmodellen är oförändrad: en flyttdag (hemifrån → n flyttar → hem) äger tillkörning och hemresa; varje flytt äger flytt_km
// (fakturerbar-styrande) och mellankörning (tomkörning från förra flyttens slutpunkt). Mätt och beräknat blandas aldrig.
//
// Varje skrivning kräver rader tillbaka: noll rader är ett FEL (RLS kan ge noll rader utan fel), aldrig "sparat".

import { supabase } from '@/lib/supabase';
import { haversine } from '@/utils/geo';
import { fakturerbarEffektiv, type FlyttTyp } from '@/lib/flytt/fakturerbar';
import { rimligGpsPunkt } from '@/app/maskinflytt/senastePlats';
import type { Pos } from './gps';
import { matarKm } from '../fakturerbart';

export interface Forare { id: string; namn: string; hem_lat: number | null; hem_lng: number | null }

export interface Dag {
  id: string;
  starttid: string;
  start_lat: number | null;
  start_lng: number | null;
  start_kalla: string | null;
  tillkorning_km: number | null;
  start_odometer_m: number | null;
  start_odometer_tid: string | null;
  odometer_stale: boolean | null;
  hemresa_start_tid: string | null;
  hemresa_start_odometer_m: number | null;
}
export const DAG_FALT = 'id, starttid, start_lat, start_lng, start_kalla, tillkorning_km, start_odometer_m, start_odometer_tid, odometer_stale, hemresa_start_tid, hemresa_start_odometer_m';

export interface Ctx { forare: Forare | null; vin: string | null }
export type Utfall<T> = { ok: true; v: T } | { ok: false; fel: string };
const fel = (t: string): { ok: false; fel: string } => ({ ok: false, fel: t });

// Skräptidsskydd: orimliga mätben sparas som NULL, aldrig som äkta siffror.
export const MAX_TID_TILL_MASKIN_MIN = 180;  // bas→A över 3 tim = föraren gjorde annat
export const MAX_TID_FLYTT_MIN = 360;        // A→B över 6 tim = appen låg öppen
export const MAX_DAG_MIN = 960;              // dag över 16 tim = aldrig avslutad på riktigt
const NARBEN_TID_MIN = 3;

// ── Mätare och rutt ─────────────────────────────────────────────────────────────────────────────

/** Lastbilens odometer just nu via /api/scania/odometer (nycklar server-side). Scania får ALDRIG blockera — fel/timeout ger null. */
export async function hamtaOdometer(): Promise<{ odometer_m: number; tid: string | null; stale: boolean } | null> {
  try {
    const r = await fetch('/api/scania/odometer', { cache: 'no-store' });
    if (!r.ok) return null;
    const b = await r.json();
    return b?.ok && Number.isFinite(b.odometer_m) ? { odometer_m: b.odometer_m, tid: b.tid ?? null, stale: !!b.stale } : null;
  } catch { return null; }
}

/** Lastbilens senast LOGGADE odometer. `farsk` = punkten ligger inom NARBEN_TID_MIN av nu. */
export async function narmasteOdometer(vin: string | null): Promise<{ odometer_m: number; tid: string; farsk: boolean } | null> {
  if (!vin) return null;
  try {
    const { data } = await supabase.from('lastbil_logg').select('odometer_m, tidpunkt').eq('vin', vin).order('tidpunkt', { ascending: false }).limit(1);
    const p = data?.[0];
    if (!p || p.odometer_m == null) return null;
    return { odometer_m: p.odometer_m, tid: p.tidpunkt, farsk: Date.now() - Date.parse(p.tidpunkt) <= NARBEN_TID_MIN * 60_000 };
  } catch { return null; }
}

/** Körsträcka (och ev. restid) via /api/routing (cache→ORS→haversine×1,4). minutes är null när restiden inte kunde fås. */
export async function korRutt(
  from: { lat: number; lng: number }, to: { lat: number; lng: number }, withDuration = false,
): Promise<{ km: number; minutes: number | null }> {
  try {
    const r = await fetch(`/api/routing?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}${withDuration ? '&withDuration=1' : ''}`);
    if (r.ok) {
      const body = await r.json();
      if (Number.isFinite(body?.km)) return { km: body.km, minutes: Number.isFinite(body?.minutes) ? body.minutes : null };
    }
  } catch { /* faller till lokal uppskattning */ }
  return { km: Math.round(haversine(from.lat, from.lng, to.lat, to.lng) * 1.4), minutes: null };
}

/** Väder vid avslut via Open-Meteo. Fel/timeout → null överallt (väder är bonus, aldrig blockerande). */
export async function hamtaVader(lat: number, lng: number): Promise<{ temp: number | null; kod: number | null; nederbord: number | null }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,precipitation,weather_code`,
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    if (r.ok) {
      const c = (await r.json())?.current;
      return {
        temp: Number.isFinite(c?.temperature_2m) ? c.temperature_2m : null,
        kod: Number.isFinite(c?.weather_code) ? c.weather_code : null,
        nederbord: Number.isFinite(c?.precipitation) ? c.precipitation : null,
      };
    }
  } catch { /* väder är bonus */ }
  return { temp: null, kod: null, nederbord: null };
}

// ── Dagen ───────────────────────────────────────────────────────────────────────────────────────

/** Stäng en kvarglömd dag i efterhand: sluttid = sista flyttens sluttid, ingen hemresa (den kördes okänt). */
async function autoStangDag(d: Dag): Promise<void> {
  const { data: fl } = await supabase.from('maskin_flytt')
    .select('sluttid, flytt_km, mellankorning_km')
    .eq('flyttdag_id', d.id).not('sluttid', 'is', null).eq('avbruten', false)
    .order('sluttid', { ascending: false });
  const sista = fl?.[0]?.sluttid ?? d.starttid;
  const raMin = Math.round((new Date(sista).getTime() - new Date(d.starttid).getTime()) / 60000);
  const totalKm = (d.tillkorning_km ?? 0) + (fl || []).reduce((s, f) => s + (f.flytt_km ?? 0) + (f.mellankorning_km ?? 0), 0);
  await supabase.from('flyttdag').update({
    sluttid: sista, total_km: totalKm, total_tid_min: raMin >= 0 && raMin <= MAX_DAG_MIN ? raMin : null, status: 'auto_avslutad',
  }).eq('id', d.id).select('id');
}

/** Förarens öppna dag. En dag från ett tidigare dygn stängs automatiskt — nästa dags flytt får aldrig hamna i gårdagens dag. */
export async function hittaDag(ctx: Ctx): Promise<Utfall<Dag | null>> {
  const bas = supabase.from('flyttdag').select(DAG_FALT).is('sluttid', null).order('starttid', { ascending: false }).limit(1);
  const { data, error } = ctx.forare ? await bas.eq('medarbetare_id', ctx.forare.id) : await bas.is('medarbetare_id', null);
  if (error) return fel(`Kunde inte läsa dagen: ${error.message}`);
  if (!data?.length) return { ok: true, v: null };
  const d = data[0] as Dag;
  if (new Date(d.starttid).toLocaleDateString('sv-SE') !== new Date().toLocaleDateString('sv-SE')) {
    await autoStangDag(d);
    return { ok: true, v: null };
  }
  return { ok: true, v: d };
}

/** Rundan cron:en stängde för mindre än 60 min sedan — bilen kan ha svängt förbi basen. Frågan "fortsätt eller ny?" ställs aldrig tyst. */
export async function hittaNyligenStangd(): Promise<string | null> {
  const [oppen, stangd] = await Promise.all([
    supabase.from('flyttdag').select('id').is('sluttid', null).limit(1),
    supabase.from('flyttdag').select('id').eq('auto_avslutad_av', 'cron')
      .gte('sluttid', new Date(Date.now() - 60 * 60000).toISOString())
      .order('sluttid', { ascending: false }).limit(1),
  ]);
  return !oppen.data?.length && stangd.data?.length ? stangd.data[0].id : null;
}

export async function ateroppnaRunda(rundaId: string): Promise<void> {
  await supabase.from('flyttdag').update({ sluttid: null, status: 'pagaende', auto_skapad: false, auto_avslutad_av: null }).eq('id', rundaId);
}

/** Skriver lastbilens odometer vid dagstart (fire-and-forget — Scania fördröjer aldrig "Lassa"). Misslyckas den blir mätaren oräknad. */
function skrivStartOdometer(dagId: string): void {
  void hamtaOdometer().then(odo => {
    if (!odo) return;
    void supabase.from('flyttdag').update({ start_odometer_m: odo.odometer_m, start_odometer_tid: odo.tid, odometer_stale: odo.stale }).eq('id', dagId);
  });
}

/** Dagen: förarens öppna, annars en öppen runda för bilen (cron:ens auto-runda — TAS ÖVER, inte dubbleras), annars en ny.
 *  Startpunkten är förarens GPS om den är rimlig, annars hembasen; saknas båda startar dagen utan startpunkt och tillkörningen
 *  redovisas som oräknad. */
export async function sakraDag(ctx: Ctx, start: Pos | null, starttid: string): Promise<Utfall<Dag>> {
  const egen = await hittaDag(ctx);
  if (!egen.ok) return egen;
  if (egen.v) return { ok: true, v: egen.v };

  // Dubbelskydd: finns redan en öppen runda för bilen — ta över den.
  const { data: oppna } = await supabase.from('flyttdag').select(DAG_FALT).is('sluttid', null).order('starttid', { ascending: false }).limit(1);
  if (oppna?.length) {
    const d = oppna[0] as Dag;
    await supabase.from('flyttdag').update({ forare: ctx.forare?.namn ?? null, medarbetare_id: ctx.forare?.id ?? null, vin: ctx.vin, auto_skapad: false }).eq('id', d.id);
    return { ok: true, v: d };
  }

  const hem = ctx.forare;
  const startPunkt = start && rimligGpsPunkt(start.lat, start.lng)
    ? { lat: start.lat, lng: start.lng, kalla: 'gps' }
    : hem && rimligGpsPunkt(hem.hem_lat, hem.hem_lng) ? { lat: hem.hem_lat!, lng: hem.hem_lng!, kalla: 'hembas' } : null;
  const { data, error } = await supabase.from('flyttdag').insert({
    forare: hem?.namn ?? null,
    medarbetare_id: hem?.id ?? null,
    vin: ctx.vin,   // engagerar dubbelskyddsindexet flyttdag_en_oppen_per_vin
    starttid,
    start_lat: startPunkt?.lat ?? null,
    start_lng: startPunkt?.lng ?? null,
    start_kalla: startPunkt?.kalla ?? null,
  }).select(DAG_FALT);
  if (error) {
    // 23505: cron:en (eller en annan flik) hann öppna en runda för bilen samtidigt — ta över den (race:t som gav dubbelrundan 10 aug).
    if ((error as { code?: string }).code === '23505' && ctx.vin) {
      const { data: vinnare } = await supabase.from('flyttdag').select(DAG_FALT).is('sluttid', null).eq('vin', ctx.vin).order('starttid', { ascending: false }).limit(1);
      if (vinnare?.length) {
        const dv = vinnare[0] as Dag;
        await supabase.from('flyttdag').update({ forare: hem?.namn ?? null, medarbetare_id: hem?.id ?? null, auto_skapad: false }).eq('id', dv.id);
        return { ok: true, v: dv };
      }
    }
    return fel(`Kunde inte starta dagen: ${error.message}`);
  }
  if (!data?.length) return fel('Kunde inte starta dagen: inga rader sparades');
  const d = data[0] as Dag;
  skrivStartOdometer(d.id);
  return { ok: true, v: d };
}

// ── Flytten ─────────────────────────────────────────────────────────────────────────────────────

export interface FlyttPart {
  /** Egen maskin (maskin_id) eller en främmande (extern). Exakt en av dem. */
  maskin_id: string | null;
  extern: string | null;
}

/** Slutpunkten på dagens senaste avslutade flytt = där tomkörningen till nästa maskin börjar. */
async function forraSlutpunkt(dagId: string): Promise<{ lat: number; lng: number } | null> {
  const { data } = await supabase.from('maskin_flytt').select('till_lat, till_lng')
    .eq('flyttdag_id', dagId).not('sluttid', 'is', null).eq('avbruten', false)
    .order('sluttid', { ascending: false }).limit(1);
  const f = data?.[0];
  return f && f.till_lat != null && f.till_lng != null ? { lat: f.till_lat, lng: f.till_lng } : null;
}

export interface SkapadFlytt { flyttId: string; hamtadTid: string; dag: Dag }

/**
 * "Lassa": öppnar flytten vid `punkt` (förarens GPS, eller maskinens kända plats). Tomkörningen räknas från förra flyttens
 * slutpunkt (null för dagens första) och dagens tillkörning från startpunkten till den FÖRSTA maskinen.
 */
export async function skapaFlytt(ctx: Ctx, dag: Dag, del: FlyttPart, punkt: { lat: number; lng: number }, fran: { objektId: string | null; platsId: string | null }, starttid: string): Promise<Utfall<SkapadFlytt>> {
  const forraB = await forraSlutpunkt(dag.id);
  const mellankorning = forraB ? (await korRutt(forraB, punkt)).km : null;
  const nu = new Date().toISOString();
  const { data, error } = await supabase.from('maskin_flytt').insert({
    maskin_id: del.maskin_id,
    extern_maskin: del.extern,
    flyttdag_id: dag.id,
    fran_objekt_id: fran.objektId,
    fran_plats_id: fran.platsId,
    mellankorning_km: mellankorning,
    fran_lat: punkt.lat,
    fran_lng: punkt.lng,
    starttid,
    hamtad_tid: nu,
    forare: ctx.forare?.namn ?? null,
    medarbetare_id: ctx.forare?.id ?? null,
  }).select('id');
  if (error || !data?.length) return fel(`Kunde inte spara lastningen: ${error?.message || 'inga rader sparades'}`);

  // Dagens tillkörning: start → dagens första maskin. Villkoret är "första flytten" (ingen slutpunkt än), inte "km är null" —
  // en felaktig 0:a från ett tidigare försök får inte blockera omräkningen.
  let d = dag;
  if (!forraB && dag.start_lat != null && dag.start_lng != null) {
    const t = await korRutt({ lat: dag.start_lat, lng: dag.start_lng }, punkt);
    const { data: du } = await supabase.from('flyttdag').update({ tillkorning_km: t.km }).eq('id', dag.id).select('id');
    if (du?.length) d = { ...dag, tillkorning_km: t.km };
  }
  // Mätt ben: lastbilens odometer vid Lassa (fire-and-forget).
  void narmasteOdometer(ctx.vin).then(o => { if (o) void supabase.from('maskin_flytt').update({ fran_odometer_m: o.odometer_m }).eq('id', data[0].id); });
  return { ok: true, v: { flyttId: data[0].id, hamtadTid: nu, dag: d } };
}

/** "Ändra" på ✓ Lassat: lastningen var ett misstag — flytten avbryts (alla läsare filtrerar redan bort avbrutna). */
export async function avbrytFlytt(flyttId: string): Promise<Utfall<true>> {
  const { data, error } = await supabase.from('maskin_flytt').update({ sluttid: new Date().toISOString(), avbruten: true }).eq('id', flyttId).select('id');
  if (error || !data?.length) return fel(`Kunde inte ta bort lastningen: ${error?.message || 'inga rader sparades'}`);
  return { ok: true, v: true };
}

export interface Mal {
  objektId: string | null;
  platsId: string | null;
  /** Kartpunkten flytten slutar vid: förarens GPS här, annars vald trakts/plats koordinat. */
  lat: number;
  lng: number;
  kalla: 'gps' | 'larmkoordinat' | 'objekt' | 'flyttplats' | 'karta';
  namn: string;
  /** Verkstad som mål → service. */
  verkstad: boolean;
}

export interface AvslutadFlytt { flyttKm: number; fakturerbar: boolean; typ: FlyttTyp; positionSparad: boolean }

/**
 * "Lassat av här": avslutar flytten mot `mal`. Typen följer målet (verkstad = service, annars produktion; främmande maskin =
 * kunduppdrag med kund), fakturerbar kommer ur EN regel (fakturerbarEffektiv) och en egen maskins nya position sparas.
 * Läser startpunkten ur flytten själv, så att den fungerar även efter en omstart av appen.
 */
export async function avslutaFlytt(ctx: Ctx, flyttId: string, del: FlyttPart, mal: Mal, kund: string | null): Promise<Utfall<AvslutadFlytt>> {
  const { data: rad, error: radFel } = await supabase.from('maskin_flytt').select('fran_lat, fran_lng, starttid, hamtad_tid, fran_odometer_m').eq('id', flyttId).maybeSingle();
  if (radFel || !rad || rad.fran_lat == null || rad.fran_lng == null) return fel(`Kunde inte läsa lastningen: ${radFel?.message || 'flytten hittades inte'}`);
  const typ: FlyttTyp = del.extern ? 'kunduppdrag' : mal.verkstad ? 'service' : 'produktion';
  if (typ === 'kunduppdrag' && !(kund ?? '').trim()) return fel('Kunduppdrag kräver kund — fyll i kundnamnet.');

  const aPos = { lat: rad.fran_lat as number, lng: rad.fran_lng as number };
  const [flytt, vader, tillOdo] = await Promise.all([korRutt(aPos, mal), hamtaVader(mal.lat, mal.lng), narmasteOdometer(ctx.vin)]);
  // Bilens mätare går före den räknade vägen (Martin 2026-10-24): lastad → lossad på mätaren är det som faktiskt kördes.
  // Bara när mätaren vid lossningen är färsk (bilen står där nu) och skillnaden är rimlig; annars den räknade vägen.
  const matare = tillOdo?.farsk ? matarKm(rad.fran_odometer_m == null ? null : Number(rad.fran_odometer_m), tillOdo.odometer_m) : null;
  const flyttKm = matare ?? flytt.km;
  const fakturerbar = fakturerbarEffektiv(typ, flyttKm, null);   // ett nytt flytt har inget manuellt val (null)
  const nu = new Date().toISOString();
  const minMellan = (a: string | null, b: string) => (a ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000) : null);
  const raTillMaskin = minMellan(rad.starttid, rad.hamtad_tid ?? nu);
  const raFlytt = minMellan(rad.hamtad_tid, nu);
  const tillMaskinOgiltig = raTillMaskin != null && (raTillMaskin < 0 || raTillMaskin > MAX_TID_TILL_MASKIN_MIN);
  const flyttOgiltig = raFlytt != null && (raFlytt < 0 || raFlytt > MAX_TID_FLYTT_MIN);

  // Dagnivån äger tillkörning/hem/total — de skrivs INTE här.
  const { data, error } = await supabase.from('maskin_flytt').update({
    till_objekt_id: mal.objektId,
    till_plats_id: mal.platsId,
    till_lat: mal.lat,
    till_lng: mal.lng,
    koord_kalla: mal.kalla,
    flytt_km: flyttKm,
    fakturerbar,
    flytt_typ: typ,
    kund: (kund ?? '').trim() || null,
    tid_till_maskin_min: tillMaskinOgiltig ? null : raTillMaskin,
    tid_flytt_min: flyttOgiltig ? null : raFlytt,
    till_odometer_m: tillOdo?.odometer_m ?? null,
    vader_temp_c: vader.temp,
    vader_kod: vader.kod,
    vader_nederbord_mm: vader.nederbord,
    sluttid: nu,
  }).eq('id', flyttId).select('id');
  if (error || !data?.length) return fel(`Kunde inte avsluta flytten: ${error?.message || 'inga rader sparades'}`);

  // Maskinens nya position — bara EGNA maskiner; andras spåras aldrig.
  let positionSparad = true;
  if (del.maskin_id) {
    const pos = await supabase.from('maskin_position').insert({ maskin_id: del.maskin_id, lat: mal.lat, lng: mal.lng, tidpunkt: nu }).select('maskin_id');
    positionSparad = !pos.error && (pos.data?.length ?? 0) > 0;
  }
  return { ok: true, v: { flyttKm, fakturerbar, typ, positionSparad } };
}

// ── Hemresan och rundans slut ───────────────────────────────────────────────────────────────────

/** "Vägen hem": startar hemresan (stänger INTE rundan; den mäts vid Klar). Färsk odometer vid avfärd. */
export async function startaHemresa(dag: Dag): Promise<Utfall<Dag>> {
  if (dag.hemresa_start_tid) return { ok: true, v: dag };   // redan startad (omladdning, andra tryck)
  const odo = await hamtaOdometer();
  const { data, error } = await supabase.from('flyttdag').update({
    hemresa_start_tid: new Date().toISOString(),
    hemresa_start_odometer_m: odo?.odometer_m ?? null,
  }).eq('id', dag.id).select('id, hemresa_start_tid, hemresa_start_odometer_m');
  if (error || !data?.length) return fel(`Kunde inte starta hemresan: ${error?.message || 'inga rader sparades'}`);
  return { ok: true, v: { ...dag, hemresa_start_tid: data[0].hemresa_start_tid, hemresa_start_odometer_m: data[0].hemresa_start_odometer_m } };
}

/** "Framme på LBC" — stänger dagen med MÄTT hemresa (odometer-diff + tid). Anropas bara från Klar efter framme-kontrollen. */
export async function stangDag(ctx: Ctx, d: Dag): Promise<Utfall<true>> {
  const { data: fl, error: flErr } = await supabase.from('maskin_flytt')
    .select('flytt_km, mellankorning_km, till_lat, till_lng, sluttid')
    .eq('flyttdag_id', d.id).not('sluttid', 'is', null).eq('avbruten', false)
    .order('sluttid', { ascending: false });
  if (flErr) return fel(`Kunde inte läsa dagens flyttar: ${flErr.message}`);
  const flyttKmSumma = (fl || []).reduce((s, f) => s + (f.flytt_km ?? 0), 0);
  const mellanSumma = (fl || []).reduce((s, f) => s + (f.mellankorning_km ?? 0), 0);
  const sistaB = fl?.length && fl[0].till_lat != null && fl[0].till_lng != null ? { lat: fl[0].till_lat, lng: fl[0].till_lng } : null;

  const [slutOdo, dagFarsk] = await Promise.all([
    hamtaOdometer(),   // lastbilens odometer nu (slut)
    supabase.from('flyttdag').select('start_odometer_m, start_odometer_tid, odometer_stale').eq('id', d.id).single(),
  ]);
  // Mätarställning: (slut − start)/1000, en decimal. Saknas endera → null. Vid sidan av rutt-km, aldrig i stället.
  const startOdoM: number | null = dagFarsk.data?.start_odometer_m ?? d.start_odometer_m ?? null;
  const startStale = !!(dagFarsk.data?.odometer_stale ?? d.odometer_stale);
  const slutOdoM: number | null = slutOdo?.odometer_m ?? null;
  const matareKm = startOdoM != null && slutOdoM != null ? Math.round(((slutOdoM - startOdoM) / 1000) * 10) / 10 : null;
  const odometerStale = startStale || !!slutOdo?.stale;

  // Bränsle: (slut − start bransle_ml)/1000 ur lastbil_logg. Saknas → null.
  let bransleL: number | null = null;
  const startOdoTid = dagFarsk.data?.start_odometer_tid ?? d.start_odometer_tid;
  if (ctx.vin && startOdoTid) {
    const [sp, lp] = await Promise.all([
      supabase.from('lastbil_logg').select('bransle_ml').eq('vin', ctx.vin).eq('tidpunkt', startOdoTid).maybeSingle(),
      supabase.from('lastbil_logg').select('bransle_ml').eq('vin', ctx.vin).order('tidpunkt', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (sp.data?.bransle_ml != null && lp.data?.bransle_ml != null) bransleL = Math.round(((lp.data.bransle_ml - sp.data.bransle_ml) / 1000) * 10) / 10;
  }

  const nu = new Date();
  const raMin = Math.round((nu.getTime() - new Date(d.starttid).getTime()) / 60000);
  const dagOgiltig = raMin < 0 || raMin > MAX_DAG_MIN;

  // Hemresan MÄTT: framme-odometer − hemresa_start_odometer, tid = nu − start.
  let hemKm: number | null = null;
  let hemMin: number | null = null;
  let hemresaMatt = false;
  if (d.hemresa_start_odometer_m != null && slutOdoM != null) {
    hemKm = Math.round(((slutOdoM - d.hemresa_start_odometer_m) / 1000) * 10) / 10;
    hemresaMatt = true;
  }
  if (d.hemresa_start_tid) {
    const hm = Math.round((nu.getTime() - Date.parse(d.hemresa_start_tid)) / 60000);
    if (hm >= 0 && hm <= MAX_DAG_MIN) hemMin = hm;
  }
  // Saknas hemresestarten: ORS-gissning, märks EJ som mätt.
  const hem = ctx.forare;
  if (hemKm == null && hem?.hem_lat != null && hem?.hem_lng != null && sistaB) {
    const est = await korRutt(sistaB, { lat: hem.hem_lat, lng: hem.hem_lng }, true);
    hemKm = est?.km ?? null;
    if (hemMin == null) hemMin = est?.minutes ?? null;
    hemresaMatt = false;
  }
  const totalKm = (d.tillkorning_km ?? 0) + flyttKmSumma + mellanSumma + (hemKm ?? 0);

  const { data, error } = await supabase.from('flyttdag').update({
    sluttid: nu.toISOString(),
    slut_lat: hem?.hem_lat ?? null,
    slut_lng: hem?.hem_lng ?? null,
    hem_km: hemKm,
    tid_hem_min: hemMin,
    hemresa_matt: hemresaMatt,
    total_km: totalKm,
    total_tid_min: dagOgiltig ? null : raMin,
    slut_odometer_m: slutOdoM,
    slut_odometer_tid: slutOdo?.tid ?? null,
    matare_km: matareKm,
    bransle_l: bransleL,
    odometer_stale: odometerStale,
    status: 'avslutad',
  }).eq('id', d.id).select('id');
  if (error || !data?.length) return fel(`Kunde inte avsluta dagen: ${error?.message || 'inga rader sparades'}`);
  return { ok: true, v: true };
}

