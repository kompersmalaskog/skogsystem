// Gallring per hektar — uttaget och stickvägarna räknade på Vidas traktgräns. Rena funktioner, inga anrop.
//
// Martin 2026-10-22: "om en människa måste mäta alla objekten blir det inte av". Allt här kommer ur det maskinerna
// redan lämnar ifrån sig — ingen fältmätning:
//
//  AREAL   = ytan innanför Vidas traktgräns (L_TRAKTDEL, objekt_geometri). INTE objekt.areal: på Sandåsen gallring
//            2025 säger fältet 3,98 ha medan traktgränsen är 8,83 ha (Vidas egen SHAPE.STAr 88 343 m²) — per-hektar-
//            talen blev dubbelt så höga. Traktgränsen är en mätning (Vidas karta), ingen skattning ur körspår.
//  UTTAG   = MOM:s volym och stammar, med bara den del som står INNANFÖR gränsen. Varje stam i detalj_stam har en
//            position; andelen innanför tas på grundytan (för volym och grundyta) och på antalet (för stammar).
//            Sandåsen: 28 % av stammarna står utanför gränsen — de hör inte till trakten och räknas inte.
//            detalj_stam har luckor (se lib/gallring.ts): grundytan skalas därför upp med MOM-stammar / stamrader,
//            samma antagande som stammar per hektar bygger på.
//  STICKVÄG = maskinernas GPS-spår (hyttspar, skördare OCH skotare — skotaren kör samma stickvägar), 2 m åt varje
//            håll (4 m breda vägar), klippt mot traktgränsen = vägarnas yta. Andel = vägyta / areal, avstånd mellan
//            vägarna = bredd / andel. Rådata, aldrig det utjämnade spåret (lib/sparJamning gäller bara ritning).
//
// KÄND SKEVHET (ej kalibrerad, 2026-10-22): GPS-bruset (± 2–3 m) och att skotaren kör samma väg flera gånger gör
// vägarna bredare än 4 m i rastret. Betet och Sandåsen gav 24–25 %, alltså ca 16–17 m mellan vägarna, där normalt är
// 18–20 % och ca 20 m. Talet visas som "ca". En kalibrering mot EN trakt där avståndet mätts med måttband räcker.
//
// "Kvar efter gallring" (grundyta före ur Skogsstyrelsens laserdata) är INTE byggt — se STATUS/CLAUDE.md.

import { avverkadAreaM2, type Punkt } from './avverkadAreal';
import { punktIPolygon } from './skotat';
import { beraknaGallradYta, type GallradYta, type UtanforSvar, type EjGallratSvar } from './gallradYta';

/** Stickvägens bredd i meter — bufferten runt spåret är halva. */
export const STICKVAG_BREDD_M = 4;
/** Rastrets ruta. 0,5 m: ett 4 m brett stråk blir 8 rutor, fel ca 3 %. */
const STICKVAG_RUTA_M = 0.5;
/** Under denna andel täcker spåret inte trakten (= mer än 40 m mellan vägarna, vilket ingen gallring har).
 *  Då är spåret ofullständigt — Hålabäck 16 ga hade 55 skotarpunkter — och ett tal vore fel, inte lågt. */
export const STICKVAG_MIN_ANDEL = STICKVAG_BREDD_M / 40;
/** Stammar utanför traktgränsen sägs först från denna andel — under det är det GPS-brus vid kanten. */
export const UTANFOR_VISA_FRAN = 0.05;

const JORDRADIE_M = 6371008.8;

/** Yta i m² för traktgränsens ringar ([lng, lat], yttre ringar). Lokal projektion runt ringarnas mitt. */
export function ringarYtaM2(ringar: Punkt[][]): number {
  const alla = ringar.flat();
  if (alla.length === 0) return 0;
  const rad = Math.PI / 180;
  const lat0 = alla.reduce((s, p) => s + p[1], 0) / alla.length;
  const kx = JORDRADIE_M * Math.cos(lat0 * rad) * rad;
  const ky = JORDRADIE_M * rad;
  let yta = 0;
  for (const r of ringar) {
    let s = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      s += (r[j][0] * kx) * (r[i][1] * ky) - (r[i][0] * kx) * (r[j][1] * ky);
    }
    yta += Math.abs(s) / 2;
  }
  return yta;
}

export type StamPunkt = { id?: number | string; lat: number; lng: number; dbhMm: number | null };

/** Stammarnas positioner måste täcka så stor del av MOM-uttaget innan ogallrad mark letas upp. */
export const TACKNING_FOR_EJ_GALLRAT = 0.9;

export type StickvagSvar =
  | { lage: 'ok'; andel: number; avstandM: number; roller: string[] }
  | { lage: 'inget-spar' }
  | { lage: 'ofullstandigt'; andel: number; roller: string[] };

export type PerHa =
  | { lage: 'ingen-grans' }
  | {
      lage: 'ok';
      /** Arealen uttaget räknas på: den gallrade ytan när stammarna har positioner, annars Vidas gräns. */
      arealHa: number;
      /** Vidas traktgräns i hektar (oförändrad, visas bredvid). */
      vidaHa: number;
      /** Den gallrade ytan — null utan stampositioner. */
      yta: GallradYta | null;
      volymPerHa: number;
      stammarPerHa: number;
      /** null när inga stammar har diameter. */
      grundytaPerHa: number | null;
      /** Andel av stamraderna med position som INTE räknas (utanför gränsen och inte gallring). null = inga positioner. */
      andelUtanfor: number | null;
      stickvag: StickvagSvar;
    };

