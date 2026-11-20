// SAMMA MUR (Stefan, Lidhem Bondagård, 12 nov 2026): planeraren ritar ofta en stenmur i flera bitar. Varje bit är en egen markering med sitt eget "Sett",
// så föraren fick frågan en gång per bit — för honom samma mur som frågar igen. Bitar som hänger ihop räknas nu som EN mur: ett Sett gäller hela kedjan.
//
// REGELN: två stenmursbitar hör ihop när de ligger högst SAMMA_MUR_M från varandra (närmaste punkt mot närmaste punkt) och säger samma sak (samma hash =
// samma typ och kommentar — en bit med en egen kommentar är egen information och ska läsas för sig). Det går i kedja: A–B och B–C gör A, B, C till en mur.
// En mur långt bort på samma trakt hör inte till kedjan och frågar för sig.
// Mätt på Lidhem (prod): bitar av samma mur låg 1,4 m och 3,3 m isär; två OLIKA murar som närmast 35 m. Därför 10 m.
import { avstandTillLinjeM, avstandPunktM, type LatLon } from './geo';

export const SAMMA_MUR_M = 10;
/** Linjetyper där bitar slås ihop. Bara stenmur: el-ledning är Röd och har inget Sett, övriga linjer larmar inte. */
export const SAMMA_MUR_TYPER: ReadonlySet<string> = new Set(['stonewall']);

export interface MurBit { id: string; typ?: string; hash: string; koordinater: readonly LatLon[] }

/** Punkter längs linjen med högst `stegM` emellan — så att två bitar som KORSAR varandra mitt på ett långt segment också mäts som nära. */
function tat(linje: readonly LatLon[], stegM: number): LatLon[] {
  const ut: LatLon[] = [];
  for (let i = 0; i < linje.length; i++) {
    ut.push(linje[i]);
    if (i === linje.length - 1) break;
    const a = linje[i], b = linje[i + 1];
    const n = Math.floor(avstandPunktM(a, b) / stegM);
    for (let k = 1; k <= n; k++) ut.push({ lat: a.lat + ((b.lat - a.lat) * k) / (n + 1), lon: a.lon + ((b.lon - a.lon) * k) / (n + 1) });
  }
  return ut;
}

/** Kortaste avståndet mellan två linjer i meter (inom några decimeter). */
export function avstandMellanLinjerM(a: readonly LatLon[], b: readonly LatLon[]): number {
  if (a.length === 0 || b.length === 0) return Infinity;
  let min = Infinity;
  for (const p of tat(a, 2)) min = Math.min(min, b.length > 1 ? avstandTillLinjeM(p, b) : avstandPunktM(p, b[0]));
  for (const p of tat(b, 2)) min = Math.min(min, a.length > 1 ? avstandTillLinjeM(p, a) : avstandPunktM(p, a[0]));
  return min;
}

/**
 * Vilka bitar hör till samma mur? Svar: för varje bit, id:na på ALLA bitar i dess kedja (den själv först).
 * En bit som inte är stenmur, eller som står ensam, får bara sig själv.
 */
export function sammaMur(bitar: readonly MurBit[], gransM: number = SAMMA_MUR_M): Map<string, string[]> {
  const med = bitar.filter((b) => SAMMA_MUR_TYPER.has(b.typ ?? '') && b.koordinater.length > 1);
  const rot = new Map<string, string>(med.map((b) => [b.id, b.id]));
  const hitta = (x: string): string => { let r = x; while (rot.get(r) !== r) r = rot.get(r)!; rot.set(x, r); return r; };
  for (let i = 0; i < med.length; i++) {
    for (let j = i + 1; j < med.length; j++) {
      if (med[i].typ !== med[j].typ || med[i].hash !== med[j].hash) continue;
      if (hitta(med[i].id) === hitta(med[j].id)) continue;
      if (avstandMellanLinjerM(med[i].koordinater, med[j].koordinater) <= gransM) rot.set(hitta(med[i].id), hitta(med[j].id));
    }
  }
  const kedjor = new Map<string, string[]>();
  for (const b of med) { const r = hitta(b.id); const k = kedjor.get(r); if (k) k.push(b.id); else kedjor.set(r, [b.id]); }
  const ut = new Map<string, string[]>();
  for (const b of bitar) {
    const kedja = rot.has(b.id) ? kedjor.get(hitta(b.id))! : [b.id];
    ut.set(b.id, [b.id, ...kedja.filter((x) => x !== b.id)]);
  }
  return ut;
}
