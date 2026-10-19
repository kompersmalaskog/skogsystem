// Brickorna i rundvyns docka: vilka de är, vad ett tryck gör och vad raden under dem får svara. RENT — ingen React, ingen karta, ingen databas.
//
// EN REGEL: TRYCK MARKERAR, RADEN SVARAR.
//   - Ett tryck på en bricka markerar den, alltid. Raden i dockan visar då vad som är markerat och bär svarsknapparna.
//   - Undantaget är ETT: en OBESVARAD bricka får Bra i samma tryck (88 % av alla svar på utförandepunkterna är Bra — prod 2026-10-19,
//     46 av 52). Det är en genväg, inte en andra regel: brickan markeras ändå, och raden visar svaret så man ser vad som skrevs.
//   - Ett tryck på en BESVARAD bricka skriver aldrig något. Ett oavsiktligt tryck med handske kan därför aldrig ändra ett svar
//     som redan står; det som ändrar är en medveten knapp i raden.
// Inga långtryck och inga svep: en gest man inte ser är en gest man inte hittar, och den krockar med att dra arket.

import type { EgenkontrollPunkt, PunktDel, PunktStatus } from './egenkontroll';

export type Bricka = {
  id: string;
  /** punkt_typ — den stabila nyckeln. Null på en rad utan (äldre data); brickan visar då rubriken. */
  slug: string | null;
  /** Kort namn som ryms i en bricka på tre kolumner (≈ 76 px text på en 390 px bred telefon). */
  namn: string;
  /** Hela rubriken, till raden och till skärmläsaren. */
  rubrik: string;
  /** Material Symbols-namn. */
  ikon: string;
  /** Rundans svar, eller null = obesvarad. */
  status: string | null;
};

type BrickNamn = { namn: string; ikon: string };

/** Kort namn och ikon per katalogpunkt (utforandeKatalog i lib/egenkontroll.ts). Okänd slug → rubriken och en neutral ikon, aldrig en saknad bricka. */
export const BRICKA_NAMN: Record<string, BrickNamn> = {
  risning_basvag: { namn: 'Risning', ikon: 'alt_route' },
  rishogar: { namn: 'Rishögar', ikon: 'grass' },
  korspar: { namn: 'Körspår', ikon: 'route' },
  avlagg: { namn: 'Avlägg', ikon: 'inventory_2' },
  upplagg_avverkning: { namn: 'Upplägg', ikon: 'layers' },
  stubbhojder: { namn: 'Stubbhöjd', ikon: 'straighten' },
  val_av_stammar: { namn: 'Stammar', ikon: 'park' },
  tradslagsblandning_kvar: { namn: 'Trädslag', ikon: 'forest' },
  frotrad_eller_skarm: { namn: 'Fröträd', ikon: 'nature' },
  kantzon_mot_vatten: { namn: 'Kantzon', ikon: 'water' },
  hyggesrester_mot_markberedning: { namn: 'Hyggesrest', ikon: 'landscape' },
  naturhansyn_utforande: { namn: 'Natur', ikon: 'eco' },
  grotuttag: { namn: 'Grot', ikon: 'compost' },
};

const OKAND_IKON = 'checklist';

/**
 * Brickorna, i rundans ordning.
 *
 * AVSTEG 5/7 FRÅN PLANERINGSVYN: PUNKTLISTAN ÄR KATALOGDRIVEN OCH INTE REDIGERBAR.
 * Planeringen är en yta man ritar på: markeringar läggs till, flyttas, byter typ och tas bort av den som planerar. Här finns ingen
 * sådan frihet, med flit. Brickorna är det katalogen (utforandeKatalog) kräver av en runda — tio på gallring, elva på slutavverkning —
 * och ryggraden (kompletteraRunda) ser till att en pågående runda har dem alla. Föraren kan inte lägga till, ta bort, byta namn på
 * eller flytta en bricka: en kontroll som kan kortas av den som utför den kontrollerar ingenting, och Vida jämför rundor mot varandra.
 * Därför finns här inget "redigera", inget långtryck för att flytta, ingen "lägg till punkt". En ny punkt kommer ur katalogen,
 * i en ny version av appen, och hamnar sist i serien.
 *
 * Bara del 'utforande' är brickor. Stubbehandlingen (del 'matning') är en mätning och inte ett betyg och bor i arket; planpunkterna
 * (del 'plan') har en plats på kartan och väljs där; observationer är tillägg och ingår aldrig.
 */
