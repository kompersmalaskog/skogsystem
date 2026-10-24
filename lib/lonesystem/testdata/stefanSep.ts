// Stefan Karlssons september 2026 ur prod (stefanSep2026.json) som tabeller för beraknaLoneunderlag — delas av vymodellens test och arkets rendertest.
import fixtur from "./stefanSep2026.json";
import sep from "./sep2026.json";
import { tabellKlient } from "./tabellKlient";
import { PROD_MAPPNING } from "./sepKlient";
import { beraknaLoneunderlag } from "../loneunderlag";

export const ID = "stefan";
export const MASKIN = "PONS20SDJAA270231";

// Fiktiva koordinater (bara etiketterna testas): trakterna ligger olika långt från hemmet.
const KOORD: Record<string, [number, number]> = {
  "11131022": [56.5, 15.1], "11208196": [56.6, 15.2], "11218523": [56.7, 15.3], "11249883": [56.8, 15.4],
  "11251359": [56.9, 15.5], "11225601": [57.0, 15.6], "11251460": [57.1, 15.7],
};

const NAMN: Record<string, string> = {
  "11131022": "Stänkelsmåla 2025", "11208196": "400763 Akelius Tåget SA -26", "11218523": "Kämpamåla AU 2026", "11249883": "Hallaslätt AU 2026",
  "11251359": "Hålabäck au 2025", "11225601": "Östra-Hoka 17 A-C -25", "11251460": "Kroksjömåla 123 A-A -25",
};

export function stefanTabeller(andra: (d: any) => any = d => d, extraTillagg: any[] = []) {
  const dagar = (fixtur as any).arbetsdag.map(andra);
  return {
    medarbetare: [{ id: ID, namn: "Stefan Karlsson", maskin_id: MASKIN, foretagsledare: false, anstallningsdatum: null, aktiv: true }],
    arbetsdag: dagar.map((d: any, i: number) => ({
      id: `d${i + 1}`, medarbetare_id: ID, datum: d.datum, arbetad_min: d.arbetad_min, maskin_id: d.maskin_id === undefined ? MASKIN : d.maskin_id, km_totalt: d.km_totalt, km_morgon: d.km_morgon,
      km_kvall: d.km_kvall, km_kalla: d.km_kalla, bekraftad: true, dagtyp: "Produktion", synk_avvikelse: null, start_tid: d.start_tid, slut_tid: d.slut_tid,
      rast_min: d.rast_min, traktamente: false, brandrisk_beordrad: null, objekt_id: d.objekt[0]?.objekt_id ?? null,
    })),
    arbetsdag_objekt: dagar.flatMap((d: any, i: number) => d.objekt.map((o: any, j: number) => ({ arbetsdag_id: `d${i + 1}`, objekt_id: o.objekt_id, objekt_namn: o.objekt_namn, ordning: j + 1 }))),
    extra_tid: [...(fixtur as any).extra_tid, ...extraTillagg].map((e: any) => ({ medarbetare_id: ID, ...e })),
    dim_maskin: [{ maskin_id: MASKIN, maskin_typ: "Harvester", sander_filer: true }],
    dim_objekt: [
      ...Object.entries(KOORD).map(([objekt_id, [latitude, longitude]]) => ({ objekt_id, object_name: NAMN[objekt_id], latitude, longitude })),
      { objekt_id: "20250731", object_name: "Flyttobjekt", latitude: null, longitude: null },   // Flyttobjektet har ingen plats: kmräkningen hoppar över det
    ],
    objekt: [],
    medarbetare_lonesystem: [{ medarbetare_id: ID, anstallningsnummer: "1001" }],
    gs_avtal: [{ ...(sep as any).gs_avtal, giltigt_fran: "2025-04-01" }],
    lonesystem_koppling: [{ id: "ls1", system_typ: "fortnox" }],
    lonesystem_artikelmappning: PROD_MAPPNING.map((m, i) => ({ id: `x${i + 1}`, lonesystem_id: "ls1", ...m })),
    ledighet_ansokningar: [], fortnox_export_logg: [], utjamningsperiod: [], vilobrott: [], fakt_avbrott: [], operator_medarbetare: [], fakt_tid: [],
  };
}


/** Löneunderlaget för Stefan september (löneperiod 2026-10) med granskningsstödet på, så som Admin ser det. `andra` ändrar en dag. */
export async function stefanUnderlag(andra?: (d: any) => any, extraTillagg: any[] = []) {
  const u = await beraknaLoneunderlag(tabellKlient(stefanTabeller(andra, extraTillagg)), { period: "2026-10", medMaskintid: true });
  const m: any = u.berikad.find(x => x.medarbetare_id === ID);
  return { u, m };
}
