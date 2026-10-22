// Hur mycket står kvar efter gallringen? — grundyta FÖRE ur Skogsstyrelsens laserdata, UTTAGET ur skördaren.
// Rena funktioner, inga anrop. Läsningen bor i lib/laserGrundyta.ts och app/api/laser-grundyta.
//
//  FÖRE   = Skogliga grunddata (SkogligaGrunddata_3_1, 10 m rutor, grundyta m²/ha). Skanningen är gjord före
//           gallringen, ofta flera år före. Skogsstyrelsen räknar INTE upp datan själva — produktbeskrivningen säger
//           att användaren får räkna fram tillväxten. Vi räknar upp varje ruta från SIN skanningsdag till dagen
//           skördaren började: grundyta × (1 + tillväxt)^år. Tillväxten är 3 % per år med 2–4 % som spann (skött
//           barrskog i gallringsålder i södra Sverige); spannet står i vyn, så talet aldrig ser ut som en mätning.
//  UTTAG  = skördarens grundyta per hektar på den gallrade ytan (lib/gallringPerHa.ts). Den är en mätning.
//  KVAR   = före − uttag. Osäkerheten ligger HELT i före: ett fel där blir samma antal m²/ha fel i kvar.
//
// Det som INTE går att räkna upp är det som hänt i skogen efter skanningen (en tidigare gallring, stormfällning).
// Det som går att se är en skanning gjord EFTER att skördaren började — då visar rutan redan det gallrade beståndet.
// Sådana rutor räknas aldrig; är de många visas inget tal alls.
//
// Rutor där medelhöjden är under 3 m är 0 i Skogsstyrelsens data (väg, öppen mark, plantskog). De räknas som 0 —
// samma yta som uttaget räknas på, så snittet blir över samma mark.

/** Tillväxt i grundyta per år. Ändras här och bara här. */
export const TILLVAXT = { lag: 0.02, mitt: 0.03, hog: 0.04 } as const;
/** Under denna andel rutor med data räcker datan inte för trakten (en del saknas i Skogsstyrelsens leverans). */
export const MIN_TACKNING = 0.8;
/** Fler rutor än så skannade efter att skördaren började → inget tal. Färre → de rutorna räknas inte. */
export const MAX_ANDEL_EFTER = 0.1;
/** Rimlighet för en ruta: grundyta i m²/ha. Annat = datan har ett annat format än vi tror. */
export const MAX_GRUNDYTA = 100;

const DAG_MS = 86_400_000;
const AR_DAGAR = 365.25;

/** Rimlighet för en ruta: grundytevägd medeldiameter i cm. */
export const MAX_DIAMETER_CM = 100;
/** Rutor med grundyta men utan diameter: över denna andel räknas inga stammar före. */
export const MAX_ANDEL_UTAN_DIAMETER = 0.2;

/** En 10 m-ruta: grundyta m²/ha (null = ingen data), grundytevägd medeldiameter i cm (`d`, null/0 = okänd) och
 *  skanningsdag i dagar sedan 1970 (null/0 = okänt). */
export type LaserRuta = { g: number | null; d?: number | null; dag: number | null };

/** Stammar per hektar före och uttaget. Kvar räknas av vyn ur de avrundade talen, så det går att räkna. */
export type StammarKvar = { fore: number; uttag: number };

export type KvarSvar =
  | {
      lage: 'ok';
      /** Grundyta före, uppräknad med mitt-tillväxten — och med låg/hög för spannet. m²/ha. */
      fore: number; foreLag: number; foreHog: number;
      uttag: number;
      kvar: number; kvarLag: number; kvarHog: number;
      /** Uttaget som andel av före (mitt). */
      uttagAndel: number;
      /** Skanningsår (tidigaste–senaste bland rutorna som räknas). */
      skanningFran: number; skanningTill: number;
      /** Snittet av åren rutorna räknats upp. */
      ar: number;
      /** Antal rutor som skannats efter skördarens start och därför inte räknas. */
      efterRaknasInte: number;
      /** Stammar före (ur laserns grundyta och medeldiameter vid skanningen) och uttaget. null = går inte att räkna. */
      stammar: StammarKvar | null;
    }
  | { lage: 'saknas'; tackning: number }
  | { lage: 'skannad-efter'; skanningAr: number }
  | { lage: 'stammer-inte'; fore: number; uttag: number };

/** Dag (sedan 1970, UTC) för ett datum "YYYY-MM-DD". */
export function dagNummer(datum: string): number {
  return Math.floor(Date.parse(`${datum.slice(0, 10)}T00:00:00Z`) / DAG_MS);
}

export const arForDag = (dag: number) => new Date(dag * DAG_MS).getUTCFullYear();

/** Är rutan rimlig? Annars har tjänsten svarat i ett annat format än vi räknar med — då är det ett fel, inte ett tal. */
export function rimligRuta(r: LaserRuta, idagDag: number): boolean {
  if (r.g !== null && (!Number.isFinite(r.g) || r.g < 0 || r.g > MAX_GRUNDYTA)) return false;
  // Laserskanningen startade 2009; en dag före det eller i framtiden är inte ett datum.
  if (r.dag !== null && r.dag !== 0 && (r.dag < dagNummer('2009-01-01') || r.dag > idagDag)) return false;
  if (r.d != null && (!Number.isFinite(r.d) || r.d < 0 || r.d > MAX_DIAMETER_CM)) return false;
  return true;
}

