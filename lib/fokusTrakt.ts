// FOKUS PÅ TRAKTEN (Martin 2026-10-22: "det börjar bli för mycket på kartan, svårt att veta vad man ska kolla på"). Hålabäck au 2025: tre nyckelbiotoper, tre fornlämningar,
// blå snedstreck och stora gröna ytor — de flesta utanför trakten och lika starka som hänsynen inne i den.
//
// Regeln, bara UTSEENDET (planering och maskin):
//  • Vidas, RAÄ:s och Skogsstyrelsens ytor och punkter (hänsyn, Övrigt, nyckelbiotop, fornlämning, avlägg …) INNE i trakten eller inom
//    50 m från traktgränsen: full styrka + etikett, som förut.
//  • Helt utanför (mer än 50 m): en tredjedel av styrkan, ingen snedstreckning, INGA etiketter. Det syns att något finns men tar inte blicken.
//  • Delvis inne: hela ytan i full styrka — ytor delas aldrig.
//  • Saknas traktgräns (inget att mäta mot) sätts inget: allt är i full styrka som förut.
//  • FARA OCH VÄGAR BLIR ALDRIG SVAGA (Martin 2026-10-22): Vidas kraftledning (Röd, lib/larm/grupper) och Vidas vägar (basväg m.fl. linjer) ritas i full styrka överallt, oavsett avstånd —
//    skotaren kör utanför trakten till avlägget och korsar ledningar där. De får ingen `_fokus` alls. Egna markeringar (el-ledning, varning, jakttorn, markkabel, brant, ej framkomlig,
//    egna vägar, avlägg …) ligger i andra källor och rörs inte.
//  • Larm och fällningscirkel rörs inte (de läser geometrin, aldrig utseendet). Egna markeringar och skördarspår är andra källor och rörs inte.
//  • Att trycka på en svag yta öppnar kortet som vanligt (lagren finns kvar och träffas; bara opaciteten och etiketterna ändras).
//
// Mekanik: varje ritad feature i `trakt-geo-source` får `_fokus: 'inne' | 'ute'` när geometrin läses in (`medFokus`); lagren läser egenskapen i sina paint-uttryck.
// Avståndet mäts av lib/traktNara — samma 50 m och samma mätning som fastighetsgränsen.

import { VIDA } from './larm/grupper';
import { vidaSlag } from './larm/objekt';
import { klassaTraktFeature } from './traktGeometri';
import { NARA_TRAKT_M, avstandTillTrakt, traktModell } from './traktNara';

export const FOKUS_NARA_M = NARA_TRAKT_M;
/** Styrkan på det som ligger utanför trakten: en tredjedel av den vanliga. */
export const FOKUS_UTE_ANDEL = 1 / 3;
export const FOKUS_EGENSKAP = '_fokus';
export type Fokus = 'inne' | 'ute';

/** Vidas farliga objekt: allt som larmens egen tabell (lib/larm/grupper VIDA) placerar i gruppen Fara — idag Kraftledningen. En enda källa med larmen, så en ny Vida-fara blir aldrig svag av misstag. */
export function arFara(props: Record<string, any> | null | undefined, geometry: any): boolean {
  const slag = vidaSlag(props, geometry?.type);
  return slag != null && VIDA[slag].grupp === 'fara';
}
/** Vidas vägar: linjerna i leveransen (L_TILLAGGSLINJER, `_typ: 'linje'`) som inte är fara — basväg och allt annat som är en linje. En väg används överallt, också utanför trakten. */
export const arVag = (props: Record<string, any> | null | undefined, geometry: any): boolean => props?._typ === 'linje' && !arFara(props, geometry);

/** Är featuren något som kartan ritar och som får bli svag? Traktgränsen är referensen; fara och vägar blir aldrig svaga. */
function arRitad(props: Record<string, any> | null | undefined, geometry: any): boolean {
  if (!props || props._lager === 'L_TRAKTDEL') return false;
  if (arFara(props, geometry) || arVag(props, geometry)) return false;
  return klassaTraktFeature(props).kategori !== 'ignorera';
}

/** Fokus per feature, räknat mot trakten. Tom lista när traktgräns saknas. */
export function medFokus<T extends { features?: any[] }>(fc: T): T {
  if (!fc || !Array.isArray(fc.features)) return fc;
  const modell = traktModell(fc);
  if (!modell) return fc;                                      // inget att mäta mot → allt full styrka
  const features = fc.features.map((f) => {
    if (!arRitad(f?.properties, f?.geometry) || !f?.geometry) return f;
    const fokus: Fokus = avstandTillTrakt(f.geometry, modell, FOKUS_NARA_M) <= FOKUS_NARA_M ? 'inne' : 'ute';
    return { ...f, properties: { ...f.properties, [FOKUS_EGENSKAP]: fokus } };
  });
  return { ...fc, features };
}

// ---- MapLibre-uttryck (samma för alla lager) ----

/** Sant för det som ligger utanför trakten. En feature utan egenskapen (traktgräns saknas) är aldrig "ute". */
export const FOKUS_UTE_UTTRYCK = ['==', ['get', FOKUS_EGENSKAP], 'ute'] as const;

/** Styrka (opacitet) som en tredjedel utanför trakten, `full` inne. */
export function fokusOpacitet(full: number): any[] {
  return ['case', FOKUS_UTE_UTTRYCK, +(full * FOKUS_UTE_ANDEL).toFixed(4), full];
}
/** Snedstreckningen försvinner helt utanför trakten. */
export const FOKUS_HATCH_OPACITET: any[] = ['case', FOKUS_UTE_UTTRYCK, 0, 1];
/** Etiketter sätts bara inne i och vid trakten. */
export function fokusEtikettFilter(filter: any[]): any[] {
  return ['all', filter, ['!=', ['get', FOKUS_EGENSKAP], 'ute']];
}
