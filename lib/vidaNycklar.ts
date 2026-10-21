// STABILA NYCKLAR för Vidas objekt (objekt_geometri), så att våra kommentarer och foton på ett Vida-objekt kan sparas hos OSS (kartkommentar och objekt_yta_media,
// kopplade till objekt_id + yta_nyckel) utan att Vidas data någonsin ändras. Ytor, punkter och RAÄ-objekt har egna id-fält som `ytaNyckel` redan läser
// (hansyn:<LOPNR>, traktdel:<TRDEL_ID>, nb:<Beteckn>, raa:<lamningsnu>, punkt:<nr>).
//
// Vidas LINJER (kraftledning, basväg) har inget id-fält i dbf:en — de nycklas på GEOMETRIN, inte på beskrivning + ordning (Martin 2026-10-20: en omimport i annan
// ordning fick annars "låg ledning vid bäcken" att hamna på fel ledning): `linje:<hash>`, där hashen byggs av linjens första och sista punkt avrundade till
// ~1 m och längden avrundad till 10 m. Ändpunkterna sorteras, så en linje som levereras åt andra hållet får samma nyckel. Två linjer som blir exakt lika
// (samma ändpunkter och längd) får ett löpnummer efter första: `linje:<hash>~2`.
// Begränsning: en koordinat som ligger precis vid en avrundningsgräns kan hoppa ett steg om Vida flyttar punkten en bråkdel av en meter; flyttar Vida linjen
// på riktigt (ny sträckning) är det en ny linje och får en ny nyckel — det är avsikten.

import { ytaNyckel } from './traktGeometri';

const M_PER_GRAD = 111320;

const arVidaLinje = (f: any): boolean => String(f?.properties?._lager ?? '') === 'L_TILLAGGSLINJER' || String(f?.properties?._typ ?? '') === 'linje';

type Pos = [number, number];

/** Linjens delar som positioner [lng, lat]; en LineString ger en del, en MultiLineString flera (sammanfogade i leveransens ordning). */
function linjePunkter(geom: any): Pos[] {
  const del: Pos[][] = geom?.type === 'LineString' ? [geom.coordinates] : geom?.type === 'MultiLineString' ? geom.coordinates : [];
  return del.flat().filter((p): p is Pos => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

function langdM(p: readonly Pos[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) {
    const kos = Math.cos(((p[i][1] + p[i - 1][1]) / 2) * Math.PI / 180);
    s += Math.hypot((p[i][0] - p[i - 1][0]) * M_PER_GRAD * kos, (p[i][1] - p[i - 1][1]) * M_PER_GRAD);
  }
  return s;
}

/** Punkten avrundad till hela meter (nord, öst) — ett rutnät, så samma punkt ger samma text. */
const meterRuta = (p: Pos): string => `${Math.round(p[1] * M_PER_GRAD)},${Math.round(p[0] * M_PER_GRAD * Math.cos(p[1] * Math.PI / 180))}`;

/** FNV-1a, 32 bitar, som 8 hextecken. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Geometrinyckeln för en linje (utan löpnummer). Null när linjen saknar punkter. */
export function linjeGeometriNyckel(geom: any): string | null {
  const p = linjePunkter(geom);
  if (p.length < 2) return null;
  const andar = [meterRuta(p[0]), meterRuta(p[p.length - 1])].sort();
  const lang = Math.round(langdM(p) / 10) * 10;
  return `linje:${fnv(`${andar[0]}|${andar[1]}|${lang}`)}`;
}

/** Nyckeln per feature, i samma ordning som `features` (null = featuren kan inte få en stabil nyckel och därmed ingen kommentar/foto). */
export function vidaNycklar(features: readonly any[] | null | undefined): (string | null)[] {
  const sett = new Map<string, number>();
  return (features ?? []).map((f) => {
    if (arVidaLinje(f)) {
      const bas = linjeGeometriNyckel(f?.geometry);
      if (!bas) return null;
      const n = (sett.get(bas) ?? 0) + 1;
      sett.set(bas, n);
      return n === 1 ? bas : `${bas}~${n}`;
    }
    return ytaNyckel(f?.properties ?? {});
  });
}

/** Samlingen med `_nyckel` satt på varje feature som har en (en kopia — indatan rörs aldrig). Ritas på kartan och läses av trycket. */
export function medVidaNycklar<T extends { features?: any[] }>(fc: T): T {
  const nycklar = vidaNycklar(fc.features);
  return { ...fc, features: (fc.features ?? []).map((f, i) => (nycklar[i] ? { ...f, properties: { ...(f.properties ?? {}), _nyckel: nycklar[i] } } : f)) };
}