export function byggBrickor(punkter: EgenkontrollPunkt[]): Bricka[] {
  return punkter
    .filter((p) => p.del === 'utforande')
    .sort((a, b) => a.ordning - b.ordning)
    .map((p) => {
      const k = p.punkt_typ ? BRICKA_NAMN[p.punkt_typ] : undefined;
      return {
        id: p.id,
        slug: p.punkt_typ,
        namn: k?.namn ?? p.rubrik,
        rubrik: p.rubrik,
        ikon: k?.ikon ?? OKAND_IKON,
        status: p.status,
      };
    });
}

export type BrickaTryck = {
  /** Punkten som markeras. Alltid satt: ett tryck markerar. */
  markera: string;
  /** Satt = skriv detta svar (bara Bra, bara på en obesvarad bricka på en öppen runda). Null = skriv ingenting. */
  svara: 'bra' | null;
};

/** Vad ett tryck på en bricka gör. `last` = rundan är avslutad. */
export function brickaTryck(bricka: Pick<Bricka, 'id' | 'status'>, last: boolean): BrickaTryck {
  return { markera: bricka.id, svara: !last && bricka.status === null ? 'bra' : null };
}

/** Status i ord och tecken. FORM bär svaret, färgen upprepar det: ✓ Bra, ~ Godkänt, ! Bättre. */
export const BRICKSTATUS: Record<string, { tecken: string; ord: string; farg: 'gron' | 'text2' | 'orange' | 'rod' }> = {
  bra: { tecken: '✓', ord: 'Bra', farg: 'gron' },
  ok: { tecken: '✓', ord: 'OK', farg: 'gron' },
  godkant: { tecken: '~', ord: 'Godkänt', farg: 'text2' },
  battre: { tecken: '!', ord: 'Bättre', farg: 'orange' },
  avvikelse: { tecken: '!', ord: 'Avvikelse', farg: 'rod' },
};

/** Texten på en bricka som inte är besvarad. Ett ord, ingen färg. */
export const OBESVARAD_ORD = 'Kvar';

/** Svarsknapparna i raden. Etikett och status; Avvikelse skrivs aldrig rakt av (typ, foto och position samlas i arket). */
export type RadKnapp = { status: PunktStatus; etikett: string };

const KNAPPAR_UTFORANDE: RadKnapp[] = [
  { status: 'bra', etikett: 'Bra' },
  { status: 'godkant', etikett: 'Godkänt' },
  { status: 'battre', etikett: 'Bättre' },
];
const KNAPPAR_PLAN: RadKnapp[] = [
  { status: 'ok', etikett: 'OK' },
  { status: 'avvikelse', etikett: 'Avvikelse' },
];

/** Raden för en markerad punkt: svarsknapparna (+ "Foto · Not" som komponenten lägger sist). En del utan svarsknappar (mätning) ger tom lista. */
export function radKnappar(del: string): RadKnapp[] {
  if (del === 'utforande') return KNAPPAR_UTFORANDE;
  if (del === 'plan') return KNAPPAR_PLAN;
  return [];
}

export type RadHandling = 'svara' | 'avvikelse-ark' | 'ingen';

/** Vad en knapp i raden gör. En avslutad runda är låst; Avvikelse öppnar formuläret; resten skrivs. */
export function radHandling(status: PunktStatus, last: boolean): RadHandling {
  if (last) return 'ingen';
  return status === 'avvikelse' ? 'avvikelse-ark' : 'svara';
}

/** Delen en svarsfunktion ska få: bara plan och utförande har svarsknappar. */
export function svarsDel(del: string): PunktDel | null {
  return del === 'plan' || del === 'utforande' ? del : null;
}

/** Siffran i huvudet. En enda: vad som återstår. Avslutad runda säger det; inget kvar säger Klart. */
export function kvarText(kvar: number, klar: boolean): string {
  if (klar) return 'Avslutad';
  if (kvar <= 0) return 'Klart';
  return `${kvar} kvar`;
}

/** "Foto · Not" — knappen som öppnar punkten med foto och kommentar. Ett namn, en plats. */
export const FOTO_NOT_ETIKETT = 'Foto · Not';

/** Hur länge "Ångra" står kvar efter ett svar som skrevs av ett tryck på en bricka. */
export const ANGRA_MS = 5000;

/**
 * Radens maxhöjd för innehållet (kommentar, typ, foton) på en avslutad runda, i procent av skärmens höjd (dvh). Mer än så scrollar INOM raden: på en låst
 * runda är brickan enda platsen anteckningarna finns i appen, så en lång text får aldrig fylla hela arket och lämna resten onåbar.
 */
export const RAD_MAX_DVH = 30;
