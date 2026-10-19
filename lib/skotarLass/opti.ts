// Skotat i Opti-lassen (fakt_lass) för tiden INNAN appen började rapportera lass på trakten — och inte efter.
//
// Regel (Martin 2026-10-19): skotat = Opti-lass för tiden före appens första lass för den maskinen på trakten + appens lass därefter.
// Ingen dubbelräkning: ett Opti-lass som ligger efter maskinens första app-lass räknas inte (appen har samma lass), och en maskin utan
// app-lass på trakten räknas helt med Opti (hela dess skotning är Opti). Per maskin, eftersom två skotare kan ha börjat olika dag.
//
// Sortimenten är skotarens egna ("Urshult 1-2_V3", "BmavFall_V3") medan kvar räknas per SKÖRDARENS sortiment ("Timmer: Vislanda_195_1-2_V3").
// De två maskinerna har olika sortimentslistor, så Opti-volymen kopplas i fyra steg — direkt träff först, grövre sist:
//   1. samma kundkod (dim_sortiment.kundkod)  → just det sortimentet (flera med samma kod: den med mest kvar först)
//   2. samma namn (utan grupp, version och skiljetecken)
//   3. samma KLASS (kundkodens första siffra: 0 timmer/kubb, 1 massa, 2 kubb, 4–5 energi) → sortimenten i klassen, mest kvar först
//   4. ingen kod/klass → vilket sortiment som helst, mest kvar först
// Volym som inte får plats (skotat mer än skördat i sin grupp) blir överskott och räknas aldrig som minus någonstans.
import { OKLASSAT_NYCKEL, type SkordatSortiment } from './sortiment';
import type { Lass } from './typer';

export interface OptiRad { namn: string; kundkod: string | null; m3: number }

/** Ett Opti-lass (fakt_lass) med sina sortimentsrader (fakt_lass_sortiment). */
export interface OptiLass {
  maskinId: string;
  /** Maskinens lokala dag. */
  datum: string;
  lassNummer: number;
  /** Verkligt UTC-ögonblick för lossningen, null om tiden saknas. */
  tidMs: number | null;
  /** Lassets samlade volym (fakt_lass.volym_m3sub) — används för takten när sortimentsraderna saknas. */
  volymM3: number | null;
  rader: OptiRad[];
}

const tomMs = (iso: string) => Date.parse(iso);
const sthlmDag = (ms: number): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(ms));

/** Maskinens första icke-struken app-lass på trakten (lossningstiden, ms). Maskiner utan app-lass finns inte i svaret. */
export function appStartPerMaskin(lass: readonly Lass[]): Map<string, number> {
  const per = new Map<string, number>();
  for (const l of lass) {
    if (l.status === 'struket') continue;
    for (const d of l.delar) {
      const t = tomMs(d.lossadTid);
      if (!Number.isFinite(t)) continue;
      const nu = per.get(l.maskinId);
      if (nu == null || t < nu) per.set(l.maskinId, t);
    }
  }
  return per;
}

/** Opti-lassen som räknas: de som ligger före maskinens första app-lass (eller alla, om maskinen inte rapporterat i appen). */
export function raknadeOptiLass(opti: readonly OptiLass[], appStart: ReadonlyMap<string, number>): OptiLass[] {
  return opti.filter((o) => {
    const start = appStart.get(o.maskinId);
    if (start == null) return true;
    // Utan tid: dagen avgör — ligger lassets dag före appens första dag räknas det, annars inte (appen har den dagen).
    if (o.tidMs == null) return o.datum < sthlmDag(start);
    return o.tidMs < start;
  });
}

// ── Kopplingen Opti-sortiment → skördarens sortiment ──────────────────────────────────────────────────────────────────

/** Namn utan grupp ("Massa:"), version ("_V3") och skiljetecken; & skrivs "o" i skördarens namn (BERGoBERG). */
export function namnNyckel(namn: string): string {
  const s = String(namn ?? '').replace(/&/g, 'o');
  const utanGrupp = s.includes(':') ? s.slice(s.indexOf(':') + 1) : s;
  return utanGrupp.replace(/[_ ]?V\d+\s*$/i, '').toLowerCase().replace(/[^a-z0-9åäö]/g, '');
}

/** Klassen en kundkod hör till: kodens första siffra (0 timmer/kubb, 1 massa, 2 kubb, 4 och 5 energi). null = okänd. */
export function kodKlass(kod: string | null | undefined): string | null {
  const m = String(kod ?? '').trim().match(/^(\d)/);
  if (!m) return null;
  return m[1] === '4' || m[1] === '5' ? 'energi' : m[1];
}

