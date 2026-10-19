// Spårdelen sedan förra lossningen: sparas på lasset (tunnad) och viktas per väg, så "kvar per väg" (PR 2) vet hur mycket av varje
// stickväg som lasset hämtades från. Ren logik. Matas med RÅA fixar (inte hyttspåret, som släpper punkter som ligger nära varandra).
import { avstand, avstandTillLinje } from './geo';
import type { LatLng, SparPunkt, VagTid } from './typer';

export const SPAR = {
  /** En fix räknas till en väg om den ligger så här nära vägens linje. */
  VAG_RADIE_M: 15,
  /** Tid mellan två fixar längre än så räknas inte (glapp i loggen — vi vet inte var maskinen var). */
  MAX_STEG_S: 30,
  /** Tunning av sparade punkter: minst så här långt mellan sparade punkter … */
  TUNNA_M: 6,
  /** … och aldrig fler än så här många per lass. */
  MAX_PUNKTER: 400,
} as const;

export interface RaFix extends LatLng { ts: number }

/** En väg att väga mot: skördarens stråk (nyckel = stabilt id för vägen) som linje. */
export interface VagLinje { vag: string; linje: readonly LatLng[] }

/** Tunnar spåret till de punkter som behövs för att rita om det. Första och sista behålls alltid. */
export function tunnaSpar(fixar: readonly RaFix[]): SparPunkt[] {
  if (fixar.length === 0) return [];
  const ut: RaFix[] = [fixar[0]];
  for (let i = 1; i < fixar.length - 1; i++) if (avstand(fixar[i], ut[ut.length - 1]) >= SPAR.TUNNA_M) ut.push(fixar[i]);
  if (fixar.length > 1) ut.push(fixar[fixar.length - 1]);
  // Överstiger vi taket: ta jämnt fördelade punkter (första/sista behålls).
  let valda = ut;
  if (ut.length > SPAR.MAX_PUNKTER) {
    const steg = (ut.length - 1) / (SPAR.MAX_PUNKTER - 1);
    valda = Array.from({ length: SPAR.MAX_PUNKTER }, (_, k) => ut[Math.round(k * steg)]);
  }
  return valda.map((p) => ({ lat: p.lat, lng: p.lng, tid: new Date(p.ts).toISOString() }));
}

/**
 * Tid per väg: varje steg mellan två fixar (≤ MAX_STEG_S) läggs på vägen närmast steget om den ligger inom VAG_RADIE_M. Tid som
 * inte ligger på någon väg (körd på basväg, utanför stråken) räknas inte med i andelen — `andel` är andel av tiden PÅ vägar.
 */
export function vagTider(fixar: readonly RaFix[], vagar: readonly VagLinje[]): VagTid[] {
  const sek = new Map<string, number>();
  for (let i = 1; i < fixar.length; i++) {
    const a = fixar[i - 1], b = fixar[i];
    const dt = (b.ts - a.ts) / 1000;
    if (!(dt > 0) || dt > SPAR.MAX_STEG_S) continue;
    const mitt: LatLng = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    let basta: string | null = null;
    let min = SPAR.VAG_RADIE_M;
    for (const v of vagar) {
      const d = avstandTillLinje(mitt, v.linje);
      if (d <= min) { min = d; basta = v.vag; }
    }
    if (basta) sek.set(basta, (sek.get(basta) ?? 0) + dt);
  }
  const totalt = Array.from(sek.values()).reduce((s, x) => s + x, 0);
  if (totalt <= 0) return [];
  return Array.from(sek, ([vag, s]) => ({ vag, sek: Math.round(s), andel: s / totalt })).sort((x, y) => y.sek - x.sek);
}