export function beraknaKvar(ind: {
  rutor: LaserRuta[];
  /** Skördarens grundyta per hektar på samma yta. */
  uttagPerHa: number;
  /** Första dagen skördaren körde, "YYYY-MM-DD". */
  skordStart: string;
  /** Skördarens uttagna stammar per hektar på samma yta (null = okänt). */
  uttagStammarPerHa?: number | null;
}): KvarSvar {
  const start = dagNummer(ind.skordStart);
  const total = ind.rutor.length;
  const medData = ind.rutor.filter((r) => r.g !== null) as { g: number; d?: number | null; dag: number | null }[];
  const tackning = total > 0 ? medData.length / total : 0;
  if (total === 0 || tackning < MIN_TACKNING) return { lage: 'saknas', tackning };

  // Skanningen efter skördarens start: den rutan visar redan det gallrade beståndet.
  const daterade = medData.filter((r) => r.dag !== null && r.dag > 0);
  const efter = daterade.filter((r) => (r.dag as number) >= start);
  if (daterade.length > 0 && efter.length / daterade.length > MAX_ANDEL_EFTER) {
    const senast = Math.max(...efter.map((r) => r.dag as number));
    return { lage: 'skannad-efter', skanningAr: arForDag(senast) };
  }
  const raknas = medData.filter((r) => !(r.dag !== null && r.dag > 0 && r.dag >= start));

  let sLag = 0, sMitt = 0, sHog = 0, arSum = 0, arN = 0;
  let fran = Infinity, till = -Infinity;
  for (const r of raknas) {
    // En ruta med 0 i grundyta behöver ingen uppräkning (och har ofta inget datum).
    const ar = r.dag && r.dag > 0 ? Math.max(0, (start - r.dag) / AR_DAGAR) : 0;
    sLag += r.g * (1 + TILLVAXT.lag) ** ar;
    sMitt += r.g * (1 + TILLVAXT.mitt) ** ar;
    sHog += r.g * (1 + TILLVAXT.hog) ** ar;
    if (r.dag && r.dag > 0) {
      arSum += ar; arN++;
      const a = arForDag(r.dag);
      if (a < fran) fran = a;
      if (a > till) till = a;
    }
  }
  const n = raknas.length;
  if (n === 0 || arN === 0) return { lage: 'saknas', tackning };
  const fore = sMitt / n, foreLag = sLag / n, foreHog = sHog / n;
  const uttag = ind.uttagPerHa;
  // Mer uttaget än det som stod där enligt laserdatan (även med hög tillväxt): datan stämmer inte för trakten.
  if (uttag > foreHog) return { lage: 'stammer-inte', fore, uttag };

  return {
    lage: 'ok',
    fore, foreLag, foreHog,
    uttag,
    kvar: fore - uttag,
    kvarLag: foreLag - uttag,
    kvarHog: foreHog - uttag,
    uttagAndel: fore > 0 ? uttag / fore : 0,
    skanningFran: fran, skanningTill: till,
    ar: arSum / arN,
    efterRaknasInte: efter.length,
    stammar: stammarFore(raknas, ind.uttagStammarPerHa ?? null),
  };
}

/** Stammar per hektar före gallringen: per ruta grundyta / (π/4 · Dg²), vid SKANNINGEN — antalet stammar växer inte,
 *  så det räknas aldrig upp. Dg är grundytevägd och lasern ser inte de minsta träden, så talet blir hellre för lågt
 *  än för högt. null när diametern saknas på för många rutor, eller när uttaget är minst lika stort som före. */
export function stammarFore(
  rutor: { g: number; d?: number | null }[],
  uttag: number | null,
): StammarKvar | null {
  if (uttag === null || !Number.isFinite(uttag)) return null;
  let summa = 0, n = 0, utanD = 0, medG = 0;
  for (const r of rutor) {
    if (r.g === 0) { n++; continue; }
    medG++;
    if (!r.d || r.d <= 0) { utanD++; continue; }
    summa += r.g / ((Math.PI / 4) * (r.d / 100) ** 2);
    n++;
  }
  if (n === 0 || medG === 0 || utanD / medG > MAX_ANDEL_UTAN_DIAMETER) return null;
  const fore = summa / n;
  if (uttag >= fore) return null;
  return { fore, uttag };
}

/** Provpunkter var 10:e meter i den gallrade ytan ([lng, lat]) — servern slår upp rutan varje punkt ligger i. */
export function provpunkter(
  lnglat: [number, number, number, number],
  innehaller: (lng: number, lat: number) => boolean,
  stegM = 10,
): [number, number][] {
  const [minLng, minLat, maxLng, maxLat] = lnglat;
  const lat0 = (minLat + maxLat) / 2;
  const mPerGradLat = 111_320;
  const mPerGradLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const dLat = stegM / mPerGradLat;
  const dLng = stegM / mPerGradLng;
  const ut: [number, number][] = [];
  for (let lat = minLat + dLat / 2; lat < maxLat; lat += dLat) {
    for (let lng = minLng + dLng / 2; lng < maxLng; lng += dLng) {
      if (innehaller(lng, lat)) ut.push([lng, lat]);
    }
  }
  return ut;
}
