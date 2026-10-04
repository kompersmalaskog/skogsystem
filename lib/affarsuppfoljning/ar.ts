// ÅRSVYN på affärsuppföljningens startsida — "hur går året".
//
// All räkning här är ren: den tar de FÖRBERÄKNADE månadsraderna (utfall_manad, en rad per objekt och månad,
// hemved bort, samma bas som månadssidans RPC sortimentsutfall_manad) och objektens bolag/åtgärd (dim_objekt)
// och ger årets tal. Ingenting läser stockdata. Bolag och åtgärd filtreras HÄR, vid läsning, så en rättad
// bolagsuppgift i dim_objekt syns utan omräkning.
//
// ÅTGÄRD följer RPC:ns regler ordagrant, så staplarna och månaden man trycker upp visar samma tal:
//   Allt            = Slutavverkning + Gallring + objekt utan angiven åtgärd (inte Grot)
//   övriga          = exakt den huvudtypen
// BOLAG: 'Alla' tar med alla objekt (också dem utan bolag), 'Vida' bara Vidas.
// ANTAL OBJEKT räknas på samma grupperingsnyckel som månadssidan: ett numeriskt vo_nummer slår ihop skördarens
// och skotarens rad för samma trakt, annars gäller objekt_id.
//
// PÅGÅENDE MÅNAD = kalendermånaden för `idag` (streckad stapel, räknas inte som hel). SNITT PER HEL MÅNAD =
// årets avslutade månader från den första med volym i urvalet, delat på antalet — en avslutad månad utan volym
// efter den första räknas som noll, annars blev snittet för högt.

export type Atgard = 'Allt' | 'Slutavverkning' | 'Gallring' | 'Grot';
export const ATGARDER: Atgard[] = ['Allt', 'Slutavverkning', 'Gallring', 'Grot'];
export type Bolag = 'Alla' | 'Vida';
export const BOLAGEN: Bolag[] = ['Alla', 'Vida'];

/** En rad ur utfall_manad. `manad` är 'YYYY-MM'. */
export type ManadRad = {
  objekt_id: string; manad: string;
  volym: number; timmer: number; kubb: number; massa: number;
  barr: number;       // barrmassaved, m³
  barrLm: number;     // summa av längd_cm * volym för barrmassaved
};
export type ObjektInfo = { objekt_id: string; namn: string | null; vo_nummer: string | null; huvudtyp: string | null; bolag: string | null };

/** År med så här lite volym (flyttobjekt, tester) är inte ett år att välja. */
export const MIN_AR_VOLYM = 100;

export function arAtgard(o: ObjektInfo | undefined, atgard: Atgard): boolean {
  if (!o) return false;
  if (atgard === 'Allt') return o.huvudtyp === 'Slutavverkning' || o.huvudtyp === 'Gallring' || o.huvudtyp == null;
  return o.huvudtyp === atgard;
}
export function arBolag(o: ObjektInfo | undefined, bolag: Bolag): boolean {
  if (!o) return false;
  return bolag === 'Alla' || o.bolag === bolag;
}
export const grupperingsnyckel = (o: ObjektInfo): string => (o.vo_nummer && /^[0-9]+$/.test(o.vo_nummer) ? o.vo_nummer : o.objekt_id);

export const manadsnyckel = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export type Manad = { manad: string; volym: number; pagaende: boolean; framtid: boolean };
export type Fordelning = { timmer: number; kubb: number; massa: number; ovrigt: number };
export type ArSvar = {
  ar: number;
  manader: Manad[];                     // alltid tolv, januari–december
  total: number;                        // m³ hittills i år
  antalObjekt: number;
  snittPerHelManad: number | null;
  antalHelaManader: number;
  fordelning: Fordelning;               // m³; summerar till total
};

function urvalAv(rader: ManadRad[], objekt: Map<string, ObjektInfo>, atgard: Atgard, bolag: Bolag): ManadRad[] {
  return rader.filter(r => {
    const o = objekt.get(r.objekt_id);
    return arAtgard(o, atgard) && arBolag(o, bolag);
  });
}

