// Skotarläget: vilka produktionshögar har lassen troligen tagit? (Martin 2026-11-01, provat mot hans ritning på Skälviken: ca 85 % av det
// appen kallar taget låg där han själv ritat "har tagit".)
//
// Skotaren rapporterar VAD han lossade, inte var han lastade. Var läses ur lassets spår (sparPunkter, tunnat) mellan förra lossningen och
// den här: ställen där maskinen stod still är där kranen jobbade. Regeln:
//   • ett STOPP = två spårpunkter i följd med minst STOPP_MIN_S emellan och fart under STOPP_MAX_FART (m/s)
//   • stopp inom AVLAGG_RADIE_M från lassets lossning räknas inte (där lossar han, där lastar han inte)
//   • ett stopp längre än RAST_S är rast (mat, paus) och räknas inte; ett stopp räknas högst som STOPP_TAK_S
//   • kandidater = högar inom KRAN_M från något stopp, ordnade efter hur länge maskinen stod nära (mest först), sedan avstånd
//   • lassets m³ per sortiment tas från kandidaternas SAMMA sortiment (exakt namn först, sedan samma grupp: Timmer/Kubb/Massa/Energi),
//     aldrig mer än som ligger där. Energi och löv som inte lastats ligger alltså kvar.
// Lass utan spår går inte att placera och räknas inte här (Kvar i namnfältet räknar dem som förut). Ren funktion: ingen karta, ingen databas.
import type { Lass } from './skotarLass/typer';
import { raknasSomSkotat } from './skotarLass/lassModell';
import { sortimentNyckel } from './skotarLass/sortiment';

export const STOPP_MIN_S = 15;
export const STOPP_MAX_FART = 0.4;
export const AVLAGG_RADIE_M = 50;
export const RAST_S = 360;
export const STOPP_TAK_S = 120;
export const KRAN_M = 15;

export interface HogIn { lat: number; lng: number; sortimentVolym: Record<string, number> }
export interface HogKvar {
  /** m³ kvar per sortiment (samma nycklar som in) */
  kvar: Record<string, number>;
  /** summa kvar */
  totalt: number;
  /** andel kvar 0–1 av det som låg där */
  andel: number;
}

/** Sortimentgrupp ur skördarens namn ("Gran Timmer: Vislanda…", "Massa: BmavFall_V3") — det som står före kolonet. */
export type HogGrupp = 'timmer' | 'kubb' | 'massa' | 'energi' | 'ovrigt';
export function hogGrupp(namn: string): HogGrupp {
  const s = String(namn ?? '').toLowerCase();
  if (/hemved/.test(s)) return 'energi';
  if (/timmer/.test(s)) return 'timmer';
  if (/kubb/.test(s)) return 'kubb';
  if (/massa/.test(s)) return 'massa';
  if (/energi|avkap|engved|grot/.test(s)) return 'energi';
  return 'ovrigt';
}

/** detalj_stam.sortiment bär trädslaget först ("Gran Timmer: Vislanda_195_1-2_V3"); lassets namn gör det inte. Samma nyckel som lassen. */
export function hogSortimentNyckel(namn: string): string {
  return sortimentNyckel(String(namn ?? '').replace(/^\S+\s+(?=[^\s:]+:)/, ''));
}

const M_PER_LAT = 111_320;
const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const kx = M_PER_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lng - b.lng) * kx, (a.lat - b.lat) * M_PER_LAT);
};

interface Stopp { lat: number; lng: number; vikt: number }

/** Stoppen i ett lass spår (se regeln överst). */
export function stoppILass(l: Pick<Lass, 'sparPunkter' | 'delar'>): Stopp[] {
  const p = l.sparPunkter ?? [];
  const loss = (l.delar ?? []).filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng));
  const ut: Stopp[] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1];
    const dt = (Date.parse(b.tid) - Date.parse(a.tid)) / 1000;
    if (!Number.isFinite(dt) || dt < STOPP_MIN_S) continue;
    if (dist(a, b) / dt > STOPP_MAX_FART) continue;
    if (dt > RAST_S) continue;
    if (loss.some((d) => dist(a, d) < AVLAGG_RADIE_M)) continue;
    ut.push({ lat: a.lat, lng: a.lng, vikt: Math.min(dt, STOPP_TAK_S) });
  }
  return ut;
}

/**
 * Det som ligger kvar i varje hög efter lassen (samma ordning som `hogar`). Bara lass som räknas som skotat (bekräftade, inte automatiska),
 * i den ordning de lossades.
 */
