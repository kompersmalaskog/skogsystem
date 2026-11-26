// Zoom i PDF-läsaren (app/planering/PdfLasare.tsx). Appen har zoom låst
// (app/layout.tsx: userScalable false), så läsaren zoomar själv: nyp och
// dubbeltryck. Rena funktioner här, så reglerna går att testa utan en webbläsare.

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
/** Dubbeltryck på en ozoomad sida zoomar hit; dubbeltryck igen går tillbaka till 1. */
export const ZOOM_DUBBEL = 2.5;
/** Två tryck inom så här lång tid och så här nära varandra är ett dubbeltryck. */
export const DUBBEL_MS = 300;
export const DUBBEL_PX = 30;
/** iOS ritar inte en canvas över ~16,7 miljoner pixlar — håll oss under med marginal. */
export const MAX_CANVAS_PX = 12_000_000;

export const klamZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/** Dubbeltryck: in till ZOOM_DUBBEL om sidan är (nästan) ozoomad, annars ut till 1. */
export const zoomEfterDubbeltryck = (z: number) => (z < 1.1 ? ZOOM_DUBBEL : 1);

/**
 * Var rullningen ska stå efter en zoom så att punkten under fingrarna stannar kvar.
 * `fokus` = punkten i rullytans synliga del (px), `rull` = rullningen före,
 * `kant` = utfyllnaden före innehållet. Gäller en axel i taget.
 */
export function rullEfterZoom(rull: number, fokus: number, fore: number, efter: number, kant = 0): number {
  const iInnehall = (rull + fokus - kant) / fore;
  return Math.max(0, iInnehall * efter + kant - fokus);
}

/**
 * Upplösningen en sida ritas i: visad bredd × zoom × skärmens täthet, men aldrig
 * fler pixlar än MAX_CANVAS_PX (då blir sidan lite mjukare i stället för vit).
 */
export function ritSkala(sidBreddPt: number, sidHojdPt: number, visadBredd: number, zoom: number, dpr: number): number {
  const onskad = (visadBredd * zoom * dpr) / sidBreddPt;
  const pixlar = sidBreddPt * sidHojdPt * onskad * onskad;
  return pixlar <= MAX_CANVAS_PX ? onskad : Math.sqrt(MAX_CANVAS_PX / (sidBreddPt * sidHojdPt));
}

export const arDubbeltryck = (forra: { t: number; x: number; y: number } | null, nu: { t: number; x: number; y: number }) =>
  !!forra && nu.t - forra.t <= DUBBEL_MS && Math.hypot(nu.x - forra.x, nu.y - forra.y) <= DUBBEL_PX;
