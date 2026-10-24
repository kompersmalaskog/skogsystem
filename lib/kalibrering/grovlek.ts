/**
 * PER GROVLEK — var i historiken träffar maskinen fel? Ett rutnät: rader = grovlek (diameterklass), kolumner = månad (eller kvartal/år), valfritt ett trädslag.
 *
 * Underlaget är kontrollstammarna: maskinens diameter mot operatörens klave, mätpunkterna längs stocken och toppen vid kapsnittet — samma punkter, samma
 * OMÄTT-filter och samma klassning (operatörens diameter) som Träff, Spridning och Läget (lib/kalibrering/diameterpunkter). Månaden är kontrollens datum,
 * som i de andra kurvorna, så en ruta går att korskontrollera mot Träff.
 *
 * EN STAM RÄKNAS EN GÅNG PER RUTA (se rutnat.ts): varje stam ger sin egen träffandel (punkter inom toleransen / stammens punkter i rutan) och sitt eget
 * medelfel, och rutan visar medelvärdet över stammarna. Det skiljer sig medvetet från Läget, som räknar alla mätpunkter lika — Läget bedömer mot Vidas krav,
 * den här vyn letar efter VAR felet sitter, och där ska en stam med nio mätpunkter inte väga nio gånger så mycket som en med en.
 *
 * Allt här är rent (inga anrop, ingen färg): servern bygger raderna med `byggGrovlekRader`, klienten räknar rutnätet med `grovlekRutnat` och ritar det,
 * och justeringsförslagen kan läsa `grovlekRutnat` direkt.
 */
import type { DiaPunkt } from './diameterpunkter';
import { periodKey, traffTon, type LagetSteg, type RutaTon, type RutKrav } from './rutnat';
import { tradslagLabel } from '@/lib/tradslag';

/** Grovleksklasserna är de som Träff och Läget redan använder (operatörens diameter): <150, 150–199, 200–249, 250–299, 300+. */
export const GROVLEK_KLASSER = ['<150', '150-199', '200-249', '250-299', '300+'] as const;
export type GrovlekKlass = typeof GROVLEK_KLASSER[number];

export const grovlekKlass = (mm: number): GrovlekKlass =>
  mm < 150 ? '<150' : mm < 200 ? '150-199' : mm < 250 ? '200-249' : mm < 300 ? '250-299' : '300+';

/** "<150 mm", "150–199", … — klassen som den läses av en människa. */
export const klassEtikett = (k: string): string => (k === '<150' ? '<150' : k === '300+' ? '300+' : k.replace('-', '–'));

/** Färre stammar än så i en ruta → grå med "–". Stammar, inte mätpunkter: punkterna på en stam hänger ihop. */
export const GROVLEK_MIN_STAMMAR = 8;

/** En stam i en ruta, som servern skickar den. `traff` = punkter inom toleransen, `summa` = Σ avvikelse (mm, maskin − klave) över stammens `n` punkter i rutan. */
export type GrovlekRad = { manad: string; tradslag: string; klass: GrovlekKlass; filnamn: string; n: number; traff: number; summa: number };

export type StockRad = {
  id: number; filnamn: string; kontroll_datum: string; harvest_date: string | null; stam_nummer: number; stock_nummer: number;
  machine_measurement_date: string | null; operator_measurement_date: string | null;
};

/**
 * Raderna: en per stam, månad och klass. Månaden är kontrollens datum, trädslaget kontrollens (fakt_kalibrering, via filnamn).
 *
 * EN STAM, EN STOCK: en stam känns igen på sin SKÖRDETID (`harvest_date`), inte på stamnumret — en ackumulerande HQC-fil numrerar om stammarna, så samma stam har
 * olika nummer i olika filer (Scorpionen: 228 stammar på skördetid mot 295 på skördetid + nummer). Av samma skäl räknas en stock EN gång: samma skördetid,
 * stocknummer och mättider är samma stock även när stamnumret skiljer sig (325 av Scorpionens 1 461 stockar var en sådan upprepning efter dubblettrensningen
 * 2026-10-22, som gick på stamnumret); den med lägst id behålls. Saknar filen trädslag hamnar stammen utan rad: vi gissar inte.
 */
export function byggGrovlekRader(args: { stockar: StockRad[]; punkter: DiaPunkt[]; filTradslag: Map<string, string>; tolerans: number }): GrovlekRad[] {
  const { stockar, punkter, filTradslag, tolerans } = args;
  // Samma stock i flera filer: den äldsta (lägst id) gäller.
  const fysisk = new Map<string, number>();
  for (const s of stockar) {
    const k = `${s.harvest_date ?? s.filnamn}|${s.stock_nummer}|${s.machine_measurement_date}|${s.operator_measurement_date}`;
    const aldst = fysisk.get(k);
    if (aldst == null || s.id < aldst) fysisk.set(k, s.id);
  }
  const behalls = new Set(fysisk.values());
  const stock = new Map(stockar.filter(s => behalls.has(s.id)).map(s => [s.id, s]));
  const rader = new Map<string, GrovlekRad>();
  for (const p of punkter) {
    const s = stock.get(p.stockId);
    if (!s) continue;
    const tr = filTradslag.get(s.filnamn);
    if (!tr) continue;
    const manad = s.kontroll_datum.slice(0, 7);
    const klass = grovlekKlass(p.operator_mm);
    const tradslag = tradslagLabel(tr);
    const nyckel = `${s.harvest_date ?? `${s.filnamn}|${s.stam_nummer}`}|${manad}|${klass}`;
    let r = rader.get(nyckel);
    if (!r) { r = { manad, tradslag, klass, filnamn: s.filnamn, n: 0, traff: 0, summa: 0 }; rader.set(nyckel, r); }
    r.n++; r.summa += p.avvik; if (Math.abs(p.avvik) <= tolerans) r.traff++;
  }
  return Array.from(rader.values()).sort((a, b) => a.manad.localeCompare(b.manad) || a.klass.localeCompare(b.klass) || a.filnamn.localeCompare(b.filnamn));
}

