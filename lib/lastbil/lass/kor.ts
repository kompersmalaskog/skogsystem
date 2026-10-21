// Lassdetekteringen i Scania-cron:en: läser loggen, hittar lass, avgör maskinen, skapar flytten eller frågar.
//
// Körs efter varje cykel (också när ingen ny loggpunkt kom — bevisen för ett väntande lass kan ha kommit: maskinernas GPS-spår
// importeras timmar efter transporten). Idempotent på tre nivåer: unik nyckel (vin, första lastade punkten) i databasen, en
// överlappskontroll mot redan funna lass här, och funktionerna i databasen (skapa_flytt_ur_lass hoppar över ett lass som redan
// har flytt). Kraschar aldrig: varje fel hamnar i rapporten, cron:ens loggskrivning är redan gjord.
//
// BARA FRAMÅT. Fönstret är de senaste 96 timmarna och ett lass skrivs först när det är KLART (en tom punkt har setts efter det och
// 15 minuter har gått sedan sista lastade punkten — annars kan en falsk tom mitt i lasset ge två rader). Historiken backfillas
// aldrig: Martin godkänner den rad för rad separat.
//
// FÖRDRÖJD FRÅGA. Maskinernas GPS-spår kommer in i databasen med timmars eftersläpning. Ett lass som inte är Hög direkt väntar därför
// NOTIS_FORDROJNING_MIN minuter innan någon får frågan, och utvärderas om varje cykel under tiden (och i 24 timmar): kommer spåret
// och lasset blir Hög skapas flytten av sig själv och ingen frågas.

import { haversine } from '@/utils/geo';
import { beslutaLass, type Beslut } from './beslut';
import { byggKedja, samlaBevis, sammanfattaFoljer, type ArbeteDag, type FoljerRad, type NarvaroRad } from './bevis';
import { detekteraLass, LASS, tidMs, viktPunkter, type DetektLass, type LoggPunkt } from './detektera';
import { bedomMaskin, type MaskinBedomning, type MaskinBevis } from './maskin';
import { hittaManuellFlytt, type ManuellFlytt, type ManuellTraff } from './matcha';
import { LASS_MASKIN, LASS_MOTTAGARE_EPOST, NOTIS_FORDROJNING_MIN, valjMottagare, type Mottagare } from './notis';
import { narmastePlats, narPlatsMeter, type FunnenPlats, type PlatsKandidat } from './plats';

export const FONSTER_TIM = 96;
export { NOTIS_FORDROJNING_MIN };
export const OMVARDERA_TIM = 24;
export const KLAR_EFTER_MIN = 15;
const MIN = 60_000;
const TIM = 3_600_000;

export interface LassRapport {
  ok: boolean;
  vin: string | null;
  loggPunkter: number;
  lastadePunkter: number;
  nya: number;
  avvisade: number;
  auto: number;
  matchade: number;
  vantar: number;
  omvarderade: number;
  oavslutade: number;
  notiser: number;
  fel: string[];
}

const tomRapport = (): LassRapport => ({
  ok: true, vin: null, loggPunkter: 0, lastadePunkter: 0, nya: 0, avvisade: 0, auto: 0, matchade: 0, vantar: 0,
  omvarderade: 0, oavslutade: 0, notiser: 0, fel: [],
});

