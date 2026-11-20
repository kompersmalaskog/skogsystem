// Kortet "Var är bilen?" (förut "Bilen nu"): vad lastbilen gör just nu, härlett ur /api/lastbil. Rena funktioner — all text byggs här
// så den går att testa, och så vyn bara ritar. Stockholmstid genomgående (servern kör UTC).
//
// Tillstånd syns, de räknas aldrig ut (skillen): läget står i ord, en tänd varningslampa TAR ÖVER rubriken,
// och tankraden har orden bredvid siffran (färgen förstärker bara).

import { sthlmDelar } from '@/lib/sthlmTid';

export type Runda = {
  id: string; starttid: string | null; sluttid: string | null;
  typ: 'flytt' | 'ovrig' | 'pagar'; antal_flytt: number;
  matare_km: number | null; bransle_l: number | null; l_per_mil: number | null;
};

export type LastbilData = {
  ok: boolean; harData: boolean; namn?: string | null;
  position: { lat: number; lng: number; tidpunkt: string | null; alder_min: number | null } | null;
  tank: { diesel_pct: number | null; adblue_pct: number | null; rackvidd_km: number | null } | null;
  halsa: { har_lampor: boolean; lampor: { kod: string; namn: string; state: string }[]; service_km: number | null; matare_km: number | null; motortimmar: number | null } | null;
  spar_idag?: { lat: number; lng: number; t?: string }[];
  runda_pagar: boolean; oppen_runda_id: string | null;
  oppen_runda: { id: string; starttid: string | null; live_km: number | null; maskin: { namn: string; lage: 'flaket' | 'lossad' } | null; pa_vag_hem: boolean; km_kvar: number | null } | null;
  parkerad: { plats: string; sedan: string | null } | null;
  rundor: Runda[]; saknas: string[];
};

/** Gränser som styr när tanken blir en avvikelse. En källa — Nu-kortet och rubriken läser samma. */
export const GRANS = { dieselRod: 15, dieselOrange: 25, rackviddOrange: 150, adblueOrange: 20 } as const;

const MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const DAG = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];

const tvasiffrig = (n: number) => String(n).padStart(2, '0');

/** "12:05" i Stockholmstid. */
export function fmtKlocka(iso: string | null): string {
  if (!iso) return '';
  const d = sthlmDelar(new Date(iso));
  return d ? `${tvasiffrig(d.h)}:${tvasiffrig(d.mi)}` : '';
}

/** "mån 12 okt" i Stockholmstid. */
export function fmtDatum(iso: string | null): string {
  if (!iso) return '—';
  const d = sthlmDelar(new Date(iso));
  if (!d) return '—';
  const veckodag = new Date(Date.UTC(d.ar, d.man - 1, d.dag)).getUTCDay();
  return `${DAG[veckodag]} ${d.dag} ${MANAD[d.man - 1]}`;
}

/** "för 5 min sedan", "för 2 h 10 min sedan". null = okänd. */
export function fmtAlder(min: number | null): string {
  if (min == null) return 'okänd tid';
  if (min < 1) return 'nyss';
  if (min < 60) return `för ${min} min sedan`;
  const h = Math.floor(min / 60), m = min % 60;
  return `för ${h} h${m ? ` ${m} min` : ''} sedan`;
}

/** Samma Stockholmsdag som `nu`? */
function arIdag(iso: string, nu: Date): boolean {
  const d = sthlmDelar(new Date(iso)), n = sthlmDelar(nu);
  return !!d && !!n && d.ar === n.ar && d.man === n.man && d.dag === n.dag;
}

/** "12 okt" i Stockholmstid. */
function fmtDagManad(iso: string): string {
  const d = sthlmDelar(new Date(iso));
  return d ? `${d.dag} ${MANAD[d.man - 1]}` : '';
}

const DAG_LANG = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];

/** Veckodagen (0 = söndag) för ett datum i Stockholmstid. */
function veckodag(iso: string): number | null {
  const d = sthlmDelar(new Date(iso));
  return d ? new Date(Date.UTC(d.ar, d.man - 1, d.dag)).getUTCDay() : null;
}

/** "torsdag 22 okt" i Stockholmstid — veckodagen utskriven, för rundraden. */
export function fmtDatumLang(iso: string | null): string {
  if (!iso) return '—';
  const d = sthlmDelar(new Date(iso));
  if (!d) return '—';
  return `${DAG_LANG[veckodag(iso)!]} ${d.dag} ${MANAD[d.man - 1]}`;
}

/** Hela svenska kalenderdagar mellan `iso` och `nu` (0 = samma dag). null = okänd. */
function kalenderdagarSedan(iso: string, nu: Date): number | null {
  const d = sthlmDelar(new Date(iso)), n = sthlmDelar(nu);
  if (!d || !n) return null;
  return Math.round((Date.UTC(n.ar, n.man - 1, n.dag) - Date.UTC(d.ar, d.man - 1, d.dag)) / 86400000);
}

