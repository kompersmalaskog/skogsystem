// ENGÅNGSKÖRNING: för in lassen som vikten visar i en historisk period (3 aug–15 okt 2026) i lastbil_lass, så de syns under
// "N lass saknar maskin" och besvaras i appen (besvara_lass / avvisa_lass) precis som nya lass.
//
// SAMMA LOGIK som cron-jobbet (kor.ts): detekteraLass, utvardera (platser, kund, maskinbevis, bedomMaskin). Det som skiljer är vad som
// SKRIVS, och det är avsiktligt strängare:
//
//   • ALDRIG en automatisk flytt. skapa_flytt_ur_lass anropas aldrig, inte ens när maskinen är Hög: en människa godkänner varje lass.
//     Alla blir status vantar_maskin (förslaget och säkerheten ligger kvar i raden, så svaret är ett tryck).
//   • INGA pushar. Ingen rad köas i notis_kö, och skapad_tid sätts till LOSSNINGSTIDEN (inte now()), så cron-jobbets "väntande"-loop
//     (skapad_tid inom 24 h) aldrig plockar raden. Raden märks bevis.historisk = true.
//   • Ett lass med en REGISTRERAD flytt (samma tid och samma plats, matcha.ts sokRegistreradeFlyttar) blir ingen fråga: det kopplas
//     till flytten (status matchad_manuell, som cron-jobbet) och fyll_flytt_ur_lass fyller BARA tomma fält (odometer, Från) — aldrig
//     över något som finns. Från fylls bara när bilen stod stilla vid en trakt (säker plats); annars lämnas den tom.
//   • Samma tid men ANNAN plats (eller en avbruten flytt): lasset blir en fråga, och frågan säger det ("En flytt med H8E -23 finns
//     samma tid", bevis.flytt_samma_tid), så den som svarar kan avvisa i stället för att dubblera.
//   • Avvisade lass (enstaka mätning, för lite last, ingen transport) och lass som inte är klara lagras inte.
//   • Idempotent: unik nyckel (vin, första lastade punkten) + överlappskontroll mot befintliga lass. En ny körning ger 0 nya.
//   • Intervallet måste sluta före cron-jobbets fönster (FONSTER_TIM): de senaste dagarna äger cron-jobbet.
//
// Torrkörning är standard (skriv: false): hela kedjan körs och rapporten skrivs, men inget skrivs till databasen och fyll_flytt_ur_lass
// anropas inte. Startas från GitHub Actions (.github/workflows/lass-historik.yml → scripts/lass-historik.ts).

import { sthlmDagGranserUtc } from '@/lib/optiTid';
import { FONSTER_TIM, KLAR_EFTER_MIN, las, overlapper, utvardera, type Ctx } from './kor';
import { detekteraLass, LASS, tidMs, viktPunkter, type DetektLass, type LoggPunkt } from './detektera';
import { sokRegistreradeFlyttar, type LassPlatser, type RegistreradFlytt } from './matcha';
import { narmastePlats, narPlatsMeter, PLATS_NARA_M, type PlatsKandidat } from './plats';
import type { Sakerhet } from './maskin';
import { samtidigText, type SamtidigFlytt } from './samtidig';

const TIM = 3_600_000;
const SIDA = 1000;

export type Utfall = 'fraga' | 'matchad' | 'avvisad' | 'ej_klar' | 'finns_lass';

export interface HistorikAlt {
  /** Första svenska dagen (YYYY-MM-DD), inklusive. */
  fran: string;
  /** Sista svenska dagen + 1 (YYYY-MM-DD), EXKLUSIV: 2026-10-16 tar med hela 15 okt. */
  till: string;
  skriv: boolean;
  nu?: Date;
}


