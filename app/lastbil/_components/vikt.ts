// Lastbilens körning uppdelad på lastad / tom / okänd ur bilens bruttovikt (Uppföljning, steg 3). EN härledning för Förbrukning,
// Körsträcka och jämförelsen i Betalt, så de aldrig läser olika underlag.
//
// Källa: SQL-funktionen lastbil_vikt_manad (migration 20261020120000): segment mellan två mätpunkter där mätaren ökat, klassade på
// vikten i ändpunkterna (lastad ≥ 34 t, tom under, olika klass i ändarna eller ingen vikt = okänd). Siffrorna är MÄTT körning
// (mätaren i bilen) — inte rundornas km, så summan kan skilja sig lite från "Körd 2026" och månadslistan, som bygger på rundorna.
//
// Regler: km per klass avrundas till hela km före summering (summan är summan av de visade delarna); l/mil = liter / km med
// bränsleuppgift * 10 (ett segment utan bränsle drar aldrig ner snittet); saknad mätning är null/"saknas", aldrig 0; en månad där
// varken lastad eller tom körning är känd säger "vikt saknas".

import { manadForStart, manaderIAr, type Manad } from './period';
import type { Flytt } from './maskiner';

/** En rad ur RPC:n. numeric kommer som tal eller text beroende på driver — alltid Number() vid läsning. */
export interface ViktRad {
  man: number;
  km_lastad: number; liter_lastad: number; km_diesel_lastad: number;
  km_tom: number; liter_tom: number; km_diesel_tom: number;
  km_okand: number; liter_okand: number; km_diesel_okand: number;
}

export type Klass = 'lastad' | 'tom' | 'okand';

export interface KlassSumma {
  /** Hela km (avrundat). */
  km: number;
  /** Exakt km, före avrundning — bara för att avgöra "finns det någon körning alls". */
  kmRa: number;
  /** Liter i klassen; null = ingen bränsleuppgift alls. */
  liter: number | null;
  /** l/mil över de segment som har bränsleuppgift; null = ingen. */
  lPerMil: number | null;
}

export interface ViktManad {
  m: Manad;
  /** Minst en känd (lastad eller tom) sträcka. Annars "vikt saknas". */
  harVikt: boolean;
  lastad: KlassSumma;
  tom: KlassSumma;
  okand: KlassSumma;
  /** Summan av de avrundade delarna. */
  km: number;
}

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function klass(km: unknown, liter: unknown, kmDiesel: unknown): KlassSumma {
  const kmRa = num(km), kd = num(kmDiesel);
  return {
    km: Math.round(kmRa), kmRa,
    liter: kd > 0 ? Math.round(num(liter)) : null,
    lPerMil: kd > 0 && num(liter) > 0 ? num(liter) / (kd / 10) : null,
  };
}

const TOM_KLASS: KlassSumma = { km: 0, kmRa: 0, liter: null, lPerMil: null };

/** Årets månader (nyast först) med sin viktuppdelning. En månad utan rad i svaret är "vikt saknas" — aldrig en nolla som ser ut som mätning. */
export function perViktManad(ar: number, rader: readonly ViktRad[], nu?: Date): ViktManad[] {
  return manaderIAr(ar, nu).map(m => {
    const r = rader.find(x => Number(x.man) === m.man);
    if (!r) return { m, harVikt: false, lastad: TOM_KLASS, tom: TOM_KLASS, okand: TOM_KLASS, km: 0 };
    const lastad = klass(r.km_lastad, r.liter_lastad, r.km_diesel_lastad);
    const tom = klass(r.km_tom, r.liter_tom, r.km_diesel_tom);
    const okand = klass(r.km_okand, r.liter_okand, r.km_diesel_okand);
    return { m, harVikt: lastad.kmRa + tom.kmRa > 0, lastad, tom, okand, km: lastad.km + tom.km + okand.km };
  });
}

/** Lass kan saknas när bilen kört med lass mer än 1,5 gånger så långt som de registrerade flyttarna. */
export const LASS_SAKNAS_FAKTOR = 1.5;

export interface LassMotFlytt {
  m: Manad;
  /** Km körda med lass enligt vikten. */
  lassKm: number;
  /** Summa av avrundade flytt_km för registrerade (avslutade, icke-avbrutna) flyttar som lossats i månaden. */
  flyttKm: number;
  /** Registrerade flyttar i månaden som saknar km — då är flyttKm ett minimum. */
  saknarKm: number;
  /** lassKm > 1,5 × flyttKm. */
  kanSaknas: boolean;
}

/**
 * Kört med lass mot registrerade flyttar, per månad med känd vikt. Månaden är den svenska dag flytten lossades
 * (som Maskiner). Flytt_km är den lastade sträckan A→B, mätvikten är körning med lass — samma sak mätt två sätt.
 */
export function lassMotFlyttar(manader: readonly ViktManad[], flyttar: readonly Flytt[]): LassMotFlytt[] {
  return manader.filter(v => v.harVikt).map(v => {
    const dennaManad = flyttar.filter(f => { const x = manadForStart(f.lossad); return x?.ar === v.m.ar && x.man === v.m.man; });
    const flyttKm = dennaManad.reduce((s, f) => s + (f.km == null ? 0 : Math.round(f.km)), 0);   // varje flytt avrundad före summering
    const saknarKm = dennaManad.filter(f => f.km == null).length;
    const lassKm = v.lastad.km;
    return { m: v.m, lassKm, flyttKm, saknarKm, kanSaknas: lassKm > LASS_SAKNAS_FAKTOR * flyttKm };
  });
}