/**
 * EN tid, i ord när det går: "sedan 13:16" (idag), "sedan igår", "sedan i torsdags" (2–6 dagar sedan), annars "sedan 12 okt".
 * Aldrig datum och klockslag tillsammans.
 */
export function fmtSedan(iso: string | null, nu: Date = new Date()): string {
  if (!iso) return '';
  if (arIdag(iso, nu)) return `sedan ${fmtKlocka(iso)}`;
  const dagar = kalenderdagarSedan(iso, nu);
  if (dagar === 1) return 'sedan igår';
  if (dagar != null && dagar >= 2 && dagar <= 6) return `sedan i ${DAG_LANG[veckodag(iso)!]}s`;
  return `sedan ${fmtDagManad(iso)}`;
}

/**
 * Svaret på "Var är bilen?": en rubrik i ord och EN rad under.
 *   Kör:   "Kör nu" + "Giant på flaket · 34 km · avfärd 06:41"
 *   Hem:   "På väg hem" + "ungefär 12 km kvar · avfärd 06:41"
 *   Står:  "Står vid LBC" + "Sedan i torsdags"
 */
export function lageSvar(data: LastbilData, nu: Date = new Date()): { rubrik: string; under: string } {
  const o = data.oppen_runda;
  if (o) {
    const delar: string[] = [];
    if (o.pa_vag_hem) {
      if (o.km_kvar != null) delar.push(`ungefär ${o.km_kvar} km kvar`);
      else if (o.live_km != null) delar.push(`${o.live_km} km`);
    } else {
      delar.push(o.maskin ? (o.maskin.lage === 'lossad' ? `${o.maskin.namn} lossad` : `${o.maskin.namn} på flaket`) : 'Övrig körning');
      if (o.live_km != null) delar.push(`${o.live_km} km`);
    }
    if (o.starttid) delar.push(`avfärd ${fmtKlocka(o.starttid)}`);
    return { rubrik: o.pa_vag_hem ? 'På väg hem' : 'Kör nu', under: delar.join(' · ') };
  }
  if (data.parkerad) {
    const sedan = fmtSedan(data.parkerad.sedan, nu);
    return { rubrik: `Står vid ${data.parkerad.plats}`, under: sedan ? sedan[0].toUpperCase() + sedan.slice(1) : '' };
  }
  return { rubrik: 'Ingen runda pågår', under: '' };
}

/** En tänd varningslampa tar över rubriken (röd, med orden "lyser" och "Kontrollera bilen" — färgen förstärker bara). */
export function lampaRubrik(data: LastbilData): { rubrik: string; under: string } | null {
  const lampor = data.halsa?.lampor ?? [];
  if (lampor.length === 0) return null;
  return { rubrik: lampor.length === 1 ? `${lampor[0].namn} lyser` : `${lampor.length} varningslampor lyser`, under: 'Kontrollera bilen' };
}

/**
 * En del av tankraden. `text` är det korta som står i raden ("Diesel 62 %", "AdBlue 80 %", "540 km kvar"); `ord` är orden som står
 * på EGEN rad under raden, bara när de gäller ("Diesel låg – tanka snart", "Diesel saknas i datan"). Färgen (`niva`) förstärker bara — orden bär
 * betydelsen. `dampad` = värdet saknas i datan (aldrig 0).
 */
export interface TankDel { text: string; niva: 'ok' | 'orange' | 'rod' | 'dampad'; ord: string | null }

/** Raden: "Diesel 62 % · AdBlue 80 % · 540 km kvar". Gränserna är `GRANS` — samma som förut. */
export function tankDelar(data: LastbilData): TankDel[] {
  const t = data.tank;
  const d = t?.diesel_pct, a = t?.adblue_pct, r = t?.rackvidd_km;
  const diesel: TankDel = d == null ? { text: 'Diesel –', niva: 'dampad', ord: 'Diesel saknas i datan' }
    : d < GRANS.dieselRod ? { text: `Diesel ${Math.round(d)} %`, niva: 'rod', ord: 'Diesel låg – tanka nu' }
    : d < GRANS.dieselOrange ? { text: `Diesel ${Math.round(d)} %`, niva: 'orange', ord: 'Diesel låg – tanka snart' }
    : { text: `Diesel ${Math.round(d)} %`, niva: 'ok', ord: null };
  const adblue: TankDel = a == null ? { text: 'AdBlue –', niva: 'dampad', ord: 'AdBlue saknas i datan' }
    : a < GRANS.adblueOrange ? { text: `AdBlue ${Math.round(a)} %`, niva: 'orange', ord: 'AdBlue låg – fyll på' }
    : { text: `AdBlue ${Math.round(a)} %`, niva: 'ok', ord: null };
  const rackvidd: TankDel = r == null ? { text: 'Räckvidd –', niva: 'dampad', ord: 'Räckvidd saknas i datan' }
    : r < GRANS.rackviddOrange ? { text: `${r.toLocaleString('sv-SE')} km kvar`, niva: 'orange', ord: 'Räckvidd kort – tanka snart' }
    : { text: `${r.toLocaleString('sv-SE')} km kvar`, niva: 'ok', ord: null };
  return [diesel, adblue, rackvidd];
}

