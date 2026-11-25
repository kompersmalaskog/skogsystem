// Ritar skotningsrapporten (lib/faktura/skotningsrapport.ts) som en A4 med karta.
//
// A4-LAYOUTEN ÄR INTE NY: `skapaArbetsmiljoPdf` ritar huvudet, svaret,
// avsnitten och foten — samma ritare som arbetsmiljön, markägarrapporten och
// "Ligger i skogen". Här läggs bara KARTAN till, mellan svaret och avsnitten,
// via `PdfKarta`-callbacken. Så finns A4:an på ETT ställe, och en ändring där
// slår igenom i alla rapporter.
//
// KARTAN ÄR OCKSÅ ÅTERANVÄND: `ritaKarta` i lib/egenkontrollRapportKartaPdf är
// appens vektorkarta för PDF (traktgräns, stammoln, hyttspår, pinnar, norr
// uppåt, skalstock). Ingen bakgrundskarta — en rapport som hämtar flygfoto
// genom en proxy blir förr eller senare en rapport UTAN karta, och det märks
// först när inköparen öppnar den.

import type { Dokument } from '@/lib/arbetsmiljo/dokument';
import { skapaArbetsmiljoPdf, type PdfKarta } from '@/lib/arbetsmiljo/pdf';
import { sanera } from '@/lib/markagarrapport/pdf';
import { brytText } from '@/lib/egenkontrollRapportPdf';
import { helveticaBreddEm } from '@/lib/helveticaBredd';
import { kartaHojd, ritaKarta, type KartLager } from '@/lib/egenkontrollRapportKartaPdf';
import { KARTA_FORKLARING } from './skotningsrapport';

/** Allt kartan behöver, i lat/lng. Tomma listor ger ingen karta. */
export type RapportKarta = {
  /** Vidas traktdelar (L_TRAKTDEL). */
  granser: { lat: number; lng: number }[][];
  /** Var virket stod: skördarens stammar. */
  stammar: { lat: number; lng: number }[];
  /**
   * Skotarens körspår (ritning). Heter `korspar` och inte `spar`: `skotar_lass.spar`
   * var den trasiga spårkopian som avståndet en gång räknades ur, och en vakt
   * (`lassCykel.vakter.test.ts`) larmar på varje `.spar` i en fakturafil. Det
   * här är en bild, inte en mätning — men namnet ska inte be om ett undantag.
   */
  korspar: { lat: number; lng: number }[][];
  /** Avläggen, numrerade som på kartan i appen. */
  avlagg: { nr: number; namn: string; plats: { lat: number; lng: number } }[];
};

/** true när det finns något att rita. En tom karta ritas aldrig. */
export function harKarta(k: RapportKarta): boolean {
  return k.granser.some(r => r.length > 0) || k.stammar.length > 0
    || k.korspar.some(l => l.length > 0) || k.avlagg.length > 0;
}

function tillLager(k: RapportKarta): KartLager {
  return {
    granser: k.granser.filter(r => r.length > 1),
    stammar: k.stammar,
    hyttspar: k.korspar.length > 0 ? [{ roll: 'skotare', linjer: k.korspar.filter(l => l.length > 1) }] : undefined,
    markeringar: [],
    pinnar: k.avlagg.map(a => ({ nr: a.nr, rubrik: a.namn, plats: a.plats })),
  };
}

const A4_BREDD = 595.28;
const MARG = 48;
const KART_BREDD = A4_BREDD - 2 * MARG;

/** Teckenförklaringens textstorlek och radavstånd under skalstocken. */
const FORKL_STORLEK = 8;
const FORKL_RAD = 10;

/**
 * Kartan som en `PdfKarta` PÅ EGEN SIDA, sist i rapporten.
 *
 * VARFÖR EGEN SIDA (mätt 2026-11-25): rapportens fakta, svar och två avsnitt
 * tar nästan en hel A4. Med kartan i flödet blev det två sidor även vid 60 pt
 * karta — och då bryts prisavsnittet mitt itu. Så sida 1 svarar på frågan
 * ensam (avstånd, fyra mått, kronor) och kartan får hela sida 2. En karta som
 * ska gå att läsa behöver den ytan.
 *
 * TECKENFÖRKLARINGEN RITAS HÄR, vid kartan — inte i dokumentets fot. Den
 * säger vad prickarna och linjerna ÄR, och en inköpare som tittar på kartan
 * ska hitta den utan att leta. Och den ritas bara när kartan ritas:
 * `skotningsrapport()` vet inte om det finns någon geometri, så en förklaring
 * i noten hade stått där även på en rapport utan karta.
 */
export function kartaForRapport(k: RapportKarta): PdfKarta | undefined {
  if (!harKarta(k)) return undefined;
  const lager = tillLager(k);
  // Förklaringen bryts mot kartans bredd med Helveticas EGNA breddvärden
  // (`helveticaBreddEm`), inte en gissning på teckenantal — annars hamnar en
  // rad utanför sidan eller skalstocken ovanpå texten.
  const matBredd = (s: string) => helveticaBreddEm(s) * FORKL_STORLEK;
  const forklRader = brytText(KARTA_FORKLARING, KART_BREDD, matBredd);
  const under = 14 + forklRader.length * FORKL_RAD;
  return {
    hojd: 0, // ignoreras: egen sida ger rutan.
    egenSida: true,
    rubrik: 'Var skotaren körde',
    rita: ({ sida, lib, fonter, ruta }) => {
      // Kartan behåller sin egen form: `kartaHojd` räknar höjden ur traktens
      // proportion, så en bred trakt inte får en hög ruta med tom yta under.
      // Taket är sidans plats minus förklaringen.
      const plats = Math.max(160, ruta.h - under);
      const hojd = kartaHojd(lager, ruta.b, 240, plats, 18, { allt: true });
      const r = ritaKarta(
        lib as never,
        sida as never,
        fonter as never,
        { x: ruta.x, top: ruta.top, b: ruta.b, h: hojd },
        lager,
        sanera,
        // `extentAllt`: avlägget ligger utanför traktgränsen och MÅSTE med —
        // rapporten handlar om avståndet från det. `ritaKarta` ritar sin egen
        // skalstock inne i rutan; vi ritar ingen till.
        { etiketter: true, extentAllt: true },
      );
      if (!r) return;
      const l = lib as typeof import('pdf-lib');
      const gra = l.rgb(0.42, 0.42, 0.44);
      const sid = sida as import('pdf-lib').PDFPage;
      const normal = (fonter as { normal: import('pdf-lib').PDFFont }).normal;

      // Teckenförklaringen, radbruten, under kartan.
      let ty = 841.89 - ruta.top - hojd - FORKL_RAD - 4;
      for (const rad of forklRader) {
        sid.drawText(sanera(rad), { x: ruta.x, y: ty, size: FORKL_STORLEK, font: normal, color: gra });
        ty -= FORKL_RAD;
      }
    },
  };
}

export async function skapaSkotningsrapportPdf(dok: Dokument, karta: RapportKarta): Promise<Uint8Array> {
  return skapaArbetsmiljoPdf(dok, kartaForRapport(karta));
}