export interface HistorikRad {
  nr: number;
  utfall: Utfall;
  /** Varför lasset hoppades över (avvisad, ej klar, finns redan) — eller varför det väntar (status_orsak). */
  orsak: string | null;
  forstaLastad: string;
  lassning: string;
  lossning: string;
  fran: string | null;
  franM: number | null;
  till: string | null;
  tillM: number | null;
  km: number | null;
  kmOsaker: boolean;
  lastviktKg: number;
  bruttoKg: number;
  tomKg: number | null;
  forslag: string | null;
  forslagNamn: string | null;
  sakerhet: Sakerhet;
  /** Förarens flytt som lasset kopplas till (utfall matchad), med de tomma fält som fylls. */
  flytt: { id: string; maskin: string | null; fyller: string[]; franUtelamnad: string | null } | null;
  samtidiga: SamtidigFlytt[];
  /** Samma, som den mening frågan i appen visar ('En flytt med H8E -23 finns samma tid'). */
  samtidigaText: string[];
  /** lastbil_lass.id efter skrivning. */
  lassId: string | null;
}

export interface HistorikRapport {
  ok: boolean;
  skriv: boolean;
  fran: string;
  till: string;
  rader: HistorikRad[];
  antal: Record<Utfall, number>;
  /** Flyttar där fyll_flytt_ur_lass fyllde minst ett fält (efter läsning tillbaka). */
  fyllda: number;
  fel: string[];
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Svensk dag och klockslag för sammanställningen ("2026-08-03", "09:11"). */
export const sthlmDatum = (iso: string): string => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
export const sthlmKlocka = (iso: string): string => new Date(iso).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });

/** Loggen i sidor om 1 000 (PostgREST kapar annars tyst): ett läsfel är ett fel, aldrig en halv logg. */
async function lasLogg(db: any, vin: string, franIso: string, tillIso: string, fel: string[]): Promise<LoggPunkt[] | null> {
  const ut: any[] = [];
  for (let sida = 0; ; sida++) {
    if (sida >= 100) { fel.push('lastbil_logg: för många sidor (över 100 000 rader)'); return null; }
    const r = await las<any[]>(fel, 'lastbil_logg', db.from('lastbil_logg')
      .select('tidpunkt, lat, lng, hastighet, odometer_m, vikt:radata->rfms->>grossCombinationVehicleWeight')
      .eq('vin', vin).gte('tidpunkt', franIso).lt('tidpunkt', tillIso)
      .order('tidpunkt', { ascending: true }).range(sida * SIDA, sida * SIDA + SIDA - 1));
    if (!r) return null;
    ut.push(...r);
    if (r.length < SIDA) break;
  }
  return ut.map(r => ({
    tidpunkt: r.tidpunkt, lat: r.lat, lng: r.lng, hastighet: r.hastighet, odometer_m: r.odometer_m,
    vikt_kg: r.vikt != null && r.vikt !== '' ? Number(r.vikt) : null,
  }));
}

const tomAntal = (): Record<Utfall, number> => ({ fraga: 0, matchad: 0, avvisad: 0, ej_klar: 0, finns_lass: 0 });

export async function koraHistoriskaLass(db: any, alt: HistorikAlt): Promise<HistorikRapport> {
  const nuDate = alt.nu ?? new Date();
  const nu = nuDate.getTime();
  const rapport: HistorikRapport = { ok: false, skriv: alt.skriv, fran: alt.fran, till: alt.till, rader: [], antal: tomAntal(), fyllda: 0, fel: [] };
  const fel = rapport.fel;

  if (!DATUM.test(alt.fran) || !DATUM.test(alt.till) || alt.fran >= alt.till) {
    fel.push(`Ogiltigt intervall: fran ${alt.fran}, till ${alt.till} (YYYY-MM-DD, till är exklusiv och måste vara efter fran)`);
    return rapport;
  }
  const franMs = Date.parse(sthlmDagGranserUtc(alt.fran).fran);
  const tillMs = Date.parse(sthlmDagGranserUtc(alt.till).fran);
  // De senaste dagarna äger cron-jobbet (dess fönster, dess pushar). En historisk rad som hamnar där kunde krocka med det.
  if (tillMs > nu - FONSTER_TIM * TIM) {
    fel.push(`Intervallet måste sluta senast ${new Date(nu - FONSTER_TIM * TIM).toISOString().slice(0, 10)} (före cron-jobbets fönster på ${FONSTER_TIM} h); ${alt.till} är för nytt.`);
    return rapport;
  }

  try {
    await kor(db, nu, franMs, tillMs, alt.skriv, rapport);
  } catch (e: any) {
    fel.push(e?.message ?? String(e));
  }
  rapport.ok = fel.length === 0;
  return rapport;
}