const sthlmDag = (iso: string): string => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const plusDagar = (dag: string, n: number): string => new Date(Date.parse(`${dag}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export interface Ctx {
  db: any;
  nu: number;
  vin: string;
  bas: { lat: number; lng: number; radieM: number } | null;
  kandidater: PlatsKandidat[];
  maskiner: string[];
  manuella: ManuellFlytt[];
  upptagna: Set<string>;
  fel: string[];
}

export interface Utvardering {
  rad: Record<string, unknown>;
  beslut: Beslut;
  bedomning: MaskinBedomning | null;
  manuell: ManuellTraff;
  fran: FunnenPlats | null;
  till: FunnenPlats | null;
}

export async function las<T>(fel: string[], namn: string, q: PromiseLike<{ data: T | null; error: any }>): Promise<T | null> {
  try {
    const r = await q;
    if (r.error) { fel.push(`${namn}: ${r.error.message ?? r.error}`); return null; }
    return (r.data ?? null) as T | null;
  } catch (e: any) {
    fel.push(`${namn}: ${e?.message ?? e}`);
    return null;
  }
}

/** Bevisen för varje aktiv maskin: spår som följde bilen, ankomst/avgång, skotningskedja, påbörjad flytt, senaste position. */
async function insamlaBevis(c: Ctx, l: DetektLass, fran: FunnenPlats | null, till: FunnenPlats | null, manuell: ManuellTraff): Promise<MaskinBevis[]> {
  const { db, maskiner, fel } = c;
  if (!maskiner.length) return [];

  const punkter = l.punkter.filter(p => p.lat != null && p.lng != null).map(p => ({ t: p.tidpunkt, lat: p.lat, lng: p.lng }));
  const foljer = punkter.length
    ? await las<FoljerRad[]>(fel, 'lastbil_maskin_foljer', db.rpc('lastbil_maskin_foljer', { p_punkter: punkter, p_maskiner: maskiner }))
    : null;
  const gps = sammanfattaFoljer(foljer ?? [], maskiner);

  const lossningMs = tidMs(l.lossningTid);
  const lassningMs = tidMs(l.lassningTid);
  const ankomst = l.lossning.lat != null && l.lossning.lng != null
    ? await las<NarvaroRad[]>(fel, 'lastbil_maskin_narvaro(ankomst)', db.rpc('lastbil_maskin_narvaro', {
      p_maskiner: maskiner, p_lat: l.lossning.lat, p_lng: l.lossning.lng,
      p_fran: new Date(lossningMs).toISOString(), p_till: new Date(lossningMs + 36 * TIM).toISOString(), p_forsta: true }))
    : null;
  const avgang = l.lassning.lat != null && l.lassning.lng != null
    ? await las<NarvaroRad[]>(fel, 'lastbil_maskin_narvaro(avgang)', db.rpc('lastbil_maskin_narvaro', {
      p_maskiner: maskiner, p_lat: l.lassning.lat, p_lng: l.lassning.lng,
      p_fran: new Date(lassningMs - 36 * TIM).toISOString(), p_till: new Date(lassningMs).toISOString(), p_forsta: false }))
    : null;

  // Skotningskedjan: dagar maskinen arbetade på traktens nummer/uuid, tre dagar före lassningen och tre efter lossningen.
  const lassDag = sthlmDag(l.lassningTid);
  const lossDag = sthlmDag(l.lossningTid);
  const dFran = plusDagar(lassDag, -3);
  const dTill = plusDagar(lossDag, 3);
  const traktar = [fran, till].filter((p): p is FunnenPlats => !!p && p.typ === 'objekt');
  const vo = traktar.map(p => p.kandidat.vo).filter((v): v is string => !!v);
  const uuid = traktar.map(p => p.id);
  const namnPaUuid = new Map(traktar.map(p => [p.id, p.namn]));
  const namnPaVo = new Map(traktar.filter(p => p.kandidat.vo).map(p => [p.kandidat.vo as string, p.id]));
  const arbete: ArbeteDag[] = [];
  if (vo.length) {
    const rader = await las<{ maskin_id: string; objekt_id: string; datum: string }[]>(fel, 'fakt_lass',
      db.from('fakt_lass').select('maskin_id, objekt_id, datum').in('maskin_id', maskiner).in('objekt_id', vo).gte('datum', dFran).lte('datum', dTill).limit(2000));
    for (const r of rader ?? []) {
      const id = namnPaVo.get(r.objekt_id);
      if (id) arbete.push({ maskin_id: r.maskin_id, dag: String(r.datum).slice(0, 10), objekt_id: id, trakt: namnPaUuid.get(id) ?? '' });
    }
  }
  if (uuid.length) {
    const rader = await las<{ maskin_id: string | null; objekt_id: string; datum: string }[]>(fel, 'hyttspar',
      db.from('hyttspar').select('maskin_id, objekt_id, datum').in('maskin_id', maskiner).in('objekt_id', uuid).gte('datum', dFran).lte('datum', dTill).limit(2000));
    for (const r of rader ?? []) if (r.maskin_id) arbete.push({ maskin_id: r.maskin_id, dag: String(r.datum).slice(0, 10), objekt_id: r.objekt_id, trakt: namnPaUuid.get(r.objekt_id) ?? '' });
  }

  // Senast kända position (maskin_position) inom 3 km från lastplatsen, de sju dagarna före.
  const nara = new Set<string>();
  if (l.lassning.lat != null && l.lassning.lng != null) {
    const pos = await las<{ maskin_id: string; lat: number; lng: number; tidpunkt: string }[]>(fel, 'maskin_position',
      db.from('maskin_position').select('maskin_id, lat, lng, tidpunkt').in('maskin_id', maskiner)
        .lte('tidpunkt', l.lassningTid).gte('tidpunkt', new Date(lassningMs - 7 * 24 * TIM).toISOString())
        .order('tidpunkt', { ascending: false }).limit(200));
    const sedd = new Set<string>();
    for (const p of pos ?? []) {
      if (sedd.has(p.maskin_id)) continue;
      sedd.add(p.maskin_id);
      if (haversine(l.lassning.lat, l.lassning.lng, p.lat, p.lng) * 1000 <= 3000) nara.add(p.maskin_id);
    }
  }

  return maskiner.map(m => samlaBevis({
    maskin_id: m, gps, ankomst: ankomst ?? [], avgang: avgang ?? [],
    kedja: byggKedja(arbete, m, { objekt_id: fran?.typ === 'objekt' ? fran.id : null }, { objekt_id: till?.typ === 'objekt' ? till.id : null }, lassDag, lossDag),
    paborjadFlytt: manuell?.typ === 'paborjad' && manuell.flytt.maskin_id === m,
    positionNara: nara.has(m),
  }));
}

const platsFalt = (p: FunnenPlats | null, prefix: 'fran' | 'till') => ({
  [`${prefix}_objekt_id`]: p?.typ === 'objekt' ? p.id : null,
  [`${prefix}_plats_id`]: p?.typ === 'plats' ? p.id : null,
  [`${prefix}_namn`]: p?.namn ?? null,
  [`${prefix}_avstand_m`]: p?.avstandM ?? null,
});

export async function utvardera(c: Ctx, l: DetektLass, utanBevis = false): Promise<Utvardering> {
  const fran = narmastePlats(l.lassning.lat, l.lassning.lng, c.kandidater);
  const till = narmastePlats(l.lossning.lat, l.lossning.lng, c.kandidater);
  const manuell = hittaManuellFlytt(
    { fran: l.lassningFran ?? l.lassningTid, till: l.lossningTill ?? l.lossningTid, lastad: l.lassningTid },
    c.manuella, c.upptagna, c.nu);

  // utanBevis: en engångskörning som bara ska koppla ett lass till en redan registrerad flytt behöver inte fråga efter maskinens GPS.
  const bevis = l.avvisad || utanBevis ? [] : await insamlaBevis(c, l, fran, till, manuell);
  const bedomning = l.avvisad || utanBevis ? null : bedomMaskin(bevis);
  const beslut = beslutaLass({
    lass: l, fran, till, manuell,
    bedomning: bedomning ?? { forslag: null, sakerhet: 'okand', kandidater: [], konflikt: false },
  });

  const rad: Record<string, unknown> = {
    vin: c.vin,
    forsta_lastad_tid: l.forstaLastadTid,
    sista_lastad_tid: l.sistaLastadTid,
    lassning_fran: l.lassningFran,
    lassning_tid: l.lassningTid,
    lassning_lat: l.lassning.lat, lassning_lng: l.lassning.lng,
    lassning_odometer_m: l.lassning.odometer_m, lassning_plats_saker: l.lassning.saker,
    lossning_tid: l.lossningTid, lossning_till: l.lossningTill,
    lossning_lat: l.lossning.lat, lossning_lng: l.lossning.lng,
    lossning_odometer_m: l.lossning.odometer_m, lossning_plats_saker: l.lossning.saker,
    tom_vikt_kg: l.tomKg, lastad_vikt_kg: l.lastadKg, lastvikt_kg: l.lastviktKg, km: l.km,
    ...platsFalt(fran, 'fran'), ...platsFalt(till, 'till'),
    forslag_maskin_id: bedomning?.forslag ?? null,
    sakerhet: bedomning?.sakerhet ?? 'okand',
    kandidater: bedomning?.kandidater ?? [],
    bevis: {
      antal_punkter: l.antalPunkter, sammanslagen: l.sammanslagen, konflikt: bedomning?.konflikt ?? false,
      // Sträckan är bara att lita på när bilen stod stilla i BÅDA ändar — annars är den en uppskattning (sheeten säger "cirka").
      km_osaker: !(l.lassning.saker && l.lossning.saker),
      manuell: manuell ? { typ: manuell.typ, flytt_id: manuell.flytt.id } : null,
      maskiner: bevis,
    },
    kund: beslut.kund,
    status: beslut.status,
    status_orsak: beslut.status_orsak,
  };
  return { rad, beslut, bedomning, manuell, fran, till };
}

/** Skapar flytten (som cron: p_av 'auto'). Misslyckas den stannar lasset som vantar_maskin med orsaken — och frågan går ut. */
async function skapaFlytt(c: Ctx, lassId: string, maskinId: string): Promise<boolean> {
  try {
    const { data, error } = await c.db.rpc('skapa_flytt_ur_lass', { p_lass: lassId, p_maskin_id: maskinId, p_extern_maskin: null, p_kund: null, p_av: 'auto' });
    if (error) throw new Error(error.message);
    if (data?.skapad) return true;
    if (data?.orsak === 'finns_redan') return true;
    return false;
  } catch (e: any) {
    c.fel.push(`skapa_flytt_ur_lass(${lassId}): ${e?.message ?? e}`);
    await c.db.from('lastbil_lass').update({ status_orsak: 'auto_misslyckades' }).eq('id', lassId).eq('status', 'vantar_maskin');
    return false;
  }
}

async function koaNotis(c: Ctx, lassId: string, lassningTid: string): Promise<number> {
  const { db, fel } = c;
  const med = await las<{ id: string; epost: string }[]>(fel, 'medarbetare', db.from('medarbetare').select('id, epost').in('epost', [...LASS_MOTTAGARE_EPOST]).eq('aktiv', true));
  const mottagare: Mottagare[] = med ?? [];
  if (!mottagare.length) { fel.push('Ingen aktiv mottagare för lassnotisen'); return 0; }

  // Rundans start: flyttdagen lasset hör till, annars sex timmar före lassningen.
  const dag = await las<{ starttid: string }[]>(fel, 'flyttdag', db.from('flyttdag').select('starttid').lte('starttid', lassningTid).order('starttid', { ascending: false }).limit(1));
  const rundaStart = dag?.[0]?.starttid ?? new Date(tidMs(lassningTid) - 6 * TIM).toISOString();

  // Närvaro: senast appen öppnades. Kolumnen saknas = migrationen ej körd → ingen närvaro, båda får frågan.
  const narvaro = new Map<string, string | null>();
  const subs = await las<{ medarbetare_id: string; senast_oppnad: string | null }[]>(fel, 'push_subscriptions',
    db.from('push_subscriptions').select('medarbetare_id, senast_oppnad').in('medarbetare_id', mottagare.map(m => m.id)));
  for (const s of subs ?? []) {
    const t = s.senast_oppnad;
    if (t && (!narvaro.get(s.medarbetare_id) || Date.parse(t) > Date.parse(narvaro.get(s.medarbetare_id) as string))) narvaro.set(s.medarbetare_id, t);
  }
  const valda = valjMottagare(mottagare, narvaro, rundaStart);

  const rader = valda.map(m => ({ mottagare_id: m.id, typ: LASS_MASKIN, payload: { lass_id: lassId }, skickas_at: 'infinity', dedup_nyckel: lassId }));
  const ins = await las<{ dedup_nyckel: string }[]>(fel, 'notis_kö', db.from('notis_kö').upsert(rader, { onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true }).select('dedup_nyckel'));
  return ins?.length ?? 0;
}

export const overlapper = (a: { forsta: number; sista: number }, b: { forsta: number; sista: number }): boolean =>
  a.forsta <= b.sista + KLAR_EFTER_MIN * MIN && b.forsta <= a.sista + KLAR_EFTER_MIN * MIN;

export async function koraLassdetektering(db: any, nuDate: Date = new Date()): Promise<LassRapport> {
  const rapport = tomRapport();
  const nu = nuDate.getTime();
  try {
    const bil = await las<any[]>(rapport.fel, 'lastbil', db.from('lastbil').select('vin, hemmabas_lat, hemmabas_lng, hemmabas_radie_m').eq('aktiv', true).limit(1));
    const b = bil?.[0];
    if (!b?.vin) { rapport.ok = rapport.fel.length === 0; return rapport; }
    rapport.vin = b.vin;
    const vin: string = b.vin;

    try {
      await kor(db, nu, vin, b, rapport);
    } finally {
      // Pulsen: svarar på "körs cron:en?" även när bilen står parkerad och loggen är tyst.
      const sista = await las<{ tidpunkt: string }[]>([], 'lastbil_logg', db.from('lastbil_logg').select('tidpunkt').eq('vin', vin).order('tidpunkt', { ascending: false }).limit(1));
      await db.from('lastbil_lass_state').upsert({ vin, senast_kord: nuDate.toISOString(), senaste_logg_tid: sista?.[0]?.tidpunkt ?? null, senaste_rapport: { ...rapport } }, { onConflict: 'vin' });
    }
  } catch (e: any) {
    rapport.fel.push(e?.message ?? String(e));
  }
  rapport.ok = rapport.fel.length === 0;
  return rapport;
}

async function kor(db: any, nu: number, vin: string, bil: any, rapport: LassRapport): Promise<void> {
  const fel = rapport.fel;
  const fran = new Date(nu - FONSTER_TIM * TIM).toISOString();
  const logg = await las<any[]>(fel, 'lastbil_logg', db.from('lastbil_logg')
    .select('tidpunkt, lat, lng, hastighet, odometer_m, vikt:radata->rfms->>grossCombinationVehicleWeight')
    .eq('vin', vin).gte('tidpunkt', fran).order('tidpunkt', { ascending: false }).limit(1000));
  if (!logg) return;

  const alla: LoggPunkt[] = logg.reverse().map(r => ({
    tidpunkt: r.tidpunkt, lat: r.lat, lng: r.lng, hastighet: r.hastighet, odometer_m: r.odometer_m,
    vikt_kg: r.vikt != null && r.vikt !== '' ? Number(r.vikt) : null,
  }));
  rapport.loggPunkter = alla.length;

  // Fönstret ska börja med bilen TOM: en period som redan pågick när fönstret började är avskuren och räknas inte.
  const vikt = viktPunkter(alla);
  const forstaTom = vikt.find(p => (p.vikt_kg as number) <= LASS.TOM_KG);
  if (!forstaTom) return;
  const fonster = alla.filter(p => tidMs(p.tidpunkt) >= tidMs(forstaTom.tidpunkt));
  rapport.lastadePunkter = viktPunkter(fonster).filter(p => (p.vikt_kg as number) >= LASS.GOLV_KG).length;
  if (!rapport.lastadePunkter) return;

  // Platser och maskiner: bara när det finns något lastat att placera.
  const [objekt, platser, maskinRader] = await Promise.all([
    las<any[]>(fel, 'objekt', db.from('objekt').select('id, namn, lat, lng, bolag, markagare, vo_nummer').not('lat', 'is', null).not('lng', 'is', null).limit(5000)),
    las<any[]>(fel, 'flyttplats', db.from('flyttplats').select('id, namn, typ, lat, lng').eq('aktiv', true).limit(1000)),
    las<any[]>(fel, 'dim_maskin', db.from('dim_maskin').select('maskin_id, aktiv_till').limit(200)),
  ]);
  if (!objekt || !platser || !maskinRader) return;   // en halv kandidatlista ger fel Från/Till — hellre ingen utvärdering
  const idag = new Date(nu).toISOString().slice(0, 10);
  const kandidater: PlatsKandidat[] = [
    ...objekt.map(o => ({ typ: 'objekt' as const, id: o.id, namn: o.namn, lat: o.lat, lng: o.lng, bolag: o.bolag, markagare: o.markagare, vo: o.vo_nummer })),
    ...platser.map(p => ({ typ: 'plats' as const, id: p.id, namn: p.namn, lat: p.lat, lng: p.lng, platsTyp: p.typ })),
  ];
  const bas = bil.hemmabas_lat != null && bil.hemmabas_lng != null ? { lat: bil.hemmabas_lat, lng: bil.hemmabas_lng, radieM: bil.hemmabas_radie_m ?? 300 } : null;

  const resultat = detekteraLass(fonster, { narPlatsM: narPlatsMeter(kandidater), bas: bas ?? undefined });

  // Redan funna lass (för överlapp) och väntande (för omvärdering).
  const befintliga = await las<any[]>(fel, 'lastbil_lass', db.from('lastbil_lass')
    .select('id, forsta_lastad_tid, sista_lastad_tid, status, status_orsak, flytt_id, skapad_tid, lassning_tid')
    .eq('vin', vin).gte('sista_lastad_tid', new Date(tidMs(forstaTom.tidpunkt) - 2 * TIM).toISOString()));
  if (!befintliga) return;

  // Förarens egna flyttar kring lassen, och vilka flyttar som redan hör till något lass.
  const minT = Math.min(...resultat.lass.map(x => tidMs(x.lassningFran ?? x.lassningTid)), nu) - 12 * TIM;
  const manuella = await las<any[]>(fel, 'maskin_flytt', db.from('maskin_flytt')
    .select('id, maskin_id, extern_maskin, starttid, hamtad_tid, sluttid, avbruten').gte('starttid', new Date(minT).toISOString()).limit(500));
  const upptagnaRader = await las<any[]>(fel, 'lastbil_lass(flytt)', db.from('lastbil_lass').select('flytt_id').not('flytt_id', 'is', null).gte('skapad_tid', new Date(minT - 24 * TIM).toISOString()));
  if (!manuella || !upptagnaRader) return;

  const c: Ctx = {
    db, nu, vin, bas,
    kandidater,
    maskiner: maskinRader.filter(m => !m.aktiv_till || m.aktiv_till >= idag).map(m => m.maskin_id),
    manuella: manuella as ManuellFlytt[],
    upptagna: new Set(upptagnaRader.map(r => r.flytt_id as string)),
    fel,
  };

  for (const l of resultat.lass) {
    if (!l.klar) { rapport.oavslutade++; continue; }
    // Klar först när en falsk tom mitt i lasset inte längre kan följas av fler lastade punkter (se kontrollen i detektera.ts).
    if (nu - tidMs(l.sistaLastadTid) <= KLAR_EFTER_MIN * MIN) { rapport.oavslutade++; continue; }

    const span = { forsta: tidMs(l.forstaLastadTid), sista: tidMs(l.sistaLastadTid) };
    const finns = befintliga.find(e => e.forsta_lastad_tid && overlapper(span, { forsta: tidMs(e.forsta_lastad_tid), sista: tidMs(e.sista_lastad_tid) }));

    if (finns) {
      // Väntande lass utvärderas om i 24 timmar: maskinernas spår kan ha kommit.
      if (finns.status !== 'vantar_maskin' || nu - tidMs(finns.skapad_tid) > OMVARDERA_TIM * TIM) continue;
      rapport.omvarderade++;
      await hanteraVantande(c, rapport, l, finns.id);
      continue;
    }

    const u = await utvardera(c, l);
    if (u.manuell?.typ === 'match') c.upptagna.add(u.manuell.flytt.id);
    const rad = { ...u.rad };
    if (u.beslut.status === 'matchad_manuell' && u.manuell) rad.flytt_id = u.manuell.flytt.id;
    if (u.beslut.status === 'matchad_manuell') { rad.besvarad_av = 'matchad'; rad.besvarad_tid = new Date(nu).toISOString(); }

    const ins = await las<{ id: string }[]>(fel, 'lastbil_lass(insert)',
      db.from('lastbil_lass').upsert(rad, { onConflict: 'vin,forsta_lastad_tid', ignoreDuplicates: true }).select('id'));
    const id = ins?.[0]?.id;
    if (!id) continue;                       // en annan körning hann före, eller skrivfel (loggat)
    rapport.nya++;

    if (u.beslut.status === 'avvisad') { rapport.avvisade++; continue; }
    if (u.beslut.status === 'matchad_manuell' && u.manuell) {
      rapport.matchade++;
      await las(fel, 'fyll_flytt_ur_lass', db.rpc('fyll_flytt_ur_lass', { p_lass: id, p_flytt: u.manuell.flytt.id }));
      continue;
    }
    if (u.beslut.autoSkapa && u.bedomning?.forslag && await skapaFlytt(c, id, u.bedomning.forslag)) { rapport.auto++; continue; }
    rapport.vantar++;
  }

  // Frågan går ut när lasset väntat tillräckligt länge på att maskinernas spår skulle komma.
  const vantande = await las<any[]>(fel, 'lastbil_lass(vantar)', db.from('lastbil_lass')
    .select('id, lassning_tid, lossning_tid').eq('vin', vin).eq('status', 'vantar_maskin')
    .gte('skapad_tid', new Date(nu - OMVARDERA_TIM * TIM).toISOString()));
  for (const v of vantande ?? []) {
    if (nu - tidMs(v.lossning_tid) < NOTIS_FORDROJNING_MIN * MIN) continue;
    rapport.notiser += await koaNotis(c, v.id, v.lassning_tid);
  }
}

/** Utvärderar ett redan sparat, väntande lass på nytt: uppdaterar bevisen, och skapar flytten om det nu är Hög. */
async function hanteraVantande(c: Ctx, rapport: LassRapport, l: DetektLass, id: string): Promise<void> {
  const u = await utvardera(c, l);
  const { vin: _v, forsta_lastad_tid: _f, status: _s, ...uppdatera } = u.rad as any;
  const { error } = await c.db.from('lastbil_lass').update({ ...uppdatera, status_orsak: u.beslut.status_orsak }).eq('id', id).eq('status', 'vantar_maskin');
  if (error) { rapport.fel.push(`lastbil_lass(update): ${error.message}`); return; }

  if (u.beslut.status === 'matchad_manuell' && u.manuell) {
    c.upptagna.add(u.manuell.flytt.id);
    const { error: e2 } = await c.db.from('lastbil_lass').update({ status: 'matchad_manuell', status_orsak: null, flytt_id: u.manuell.flytt.id, besvarad_av: 'matchad', besvarad_tid: new Date(c.nu).toISOString() }).eq('id', id).eq('status', 'vantar_maskin');
    if (e2) { rapport.fel.push(`lastbil_lass(matcha): ${e2.message}`); return; }
    rapport.matchade++;
    await las(rapport.fel, 'fyll_flytt_ur_lass', c.db.rpc('fyll_flytt_ur_lass', { p_lass: id, p_flytt: u.manuell.flytt.id }));
    return;
  }
  if (u.beslut.autoSkapa && u.bedomning?.forslag && await skapaFlytt(c, id, u.bedomning.forslag)) rapport.auto++;
}
