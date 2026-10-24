// Spårdelen sedan förra lossningen: sparas på lasset (tunnad) och viktas per väg, så "kvar per väg" (PR 2) vet hur mycket av varje
// stickväg som lasset hämtades från. Ren logik. Matas med RÅA fixar (inte hyttspåret, som släpper punkter som ligger nära varandra).
import { avstand, avstandTillLinje } from './geo';
import type { LatLng, SparPunkt, VagTid } from './typer';

export const SPAR = {
  /** En fix räknas till en väg om den ligger så här nära vägens linje. */
  VAG_RADIE_M: 15,
  /** Tid mellan två fixar längre än så räknas inte (glapp i loggen — vi vet inte var maskinen var). */
  MAX_STEG_S: 30,
  /** Samma för hyttspåret: det är gallrat (en punkt närmast var 2 m) och har en puls-punkt var 60:e s när maskinen står still (lib/hyttsparPuls), så steget är längre. */
  MAX_STEG_HYTTSPAR_S: 90,
  /** Tunning av sparade punkter: minst så här långt mellan sparade punkter … */
  TUNNA_M: 6,
  /** … och aldrig fler än så här många per lass. */
  MAX_PUNKTER: 400,
} as const;

export interface RaFix extends LatLng { ts: number; /** Första punkten efter en lucka i hyttspåret: steget dit räknas aldrig. */ lucka?: boolean }

/** En väg att väga mot: skördarens stråk (nyckel = stabilt id för vägen) som linje. */
export interface VagLinje { vag: string; linje: readonly LatLng[] }

/** Tunnar spåret till de punkter som behövs för att rita om det. Första och sista behålls alltid. */
export function tunnaSpar(fixar: readonly RaFix[]): SparPunkt[] {
  if (fixar.length === 0) return [];
  const ut: RaFix[] = [fixar[0]];
  for (let i = 1; i < fixar.length - 1; i++) if (fixar[i].lucka || avstand(fixar[i], ut[ut.length - 1]) >= SPAR.TUNNA_M) ut.push(fixar[i]);   // en lucka-markering får aldrig tunnas bort
  if (fixar.length > 1) ut.push(fixar[fixar.length - 1]);
  // Överstiger vi taket: ta jämnt fördelade punkter (första/sista behålls).
  let valda = ut;
  if (ut.length > SPAR.MAX_PUNKTER) {
    const steg = (ut.length - 1) / (SPAR.MAX_PUNKTER - 1);
    valda = Array.from({ length: SPAR.MAX_PUNKTER }, (_, k) => ut[Math.round(k * steg)]);
  }
  return valda.map((p) => ({ lat: p.lat, lng: p.lng, tid: new Date(p.ts).toISOString(), ...(p.lucka ? { lucka: true as const } : {}) }));
}

/**
 * Tid per väg: varje steg mellan två fixar (≤ MAX_STEG_S) läggs på vägen närmast steget om den ligger inom VAG_RADIE_M. Tid som
 * inte ligger på någon väg (körd på basväg, utanför stråken) räknas inte med i andelen — `andel` är andel av tiden PÅ vägar.
 */
export function vagTider(fixar: readonly RaFix[], vagar: readonly VagLinje[], maxStegS: number = SPAR.MAX_STEG_S): VagTid[] {
  const sek = new Map<string, number>();
  for (let i = 1; i < fixar.length; i++) {
    const a = fixar[i - 1], b = fixar[i];
    const dt = (b.ts - a.ts) / 1000;
    if (!(dt > 0) || dt > maxStegS || b.lucka) continue;
    const mitt: LatLng = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    let basta: string | null = null;
    let min: number = SPAR.VAG_RADIE_M;
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

/**
 * Lassets spår = HYTTSPÅRET mellan förra och den här lossningen (`fran` .. `till`, ms), inte en egen gles inspelning. Hyttspåret är det som loggas hela tiden
 * (en punkt närmast var 2 m, puls-punkt var 60:e s stillastående), medan skotarlägets egen fixbuffert har ett tak och förut bara räckte ~1 minut bakåt
 * (Wisent 2026-10-21/22: 2–14 punkter per lass). Slutpunkten läggs till där lossningen började. Färre än 2 punkter = hyttspåret räcker inte → null (anroparen
 * faller tillbaka på den gamla buffern).
 */
export function sparUrHyttspar(punkter: readonly { lat: number; lng: number; tid: string; lucka?: boolean }[], fran: number, till: number, slut?: LatLng): RaFix[] | null {
  const ut: RaFix[] = [];
  for (const p of punkter) {
    const ts = Date.parse(p.tid);
    if (!Number.isFinite(ts) || ts < fran || ts > till) continue;
    ut.push({ lat: p.lat, lng: p.lng, ts, ...(p.lucka ? { lucka: true } : {}) });
  }
  if (ut.length < 2) return null;
  if (slut && avstand(slut, ut[ut.length - 1]) >= 1) ut.push({ lat: slut.lat, lng: slut.lng, ts: till });
  return ut;
}