export function byggAr(
  rader: ManadRad[], objekt: Map<string, ObjektInfo>,
  { ar, atgard, bolag, idag }: { ar: number; atgard: Atgard; bolag: Bolag; idag: Date },
): ArSvar {
  const urval = urvalAv(rader, objekt, atgard, bolag).filter(r => r.manad.startsWith(`${ar}-`));
  const nu = manadsnyckel(idag);
  const perManad = new Map<string, number>();
  for (const r of urval) perManad.set(r.manad, (perManad.get(r.manad) ?? 0) + r.volym);
  const manader: Manad[] = Array.from({ length: 12 }, (_, i) => {
    const manad = `${ar}-${String(i + 1).padStart(2, '0')}`;
    return { manad, volym: perManad.get(manad) ?? 0, pagaende: manad === nu, framtid: manad > nu };
  });
  const total = urval.reduce((s, r) => s + r.volym, 0);
  const timmer = urval.reduce((s, r) => s + r.timmer, 0);
  const kubb = urval.reduce((s, r) => s + r.kubb, 0);
  const massa = urval.reduce((s, r) => s + r.massa, 0);
  const nycklar = new Set(urval.filter(r => r.volym > 0).map(r => grupperingsnyckel(objekt.get(r.objekt_id) as ObjektInfo)));

  const forstaMedVolym = manader.find(m => m.volym > 0 && !m.framtid)?.manad ?? null;
  const hela = manader.filter(m => !m.pagaende && !m.framtid && forstaMedVolym != null && m.manad >= forstaMedVolym);
  const snitt = hela.length ? hela.reduce((s, m) => s + m.volym, 0) / hela.length : null;

  return {
    ar, manader, total, antalObjekt: nycklar.size, snittPerHelManad: snitt, antalHelaManader: hela.length,
    fordelning: { timmer, kubb, massa, ovrigt: Math.max(0, total - timmer - kubb - massa) },
  };
}

/** År med minst MIN_AR_VOLYM volym i tabellen, nyaste först. Innevarande år finns alltid med. */
export function arLista(rader: ManadRad[], idag: Date): number[] {
  const perAr = new Map<number, number>();
  for (const r of rader) {
    const a = Number(r.manad.slice(0, 4));
    perAr.set(a, (perAr.get(a) ?? 0) + r.volym);
  }
  const ar = Array.from(perAr.entries()).filter(([, v]) => v >= MIN_AR_VOLYM).map(([a]) => a);
  if (!ar.includes(idag.getFullYear())) ar.push(idag.getFullYear());
  return ar.sort((a, b) => b - a);
}

/** Senaste AVSLUTADE månad med volym i urvalet — över alla år. null om ingen finns. */
export function senastAvslutadManad(
  rader: ManadRad[], objekt: Map<string, ObjektInfo>, atgard: Atgard, bolag: Bolag, idag: Date,
): { manad: string; volym: number } | null {
  const nu = manadsnyckel(idag);
  const per = new Map<string, number>();
  for (const r of urvalAv(rader, objekt, atgard, bolag)) if (r.manad < nu) per.set(r.manad, (per.get(r.manad) ?? 0) + r.volym);
  const med = Array.from(per.entries()).filter(([, v]) => v > 0).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return med.length ? { manad: med[0][0], volym: med[0][1] } : null;
}

/**
 * Barrmassavedens medellängd i meter, VIDAS objekt, innevarande månad — samma urval som massaved_niva1 (Vida,
 * valta Barr). Finns ingen barrmassaved den här månaden än: senaste månad som har någon (`aktuell` = false), så
 * raden aldrig står tom en första dag i månaden. Viktat över objekten: summa längd*volym / summa volym.
 */
export function massavedLangd(rader: ManadRad[], objekt: Map<string, ObjektInfo>, idag: Date):
  { manad: string; medellangd: number; volym: number; aktuell: boolean } | null {
  const nu = manadsnyckel(idag);
  const per = new Map<string, { v: number; lm: number }>();
  for (const r of rader) {
    if (objekt.get(r.objekt_id)?.bolag !== 'Vida' || r.barr <= 0 || r.manad > nu) continue;
    const p = per.get(r.manad) ?? { v: 0, lm: 0 };
    p.v += r.barr; p.lm += r.barrLm;
    per.set(r.manad, p);
  }
  const senaste = Array.from(per.keys()).sort().pop();
  if (!senaste) return null;
  const p = per.get(senaste) as { v: number; lm: number };
  return { manad: senaste, medellangd: p.lm / p.v / 100, volym: p.v, aktuell: senaste === nu };
}

export const MANADSNAMN = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
export const manadsNamn = (manad: string): string => MANADSNAMN[Number(manad.slice(5, 7)) - 1];
