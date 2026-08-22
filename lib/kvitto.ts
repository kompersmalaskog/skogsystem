// Gallringskvitto — dokumentet markägaren får efter utförd gallring.
//
// Kvittot räknar ingenting eget. Alla tal kommer ur lib/gallring.ts, samma
// källa som gallringsvyn läser. Skulle kvittot ha en egen uträkning skulle två
// dokument kunna säga olika saker om samma trakt, och då är kvittot värdelöst
// som underlag.
//
// Den här filen lägger bara till det gallringsvyn inte behöver: markägarens
// namn, fastigheten, kontraktet — objektets identitet utåt.
//
// ── VAD SOM MEDVETET SAKNAS ───────────────────────────────────────────────
//
// Grundyteblocket (plan före → uttag → kvar) finns inte. Planens ingångsvärde
// är inte lagrat någonstans: objekt.trakt_data bär bara areal/volym/beraknad,
// och lib/skoglig-berakning.ts räknar visserligen grundyta ur SLU:s laserdata
// men resultatet sparas aldrig. Beslut 2026-08-22: fältet ska bli en ny kolumn
// objekt.grundyta_fore_m2ha som fylls manuellt ur stämplingslängd eller
// traktdirektiv — markägarens EGET tal, det han redan accepterat. SLU-värdet
// duger inte: det är från skanningsdatum och bär tillväxt sedan dess.
// Migrationen görs i egen gren. Se STATUS.md.
//
// Kartan över uttagna träd hör till steg 2 och blockeras av luckorna i
// detalj_stam — en karta med hål ser ut som luckor i beståndet.

import { supabase } from './supabase';
import { hamtaGallring, type GallringDetalj, type TradslagAndel } from './gallring';

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

/** Objektets identitet utåt. Allt hämtas ur `objekt`, matchat på vo_nummer —
 *  objektnamnen skiljer sig mellan `objekt` och `dim_objekt`. */
export type KvittoObjekt = {
  namn: string | null;
  fastighet: string | null;
  markagare: string | null;
  bolag: string | null;
  /** objekt.traktnr. På Hålabäck 886311 — det tal som står i planen. */
  traktnr: string | null;
  /** Visas BARA när det skiljer sig från VO. På Hålabäck bär vo_nummer och
   *  kontraktsnummer samma värde (11219961), och att trycka samma siffra två
   *  gånger under olika etiketter läser sig som ett fel i dokumentet. */
  kontraktsnummer: string | null;
};

export type Kvitto = {
  gallring: GallringDetalj;
  objekt: KvittoObjekt;
  /** Andel av ANTALET stammar, inte av volymen. Kvittot redovisar stamandel —
   *  gallringsvyn volymandel — och båda skriver ut sin bas, annars ser samma
   *  trädslag ut att ha två olika tal utan förklaring (Tall 55 % mot 61 %). */
  stamandelar: TradslagAndel[];
};

// ---------------------------------------------------------------------------
// Hämtning
// ---------------------------------------------------------------------------

async function hamtaObjekt(vo: string): Promise<KvittoObjekt> {
  const { data, error } = await supabase
    .from('objekt')
    .select('namn, fastighetsbeteckning, markagare, bolag, traktnr, kontraktsnummer')
    .eq('vo_nummer', vo)
    .limit(1);
  if (error) throw new Error(`objektuppgifter: ${error.message}`);

  const o = data?.[0];
  return {
    namn: o?.namn ?? null,
    fastighet: o?.fastighetsbeteckning ?? null,
    markagare: o?.markagare ?? null,
    bolag: o?.bolag ?? null,
    traktnr: o?.traktnr ?? null,
    kontraktsnummer: o?.kontraktsnummer ?? null,
  };
}

/** null = ingen gallring med det VO-numret. Anroparen skiljer det från fel. */
export async function hamtaKvitto(vo: string): Promise<Kvitto | null> {
  const [gallring, objekt] = await Promise.all([hamtaGallring(vo), hamtaObjekt(vo)]);
  if (!gallring) return null;

  return {
    gallring,
    objekt,
    stamandelar: [...gallring.tradslag].sort((a, b) => b.stammar - a.stammar),
  };
}

