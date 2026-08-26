// Mätvyns lokala lager och kalibrering.
//
// OFFLINE — VAD SOM GÄLLER OCH VAD SOM INTE GÖR DET
//
// Ingen täckning i skogen. Varje träd och varje punkt skrivs till
// localStorage i samma ögonblick den registreras, så en påbörjad mätning
// aldrig kan gå förlorad mitt i ett varv. Synk till databasen sker när
// täckning finns.
//
// Det som INTE går att lösa så: app-skalet. Service workern cachar medvetet
// ingenting — den avstod från cachning efter att en gammal PWA-version fastnat
// hos förarna, och den avvägningen står fast. Kallstartar Martin appen utan
// täckning laddar den alltså inte alls.
//
// Därför säger mätvyn det rakt ut när mätningen startas i stället för att låta
// honom upptäcka det när han står tre kilometer in i skogen. Se KALLSTART_TEXT.

import { normalisera } from './orientering';

export const KALLSTART_TEXT =
  'Håll appen öppen — den laddar inte utan täckning.';

/** Ett träd, som det lagras. Bäring och höjdvinkel, aldrig skärmläge. */
export type MattTrad = {
  tradslag: string;
  baring: number;
  hojdvinkel: number;
  ordning: number;
};

export type MattPunkt = {
  punkt_nummer: number;
  /** Ligger punkten i databasen? Sätts av synken. En punkt som redan finns
   *  där får aldrig skrivas en gång till — då dubbelräknas den i grundytan. */
  synkad?: boolean;
  /** matning_punkt.id när punktraden skapats, även om träden inte gick igenom.
   *  Utan det skulle ett omförsök skapa en ANDRA punktrad, och den första
   *  ligger kvar med noll träd — alltså en punkt med grundyta 0 som drar ned
   *  medlet. Med id:t skrivs träden om till samma rad i stället. */
  punkt_id?: string | null;
  /** Där punkten lottades. */
  lat: number | null;
  lng: number | null;
  /** Där Martin faktiskt stod. Skilt från det lottade läget — se migrationen. */
  matt_lat: number | null;
  matt_lng: number | null;
  gps_noggrannhet_m: number | null;
  varv_grader: number | null;
  matt_tid: string | null;
  trad: MattTrad[];
};

export type PagaendeMatning = {
  /** Lokalt id tills raden finns i databasen. */
  lokal_id: string;
  /**
   * matning.id när raden skapats. HELA MÄTNINGENS IDENTITET HÄNGER HÄR.
   *
   * Utan fältet skapade synken en ny mätningsrad varje gång den kördes, och
   * eftersom den körs efter varje punkt blev tio punkter i samma trakt till
   * tio mätningar med en punkt var. Sammanfattningen hade då sagt "medel över
   * 1 punkt" och ingen spridning — alltså exakt det den finns till för att
   * visa. Sätts en gång, återanvänds resten av traktbesöket.
   */
  matning_id: string | null;
  objekt_id: string;
  datum: string;
  relaskop_faktor: number;
  synfalt_grader: number;
  enhet: string | null;
  punkter: MattPunkt[];
  synkad: boolean;
};

// ---------------------------------------------------------------------------
// Kalibrering
// ---------------------------------------------------------------------------

/** Startgissning tills Martin kalibrerat. Mätning är spärrad så länge. */
export const ANTAGET_SYNFALT = 65;

export type Kalibrering = {
  synfalt_grader: number;
  relaskop_faktor: number;
  enhet: string;
  kalibrerad: string;
};

const KAL_NYCKEL = 'matning-kalibrering';
const MAT_NYCKEL = 'matning-pagaende';

/** null = inte kalibrerad. Anroparen ska då spärra mätningen, inte gissa. */
export function lasKalibrering(): Kalibrering | null {
  try {
    const rå = localStorage.getItem(KAL_NYCKEL);
    if (!rå) return null;
    const k = JSON.parse(rå) as Kalibrering;
    // Ett synfält utanför rimliga gränser är en trasig kalibrering, inte en
    // sträng kalibrering. Hellre spärra om än mäta systematiskt fel.
    if (!(k.synfalt_grader > 20 && k.synfalt_grader < 120)) return null;
    if (!(k.relaskop_faktor > 0 && k.relaskop_faktor <= 4)) return null;
    return k;
  } catch {
    return null;
  }
}

export function sparaKalibrering(k: Kalibrering): void {
  try {
    localStorage.setItem(KAL_NYCKEL, JSON.stringify(k));
  } catch {
    /* privat läge e.d. — anroparen ser att lasKalibrering fortsatt ger null */
  }
}

