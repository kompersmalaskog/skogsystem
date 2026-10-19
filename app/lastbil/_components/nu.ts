// Kortet "Bilen nu": vad lastbilen gör just nu, härlett ur /api/lastbil. Rena funktioner — all text byggs här
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

/** "sedan 13:16", "sedan igår 13:16", "sedan tis 13:16", "sedan 3 aug 13:16". */
export function fmtSedan(iso: string | null, nu: Date = new Date()): string {
  if (!iso) return '';
  const d = sthlmDelar(new Date(iso)), n = sthlmDelar(nu);
  if (!d || !n) return '';
  const dagnr = (x: { ar: number; man: number; dag: number }) => Date.UTC(x.ar, x.man - 1, x.dag) / 86400000;
  const diff = dagnr(n) - dagnr(d);
  const kl = fmtKlocka(iso);
  if (diff <= 0) return `sedan ${kl}`;
  if (diff === 1) return `sedan igår ${kl}`;
  if (diff < 7) return `sedan ${DAG[new Date(Date.UTC(d.ar, d.man - 1, d.dag)).getUTCDay()]} ${kl}`;
  return `sedan ${d.dag} ${MANAD[d.man - 1]} ${kl}`;
}

/** Läget i ord + sedan när. "Kör nu · Giant på flaket · 34 km · avfärd 06:41", "Parkerad vid Kompersmåla · sedan 15:02". */
export function lageRad(data: LastbilData, nu: Date = new Date()): string {
  const o = data.oppen_runda;
  if (o) {
    const delar: string[] = [o.pa_vag_hem ? 'På väg hem' : 'Kör nu'];
    if (o.pa_vag_hem) {
      if (o.km_kvar != null) delar.push(`ungefär ${o.km_kvar} km kvar`);
      else if (o.live_km != null) delar.push(`${o.live_km} km`);
    } else {
      delar.push(o.maskin ? (o.maskin.lage === 'lossad' ? `${o.maskin.namn} lossad` : `${o.maskin.namn} på flaket`) : 'Övrig körning');
      if (o.live_km != null) delar.push(`${o.live_km} km`);
    }
    if (o.starttid) delar.push(`avfärd ${fmtKlocka(o.starttid)}`);
    return delar.join(' · ');
  }
  if (data.parkerad) return [`Parkerad vid ${data.parkerad.plats}`, fmtSedan(data.parkerad.sedan, nu)].filter(Boolean).join(' · ');
  return 'Ingen runda pågår';
}

/** En tänd varningslampa tar över rubriken (röd, med orden "lyser" och "Kontrollera bilen" — färgen förstärker bara). */
export function lampaRubrik(data: LastbilData): { rubrik: string; under: string } | null {
  const lampor = data.halsa?.lampor ?? [];
  if (lampor.length === 0) return null;
  return { rubrik: lampor.length === 1 ? `${lampor[0].namn} lyser` : `${lampor.length} varningslampor lyser`, under: 'Kontrollera bilen' };
}

/** En del av tankraden. `dampad` = värdet saknas i datan (aldrig 0). Orden står bredvid siffran; färgen förstärker bara. */
export interface TankDel { text: string; niva: 'ok' | 'orange' | 'rod' | 'dampad' }

/** EN rad: "Diesel 62 % · AdBlue 71 % · Räckvidd 270 km". Gränserna är `GRANS` — samma som förut. */
export function tankDelar(data: LastbilData): TankDel[] {
  const t = data.tank;
  const d = t?.diesel_pct, a = t?.adblue_pct, r = t?.rackvidd_km;
  const diesel: TankDel = d == null ? { text: 'Diesel saknas i datan', niva: 'dampad' }
    : d < GRANS.dieselRod ? { text: `Diesel ${Math.round(d)} % – tanka nu`, niva: 'rod' }
    : d < GRANS.dieselOrange ? { text: `Diesel ${Math.round(d)} % – tanka snart`, niva: 'orange' }
    : { text: `Diesel ${Math.round(d)} %`, niva: 'ok' };
  const adblue: TankDel = a == null ? { text: 'AdBlue saknas i datan', niva: 'dampad' }
    : a < GRANS.adblueOrange ? { text: `AdBlue ${Math.round(a)} % – fyll på`, niva: 'orange' }
    : { text: `AdBlue ${Math.round(a)} %`, niva: 'ok' };
  const rackvidd: TankDel = r == null ? { text: 'Räckvidd saknas i datan', niva: 'dampad' }
    : r < GRANS.rackviddOrange ? { text: `Räckvidd ${r} km – tanka snart`, niva: 'orange' }
    : { text: `Räckvidd ${r} km`, niva: 'ok' };
  return [diesel, adblue, rackvidd];
}

/** Service visas BARA när det är under 1 000 km kvar (annars ingen rad). Saknas värdet visas inget — vi påstår ingenting. */
export const SERVICE_VISA_UNDER_KM = 1000;
export function serviceRad(data: LastbilData): string | null {
  const km = data.halsa?.service_km;
  if (km == null || km >= SERVICE_VISA_UNDER_KM) return null;
  return km <= 0 ? 'Service är försenad' : `Service om ${km.toLocaleString('sv-SE')} km`;
}

/** "Senast sedd för 54 min sedan" — bara när positionen är äldre än 15 min (eller åldern är okänd: då kan vi inte säga att den är färsk). */
export const SEDD_VISA_EFTER_MIN = 15;
export function sistSedd(data: LastbilData): string | null {
  if (!data.position) return null;
  const min = data.position.alder_min;
  if (min != null && min <= SEDD_VISA_EFTER_MIN) return null;
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