// === Rutnätet ===
export type GrovlekRuta = {
  klass: GrovlekKlass;
  period: string;
  /** Antal stammar i rutan — det grinden och texten räknar. */
  stammar: number;
  /** Antal mätpunkter bakom stammarna (information). */
  punkter: number;
  /** Medelvärde över stammarna av stammens träffandel, 0–100. */
  traffPct: number;
  /** Medelvärde över stammarna av stammens medelfel (maskin − klave), mm. Positivt = maskinen mäter grövre. */
  snittMm: number;
  tunn: boolean;
  ton: RutaTon;
  /** Kontrollerna (filnamn) som stammarna kommer från, utan dubbletter. */
  filnamn: string[];
};
export type GrovlekRutnat = {
  perioder: string[];
  /** En rad per klass, i ordning (klenast först). `celler` är i samma ordning som `perioder`; null = ingen stam alls i rutan. */
  rader: { klass: GrovlekKlass; celler: (GrovlekRuta | null)[] }[];
  /** Trädslagen som finns i underlaget (för växeln), största först. */
  tradslag: string[];
};

export type GrovlekUrval = { steg: LagetSteg; /** null = alla trädslag */ tradslag: string | null; krav: RutKrav | null };

const passar = (r: GrovlekRad, u: GrovlekUrval) => u.tradslag == null || r.tradslag === u.tradslag;

/** Trädslagen i underlaget, flest stammar först (Gran, Tall, Björk i praktiken). */
export const grovlekTradslag = (rader: GrovlekRad[]): string[] => {
  const antal = new Map<string, number>();
  for (const r of rader) antal.set(r.tradslag, (antal.get(r.tradslag) ?? 0) + 1);
  return Array.from(antal).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
};

const rutaAv = (klass: GrovlekKlass, period: string, rader: GrovlekRad[], krav: RutKrav | null): GrovlekRuta => {
  const stammar = rader.length;
  const traffPct = (100 * rader.reduce((a, r) => a + r.traff / r.n, 0)) / stammar;
  const snittMm = rader.reduce((a, r) => a + r.summa / r.n, 0) / stammar;
  const tunn = stammar < GROVLEK_MIN_STAMMAR;
  return {
    klass, period, stammar, punkter: rader.reduce((a, r) => a + r.n, 0), traffPct, snittMm, tunn,
    ton: tunn ? 'tunn' : traffTon(traffPct, krav),
    filnamn: Array.from(new Set(rader.map(r => r.filnamn))).sort(),
  };
};

/** Rutnätet för ett urval. Perioderna är de som har minst en stam i urvalet. */
export function grovlekRutnat(rader: GrovlekRad[], urval: GrovlekUrval): GrovlekRutnat {
  const valda = rader.filter(r => passar(r, urval));
  const perPeriodKlass = new Map<string, GrovlekRad[]>();
  for (const r of valda) {
    const k = `${periodKey(r.manad, urval.steg)}|${r.klass}`;
    perPeriodKlass.set(k, [...(perPeriodKlass.get(k) ?? []), r]);
  }
  const perioder = Array.from(new Set(valda.map(r => periodKey(r.manad, urval.steg)))).sort();
  return {
    perioder,
    rader: GROVLEK_KLASSER.map(klass => ({
      klass,
      celler: perioder.map(period => {
        const lista = perPeriodKlass.get(`${period}|${klass}`);
        return lista && lista.length > 0 ? rutaAv(klass, period, lista, urval.krav) : null;
      }),
    })),
    tradslag: grovlekTradslag(rader),
  };
}

// === Kontrollerna bakom en ruta ===
export type RutaKontroll = { filnamn: string; stammar: number; traffPct: number; snittMm: number };

/** Kontrollerna som en ruta byggs av, med varje kontrolls egna stammar, träff och medelfel i rutan. Kontrollen med flest stammar först. */
export function grovlekRutaKontroller(rader: GrovlekRad[], val: { klass: GrovlekKlass; period: string } & GrovlekUrval): RutaKontroll[] {
  const perFil = new Map<string, GrovlekRad[]>();
  for (const r of rader) {
    if (r.klass !== val.klass || periodKey(r.manad, val.steg) !== val.period || !passar(r, val)) continue;
    perFil.set(r.filnamn, [...(perFil.get(r.filnamn) ?? []), r]);
  }
  return Array.from(perFil, ([filnamn, lista]) => ({
    filnamn,
    stammar: lista.length,
    traffPct: (100 * lista.reduce((a, r) => a + r.traff / r.n, 0)) / lista.length,
    snittMm: lista.reduce((a, r) => a + r.summa / r.n, 0) / lista.length,
  })).sort((a, b) => b.stammar - a.stammar || a.filnamn.localeCompare(b.filnamn));
}

/** Det som arket "Kontrollerna bakom rutan" visar: rutan själv och kontrollerna den byggs av. Byggs när man trycker på rutan, så arket inte räknar. */
export type RutaVal = {
  rubrik: string;
  periodNamn: string;
  klass: GrovlekKlass;
  stammar: number;
  traffPct: number;
  snittMm: number;
  ton: RutaTon;
  tunn: boolean;
  /** Toleransen träffen mäts mot (±mm). */
  tolerans: number;
  kontroller: RutaKontroll[];
};