export type PerHaIndata = {
  ringar: Punkt[][];
  volymM3fub: number;
  /** MOM:s antal — sanningen om antalet stammar. */
  stammar: number;
  stamrader: StamPunkt[];
  spar: { roll: string; linjer: Punkt[][] }[];
  svarUtanfor?: Record<string, UtanforSvar>;
  svarEjGallrat?: Record<string, EjGallratSvar>;
};

function inne(p: { lat: number; lng: number }, ringar: Punkt[][]): boolean {
  return ringar.some((r) => punktIPolygon([p.lng, p.lat], r));
}

const grundyta = (dbhMm: number) => (Math.PI * dbhMm * dbhMm) / 4 / 1e6;

export function stickvag(
  spar: PerHaIndata['spar'], ringar: Punkt[][], arealM2: number,
  inne?: (lng: number, lat: number) => boolean,
): StickvagSvar {
  const medLinjer = spar.filter((s) => s.linjer.some((l) => l.length >= 2));
  if (medLinjer.length === 0 || !(arealM2 > 0)) return { lage: 'inget-spar' };
  const vagM2 = avverkadAreaM2(medLinjer.flatMap((s) => s.linjer), {
    ringar, inne, bufferM: STICKVAG_BREDD_M / 2, cellM: STICKVAG_RUTA_M,
  });
  const andel = vagM2 / arealM2;
  const roller = Array.from(new Set(medLinjer.map((s) => s.roll))).sort();
  if (andel < STICKVAG_MIN_ANDEL) return { lage: 'ofullstandigt', andel, roller };
  return { lage: 'ok', andel, avstandM: STICKVAG_BREDD_M / andel, roller };
}

export function beraknaPerHa(ind: PerHaIndata): PerHa {
  const ringar = ind.ringar.filter((r) => r.length >= 3);
  const vidaM2 = ringarYtaM2(ringar);
  if (ringar.length === 0 || !(vidaM2 > 0)) return { lage: 'ingen-grans' };

  const med = ind.stamrader
    .map((p, i) => ({ ...p, id: p.id ?? i }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  // Den gallrade ytan: bara när stammarna har positioner. Ogallrad mark letas bara när positionerna täcker uttaget.
  const tackning = ind.stammar > 0 ? med.length / ind.stammar : 0;
  const yta = med.length > 0
    ? beraknaGallradYta({
        ringar, stammar: med,
        svarUtanfor: ind.svarUtanfor, svarEjGallrat: ind.svarEjGallrat,
        hittaEjGallrat: tackning >= TACKNING_FOR_EJ_GALLRAT,
      })
    : null;
  const raknas = (p: { id: number | string; lat: number; lng: number }) =>
    yta ? yta.raknade.has(p.id) : inne(p, ringar);

  // Ytan räknas i samma rutor som Vidas gräns, så "gallrat" och "Vidas gräns" går att jämföra rakt av.
  const skala = yta && yta.vidaHa > 0 ? vidaM2 / 10000 / yta.vidaHa : 1;
  const arealHa = yta ? yta.gallradHa * skala : vidaM2 / 10000;
  if (!(arealHa > 0)) return { lage: 'ingen-grans' };

  let antalRaknade = 0;
  let gAlla = 0;
  let gRaknade = 0;
  let medDiameter = 0;
  for (const p of med) {
    const r = raknas(p);
    if (r) antalRaknade++;
    const d = Number(p.dbhMm);
    if (Number.isFinite(d) && d > 0) {
      medDiameter++;
      gAlla += grundyta(d);
      if (r) gRaknade += grundyta(d);
    }
  }

  // Utan positioner vet vi inget om vad som står utanför: hela uttaget räknas på trakten.
  const andelAntal = med.length > 0 ? antalRaknade / med.length : 1;
  const andelYta = gAlla > 0 ? gRaknade / gAlla : andelAntal;
  // Luckor i detalj_stam: skala upp den mätta grundytan till MOM:s antal stammar (aldrig ned).
  const luckfaktor = medDiameter > 0 ? Math.max(1, ind.stammar / medDiameter) : 1;

  return {
    lage: 'ok',
    arealHa,
    vidaHa: vidaM2 / 10000,
    yta,
    volymPerHa: (ind.volymM3fub * andelYta) / arealHa,
    stammarPerHa: (ind.stammar * andelAntal) / arealHa,
    grundytaPerHa: medDiameter > 0 ? (gRaknade * luckfaktor) / arealHa : null,
    andelUtanfor: med.length > 0 ? 1 - andelAntal : null,
    // Stickvägarna räknas på den gallrade ytan — också vägarna i en bit som gallrats utanför gränsen.
    stickvag: yta
      ? stickvag(ind.spar, ringar, yta.gallradM2 * skala, yta.innehaller)
      : stickvag(ind.spar, ringar, vidaM2),
  };
}
