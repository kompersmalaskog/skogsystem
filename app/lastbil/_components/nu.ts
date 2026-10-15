// Nu-fliken: vad lastbilen gör just nu, härlett ur /api/lastbil. Rena funktioner — all text byggs här
// så den går att testa, och så vyn bara ritar. Stockholmstid genomgående (servern kör UTC).
//
// Tillstånd syns, de räknas aldrig ut (skillen): läget står i ord överst, och en avvikelse
// (varningslampa, låg tank) TAR ÖVER rubriken med färgen som förstärkning av orden.

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

export type Avvikelse = { niva: 'rod' | 'orange'; rubrik: string; under: string };

/** Det som kräver handling. Röd före orange, den allvarligaste vinner. */
export function harledAvvikelse(data: LastbilData): Avvikelse | null {
  const lampor = data.halsa?.lampor ?? [];
  if (lampor.length > 0) {
    return { niva: 'rod', rubrik: lampor.length === 1 ? `${lampor[0].namn} lyser` : `${lampor.length} varningslampor lyser`, under: 'Kontrollera bilen' };
  }
  const d = data.tank?.diesel_pct, a = data.tank?.adblue_pct, r = data.tank?.rackvidd_km;
  if (d != null && d < GRANS.dieselRod) return { niva: 'rod', rubrik: `Diesel ${Math.round(d)} % – tanka nu`, under: r != null ? `Räckvidd ${r} km` : 'Låg nivå' };
  if (d != null && d < GRANS.dieselOrange) return { niva: 'orange', rubrik: `Diesel ${Math.round(d)} % – tanka snart`, under: r != null ? `Räckvidd ${r} km` : 'Planera tankning' };
  if (r != null && r < GRANS.rackviddOrange) return { niva: 'orange', rubrik: `Räckvidd ${r} km – tanka snart`, under: 'Planera tankning' };
  if (a != null && a < GRANS.adblueOrange) return { niva: 'orange', rubrik: `AdBlue ${Math.round(a)} % – fyll på`, under: 'Låg AdBlue-nivå' };
  return null;
}

export interface Hero {
  /** Liten versal etikett över rubriken. */
  mikro: string | null;
  rubrik: string;
  /** Färgen förstärker orden i rubriken — den bär aldrig ensam. */
  farg: 'text' | 'rod' | 'orange';
  /** Sekundär rad direkt under rubriken (maskin på flaket, km kvar). */
  rad: string | null;
  /** Skärmens huvudtal när bilen rullar (rundans km hittills). */
  tal: string | null;
  meta: string;
  /** Puls bara för "pågår just nu". */
  puls: boolean;
}

/** Lägesraden: "Kör nu 06:41", "Parkerad på LBC". Avvikelsen tar över rubriken men läget står kvar i metan. */
function lageText(data: LastbilData): string | null {
  const o = data.oppen_runda;
  if (o) return o.pa_vag_hem ? 'På väg hem' : 'Kör nu';
  if (data.parkerad) return `Parkerad på ${data.parkerad.plats}`;
  return null;
}

export function harledHero(data: LastbilData, nu: Date = new Date()): Hero {
  const alder = `senast sedd ${fmtAlder(data.position?.alder_min ?? null)}`;
  const avvik = harledAvvikelse(data);
  if (avvik) {
    const lage = lageText(data);
    return {
      mikro: 'Kräver handling', rubrik: avvik.rubrik, farg: avvik.niva, rad: null, tal: null, puls: false,
      meta: [avvik.under, lage, alder].filter(Boolean).join(' · '),
    };
  }
  const o = data.oppen_runda;
  if (o) {
    const m = o.maskin;
    const rubrik = o.pa_vag_hem ? 'På väg hem'
      : m ? (m.lage === 'lossad' ? `${m.namn} lossad` : `${m.namn} på flaket`)
      : 'Övrig körning';
    const rad = o.pa_vag_hem
      ? (o.km_kvar != null ? `ungefär ${o.km_kvar} km kvar` : null)
      : m ? null : 'ingen maskin på flaket';
    return {
      mikro: o.pa_vag_hem ? 'På väg hem' : 'Kör nu', rubrik, farg: 'text', rad,
      tal: o.live_km != null ? `${o.live_km} km` : '–',
      meta: [o.starttid ? `Avfärd ${fmtKlocka(o.starttid)}` : null, alder].filter(Boolean).join(' · '),
      puls: true,
    };
  }
  if (data.parkerad) {
    const sedan = fmtSedan(data.parkerad.sedan, nu);
    return {
      mikro: null, rubrik: `Parkerad på ${data.parkerad.plats}`, farg: 'text', rad: null, tal: null, puls: false,
      meta: [sedan, alder].filter(Boolean).join(' · '),
    };
  }
  return {
    mikro: null, rubrik: data.namn ? `Scania ${data.namn}` : 'Lastbilen', farg: 'text', rad: null, tal: null, puls: false,
    meta: ['Ingen runda pågår', alder].join(' · '),
  };
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

export function rundaTitel(r: Runda): string {
  if (r.typ !== 'flytt') return 'Övrig körning';
  return r.antal_flytt > 1 ? `Flytt · ${r.antal_flytt} maskiner` : 'Flytt';
}

/** Rader i tank/hälsa-kortet. `saknas i datan` när ett värde saknas — aldrig 0. */
export interface TankRad {
  rubrik: string;
  /** Orange eller röd när värdet ligger under gränsen — samma gräns som rubriken. */
  farg: 'text' | 'rod' | 'orange';
  under: string;
}

export function tankRad(data: LastbilData): TankRad {
  const t = data.tank;
  const d = t?.diesel_pct, a = t?.adblue_pct, r = t?.rackvidd_km;
  const dTxt = d != null ? `Diesel ${Math.round(d)} %` : 'Diesel saknas i datan';
  const aTxt = a != null ? `AdBlue ${Math.round(a)} %` : 'AdBlue saknas i datan';
  const rTxt = r != null ? `Räckvidd ${r} km` : 'Räckvidd saknas i datan';
  const farg: TankRad['farg'] = d != null && d < GRANS.dieselRod ? 'rod' : (d != null && d < GRANS.dieselOrange) || (a != null && a < GRANS.adblueOrange) || (r != null && r < GRANS.rackviddOrange) ? 'orange' : 'text';
  return { rubrik: `${dTxt} · ${aTxt}`, farg, under: rTxt };
}

export interface LampRad {
  rubrik: string;
  farg: 'gron' | 'rod' | 'dampad';
  under: string;
}

export function lampRad(data: LastbilData): LampRad {
  const h = data.halsa;
  const lampor = h?.lampor ?? [];
  const service = h?.service_km != null ? `Service om ${h.service_km.toLocaleString('sv-SE')} km` : 'Service: saknas i datan';
  if (!h || !h.har_lampor) return { rubrik: 'Varningslampor saknas i datan', farg: 'dampad', under: service };
  if (lampor.length === 0) return { rubrik: 'Inga varningar', farg: 'gron', under: service };
  return { rubrik: lampor.length === 1 ? lampor[0].namn : `${lampor.length} varningar`, farg: 'rod', under: service };
}

export function matareText(data: LastbilData): { km: string; motortimmar: string | null } {
  const h = data.halsa;
  return {
    km: h?.matare_km != null ? `${h.matare_km.toLocaleString('sv-SE')} km` : 'saknas i datan',
    motortimmar: h?.motortimmar != null ? `Motortimmar ${h.motortimmar.toLocaleString('sv-SE')} h` : null,
  };
}