async function kor(db: any, nu: number, franMs: number, tillMs: number, skriv: boolean, rapport: HistorikRapport): Promise<void> {
  const fel = rapport.fel;
  const bil = await las<any[]>(fel, 'lastbil', db.from('lastbil').select('vin, hemmabas_lat, hemmabas_lng, hemmabas_radie_m').eq('aktiv', true).limit(1));
  const b = bil?.[0];
  if (!b?.vin) { if (!fel.length) fel.push('Ingen aktiv lastbil'); return; }
  const vin: string = b.vin;

  // Loggen: tre dagar före (så bilen börjar TOM, som cron-fönstret) till två dagar efter (så lossningen syns).
  const logg = await lasLogg(db, vin, new Date(franMs - 3 * 24 * TIM).toISOString(), new Date(tillMs + 2 * 24 * TIM).toISOString(), fel);
  if (!logg) return;
  const forstaTom = viktPunkter(logg).find(p => (p.vikt_kg as number) <= LASS.TOM_KG);
  if (!forstaTom) return;
  const fonster = logg.filter(p => tidMs(p.tidpunkt) >= tidMs(forstaTom.tidpunkt));

  const [objekt, platser, maskinRader] = await Promise.all([
    las<any[]>(fel, 'objekt', db.from('objekt').select('id, namn, lat, lng, bolag, markagare, vo_nummer').not('lat', 'is', null).not('lng', 'is', null).limit(5000)),
    las<any[]>(fel, 'flyttplats', db.from('flyttplats').select('id, namn, typ, lat, lng').eq('aktiv', true).limit(1000)),
    las<any[]>(fel, 'dim_maskin', db.from('dim_maskin').select('maskin_id, visningsnamn, aktiv_till').limit(200)),
  ]);
  if (!objekt || !platser || !maskinRader) return;   // en halv kandidatlista ger fel Från/Till — hellre ingen utvärdering
  const idag = new Date(nu).toISOString().slice(0, 10);
  const kandidater: PlatsKandidat[] = [
    ...objekt.map(o => ({ typ: 'objekt' as const, id: o.id, namn: o.namn, lat: o.lat, lng: o.lng, bolag: o.bolag, markagare: o.markagare, vo: o.vo_nummer })),
    ...platser.map(p => ({ typ: 'plats' as const, id: p.id, namn: p.namn, lat: p.lat, lng: p.lng, platsTyp: p.typ })),
  ];
  const namnPa = new Map<string, string>(maskinRader.map(m => [m.maskin_id as string, (m.visningsnamn as string) || (m.maskin_id as string)]));
  const bas = b.hemmabas_lat != null && b.hemmabas_lng != null ? { lat: b.hemmabas_lat, lng: b.hemmabas_lng, radieM: b.hemmabas_radie_m ?? 300 } : null;

  const resultat = detekteraLass(fonster, { narPlatsM: narPlatsMeter(kandidater), bas: bas ?? undefined });

  const befintliga = await las<any[]>(fel, 'lastbil_lass', db.from('lastbil_lass')
    .select('id, forsta_lastad_tid, sista_lastad_tid, status, flytt_id')
    .eq('vin', vin).gte('sista_lastad_tid', new Date(franMs - 24 * TIM).toISOString()).limit(2000));
  const flyttar = await las<any[]>(fel, 'maskin_flytt', db.from('maskin_flytt')
    .select('id, maskin_id, extern_maskin, starttid, hamtad_tid, sluttid, avbruten, fran_objekt_id, fran_plats_id, fran_lat, fran_lng, till_objekt_id, till_plats_id, till_lat, till_lng, fran_odometer_m, till_odometer_m')
    .gte('starttid', new Date(franMs - 12 * TIM).toISOString()).lt('starttid', new Date(tillMs + 12 * TIM).toISOString()).limit(2000));
  if (!befintliga || !flyttar) return;
  if (befintliga.length >= 2000 || flyttar.length >= 2000) { fel.push('För många rader i intervallet (2 000) — korta intervallet'); return; }

  const reg = flyttar as RegistreradFlytt[];
  // En flytt = ett lass: flyttar som redan är kopplade till något lass (cron-jobbets, oavsett när det lasset ligger) matchas inte igen.
  const upptagna = new Set<string>();
  for (let i = 0; i < reg.length; i += 100) {
    const kopplade = await las<{ flytt_id: string }[]>(fel, 'lastbil_lass(flytt)', db.from('lastbil_lass').select('flytt_id').in('flytt_id', reg.slice(i, i + 100).map(f => f.id)));
    if (!kopplade) return;
    for (const k of kopplade) if (k.flytt_id) upptagna.add(k.flytt_id);
  }
  // utvardera ser bara de AVBRUTNA flyttarna: då kan den aldrig själv besluta "matchad" (det avgör den här filen, med platsen), men
  // en avbruten flytt ger fortfarande maskinen som förslag ("påbörjad flytt").
  const c: Ctx = {
    db, nu, vin, bas, kandidater,
    maskiner: maskinRader.filter(m => !m.aktiv_till || m.aktiv_till >= idag).map(m => m.maskin_id as string),
    manuella: reg.filter(f => f.avbruten), upptagna: new Set<string>(), fel,
  };

  const nuIso = new Date(nu).toISOString();
  const skrivRader: { rad: HistorikRad; db: Record<string, unknown> }[] = [];
  let nr = 0;
  for (const l of resultat.lass) {
    const forsta = tidMs(l.forstaLastadTid);
    if (forsta < franMs || forsta >= tillMs) continue;
    nr++;
    const grund = (utfall: Utfall, orsak: string | null): HistorikRad => radAv(nr, utfall, orsak, l, null, null, namnPa);

    if (l.avvisad) { rapport.rader.push(grund('avvisad', l.avvisad)); continue; }
    if (!l.klar || nu - tidMs(l.sistaLastadTid) <= KLAR_EFTER_MIN * 60_000) { rapport.rader.push(grund('ej_klar', 'bilen är fortfarande lastad')); continue; }
    const span = { forsta, sista: tidMs(l.sistaLastadTid) };
    if (befintliga.some(e => e.forsta_lastad_tid && overlapper(span, { forsta: tidMs(e.forsta_lastad_tid), sista: tidMs(e.sista_lastad_tid) }))) {
      rapport.rader.push(grund('finns_lass', 'finns redan i lastbil_lass')); continue;
    }

    // Registrerad flytt? Tid + plats.
    const franP = narmastePlats(l.lassning.lat, l.lassning.lng, kandidater);
    const tillP = narmastePlats(l.lossning.lat, l.lossning.lng, kandidater);
    const lp: LassPlatser = { fran: franP, till: tillP, lassning: l.lassning, lossning: l.lossning };
    // sokRegistreradeFlyttar ser alla flyttar: en avbruten flytt i samma tid räknas som samtidig, aldrig som registrerad.
    const sok = sokRegistreradeFlyttar({ fran: l.lassningFran ?? l.lassningTid, till: l.lossningTill ?? l.lossningTid, lastad: l.lassningTid }, lp, reg, upptagna, nu);
    const samtidiga: SamtidigFlytt[] = sok.samtidiga.map(s => ({
      flytt_id: s.flytt.id, maskin_id: s.flytt.maskin_id, extern_maskin: s.flytt.extern_maskin, avbruten: s.flytt.avbruten, skal: s.skal,
    }));

    if (sok.registrerad) {
      const f = sok.registrerad;
      upptagna.add(f.id);
      const u = await utvardera(c, l, true);
      const franSaker = !!franP && l.lassning.saker && franP.avstandM <= PLATS_NARA_M;
      const franTom = f.fran_objekt_id == null && f.fran_plats_id == null;
      const fyller: string[] = [];
      if (f.fran_odometer_m == null && l.lassning.odometer_m != null) fyller.push('odometer vid lassning');
      if (f.till_odometer_m == null && l.lossning.odometer_m != null) fyller.push('odometer vid lossning');
      if (franTom && franP && franSaker) fyller.push(`Från: ${franP.namn}`);
      const franUtelamnad = franTom && franP && !franSaker ? franP.namn : null;
      const rad = radAv(nr, 'matchad', null, l, u, { id: f.id, maskin: namnaMaskin(f, namnPa), fyller, franUtelamnad }, namnPa);
      rad.samtidiga = [];
      rapport.rader.push(rad);
      skrivRader.push({
        rad,
        db: {
          ...u.rad,
          // Från fylls bara när platsen är säker: en osäker träff lämnas ur raden, så fyll_flytt_ur_lass inte kan fylla Från med en gissning.
          ...(franSaker ? {} : { fran_objekt_id: null, fran_plats_id: null }),
          status: 'matchad_manuell', status_orsak: null, flytt_id: f.id, besvarad_av: 'matchad', besvarad_tid: nuIso,
          skapad_tid: l.lossningTid,
          bevis: { ...(u.rad.bevis as object), historisk: true, ...(franSaker ? {} : { fran_utelamnad: true }) },
        },
      });
      continue;
    }

    const u = await utvardera(c, l);
    const rad = radAv(nr, 'fraga', u.beslut.autoSkapa ? null : u.beslut.status_orsak, l, u, null, namnPa);
    rad.samtidiga = samtidiga;
    rad.samtidigaText = samtidiga.map(s => samtidigText(s, s.maskin_id ? namnPa.get(s.maskin_id) ?? s.maskin_id : null));
    rapport.rader.push(rad);
    skrivRader.push({
      rad,
      db: {
        ...u.rad,
        // ALDRIG auto: även ett Hög-lass blir en fråga. cron-jobbets autoSkapa-fall har status_orsak null (förslaget ligger i raden).
        status: 'vantar_maskin', status_orsak: u.beslut.autoSkapa ? null : u.beslut.status_orsak,
        skapad_tid: l.lossningTid,
        bevis: { ...(u.rad.bevis as object), historisk: true, flytt_samma_tid: samtidiga },
      },
    });
  }

  if (skriv && !fel.length) await skrivAllt(db, skrivRader, rapport, reg);

  for (const r of rapport.rader) rapport.antal[r.utfall]++;
}