export function hogarKvar(hogar: readonly HogIn[], lass: readonly Lass[]): HogKvar[] {
  const kvar = hogar.map((h) => ({ ...h.sortimentVolym }));
  const nycklar = hogar.map((h) => Object.keys(h.sortimentVolym).map((k) => ({ k, nyckel: hogSortimentNyckel(k), grupp: hogGrupp(k) })));
  const ordnade = lass.filter(raknasSomSkotat).slice().sort((a, b) => forstaLossning(a) - forstaLossning(b));
  for (const l of ordnade) {
    const stopp = stoppILass(l);
    if (!stopp.length) continue;
    const kand: { i: number; vikt: number; d: number }[] = [];
    hogar.forEach((h, i) => {
      let vikt = 0, d = Infinity;
      for (const s of stopp) { const x = dist(h, s); if (x < d) d = x; if (x <= KRAN_M) vikt += s.vikt; }
      if (vikt > 0) kand.push({ i, vikt, d });
    });
    kand.sort((a, b) => b.vikt - a.vikt || a.d - b.d);
    for (const del of l.delar ?? []) {
      for (const rad of del.rader ?? []) {
        let rest = Number(rad.m3) || 0;
        if (rest <= 0) continue;
        const radGrupp = hogGrupp(rad.namn || rad.nyckel);
        for (const pass of ['exakt', 'grupp'] as const) {
          for (const c of kand) {
            if (rest <= 1e-9) break;
            for (const n of nycklar[c.i]) {
              if (rest <= 1e-9) break;
              const traff = pass === 'exakt' ? n.nyckel === rad.nyckel : n.grupp === radGrupp;
              if (!traff) continue;
              const ta = Math.min(rest, kvar[c.i][n.k] ?? 0);
              if (ta > 0) { kvar[c.i][n.k] -= ta; rest -= ta; }
            }
          }
        }
      }
    }
  }
  return kvar.map((k, i) => {
    const totalt = Object.values(k).reduce((s, v) => s + Math.max(0, v), 0);
    const fore = Object.values(hogar[i].sortimentVolym).reduce((s, v) => s + Math.max(0, v), 0);
    return { kvar: k, totalt, andel: fore > 0 ? Math.min(1, totalt / fore) : 0 };
  });
}

const forstaLossning = (l: Pick<Lass, 'delar' | 'datum'>): number => {
  const t = (l.delar ?? []).map((d) => Date.parse(d.lossadTid)).filter(Number.isFinite);
  return t.length ? Math.min(...t) : Date.parse(`${l.datum}T12:00:00Z`) || 0;
};

/** Vad som visas när föraren valt ett sortiment under + (Alla = allt kvar). */
export type HogVisa = 'alla' | 'timmer' | 'kubb' | 'massa' | 'energi';
export const HOG_VISA: readonly { id: HogVisa; namn: string }[] = [
  { id: 'alla', namn: 'Alla sortiment' },
  { id: 'timmer', namn: 'Bara timmer' },
  { id: 'kubb', namn: 'Bara kubb' },
  { id: 'massa', namn: 'Bara massa' },
  { id: 'energi', namn: 'Bara energi' },
];
/** Prickens färg per val. Alla = neutral ljus. Orange används aldrig (det betyder tall). */
export const HOG_PRICK_FARG: Readonly<Record<HogVisa, string>> = {
  alla: '#f5eedd', timmer: '#ffd60a', kubb: '#64d2ff', massa: '#ffffff', energi: '#ff9fd0',
};

/** Kvar i högen för ett val (m³). */
export function kvarFor(k: HogKvar, visa: HogVisa): number {
  if (visa === 'alla') return k.totalt;
  let s = 0;
  for (const [namn, v] of Object.entries(k.kvar)) if (v > 0 && hogGrupp(namn) === visa) s += v;
  return s;
}

/** Det kartan ritar för en hög: där den ligger, hur mycket som ligger kvar för valet, och prickens färg. */
export interface HogPrick { nyckel: string; lng: number; lat: number; v: number; farg: string }

/** Högarnas nyckel på kartan: positionen (ändras inte när lassen läses om). */
export const hogNyckel = (lng: number, lat: number): string => `${lng.toFixed(6)},${lat.toFixed(6)}`;

/**
 * Prickarna i skotarläget ur högarna (planeringsvyns hogar-features, som redan bär `sortimentVolymJson`) och lassen.
 * En hög där inget av valt sortiment ligger kvar finns inte med (den har tonats bort).
 */
export function hogPrickar(
  features: readonly { geometry?: { coordinates?: number[] }; properties?: { sortimentVolymJson?: string } }[],
  lass: readonly Lass[],
  visa: HogVisa,
): HogPrick[] {
  const hogar: HogIn[] = [];
  for (const f of features) {
    const c = f?.geometry?.coordinates;
    if (!c || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    let sv: Record<string, number> = {};
    try { sv = JSON.parse(f.properties?.sortimentVolymJson || '{}') || {}; } catch { sv = {}; }
    hogar.push({ lng: c[0], lat: c[1], sortimentVolym: sv });
  }
  const kvar = hogarKvar(hogar, lass);
  const ut: HogPrick[] = [];
  hogar.forEach((h, i) => {
    const v = kvarFor(kvar[i], visa);
    if (v < 0.05) return;
    ut.push({ nyckel: hogNyckel(h.lng, h.lat), lng: h.lng, lat: h.lat, v: Math.round(v * 100) / 100, farg: HOG_PRICK_FARG[visa] });
  });
  return ut;
}

/** Valet under + sparas per enhet. Läsfel eller okänt värde = Alla. */
export const HOG_VISA_NYCKEL = 'skotar_hogar_visa_v1';
export function lasHogVisa(): HogVisa {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(HOG_VISA_NYCKEL) : null;
    return HOG_VISA.some((x) => x.id === v) ? (v as HogVisa) : 'alla';
  } catch { return 'alla'; }
}
export function sparaHogVisa(v: HogVisa): void {
  try { localStorage.setItem(HOG_VISA_NYCKEL, v); } catch { /* bara en bekvämlighet */ }
}