/** Enhetsnamn för spårbarhet. Ingen fingerprinting, bara modellsträngen. */
export function enhetsNamn(): string {
  if (typeof navigator === 'undefined') return 'okänd';
  return (navigator.userAgent || 'okänd').slice(0, 120);
}

// ---------------------------------------------------------------------------
// Pågående mätning
// ---------------------------------------------------------------------------

export function lasPagaende(): PagaendeMatning | null {
  try {
    const rå = localStorage.getItem(MAT_NYCKEL);
    return rå ? (JSON.parse(rå) as PagaendeMatning) : null;
  } catch {
    return null;
  }
}

/** Skrivs vid VARJE träd. Ett tappat varv är en mätning som måste göras om. */
export function sparaPagaende(m: PagaendeMatning): void {
  try {
    localStorage.setItem(MAT_NYCKEL, JSON.stringify(m));
  } catch {
    /* full disk — mätningen fortsätter i minnet, synken får rädda den */
  }
}

/** Hur många punkter som ännu inte nått databasen. Det talet — inte antalet
 *  mätta punkter — är vad vyn ska visa som "väntar på att sparas". */
export function osynkadeAntal(m: PagaendeMatning | null): number {
  return m ? m.punkter.filter((p) => !p.synkad).length : 0;
}

export function rensaPagaende(): void {
  try {
    localStorage.removeItem(MAT_NYCKEL);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Beskedet efter varje punkt
// ---------------------------------------------------------------------------

export type Besked = {
  grundyta: number;
  rad: string;
  avvikande: boolean;
};

/**
 * Ett tal och en rad, medan Martin står kvar på punkten.
 *
 * Avvikande = mer än 40 % från medianen av de tidigare punkterna. Median och
 * inte medel: en enda feltagen punkt drar medelvärdet med sig och skulle då
 * dölja precis det den ska larma om.
 *
 * Under tre tidigare punkter finns inget att jämföra mot, och då sägs det —
 * hellre "första punkten" än ett tyst godkännande som ser ut som en bedömning.
 */
export function beskedForPunkt(grundyta: number, tidigare: number[]): Besked {
  const rundad = Math.round(grundyta);
  if (tidigare.length < 3) {
    return {
      grundyta: rundad,
      rad: tidigare.length === 0 ? 'Första punkten' : `Punkt ${tidigare.length + 1} av 10`,
      avvikande: false,
    };
  }

  const sorterad = [...tidigare].sort((a, b) => a - b);
  const mitt = sorterad.length % 2
    ? sorterad[(sorterad.length - 1) / 2]
    : (sorterad[sorterad.length / 2 - 1] + sorterad[sorterad.length / 2]) / 2;

  if (mitt <= 0) return { grundyta: rundad, rad: 'Ingen jämförelse möjlig', avvikande: false };

  const kvot = grundyta / mitt;
  if (kvot > 1.4) return { grundyta: rundad, rad: 'Betydligt högre. Mät om?', avvikande: true };
  if (kvot < 0.6) return { grundyta: rundad, rad: 'Betydligt lägre. Mät om?', avvikande: true };
  return { grundyta: rundad, rad: 'I linje med föregående', avvikande: false };
}

/** Grundytan för en punkt. Antalet träd som fyllde siktet, gånger faktorn. */
export function punktGrundyta(p: MattPunkt, faktor: number): number {
  return p.trad.length * faktor;
}

/**
 * Är varvet slutet? Under 330° har Martin inte gått hela vägen runt, och
 * grundytan är då en underskattning som inte får presenteras som ett resultat.
 */
export function varvSlutet(varvGrader: number | null): boolean {
  return varvGrader != null && Math.abs(varvGrader) >= 330;
}

/** Nästa ordningsnummer i varvet. */
export function nastaOrdning(trad: MattTrad[]): number {
  return trad.length === 0 ? 1 : Math.max(...trad.map((t) => t.ordning)) + 1;
}

/** Trädet som ligger närmast en given bäring — för att kunna ångra rätt prick. */
export function narmastTrad(trad: MattTrad[], baring: number): MattTrad | null {
  if (trad.length === 0) return null;
  let bast = trad[0];
  let bastDiff = Math.abs(((normalisera(trad[0].baring - baring) + 180) % 360) - 180);
  for (const t of trad.slice(1)) {
    const d = Math.abs(((normalisera(t.baring - baring) + 180) % 360) - 180);
    if (d < bastDiff) { bast = t; bastDiff = d; }
  }
  return bastDiff <= 15 ? bast : null;
}
