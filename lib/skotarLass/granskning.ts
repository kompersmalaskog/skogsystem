// Planerarens granskning av de GAMLA självbekräftade lassen (bekraftad_av = 'auto', före 2026-10-21). Rena funktioner.
//
// De räknas inte som skotat (lassModell.raknasSomSkotat) och raderas aldrig. En planerare går igenom dem trakt för trakt och maskin för maskin,
// dag för dag, och väljer för varje urval: BEKRÄFTA (lassen räknas som skotat, bekraftad_av = 'planerare'), STRYK (status 'struket') eller SLÅ IHOP
// (ett lass tar emot de andras m³ per sortiment, de andra stryks). Allt skrivs av databasfunktionen skotar_lass_granska(), som loggar lassets
// tillstånd FÖRE beslutet i skotar_lass_granskning.
import { heltM3, lassTotalM3, arObekraftatGammalt } from './lassModell';
import type { Lass } from './typer';

export type Granskning = 'bekrafta' | 'stryk' | 'slaihop';

export interface ObekraftadGrupp {
  nyckel: string;
  objektId: string;
  voNummer: string | null;
  maskinId: string;
  /** Maskinens lokala dag. */
  datum: string;
  lass: Lass[];
  m3: number;
}

/** De gamla obekräftade lassen grupperade per trakt, maskin och dag: senaste dagen först, lassen i nummerordning. Strukna och allt annat är borta. */
export function obekraftadeGrupper(lass: readonly Lass[]): ObekraftadGrupp[] {
  const per = new Map<string, ObekraftadGrupp>();
  for (const l of lass) {
    if (!arObekraftatGammalt(l)) continue;
    const nyckel = `${l.objektId}|${l.maskinId}|${l.datum}`;
    const g = per.get(nyckel) ?? { nyckel, objektId: l.objektId, voNummer: l.voNummer, maskinId: l.maskinId, datum: l.datum, lass: [], m3: 0 };
    g.lass.push(l);
    g.m3 += lassTotalM3(l);
    per.set(nyckel, g);
  }
  for (const g of per.values()) g.lass.sort((a, b) => a.lassNummer - b.lassNummer);
  return Array.from(per.values()).sort((a, b) => b.datum.localeCompare(a.datum) || (a.voNummer ?? '').localeCompare(b.voNummer ?? '') || a.maskinId.localeCompare(b.maskinId));
}

/** Vad ett beslut gör, i ord — står i bekräftelsen innan planeraren trycker. */
export function granskKonsekvens(beslut: Granskning, valda: readonly Lass[], mal?: Lass | null): string {
  const m3 = valda.reduce((s, l) => s + lassTotalM3(l), 0);
  const lassText = valda.length === 1 ? '1 lass' : `${valda.length} lass`;
  if (beslut === 'bekrafta') return `${lassText} · ${m3} m³ räknas som skotat. Lassen ändras inte.`;
  if (beslut === 'stryk') return `${lassText} · ${m3} m³ räknas inte som skotat. Lassen finns kvar i databasen som strukna.`;
  const andra = valda.filter((l) => !mal || l.id !== mal.id);
  const nr = andra.map((l) => l.lassNummer).join(', ');
  return mal
    ? `Lass ${mal.lassNummer} får ${m3} m³ (alla valdas volym läggs ihop) och räknas som skotat. Lass ${nr} stryks.`
    : `Välj vilket lass de andra ska slås ihop i.`;
}

/** Går det att slå ihop? Minst två lass, och ett av dem är mottagare. */
export const kanSlaIhop = (valda: readonly Lass[], mal: string | null): boolean => valda.length >= 2 && !!mal && valda.some((l) => l.id === mal);

/** Det lass som tar emot vid ihopslagning om planeraren inte valt: det med lägst nummer. */
export const standardMottagare = (valda: readonly Lass[]): Lass | null => [...valda].sort((a, b) => a.lassNummer - b.lassNummer)[0] ?? null;

/** Argumenten till skotar_lass_granska. Tom anledning skickas inte. */
export function granskArgument(beslut: Granskning, lass: readonly Lass[], mal: string | null, anledning: string): { p_beslut: Granskning; p_lass: string[]; p_mal: string | null; p_anledning: string | null } {
  return {
    p_beslut: beslut,
    p_lass: lass.map((l) => l.id),
    p_mal: beslut === 'slaihop' ? mal : null,
    p_anledning: anledning.trim() ? anledning.trim() : null,
  };
}

/** Raden för ett lass i granskningslistan: "Lass 3 · 14:02 · Avlägg 01-1 · Timmer 20 · 20 m³". */
export function granskRad(l: Lass, klockslag: (iso: string) => string): string {
  const del = l.delar[0];
  const tid = del ? klockslag(del.lossadTid) : '';
  const avlagg = l.delar.map((d) => d.avlaggNummer).filter(Boolean)[0];
  const sortiment = l.delar.flatMap((d) => d.rader).filter((r) => heltM3(r.m3) > 0).map((r) => `${r.namn.replace(/^[^:]*:\s*/, '')} ${heltM3(r.m3)}`);
  return [`Lass ${l.lassNummer}`, tid, avlagg ? `Avlägg ${avlagg}` : null, sortiment.join(', ') || null, `${lassTotalM3(l)} m³`].filter(Boolean).join(' · ');
}
