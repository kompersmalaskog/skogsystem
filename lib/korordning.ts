// KÖRORDNING (Planeringsvyn, 2026-10-25; skiss 50–51 i "Skotarvyn – skiss"). Planeraren trycker vägarna i den ordning de ska köras → 1, 2, 3 … Riktningen är ritriktningen;
// ett tryck på vägens ände vänder den. Appen ritar pilarna. Föraren ser EN väg i taget:
//
//   nu        lyser, vita pilar glider på vägen i körriktningen, "85 m kvar" på vägen
//   nästa     siffran, full färg men tunnare linje
//   kommande  (efter nästa) full färg, tunnare linje, ingen siffra — inget nytt, bara det som blir över
//   klar      grå (kartKlart.ts) — blir grå av sig själv när maskinen kört vägen, ingen knapp
//
// Statusen SPARAS som tre fält på vägens markering (JSONB som `farg` och `backvag` — ingen migration):
//   ordning       1, 2, 3 … (saknas = vägen ingår inte i körordningen)
//   riktningBak   true = körs från ritningens slut mot början (saknas = ritriktningen)
//   korKlar       ISO-tid då maskinen körde vägen (saknas = inte körd)
// "nu" och "nästa" sparas INTE: de följer av ordningen och vad som är klart (annars kan de motsäga varandra). Allt här är rena funktioner utan React och karta.

import { arVagKlar } from './kartKlart';

export type LngLat = [number, number];
export type KorStatus = 'nu' | 'nasta' | 'kommande' | 'klar';

export interface KorVag {
  id: string;
  /** 1, 2, 3 … eller null när vägen inte ingår i körordningen. */
  ordning: number | null;
  /** Körs bakifrån: ritningens slut är start. */
  bak: boolean;
  klar: boolean;
  /** Ritriktning, [lng, lat]. */
  coords: LngLat[];
}

export type KorPatch = { ordning?: number | null; riktningBak?: boolean | null; korKlar?: string | null };
export type KorPatchar = Record<string, KorPatch>;

// ── Geometri ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const M_PER_GRAD = 111320;
type Xy = { x: number; y: number };

/** Lokalt plan i meter runt första punkten (räcker för en väg: några hundra meter). */
function tillPlan(coords: readonly LngLat[]): Xy[] {
  if (!coords.length) return [];
  const [lng0, lat0] = coords[0];
  const kx = M_PER_GRAD * Math.cos((lat0 * Math.PI) / 180);
  return coords.map(([lng, lat]) => ({ x: (lng - lng0) * kx, y: (lat - lat0) * M_PER_GRAD }));
}
const langdPlan = (p: readonly Xy[]): number => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return s; };

/** Vägens längd i meter. */
export function langdM(coords: readonly LngLat[]): number { return langdPlan(tillPlan(coords)); }

/** Vägen i körriktningen. */
export function riktad(coords: readonly LngLat[], bak: boolean): LngLat[] { return bak ? [...coords].reverse() : [...coords]; }

/** Punkten `dM` meter in på vägen (klämd till 0..längd) och riktningen (kompassgrader, 0 = norr) där. */
export function punktLangs(coords: readonly LngLat[], dM: number): { lng: number; lat: number; riktning: number } | null {
  if (coords.length < 2) return null;
  const p = tillPlan(coords);
  const total = langdPlan(p);
  let kvar = Math.max(0, Math.min(total, dM));
  for (let i = 1; i < p.length; i++) {
    const s = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (s === 0) continue;
    if (kvar <= s || i === p.length - 1) {
      const t = Math.min(1, kvar / s);
      const lng = coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t;
      const lat = coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t;
      const riktning = (Math.atan2(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y) * 180 / Math.PI + 360) % 360;
      return { lng, lat, riktning };
    }
    kvar -= s;
  }
  return null;
}

// ── Status ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** De vägar som ingår i körordningen, i körordning. */
export const ordnade = (vagar: readonly KorVag[]): KorVag[] =>
  vagar.filter((v) => v.ordning != null).sort((a, b) => (a.ordning as number) - (b.ordning as number));

/**
 * nu = den första vägen som inte är klar, nästa = den efter, resten kommande; klara är klara. Vägar utanför körordningen har ingen status (de ritas som förut).
 * Är alla klara finns varken nu eller nästa.
 */
export function statusPerVag(vagar: readonly KorVag[]): Map<string, KorStatus> {
  const ut = new Map<string, KorStatus>();
  let rakna = 0;
  for (const v of ordnade(vagar)) {
    if (v.klar) { ut.set(v.id, 'klar'); continue; }
    ut.set(v.id, rakna === 0 ? 'nu' : rakna === 1 ? 'nasta' : 'kommande');
    rakna++;
  }
  return ut;
}

