// AVSLUT — skördning och skotning klar (Martin 2026-10-24: "gör det helt automatiskt men jag kan göra det själv
// om det inte skulle funka").
//
// Databasen sätter klar varje timme när maskinen har kört vidare till ett annat objekt (avslut_ur_maskindata,
// migration 20261024111000–111030). Då står skälet i *_auto_skal ("Giant körde vidare till Skälviken 22 okt").
// En människa går alltid före: ett datum utan skäl, eller "Inte klar än" (*_ej_klar), rör automatiken aldrig.
// "Låt appen avgöra" tar bort människans val så automatiken får bestämma igen.

export type AvslutTyp = 'harvester' | 'forwarder';

export interface AvslutFalt { datum: string; auto: string; ejKlar: string; skal: string }

export function avslutFalt(typ: AvslutTyp): AvslutFalt {
  const f = typ === 'harvester' ? 'skordning' : 'skotning';
  return { datum: `${f}_avslutad`, auto: `${f}_avslutad_auto`, ejKlar: `${f}_ej_klar`, skal: `${f}_auto_skal` };
}

/** Kolumnerna som kom med migrationen — utan den sparas arket utan dem (då finns inget att gå före). */
export const NYA_AVSLUTFALT = ['skordning_ej_klar', 'skotning_ej_klar', 'skordning_auto_skal', 'skotning_auto_skal'];

export function utanNyaFalt(patch: Record<string, any>): Record<string, any> {
  const ut: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) if (!NYA_AVSLUTFALT.includes(k)) ut[k] = v;
  return ut;
}

export function harNyaFalt(patch: Record<string, any>): boolean {
  return Object.keys(patch).some(k => NYA_AVSLUTFALT.includes(k));
}

/** Läget för ett maskinslag i gruppen (alla rader i objektet). */
export type AvslutLage =
  | { lage: 'auto'; datum: string; skal: string }      // appen satte klar
  | { lage: 'hand'; datum: string }                    // en människa (eller Godkänn) satte klar
  | { lage: 'ej_klar' }                                 // en människa sa "Inte klar än"
  | { lage: 'oppen' };                                  // inget bestämt — appen sätter klar när maskinen kört vidare

export function avslutLage(rader: readonly Record<string, any>[], typ: AvslutTyp): AvslutLage {
  const f = avslutFalt(typ);
  if (rader.some(r => r[f.ejKlar] === true)) return { lage: 'ej_klar' };
  const hand = rader.filter(r => r[f.datum] && !r[f.skal]).map(r => String(r[f.datum]).slice(0, 10)).sort();
  if (hand.length) return { lage: 'hand', datum: hand[hand.length - 1] };
  const auto = rader.filter(r => r[f.datum] && r[f.skal]).sort((a, b) => String(b[f.datum]).localeCompare(String(a[f.datum])));
  if (auto.length) return { lage: 'auto', datum: String(auto[0][f.datum]).slice(0, 10), skal: String(auto[0][f.skal]) };
  return { lage: 'oppen' };
}

/** Raden under "Skördning"/"Skotning" i objektets ark. null = ingen rad. */
export function avslutUnder(l: AvslutLage): string | null {
  if (l.lage === 'auto') return `Automatiskt · ${l.skal}`;
  if (l.lage === 'ej_klar') return 'Du sa inte klar · appen väntar på dig';
  return null;
}

/** Vad ett tryck i avslutsarket skriver. Människans val nollar alltid automatikens skäl. */
export function avslutPatch(typ: AvslutTyp, val: { klar: string } | 'inte' | 'appen' | { godkann: string }): Record<string, any> {
  const f = avslutFalt(typ);
  if (val === 'inte') return { [f.datum]: null, [f.auto]: false, [f.ejKlar]: true, [f.skal]: null };
  if (val === 'appen') return { [f.datum]: null, [f.auto]: false, [f.ejKlar]: false, [f.skal]: null };
  if ('godkann' in val) return { [f.datum]: val.godkann, [f.auto]: true, [f.ejKlar]: false, [f.skal]: null };
  return { [f.datum]: val.klar, [f.auto]: false, [f.ejKlar]: false, [f.skal]: null };
}
