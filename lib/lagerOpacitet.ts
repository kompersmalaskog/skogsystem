// Vad ett överläggs reglage ("Kartan syns ↔ Bara lagret", lib/kartReglage) styr på kartan, och hur det läggs på.
//
// Två slag:
//   • RASTER (WMS-lagren, Körbarhet, VIDA-kartbild): reglaget är lagrets opacitet i procent. Standard = lagrets nuvarande värde (`RASTER_STANDARD`; en vakt i
//     lagerOpacitet.test.ts kräver att tabellen stämmer med lagren page.tsx skapar).
//   • VEKTOR (Vidas hänsynsytor, nyckelbiotoper, fornlämningar och rågången): reglaget är en FAKTOR som läggs ovanpå lagrens egen opacitet. Standard 100 = orört.
//     Lagrens ursprungliga värde (ofta ett uttryck — fokus på trakten) sparas första gången och faktorn multipliceras in; ändrar annan kod värdet efteråt gäller det nya.
// Orört med flit: produktionshögarna, GROT-högarna, körspåren, markeringarna och allt som är FARA — de har inga reglage.
import type { Kartlager } from './kartlager';
import { LAGER_OP_MAX, LAGER_OP_MIN, REGLAGE_STEG, STYRKA_MAX, STYRKA_MIN, opacitetTillProcent, styrkaFor, type LagerOpacitet, type Styrkor } from './kartReglage';

/** Raster-överläggens startopacitet (0–1). Nyckel = överläggets id. */
export const RASTER_STANDARD: Record<string, number> = {
  nyckelbiotoper: 0.7, naturvarde: 0.7, sumpskog: 0.7, wetlands: 0.7, biotopskydd: 0.7, naturvardsavtal: 0.7, skoghistoria: 0.7, avverkningsanmalan: 0.7,
  utfordavverkning: 0.7, fornlamningar: 0.7, naturreservat: 0.7, natura2000: 0.7, vattenskydd: 0.7, oversvamning: 0.7, jordarter: 0.7, barighet: 0.7,
  kraftledningar: 0.7, sks_markfuktighet: 0.7, sks_virkesvolym: 0.7, sks_tradhojd: 0.7, sks_lutning: 0.7, sks_gallringsindex: 0.7,
  lm_skuggning: 0.35, lm_ortofoto: 1, lm_ortofoto_ir: 1, nmd_tradslag: 0.65, hydrografi: 0.7,
  korbarhet: 0.7, vidaKartbild: 0.8,
};

/** Överlägg som skalas som vektor: id → prefix på kartlagrens id. */
export const VEKTOR_PREFIX: Record<string, readonly string[]> = {
  hansyn: ['trakt-hansyn-'],
  traktNyckelbiotop: ['trakt-nb-'],
  traktLamning: ['trakt-raa-'],
  fastighetsgrans: ['trakt-ragang-', 'wms-layer-fastighetsgranser'],
};

/** Lager som aldrig får ett reglage eller skalas: träffytor. */
const EJ_VISUELLT = (id: string): boolean => id.endsWith('-hit');

export type OpacitetsMal =
  | { slag: 'raster'; standardProcent: number; lager: string[] }
  | { slag: 'vektor'; standardProcent: 100; lager: string[] };

/** Vilka kartlager ett överlägg styr (ur kartstilens lager-id) och reglagets startvärde — null när överlägget inte har något reglage. */
export function opacitetsMal(overlayId: string, kartLagerIds: readonly string[]): OpacitetsMal | null {
  if (overlayId in RASTER_STANDARD) {
    const id = overlayId === 'vidaKartbild' ? 'vida-layer' : `wms-layer-${overlayId}`;
    return { slag: 'raster', standardProcent: opacitetTillProcent(RASTER_STANDARD[overlayId]), lager: [id] };
  }
  const prefix = VEKTOR_PREFIX[overlayId];
  if (prefix) return { slag: 'vektor', standardProcent: 100, lager: kartLagerIds.filter((id) => prefix.some((p) => id.startsWith(p)) && !EJ_VISUELLT(id)) };
  return null;
}

/** Overlägg som har ett reglage (för listan i + › Lager, innan kartan finns). */
export const harReglage = (overlayId: string): boolean => overlayId in RASTER_STANDARD || overlayId in VEKTOR_PREFIX;

const EGENSKAPER: Record<string, readonly string[]> = {
  raster: ['raster-opacity'],
  line: ['line-opacity'],
  fill: ['fill-opacity'],
  circle: ['circle-opacity', 'circle-stroke-opacity'],
  symbol: ['icon-opacity', 'text-opacity'],
};

