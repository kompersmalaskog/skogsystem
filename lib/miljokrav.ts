// Miljöhänsyn i körvyns objektpill: "Högstubbar n/krav" och "Evighetsträd n/krav".
//
// EN källa för kravet och för "ligger jag efter?" — pillen, objektinfon och testerna läser här. Rena funktioner,
// inga DB-anrop, inga React-beroenden.
//
// KRAV (Martins spec 2026-10-05): högstubbar 3 per ha, evighetsträd 10 per ha på objektets areal, avrundat UPPÅT, och
// BARA för certifierade objekt. Ej certifierat → bara antalet (inget krav, ingen "efter", ingen bock).
//
// CERTIFIERAD = objekt.cert innehåller FSC eller PEFC. Kolumnen är fri text och prod har sex olika värden: "FSC PEFC",
// "FSC", "PEFC" (certifierade) men också "Ej certifierad", "None", "Not known" och null (inte certifierade). Allt som
// inte nämner FSC/PEFC räknas alltså som ej certifierat — aldrig ett gissat krav.
//
// EVIGHETSTRÄD räknas som planeringsvyns Miljöhänsyn-räknare gör det: evighetsträd + naturhörna (en naturhörna är en klunga
// naturvårdsträd, `antal` st). Samma siffra i körvyn och planeringen — annars skulle två vyer säga olika om samma objekt.
// Markeringar räknas per OBJEKT oavsett vem som satte dem (alla markörer på objektet, inte bara förarens egna).

export const HOGSTUBBAR_PER_HA = 3;
export const EVIGHETSTRAD_PER_HA = 10;

/** Certifierat = cert nämner FSC eller PEFC. "Ej certifierad", "None", "Not known", tomt och null = nej. */
export function arCertifierat(cert: string | null | undefined): boolean {
  const t = String(cert ?? '').toUpperCase();
  if (!t.trim()) return false;
  return /(^|[^A-Z])(FSC|PEFC)([^A-Z]|$)/.test(t);
}

/** Areal i ha ur objekt.areal (tal eller text med komma). Ogiltigt, noll eller negativt → null. */
export function tolkaAreal(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Antal per ha × areal, avrundat uppåt. Flyttalsbrus rensas först: 1,2 ha × 10 = 12,000000000000002 ska bli 12, inte 13. */
export function kravAntal(arealHa: number | null, perHa: number): number | null {
  if (arealHa == null || !(arealHa > 0)) return null;
  return Math.ceil(Math.round(arealHa * perHa * 1e6) / 1e6);
}

export interface MiljoKrav {
  certifierat: boolean;
  arealHa: number | null;
  /** null = inget krav (ej certifierat eller areal saknas) */
  hogstubbar: number | null;
  evighetstrad: number | null;
}

export function miljoKrav(areal: unknown, cert: string | null | undefined): MiljoKrav {
  const certifierat = arCertifierat(cert);
  const arealHa = tolkaAreal(areal);
  return {
    certifierat,
    arealHa,
    hogstubbar: certifierat ? kravAntal(arealHa, HOGSTUBBAR_PER_HA) : null,
    evighetstrad: certifierat ? kravAntal(arealHa, EVIGHETSTRAD_PER_HA) : null,
  };
}

export interface MarkorLike { type?: string | null; antal?: number | null }

export interface MiljoAntal { hogstubbar: number; evighetstrad: number }

/** Antal satta markeringar på objektet (alla, oavsett vem som satte dem). `antal` saknas = 1. */
export function raknaMiljo(markers: readonly MarkorLike[] | null | undefined): MiljoAntal {
  let hogstubbar = 0, evighetstrad = 0;
  for (const m of markers || []) {
    const a = typeof m.antal === 'number' && Number.isFinite(m.antal) && m.antal > 0 ? m.antal : 1;
    if (m.type === 'highstump') hogstubbar += a;
    else if (m.type === 'eternitytree' || m.type === 'naturecorner') evighetstrad += a;
  }
  return { hogstubbar, evighetstrad };
}

export type KravStatus = 'ingen' | 'ok' | 'efter' | 'uppfyllt';

/**
 * Status för en räknare.
 *  - 'ingen'    inget krav (ej certifierat / areal saknas): visa bara antalet
 *  - 'uppfyllt' antal ≥ krav: bock
 *  - 'efter'    föraren ligger efter i förhållande till avverkad andel
 *  - 'ok'       i fas (eller andelen är okänd — då dömer vi aldrig)
 *
 * "EFTER" = färre satta än hela antal som borde finnas vid avverkad andel: floor(andel × krav). Golvet (inte taket) gör att
 * räknaren inte blir orange redan vid första rundan — vid 50 % av 11 ska 5 vara satta, vid 3 % ska ingen vara det än.
 * Exempel: 50 % avverkat och 2 av 11 → floor(5,5) = 5 > 2 → efter. 5 av 11 → i fas.
 */
export function kravStatus(antal: number, krav: number | null, andelAvverkat: number | null): KravStatus {
  if (krav == null) return 'ingen';
  if (antal >= krav) return 'uppfyllt';
  if (andelAvverkat == null || !Number.isFinite(andelAvverkat)) return 'ok';
  const andel = Math.min(1, Math.max(0, andelAvverkat));
  const borde = Math.floor(Math.round(andel * krav * 1e6) / 1e6);
  return antal < borde ? 'efter' : 'ok';
}