const namnaMaskin = (f: { maskin_id: string | null; extern_maskin: string | null }, namnPa: Map<string, string>): string | null =>
  f.maskin_id ? namnPa.get(f.maskin_id) ?? f.maskin_id : f.extern_maskin;

function radAv(
  nr: number, utfall: Utfall, orsak: string | null, l: DetektLass, u: Awaited<ReturnType<typeof utvardera>> | null,
  flytt: HistorikRad['flytt'], namnPa: Map<string, string>,
): HistorikRad {
  const forslag = (u?.bedomning?.forslag as string | null | undefined) ?? null;
  return {
    nr, utfall, orsak,
    forstaLastad: l.forstaLastadTid, lassning: l.lassningTid, lossning: l.lossningTid,
    fran: u?.fran?.namn ?? null, franM: u?.fran?.avstandM ?? null, till: u?.till?.namn ?? null, tillM: u?.till?.avstandM ?? null,
    km: l.km, kmOsaker: !(l.lassning.saker && l.lossning.saker),
    lastviktKg: l.lastviktKg, bruttoKg: l.lastadKg, tomKg: l.tomKg,
    forslag, forslagNamn: forslag ? namnPa.get(forslag) ?? forslag : null,
    sakerhet: u?.bedomning?.sakerhet ?? 'okand',
    flytt, samtidiga: [], samtidigaText: [], lassId: null,
  };
}

