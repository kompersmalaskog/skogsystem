// Avsluta-laget: ETT KORT I TAGET.
//
// Utforandepunkterna och matningarna (en kolumn kort, tretton rader pa en ny runda) blir
// en serie: ett kort fyller ytan, svarar man kommer nasta, och de man redan svarat pa
// ligger som en kompakt rad langst ner for den som vill ga tillbaka och andra.
//
// ALLT HAR AR RENT - ingen React, ingen karta, ingen databas - sa att reglerna gar att
// testa utan en webblasare. Sidan (app/egenkontroll/[objektId]/page.tsx) och
// UtforandeSerie.tsx anropar bara dessa.
//
// SERIEN ARTAR UT SIG UR DATAN, den lagras aldrig. Vilket kort som visas ar "det man
// valt att ga tillbaka till", annars "det forsta obesvarade" - och det forsta obesvarade
// raknas ur punkternas status varje gang. Ett lagrat "nuvarande kort" kunde sta fel mot
// verkligheten (en omlasning, en punkt som blivit obesvarad igen); ett harlett kan det inte.
//
// ORDNINGEN AR INTE SLUMPAD OCH INTE VALD AV ANVANDAREN: utforandet forst, mateningarna
// sist, var och en i rundans egen ordning. Att ta bort punkter for att listan blev lang
// vore att losa ett granssnittsproblem med innehallet - serien kortar scrollen, inte listan.

import type { EgenkontrollPunkt } from './egenkontroll';
import { provytaStatus } from './provytor';

/**
 * Knapparna ar dodda sa har lange efter att ett kort bytts. Nasta kort hamnar PA SAMMA
 * STALLE som det forra - det ar hela poangen med "tummen lar sig positionen" - och ett
 * sent dubbeltryck skulle annars svara pa NASTA punkt, tyst och fel.
 */
export const TUMSKYDD_MS = 350;

/** Utforande, sedan matning, sedan allt annat. Planpunkterna ingar inte: de har en plats och nas via kartan. */
export function byggSerie(punkter: EgenkontrollPunkt[]): EgenkontrollPunkt[] {
  const efterOrdning = (a: EgenkontrollPunkt, b: EgenkontrollPunkt) => a.ordning - b.ordning;
  const utforande = punkter.filter((p) => p.del === 'utforande').sort(efterOrdning);
  const matning = punkter.filter((p) => p.del === 'matning').sort(efterOrdning);
  // FALLBACK: en framtida del far aldrig falla bort tyst - en punkt som kravs men inte syns
  // gor rundan omojlig att avsluta.
  const ovrigt = punkter.filter((p) => !['plan', 'utforande', 'matning'].includes(p.del)).sort(efterOrdning);
  return [...utforande, ...matning, ...ovrigt];
}

export function antalBesvarade(serie: EgenkontrollPunkt[]): number {
  return serie.filter((p) => p.status !== null).length;
}

export function forstaObesvarade(serie: EgenkontrollPunkt[]): EgenkontrollPunkt | null {
  return serie.find((p) => p.status === null) ?? null;
}

export type AktivtKort = {
  /** null = allt ar besvarat: slutkortet. */
  punkt: EgenkontrollPunkt | null;
  /** 1-baserad plats i serien. */
  nummer: number | null;
  /** Man har sjalv gatt tillbaka till ett kort. */
  arValt: boolean;
};

/**
 * Vilket kort som ska visas. Det man valt att ga tillbaka till - om det fortfarande finns
 * i serien - annars det forsta obesvarade. Ett val som pekar pa en punkt som inte langre
 * finns ignoreras i stallet for att visa ett tomt kort.
 */
export function aktivtKort(serie: EgenkontrollPunkt[], valtId: string | null): AktivtKort {
  if (valtId) {
    const i = serie.findIndex((p) => p.id === valtId);
    if (i >= 0) return { punkt: serie[i], nummer: i + 1, arValt: true };
  }
  const forsta = forstaObesvarade(serie);
  if (!forsta) return { punkt: null, nummer: null, arValt: false };
  return { punkt: forsta, nummer: serie.indexOf(forsta) + 1, arValt: false };
}