// ---------------------------------------------------------------------------
// Härledda tal
// ---------------------------------------------------------------------------

/** Uttagen grundyta per hektar. null när arealen saknas — den skattas ALDRIG
 *  ur rutnät eller körspår, och ett per-hektar-tal utan uppmätt areal är en
 *  gissning som ser ut som en mätning. */
export function uttagenGrundytaPerHa(k: Kvitto): number | null {
  const g = k.gallring.diameter?.grundytaM2;
  const areal = k.gallring.arealHa;
  if (g == null || !areal || areal <= 0) return null;
  return g / areal;
}

/** Medelstam, m³fub per stam. Delas på MOM:s stamantal — det är sanningen om
 *  hur många stammar som togs ut. */
export function medelstam(k: Kvitto): number | null {
  const { volymM3fub, stammar } = k.gallring;
  return stammar > 0 ? volymM3fub / stammar : null;
}

/** Sortimentsraderna med de tal som FAKTISKT visas, deras summa, och hur den
 *  summan förhåller sig till traktens uttag.
 *
 *  AVRUNDNING. Kvittot adderas för hand, så delarna måste gå ihop på pappret.
 *  Två vägar förkastades: en decimal per rad ger 17,8 + 7,4 + 3,4 + 2,3 + 1,3
 *  + 0,4 + 0,0 = 32,6 mot trakttotalen 32,7, och största-resten-avrundning
 *  tvingar summan rätt men skriver Kubb Alvesta275 som 7,5 fast den är 7,448.
 *  På ett kunddokument får ingen rad ljuga för att kolumnen ska gå ihop. Två
 *  decimaler avrundas var för sig till närmaste värde, och summan räknas på de
 *  visade talen.
 *
 *  TÄCKNING. Sortimenten kommer ur fakt_sortiment (HPR) medan traktens uttag
 *  kommer ur fakt_produktion (MOM) — CLAUDE.md:s regel, och två skilda
 *  mätvägar. De är BARA identiska på 1 av 25 gallringstrakter (2026-08-22).
 *  HPR ligger normalt 0,1–9 % lägre, Kompersmåla Lövhuggning ligger 81 % för
 *  HÖGT, och Midingstorp, Kompermåla Ga och Lars Norberg Dunshultt saknar
 *  fakt_sortiment helt.
 *
 *  Därför är huvudtalet på kvittot ALDRIG sortimentssumman. Vore det så skulle
 *  kvittot för Midingstorp skriva 0,0 m³fub på en trakt som avverkat 309 m³.
 *  Huvudtalet är traktens uttag ur fakt_produktion — samma tal gallringsvyn
 *  visar — och skiljer sig sortimentssumman från det säger dokumentet det rakt
 *  ut i stället för att låta läsaren upptäcka det med miniräknare. */
export function sortimentMedSumma(k: Kvitto): {
  rader: { namn: string; grupp: string | null; stockar: number; visadVolym: number }[];
  summa: number;
  /** Traktens uttag, huvudtalet. Ur fakt_produktion. */
  uttag: number;
  /** true när sortimentssumman täcker uttaget så när som på avrundning. */
  tacker: boolean;
} {
  const rader = k.gallring.sortiment.map((s) => ({
    namn: s.namn,
    grupp: s.grupp,
    stockar: s.stockar,
    visadVolym: Math.round(s.volym * 100) / 100,
  }));
  const summa = rader.reduce((a, r) => a + r.visadVolym, 0);
  const uttag = k.gallring.volymM3fub;
  return { rader, summa, uttag, tacker: Math.abs(summa - uttag) < 0.05 };
}

/** Utfärdandedatum, lokalt. Aldrig toISOString() — den räknar i UTC och kan
 *  skriva gårdagens datum på ett kvitto som skrivs ut på kvällen. */
export function idagLokalt(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
