// Daniel Johanssons september 2026 ur prod (danielSep2026.json) som tabeller för beraknaLoneunderlag: dagar med BERÄKNAD km (1 sep: 113 km) och med
// FÖRARENS EGNA km (15 sep: 160 km). Hemmet ligger i Växjö; koordinaterna och routingens km är fiktiva (bara etiketterna och jämförelsen testas).
import fixtur from "./danielSep2026.json";
import sep from "./sep2026.json";
import { tabellKlient } from "./tabellKlient";
import { PROD_MAPPNING } from "./sepKlient";
import { beraknaLoneunderlag } from "../loneunderlag";

export const DANIEL = "daniel";
export const DANIEL_MASKIN = "A130743";
const HEM = { lat: 56.918, lng: 14.803 };
// Trakter med koordinat. A130743_* är maskinlokala objekt utan koordinat (Flyttobjekt, Kyrkhult GROT …): de hoppas över av kmräkningen.
const KOORD: Record<string, [number, number, string]> = {
  "11131022": [56.5, 15.1, "Stänkelsmåla 2025"], "11208196": [56.6, 15.2, "400763 Akelius Tåget SA -26"], "11241031": [56.7, 15.3, "Rävemåla AU 2026"],
  "11218589": [56.8, 15.4, "GROT Jeppshoka 1 14 H A RP"], "11251359": [56.9, 15.5, "Hålabäck au 2025"],
};
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Routingens svar i route_cache: 58 km dit och 60 km hem (olika, så att ben och riktning inte kan förväxlas) — appen hade fått 118 km där föraren skrev 160. */
export const APPENS_MORGON_KM = 58;
export const APPENS_KVALL_KM = 60;
function routeCache(med: string[]) {
  const ut: any[] = [];
  for (const id of med) {
    const [lat, lng] = KOORD[id];
    ut.push({ from_lat: r3(HEM.lat), from_lng: r3(HEM.lng), to_lat: r3(lat), to_lng: r3(lng), distance_km: APPENS_MORGON_KM });
    ut.push({ from_lat: r3(lat), from_lng: r3(lng), to_lat: r3(HEM.lat), to_lng: r3(HEM.lng), distance_km: APPENS_KVALL_KM });
  }
  return ut;
}

export type DanielVal = { cacheFor?: string[]; hem?: boolean; koordinater?: boolean };

export function danielTabeller(val: DanielVal = {}) {
  const { cacheFor = ["11208196"], hem = true, koordinater = true } = val;
  const dagar = (fixtur as any).dagar;
  return {
    medarbetare: [{ id: DANIEL, namn: "Daniel Johansson", maskin_id: DANIEL_MASKIN, foretagsledare: false, anstallningsdatum: null, aktiv: true, hem_lat: hem ? HEM.lat : null, hem_lng: hem ? HEM.lng : null }],
    arbetsdag: dagar.map((d: any, i: number) => ({
      id: `d${i + 1}`, medarbetare_id: DANIEL, datum: d.datum, arbetad_min: d.arbetad_min, maskin_id: d.maskin_id, km_totalt: d.km_totalt, km_morgon: d.km_morgon, km_kvall: d.km_kvall,
      km_kalla: d.km_kalla, bekraftad: true, dagtyp: "Produktion", synk_avvikelse: null, start_tid: "06:00:00", slut_tid: "16:00:00", rast_min: 30, traktamente: false,
      brandrisk_beordrad: null, objekt_id: d.objekt_id,
    })),
    arbetsdag_objekt: dagar.flatMap((d: any, i: number) => d.objekt.map((o: any) => ({ arbetsdag_id: `d${i + 1}`, objekt_id: o.objekt_id, objekt_namn: o.objekt_namn, ordning: o.ordning }))),
    dim_objekt: Object.entries(KOORD).map(([objekt_id, [latitude, longitude, object_name]]) => ({ objekt_id, object_name, latitude: koordinater ? latitude : null, longitude: koordinater ? longitude : null })),
    objekt: [],
    route_cache: routeCache(cacheFor),
    extra_tid: [],
    dim_maskin: [{ maskin_id: DANIEL_MASKIN, maskin_typ: "Forwarder", sander_filer: true }],
    medarbetare_lonesystem: [{ medarbetare_id: DANIEL, anstallningsnummer: "1002" }],
    gs_avtal: [{ ...(sep as any).gs_avtal, giltigt_fran: "2025-04-01" }],
    lonesystem_koppling: [{ id: "ls1", system_typ: "fortnox" }],
    lonesystem_artikelmappning: PROD_MAPPNING.map((m, i) => ({ id: `x${i + 1}`, lonesystem_id: "ls1", ...m })),
    ledighet_ansokningar: [], fortnox_export_logg: [], utjamningsperiod: [], vilobrott: [], fakt_avbrott: [], operator_medarbetare: [], fakt_tid: [],
  };
}

export async function danielUnderlag(val?: DanielVal, medMaskintid = true, klient: any = tabellKlient(danielTabeller(val))) {
  const u = await beraknaLoneunderlag(klient, { period: "2026-10", medMaskintid });
  const m: any = u.berikad.find(x => x.medarbetare_id === DANIEL);
  return { u, m };
}