interface Post { nyckel: string; rest: number }

const iNyckel = (ps: readonly Post[], n: string) => ps.find((p) => p.nyckel === n);

/** Fyller kandidaterna i tur och ordning (mest kvar först); ger det som blev över. */
function fyll(kand: Post[], m3: number, per: Map<string, number>): number {
  let kvar = m3;
  for (const p of [...kand].sort((a, b) => b.rest - a.rest)) {
    if (kvar <= 0.0001) break;
    const tar = Math.min(kvar, Math.max(0, p.rest));
    if (tar <= 0) continue;
    per.set(p.nyckel, (per.get(p.nyckel) ?? 0) + tar);
    p.rest -= tar;
    kvar -= tar;
  }
  return kvar;
}

/**
 * Fördelar de räknade Opti-lassens volym på skördarens sortiment. Returnerar skotat per skördat-nyckel (m³, aldrig mer än skördat).
 * Överskott (skotat mer än skördat i sin grupp) försvinner — det är "klart", aldrig ett minus.
 */
export function fordelaOpti(skordat: readonly SkordatSortiment[], raknade: readonly OptiLass[]): Map<string, number> {
  const per = new Map<string, number>();
  const poster: Post[] = skordat.map((s) => ({ nyckel: s.nyckel, rest: s.m3 }));
  const sk = new Map(skordat.map((s) => [s.nyckel, s]));
  const namnNyckelPer = new Map(skordat.map((s) => [namnNyckel(s.namn), s.nyckel]));
  const klassAv = (nyckel: string): string | null => {
    if (nyckel === OKLASSAT_NYCKEL) return null;
    const koder = sk.get(nyckel)?.kundkoder ?? [];
    for (const k of koder) { const c = kodKlass(k); if (c) return c; }
    return null;
  };

  // Samla volymen per (kod, namn): samma sortiment i flera lass blir en post.
  const grupper = new Map<string, { kod: string | null; namn: string; m3: number }>();
  for (const o of raknade) for (const r of o.rader) {
    if (!(r.m3 > 0)) continue;
    const k = `${r.kundkod ?? ''}|${namnNyckel(r.namn)}`;
    const g = grupper.get(k) ?? { kod: r.kundkod, namn: r.namn, m3: 0 };
    g.m3 += r.m3;
    grupper.set(k, g);
  }

  const klassKo: Array<{ klass: string; m3: number }> = [];
  const allaKo: number[] = [];
  // Steg 1–2: direkta träffar (kundkod, sedan namn). Överskottet går vidare till klassen.
  for (const g of grupper.values()) {
    let kand: Post[] = g.kod ? skordat.filter((s) => s.kundkoder?.includes(g.kod!)).map((s) => iNyckel(poster, s.nyckel)!).filter(Boolean) : [];
    if (!kand.length) {
      const n = namnNyckelPer.get(namnNyckel(g.namn));
      const p = n ? iNyckel(poster, n) : undefined;
      if (p) kand = [p];
    }
    const klass = kodKlass(g.kod);
    if (kand.length) {
      const over = fyll(kand, g.m3, per);
      if (over > 0.0001 && klass) klassKo.push({ klass, m3: over });
    } else if (klass) {
      klassKo.push({ klass, m3: g.m3 });
    } else {
      allaKo.push(g.m3);
    }
  }
  // Steg 3: klassen. Överskott utöver klassens skördade volym är klart (försvinner).
  for (const k of klassKo) fyll(poster.filter((p) => klassAv(p.nyckel) === k.klass), k.m3, per);
  // Steg 4: ingen kod/klass att gå på.
  for (const m3 of allaKo) fyll(poster, m3, per);
  return per;
}

/** Opti-lassens volym per dag (maskinens dag) — takten för klar-dag. Lassens egen volym, annars sortimentsraderna. */
export function optiPerDag(raknade: readonly OptiLass[]): Array<{ datum: string; m3: number }> {
  const per = new Map<string, number>();
  for (const o of raknade) {
    const v = o.volymM3 != null && o.volymM3 > 0 ? o.volymM3 : o.rader.reduce((s, r) => s + (r.m3 > 0 ? r.m3 : 0), 0);
    if (v > 0) per.set(o.datum, (per.get(o.datum) ?? 0) + v);
  }
  return Array.from(per, ([datum, m3]) => ({ datum, m3 }));
}