async function skrivAllt(db: any, skrivRader: { rad: HistorikRad; db: Record<string, unknown> }[], rapport: HistorikRapport, reg: RegistreradFlytt[]): Promise<void> {
  const fel = rapport.fel;
  if (!skrivRader.length) return;
  // EN upsert som ignorerar dubbletter: en körning som hann före (eller en omkörning) lämnar raden orörd.
  const ins = await las<{ id: string; forsta_lastad_tid: string }[]>(fel, 'lastbil_lass(insert)',
    db.from('lastbil_lass').upsert(skrivRader.map(s => s.db), { onConflict: 'vin,forsta_lastad_tid', ignoreDuplicates: true }).select('id, forsta_lastad_tid'));
  if (!ins) return;
  const idPaTid = new Map(ins.map(r => [tidMs(r.forsta_lastad_tid), r.id]));
  for (const s of skrivRader) {
    const id = idPaTid.get(tidMs(s.rad.forstaLastad));
    if (id) s.rad.lassId = id;
    else { s.rad.utfall = 'finns_lass'; s.rad.orsak = 'fanns redan (unik nyckel)'; }
  }

  // Fyll bara de tomma fälten på förarens flyttar. Funktionen (migration 20261019150000) fyller COALESCE-vis och rör ingenting som finns.
  const fyllde = new Set<string>();
  for (const s of skrivRader) {
    if (s.rad.utfall !== 'matchad' || !s.rad.lassId || !s.rad.flytt) continue;
    try {
      const { data, error } = await db.rpc('fyll_flytt_ur_lass', { p_lass: s.rad.lassId, p_flytt: s.rad.flytt.id });
      if (error) throw new Error(error.message);
      if (data?.ok !== true) throw new Error(`svarade ${JSON.stringify(data)}`);
    } catch (e: any) {
      fel.push(`fyll_flytt_ur_lass(${s.rad.flytt.id}): ${e?.message ?? e}`);
    }
  }

  // Läs tillbaka: det som skulle fyllas ska nu vara fyllt. (En flytt med godkänt underlag är låst och fylls inte: det är inget fel.)
  const planerade = skrivRader.filter(s => s.rad.utfall === 'matchad' && s.rad.flytt && s.rad.flytt.fyller.length);
  if (planerade.length) {
    const nu = await las<any[]>(fel, 'maskin_flytt(kontroll)', db.from('maskin_flytt')
      .select('id, fran_odometer_m, till_odometer_m, fran_objekt_id, fran_plats_id').in('id', planerade.map(s => s.rad.flytt!.id)));
    for (const s of planerade) {
      const f = (nu ?? []).find(x => x.id === s.rad.flytt!.id);
      const fore = reg.find(x => x.id === s.rad.flytt!.id);
      if (!f || !fore) continue;
      const ny = (f.fran_odometer_m != null && fore.fran_odometer_m == null) || (f.till_odometer_m != null && fore.till_odometer_m == null)
        || ((f.fran_objekt_id != null || f.fran_plats_id != null) && fore.fran_objekt_id == null && fore.fran_plats_id == null);
      if (ny) fyllde.add(f.id);
      // Något som FANNS får aldrig ha ändrats.
      if (fore.fran_odometer_m != null && f.fran_odometer_m !== fore.fran_odometer_m) fel.push(`flytt ${f.id}: fran_odometer_m ändrades (${fore.fran_odometer_m} → ${f.fran_odometer_m})`);
      if (fore.till_odometer_m != null && f.till_odometer_m !== fore.till_odometer_m) fel.push(`flytt ${f.id}: till_odometer_m ändrades (${fore.till_odometer_m} → ${f.till_odometer_m})`);
      if (fore.fran_objekt_id != null && f.fran_objekt_id !== fore.fran_objekt_id) fel.push(`flytt ${f.id}: fran_objekt_id ändrades`);
      if (fore.fran_plats_id != null && f.fran_plats_id !== fore.fran_plats_id) fel.push(`flytt ${f.id}: fran_plats_id ändrades`);
    }
  }
  rapport.fyllda = fyllde.size;
}