// ── Planerarens tryck ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Nästa lediga siffra. */
export const nastaOrdning = (vagar: readonly KorVag[]): number => vagar.reduce((mx, v) => (v.ordning != null ? Math.max(mx, v.ordning) : mx), 0) + 1;

/**
 * Tryck på en väg i Körordning-läget.
 *  • väg utan siffra → får nästa siffra (riktning = ritriktning)
 *  • väg med siffra, tryck på änden (`ande` = 'start' | 'slut') → riktningen vänds
 *  • väg med siffra, tryck på mitten → ingenting (siffran tas bort bara med Börja om)
 * Returnerar de ändringar som ska sparas (tomt = ingenting hände).
 */
export function tryckPaVag(vagar: readonly KorVag[], id: string, ande: 'start' | 'slut' | null): KorPatchar {
  const v = vagar.find((x) => x.id === id);
  if (!v) return {};
  if (v.ordning == null) return { [id]: { ordning: nastaOrdning(vagar) } };
  if (ande) return { [id]: { riktningBak: v.bak ? null : true } };
  return {};
}

/** Börja om: alla vägar utan siffra, utan egen riktning och utan "klar". */
export function borjaOm(vagar: readonly KorVag[]): KorPatchar {
  const ut: KorPatchar = {};
  for (const v of vagar) if (v.ordning != null || v.bak || v.klar) ut[v.id] = { ordning: null, riktningBak: null, korKlar: null };
  return ut;
}

/** Lägger patchen på en markering. null tar bort fältet, så lagrad JSON är densamma som före körordning. Rör inget annat. */
export function medKor<T extends object>(m: T, patch: KorPatch): T {
  const ut: Record<string, unknown> = { ...(m as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined) delete ut[k]; else ut[k] = v; }
  return ut as T;
}

/** Vägen som en KorVag ur en markering (path har redan gjorts om till [lng, lat] av anroparen). */
export function korVagUr(m: { id: unknown; ordning?: unknown; riktningBak?: unknown; korKlar?: unknown }, coords: LngLat[]): KorVag {
  const o = typeof m.ordning === 'number' && Number.isFinite(m.ordning) && m.ordning >= 1 ? Math.floor(m.ordning) : null;
  return { id: String(m.id), ordning: o, bak: m.riktningBak === true, klar: arVagKlar(m.korKlar), coords };
}

// ── Pilarna (appen ritar dem) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const PIL = {
  /** Avstånd mellan pilarna på vägen. */
  AVSTAND_M: 24,
  /** "Lugnt": en gång på ~5 s från pil till pil. */
  HASTIGHET_MS: 4.8,
  /** Siffran sitter så här långt in på vägen (vid körstarten). */
  SIFFRA_M: 10,
} as const;

export interface PilPunkt { lng: number; lat: number; riktning: number }

/**
 * Pilarna på en väg i körriktningen. `tMs` flyttar dem framåt (de glider från början mot änden och försvinner där, nästa kommer in vid början); `statisk` ger en fast
 * uppställning (planeringsvyn, och minskad rörelse). Korta vägar får en pil.
 */
export function pilPunkter(coords: readonly LngLat[], bak: boolean, tMs: number, statisk = false): PilPunkt[] {
  const r = riktad(coords, bak);
  const total = langdM(r);
  if (total < 3) return [];
  const antal = Math.max(1, Math.floor(total / PIL.AVSTAND_M));
  const steg = total / antal;
  const forskjut = statisk ? steg / 2 : ((tMs / 1000) * PIL.HASTIGHET_MS) % steg;
  const ut: PilPunkt[] = [];
  for (let i = 0; i < antal; i++) {
    const d = forskjut + i * steg;
    if (d > total) continue;
    const p = punktLangs(r, d);
    if (p) ut.push(p);
  }
  return ut;
}

/** Var siffran sitter: precis in på vägen vid körstarten. */
export function siffraPunkt(coords: readonly LngLat[], bak: boolean): PilPunkt | null {
  const r = riktad(coords, bak);
  return punktLangs(r, Math.min(PIL.SIFFRA_M, langdM(r) / 2));
}

// ── Vad maskinen kört (vägen blir grå av sig själv) ─────────────────────────────────────────────────────────────────────────────────────────
export const TACKNING = {
  /** Vägen delas i bitar om så här många meter; en bit är körd när maskinen varit nära den. */
  BIT_M: 5,
  /** "Nära": GPS-brus är 2–5 m, en väg är 4–5 m bred, hytten sitter ett par meter från mitten. */
  NARA_M: 12,
  /** Två fixar längre isär än så binds inte ihop med en sträcka (GPS-glapp, maskinen flyttades). */
  HOPP_MAX_M: 80,
  /** Klar när högst så här mycket av vägen återstår: max(10 m, 10 %). */
  REST_MIN_M: 10,
  REST_ANDEL: 0.1,
} as const;

