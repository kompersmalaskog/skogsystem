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

/** Sektionerna i vyn: de två som har en beställning, och GROT som inte har någon (bestallningar.typ tillåter bara gallring/slutavverkning). */
export type SektionTyp = ObjektTyp | 'grot';
export const MANUELLA_TYPER: readonly { id: SektionTyp; namn: string }[] = [...TYPER, { id: 'grot', namn: 'GROT' }];
export const typNamn = (t: string | null | undefined): string => MANUELLA_TYPER.find(x => x.id === t)?.namn ?? (t ? t : 'Typ saknas');

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

/** Enheten står vid varje volym i vyn: Vidas tal och beställningen är m³fub, stämplingslängden är m³sk (lib/objekt/stamplingslangd.ts). */
export const ENHET_M3FUB = 'm³fub';

/** "334 / 1 000 m³fub" — eller "334 / – m³fub" när ingen beställning finns. */
export function rubrikTal(inlagt: number, bestallt: number | null): string {
  return `${fmtM3(inlagt)} / ${bestallt == null ? '–' : fmtM3(bestallt)} ${ENHET_M3FUB}`;
}

/**
 * Läget mot beställningen — EN beräkning, så att orden är desamma överallt: `kvar`, `fylld`, `over`. Listans sektionsfot renderar den långt
 * (`lageText`), beställningsarket kort (`lageKort`). Meningsbyggnaden får skilja sig; orden och gränserna får aldrig göra det.
 *   kvar   inlagt < beställt   (antal = hur mycket som fattas)
 *   fylld  inlagt = beställt   (antal = 0)
 *   over   inlagt > beställt   (antal = hur mycket över)
 * Jämförelsen görs på avrundade tal (visadVolym/Math.round), som allt annat i vyn: det som visas är det som räknas.
 */
export type LageOrd = 'kvar' | 'fylld' | 'over';
export interface LageDel { lage: LageOrd; antal: number }

export function lageDel(inlagt: number, bestallt: number): LageDel {
  const i = Math.round(inlagt);
  const b = Math.round(bestallt);
  if (i < b) return { lage: 'kvar', antal: b - i };
  if (i === b) return { lage: 'fylld', antal: 0 };
  return { lage: 'over', antal: i - b };
}

export interface Lage {
  text: string;
  /** true = beställningen är fylld (eller mer). */
  fylld: boolean;
  lage?: LageOrd;
}

/** Sista raden i en sektion i LISTAN: "666 m³fub kvar till beställningen" / "Beställningen fylld" / "Beställningen fylld · 1 234 m³fub över". */
export function lageText(inlagt: number, bestallt: number | null): Lage {
  if (bestallt == null) return { text: 'Ingen beställning inlagd', fylld: false };
  const d = lageDel(inlagt, bestallt);
  if (d.lage === 'kvar') return { text: `${fmtM3(d.antal)} m³fub kvar till beställningen`, fylld: false, lage: d.lage };
  if (d.lage === 'fylld') return { text: 'Beställningen fylld', fylld: true, lage: d.lage };
  return { text: `Beställningen fylld · ${fmtM3(d.antal)} m³fub över`, fylld: true, lage: d.lage };
}

/** Raden under ett fält i BESTÄLLNINGSARKET, kort: "379 inlagt · 621 kvar" / "379 inlagt · beställningen fylld" / "5 037 inlagt · 37 över". */
export function lageKort(inlagt: number, bestallt: number): { text: string; lage: LageOrd } {
  const d = lageDel(inlagt, bestallt);
  const i = `${fmtM3(inlagt)} inlagt`;
  if (d.lage === 'kvar') return { text: `${i} · ${fmtM3(d.antal)} kvar`, lage: d.lage };
  if (d.lage === 'fylld') return { text: `${i} · beställningen fylld`, lage: d.lage };
  return { text: `${i} · ${fmtM3(d.antal)} över`, lage: d.lage };
}