/**
 * Tanken i ETT svar: "Tanken räcker 540 km". Kort räckvidd säger det i orden ("Tanken räcker bara 95 km – tanka snart", orange).
 * Diesel och AdBlue står bara när de gäller (`tankOrd`): låga eller saknade. Saknas räckvidden säger raden det, aldrig 0.
 */
export function tankSvar(data: LastbilData): { text: string; niva: TankDel['niva'] } {
  const r = data.tank?.rackvidd_km;
  if (r == null) return { text: 'Räckvidd saknas i datan', niva: 'dampad' };
  const km = r.toLocaleString('sv-SE');
  return r < GRANS.rackviddOrange ? { text: `Tanken räcker bara ${km} km – tanka snart`, niva: 'orange' } : { text: `Tanken räcker ${km} km`, niva: 'ok' };
}

/** Raderna under tanksvaret: bara diesel och AdBlue som är låga eller saknas ("Diesel låg – tanka nu", "AdBlue saknas i datan"). */
export function tankOrd(data: LastbilData): TankDel[] {
  return tankDelar(data).slice(0, 2).filter(d => d.ord);
}

/** Service visas BARA när det är under 1 000 km kvar (annars ingen rad). Saknas värdet visas inget — vi påstår ingenting. */
export const SERVICE_VISA_UNDER_KM = 1000;
export function serviceRad(data: LastbilData): string | null {
  const km = data.halsa?.service_km;
  if (km == null || km >= SERVICE_VISA_UNDER_KM) return null;
  return km <= 0 ? 'Service är försenad' : `Service om ${km.toLocaleString('sv-SE')} km`;
}

/** "Ingen kontakt sedan 12 okt 15:02" — bara när senaste kontakt är äldre än 1 h. Datum + klockslag; är det idag står bara klockslaget. */
export const KONTAKT_VISA_EFTER_MIN = 60;

/** Tidpunkten för senaste kontakt: positionens egen tid, annars nu minus åldern. null = okänd. */
function kontaktTid(data: LastbilData, nu: Date): string | null {
  const p = data.position;
  if (!p) return null;
  if (p.tidpunkt) return p.tidpunkt;
  if (p.alder_min != null) return new Date(nu.getTime() - p.alder_min * 60000).toISOString();
  return null;
}

/** Minuter sedan senaste kontakt. Åldern från servern går före (samma klocka som resten av kortet). */
function kontaktAlderMin(data: LastbilData, nu: Date): number | null {
  const p = data.position;
  if (!p) return null;
  if (p.alder_min != null) return p.alder_min;
  return p.tidpunkt ? Math.max(0, Math.round((nu.getTime() - Date.parse(p.tidpunkt)) / 60000)) : null;
}

function kontaktText(iso: string, nu: Date): string {
  return arIdag(iso, nu) ? `Ingen kontakt sedan ${fmtKlocka(iso)}` : `Ingen kontakt sedan ${fmtDagManad(iso)} ${fmtKlocka(iso)}`;
}

export function sistSedd(data: LastbilData, nu: Date = new Date()): string | null {
  if (!data.position) return null;
  const min = kontaktAlderMin(data, nu);
  if (min != null && min <= KONTAKT_VISA_EFTER_MIN) return null;
  const tid = kontaktTid(data, nu);
  // Tiden okänd: vi kan inte säga att kontakten är färsk, och inte heller sedan när den bröts.
  return tid ? kontaktText(tid, nu) : 'Tid för senaste kontakt saknas i datan';
}

/** Raden i kartarket — står alltid där. Färsk position: "Senast sedd för 5 min sedan"; annars samma text som på kortet (aldrig "99 h 49 min"). */
export function kontaktRadArk(data: LastbilData, nu: Date = new Date()): string {
  const gammal = sistSedd(data, nu);
  if (gammal) return gammal;
  const min = kontaktAlderMin(data, nu);
  return `Senast sedd ${fmtAlder(min)}`;
}

/** Senaste AVSLUTADE runda med giltig tid. En pågående runda är hjälten; en runda med sluttid före start räknas inte. */
export function senasteKorning(rundor: readonly Runda[]): Runda | null {
  for (const r of rundor) {
    if (r.typ === 'pagar' || !r.starttid || !r.sluttid) continue;
    if (Date.parse(r.sluttid) < Date.parse(r.starttid)) continue;
    return r;
  }
  return null;
}

/** Mätare och motortimmar: de bor i kartarket ("Visa var den står"), inte på kortet. Saknade värden står som "saknas i datan". */
export function matareText(data: LastbilData): { km: string; motortimmar: string } {
  const h = data.halsa;
  return {
    km: h?.matare_km != null ? `${h.matare_km.toLocaleString('sv-SE')} km` : 'saknas i datan',
    motortimmar: h?.motortimmar != null ? `${h.motortimmar.toLocaleString('sv-SE')} h` : 'saknas i datan',
  };
}