/** Tecken per svar: FORM, inte bara farg. Bra bock, Godkant tilde, Kan bli battre utropstecken. */
const TECKEN: Record<string, { tecken: string; ord: string }> = {
  bra: { tecken: '✓', ord: 'Bra' },
  godkant: { tecken: '~', ord: 'Godkänt' },
  battre: { tecken: '!', ord: 'Kan bli bättre' },
  // matningen svarar ok/battre; ok ar samma sak som Bra for den som gar tillbaka
  ok: { tecken: '✓', ord: 'OK' },
  avvikelse: { tecken: '!', ord: 'Avvikelse' },
};

export function svarsTecken(status: string | null): { tecken: string; ord: string } | null {
  if (status == null) return null;
  return TECKEN[status] ?? { tecken: '•', ord: status };
}

export type Ruta = { punkt: EgenkontrollPunkt; nummer: number; tecken: string; ord: string };

/**
 * Raden langst ner: BARA de besvarade, i seriens ordning, med sin plats i SERIEN som
 * nummer (ruta 7 ar kort 7 - aven om kort 5 an inte ar besvarat). Obesvarade finns inte
 * i raden alls: man ska inte kunna hoppa framat av misstag.
 */
export function rutor(serie: EgenkontrollPunkt[]): Ruta[] {
  const ut: Ruta[] = [];
  serie.forEach((p, i) => {
    const t = svarsTecken(p.status);
    if (t) ut.push({ punkt: p, nummer: i + 1, ...t });
  });
  return ut;
}

/**
 * Ska avsluta-laget visas som serie? Pagaende runda, terrangen klar (eller saknas), och
 * minst ett kort att visa. En avslutad runda ar ett dokument - den visas som kolumn, med
 * kommentarer och foton - och en runda utan utforandepunkter (de tre fran fore PR 3) har
 * ingen serie alls.
 */
export function arSerieLage(args: {
  harRunda: boolean;
  klar: boolean;
  terrangKvar: number;
  serieLangd: number;
}): boolean {
  return args.harRunda && !args.klar && args.terrangKvar === 0 && args.serieLangd > 0;
}

// ---------------------------------------------------------------------------
// Avsluta
// ---------------------------------------------------------------------------

const punktText = (n: number) => `${n} ${n === 1 ? 'punkt' : 'punkter'}`;
const ytText = (n: number) => `${n} ${n === 1 ? 'provyta' : 'provytor'}`;

export type AvslutaStatus = {
  kvarPunkter: number;
  kvarProvytor: number;
  kan: boolean;
  /** "6 provytor återstår" - eller null nar allt ar klart. */
  orsak: string | null;
  /** Knappens text: "Avsluta rundan" eller "Avsluta rundan — 6 provytor kvar". */
  etikett: string;
};

/**
 * Kan rundan avslutas? RAKNAR BADA SLAGEN, precis som avslutaRunda i lib/egenkontroll.ts.
 *
 * Forr raknade knappen bara punkterna: den var aktiv med provytor kvar och gav sedan ett
 * fel fran avslutaRunda ("6 provytor aterstar"). Sedan provytorna byggdes (PR 9). En
 * knapp som ser ut att fungera men inte gor det ar varre an en som sager varfor.
 *
 * Omatta ytor raknas som kvar; matta och overhoppade (med skal) ar klara.
 */
export function avslutaStatus(
  punkter: { status: string | null }[],
  provytor: { matt: string | null; overhoppad: boolean }[],
): AvslutaStatus {
  const kvarPunkter = punkter.filter((p) => p.status === null).length;
  const kvarProvytor = provytor.filter((y) => provytaStatus(y) === 'omatt').length;
  const delar: string[] = [];
  if (kvarPunkter > 0) delar.push(punktText(kvarPunkter));
  if (kvarProvytor > 0) delar.push(ytText(kvarProvytor));
  const kan = punkter.length > 0 && delar.length === 0;
  return {
    kvarPunkter,
    kvarProvytor,
    kan,
    orsak: delar.length === 0 ? null : `${delar.join(' och ')} återstår`,
    etikett: delar.length === 0 ? 'Avsluta rundan' : `Avsluta rundan — ${delar.join(' och ')} kvar`,
  };
}