/** Det lager-opacitetsvärde vi senast skrev per lager+egenskap, och det ursprungliga det byggde på. */
export interface SkalaMinne { orig: Map<string, unknown>; skrivet: Map<string, string> }
export const nyttSkalaMinne = (): SkalaMinne => ({ orig: new Map(), skrivet: new Map() });

/**
 * Lägger reglagets värde på ett kartlager.
 *  • raster: opacity = procent / 100 (absolut).
 *  • vektor: opacity = lagrets egen opacitet × procent / 100; vid 100 sätts det ursprungliga tillbaka.
 * Ett lager som inte finns (ännu) hoppas över. Kastar aldrig.
 */
export function laggPaOpacitet(map: any, lagerId: string, slag: 'raster' | 'vektor', procent: number, minne: SkalaMinne): void {
  try {
    const lager = map?.getLayer?.(lagerId);
    if (!lager) return;
    const f = procent / 100;
    for (const egenskap of EGENSKAPER[lager.type] ?? []) {
      const nyckel = `${lagerId}|${egenskap}`;
      if (slag === 'raster') { map.setPaintProperty(lagerId, egenskap, f); continue; }
      const nu = map.getPaintProperty(lagerId, egenskap);
      // Ändrades värdet av annan kod sedan vi skrev det (eller har vi aldrig rört det) är det nuvarande det ursprungliga.
      if (!minne.orig.has(nyckel) || minne.skrivet.get(nyckel) !== JSON.stringify(nu ?? null)) minne.orig.set(nyckel, nu);
      const orig = minne.orig.get(nyckel);
      const bas = orig === undefined || orig === null ? 1 : orig;
      const nytt = f >= 1 ? bas : typeof bas === 'number' ? Math.round(bas * f * 1000) / 1000 : ['*', f, bas];
      map.setPaintProperty(lagerId, egenskap, nytt);
      minne.skrivet.set(nyckel, JSON.stringify(nytt ?? null));
    }
  } catch { /* ett lager som inte går att ändra får aldrig fälla kartan */ }
}

/**
 * Lägger alla sparade reglagevärden på kartan: för varje överlägg som fått ett eget värde sätts dess kartlager. Utan eget värde rörs ingenting (lagrets eget gäller).
 * Produktionshögar, GROT, spår, markeringar och fara har ingen post i tabellerna ovan och kan därför aldrig nås härifrån.
 */
export function tillampaLagerOpacitet(map: any, lagerOp: Record<string, number>, minne: SkalaMinne): void {
  let lagerIds: string[] = [];
  try { lagerIds = (map?.getStyle?.()?.layers ?? []).map((l: any) => l.id); } catch { return; }
  for (const [id, procent] of Object.entries(lagerOp)) {
    const mal = opacitetsMal(id, lagerIds);
    if (!mal) continue;
    for (const lagerId of mal.lager) laggPaOpacitet(map, lagerId, mal.slag, procent, minne);
  }
}

/** Reglaget under en rad i + › Lager (samma form som components/planering/PlusArk LagerReglage — lib importerar aldrig komponenter). */
export interface ReglageRad { varde: number; min: number; max: number; steg: number; vanster: string; hoger: string; onAndra: (v: number) => void }

/** Reglaget "Kartan syns ↔ Bara lagret" för ett överlägg — null när överlägget inte har något. Startvärde = lagrets eget; sparat värde går före. */
export function overlayReglage(overlayId: string, lagerOp: LagerOpacitet, setLagerOp: (id: string, v: number) => void): ReglageRad | null {
  const mal = harReglage(overlayId) ? opacitetsMal(overlayId, []) : null;
  if (!mal) return null;
  return { varde: lagerOp[overlayId] ?? mal.standardProcent, min: LAGER_OP_MIN, max: LAGER_OP_MAX, steg: REGLAGE_STEG, vanster: 'Kartan syns', hoger: 'Bara lagret', onAndra: (v) => setLagerOp(overlayId, v) };
}

/** Reglaget "Dämpad ↔ Skarp" under en bakgrund. */
export function bakgrundReglage(lager: Kartlager, styrkor: Styrkor, setStyrka: (lager: Kartlager, v: number) => void): ReglageRad {
  return { varde: styrkaFor(styrkor, lager), min: STYRKA_MIN, max: STYRKA_MAX, steg: REGLAGE_STEG, vanster: 'Dämpad', hoger: 'Skarp', onAndra: (v) => setStyrka(lager, v) };
}