export interface Tackning { xy: Xy[]; langd: number; bitar: number; tackt: boolean[]; plan: { lng0: number; lat0: number; kx: number } }

/** Vad som är körd på en väg: börjar tomt. */
export function nyTackning(coords: readonly LngLat[]): Tackning {
  const xy = tillPlan(coords);
  const langd = langdPlan(xy);
  const bitar = Math.max(1, Math.ceil(langd / TACKNING.BIT_M));
  const [lng0, lat0] = coords[0] ?? [0, 0];
  return { xy, langd, bitar, tackt: new Array(bitar).fill(false), plan: { lng0, lat0, kx: M_PER_GRAD * Math.cos((lat0 * Math.PI) / 180) } };
}

const avstSegment = (p: Xy, a: Xy, b: Xy): number => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Mittpunkterna på vägens bitar, i vägens lokala plan. */
function bitCentra(t: Tackning): Xy[] {
  const ut: Xy[] = [];
  const steg = t.langd / t.bitar;
  let seg = 1, avverkat = 0;
  for (let i = 0; i < t.bitar; i++) {
    const mal = (i + 0.5) * steg;
    while (seg < t.xy.length - 1 && avverkat + Math.hypot(t.xy[seg].x - t.xy[seg - 1].x, t.xy[seg].y - t.xy[seg - 1].y) < mal) {
      avverkat += Math.hypot(t.xy[seg].x - t.xy[seg - 1].x, t.xy[seg].y - t.xy[seg - 1].y);
      seg++;
    }
    const a = t.xy[seg - 1], b = t.xy[seg];
    const s = Math.hypot(b.x - a.x, b.y - a.y);
    const f = s === 0 ? 0 : Math.max(0, Math.min(1, (mal - avverkat) / s));
    ut.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return ut;
}
const centraCache = new WeakMap<Tackning, Xy[]>();
const centra = (t: Tackning): Xy[] => { let c = centraCache.get(t); if (!c) { c = bitCentra(t); centraCache.set(t, c); } return c; };

/**
 * Lägger en fix (och sträckan från förra fixen, om den ligger nära nog) på vägen. Ändrar `t` och returnerar true om något nytt blev körd. En enstaka fix täcker bara de
 * bitar den ligger nära; sträckan mellan två fixar täcker allt längs den (hyttspåret är tunnat och glest på raka vägar).
 */
export function laggTillFix(t: Tackning, prev: LngLat | null, nu: LngLat): boolean {
  if (t.langd < 1) return false;
  const tillXy = (c: LngLat): Xy => ({ x: (c[0] - t.plan.lng0) * t.plan.kx, y: (c[1] - t.plan.lat0) * M_PER_GRAD });
  const b = tillXy(nu);
  const a = prev ? tillXy(prev) : null;
  const sammanbunden = a && Math.hypot(b.x - a.x, b.y - a.y) <= TACKNING.HOPP_MAX_M;
  let nytt = false;
  const c = centra(t);
  for (let i = 0; i < t.bitar; i++) {
    if (t.tackt[i]) continue;
    const d = sammanbunden && a ? avstSegment(c[i], a, b) : Math.hypot(c[i].x - b.x, c[i].y - b.y);
    if (d <= TACKNING.NARA_M) { t.tackt[i] = true; nytt = true; }
  }
  return nytt;
}

export interface TackningStatus {
  /** Meter som återstår att köra. */
  kvarM: number;
  /** Första bit som inte är körd, i meter från vägens ritstart (för etikettens plats). */
  forstaOtackta: number | null;
  klar: boolean;
}

export function tackningStatus(t: Tackning): TackningStatus {
  const steg = t.langd / t.bitar;
  const otackta = t.tackt.filter((x) => !x).length;
  const kvarM = Math.round(otackta * steg);
  const forsta = t.tackt.findIndex((x) => !x);
  const klar = kvarM <= Math.max(TACKNING.REST_MIN_M, t.langd * TACKNING.REST_ANDEL);
  return { kvarM, forstaOtackta: forsta < 0 ? null : forsta * steg, klar };
}

/** Etiketten "85 m kvar": mitt på den del av vägen som återstår, räknat i körriktningen. Avrundat till 5 m (GPS ger inte mer). */
export function kvarEtikett(coords: readonly LngLat[], bak: boolean, t: Tackning): { lng: number; lat: number; text: string } | null {
  const r = riktad(coords, bak);
  const s = tackningStatus(t);
  if (s.klar) return null;
  // Tackningen räknas på ritriktningen; i körriktningen är "första otäckta" från andra hållet när vägen körs bakifrån.
  const total = t.langd;
  const fran = bak && s.forstaOtackta != null ? total - sistaOtacktaSlut(t) : (s.forstaOtackta ?? 0);
  const mitt = (fran + total) / 2;
  const p = punktLangs(r, mitt);
  if (!p) return null;
  const avrundat = Math.max(5, Math.round(s.kvarM / 5) * 5);
  return { lng: p.lng, lat: p.lat, text: `${avrundat} m kvar` };
}
function sistaOtacktaSlut(t: Tackning): number {
  const steg = t.langd / t.bitar;
  for (let i = t.bitar - 1; i >= 0; i--) if (!t.tackt[i]) return (i + 1) * steg;
  return 0;
}

// ── Förslag ur de gamla handplacerade körriktningspilarna ──────────────────────────────────────────────────────────────────────────────────
export interface GammalPil { id: string; lng: number; lat: number; vinkel: number }
export interface ForslagRad { id: string; ordning: number; bak: boolean; pilar: number }
export interface Forslag {
  rader: ForslagRad[];
  /** Pilar som hör till en väg i förslaget — de tas bort när planeraren godkänner. */
  pilIdn: string[];
  /** Pilar som inte ligger vid någon väg: de ligger kvar. */
  kvarIdn: string[];
}

export const FORSLAG = { /** En pil hör till en väg om den ligger så här nära. */ NARA_M: 25 } as const;

/** Närmaste punkt på vägen till en punkt: avstånd (m) och vägens riktning där (kompassgrader). */
function narmastePunkt(coords: readonly LngLat[], p: LngLat): { avstand: number; riktning: number } | null {
  if (coords.length < 2) return null;
  const [lng0, lat0] = coords[0];
  const kx = M_PER_GRAD * Math.cos((lat0 * Math.PI) / 180);
  const xy = coords.map(([lng, lat]) => ({ x: (lng - lng0) * kx, y: (lat - lat0) * M_PER_GRAD }));
  const q = { x: (p[0] - lng0) * kx, y: (p[1] - lat0) * M_PER_GRAD };
  let bast = Infinity, rikt = 0;
  for (let i = 1; i < xy.length; i++) {
    const a = xy[i - 1], b = xy[i];
    const d = avstSegment(q, a, b);
    if (d < bast) { bast = d; rikt = (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360; }
  }
  return { avstand: bast, riktning: rikt };
}
const vinkelSkillnad = (a: number, b: number): number => Math.abs(((a - b) % 360 + 540) % 360 - 180);

/**
 * Förslag: varje pil hör till den väg som ligger närmast (inom 25 m). Vägens riktning blir den de flesta pilarna pekar åt (mot ritriktningen = bak). Ordningen
 * är den vägarna ritades i (`ritordning`, t.ex. basvägens löpnummer) — pilarna säger riktning men ingen ordning, så ordningen är en gissning planeraren rättar.
 * Vägar utan pil ingår inte.
 */
export function foreslaOrdning(vagar: readonly KorVag[], pilar: readonly GammalPil[], ritordning: (id: string) => number): Forslag {
  const rost = new Map<string, { fram: number; bak: number }>();
  const pilIdn: string[] = [], kvarIdn: string[] = [];
  for (const pil of pilar) {
    let bast: { id: string; avstand: number; riktning: number } | null = null;
    for (const v of vagar) {
      const n = narmastePunkt(v.coords, [pil.lng, pil.lat]);
      if (n && n.avstand <= FORSLAG.NARA_M && (!bast || n.avstand < bast.avstand)) bast = { id: v.id, ...n };
    }
    if (!bast) { kvarIdn.push(pil.id); continue; }
    pilIdn.push(pil.id);
    const r = rost.get(bast.id) ?? { fram: 0, bak: 0 };
    if (vinkelSkillnad(pil.vinkel, bast.riktning) <= 90) r.fram++; else r.bak++;
    rost.set(bast.id, r);
  }
  const rader: ForslagRad[] = [...rost.entries()]
    .map(([id, r]) => ({ id, bak: r.bak > r.fram, pilar: r.fram + r.bak }))
    .sort((a, b) => ritordning(a.id) - ritordning(b.id) || a.id.localeCompare(b.id))
    .map((r, i) => ({ ...r, ordning: i + 1 }));
  return { rader, pilIdn, kvarIdn };
}
