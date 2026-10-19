// Täckningen: har vi fått ihop beställningen? Inte "hur mycket är kvar att köra".
//
// Ett avslutat objekt är fortfarande inlagt — volymen står kvar (beslut 2026-10-19). Förut dolde listan avslutade objekt medan stapeln
// räknade dem; nu räknas och syns alla. Summan är summan av det som visas: varje objekts volym avrundas först, sedan summeras
// (skillen: "Summan är summan av det som visas").

export type ObjektTyp = 'gallring' | 'slutavverkning';

/** Ordningen i vyn och namnen som visas. */
export const TYPER: readonly { id: ObjektTyp; namn: string }[] = [
  { id: 'gallring', namn: 'Gallring' },
  { id: 'slutavverkning', namn: 'Slutavverkning' },
];

export const fmtM3 = (n: number): string => Math.round(n).toLocaleString('sv-SE');

/** Volymen som visas på en rad (heltal). Saknad volym är 0 i summan men skrivs "saknas" på raden. */
export function visadVolym(volym: number | null | undefined): number {
  return typeof volym === 'number' && Number.isFinite(volym) ? Math.round(volym) : 0;
}

export function inlagtSumma(objekt: readonly { volym: number | null }[]): number {
  return objekt.reduce((s, o) => s + visadVolym(o.volym), 0);
}

export interface Post { volym: number }

/** Beställt = summan av månadens poster för typen (en per bolag). null = ingen beställning inlagd. */
export function bestalltSumma(poster: readonly Post[]): number | null {
  if (poster.length === 0) return null;
  return poster.reduce((s, p) => s + Math.round(Number(p.volym) || 0), 0);
}

/** "334 / 1 000" — eller "334 / –" när ingen beställning finns. */
export function rubrikTal(inlagt: number, bestallt: number | null): string {
  return `${fmtM3(inlagt)} / ${bestallt == null ? '–' : fmtM3(bestallt)}`;
}

export interface Lage {
  text: string;
  /** true = beställningen är fylld (eller mer). */
  fylld: boolean;
}

/** Sista raden i en sektion: "666 m³fub kvar till beställningen" eller "Beställningen fylld · 1 234 över". */
export function lageText(inlagt: number, bestallt: number | null): Lage {
  if (bestallt == null) return { text: 'Ingen beställning inlagd', fylld: false };
  if (inlagt < bestallt) return { text: `${fmtM3(bestallt - inlagt)} m³fub kvar till beställningen`, fylld: false };
  if (inlagt === bestallt) return { text: 'Beställningen fylld', fylld: true };
  return { text: `Beställningen fylld · ${fmtM3(inlagt - bestallt)} över`, fylld: true };
}
