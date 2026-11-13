// Kan rundan avslutas? Ren funktion: sidan (app/egenkontroll/[objektId]/page.tsx) bygger knappens text och spärr på den.
// Låg förr i den gamla serie-filen (serien är borta sedan ramen, PR 4); räkningen är oförändrad.
//
// HÄR BOR OCKSÅ REGELN FÖR RADEN SOM SÄGER ATT RUNDAN ÄR FÄRDIG. Den finns av ett uppmätt skäl (prod 2026-11-13):
// tre rundor — Ulfsnäs 22 av 22 sedan 28 aug, Rävemåla 25 av 25 sedan 17 okt, Krokshult 11 av 11 sedan 19 okt — var
// färdiggångna med noll punkter och noll provytor kvar, och ändå aldrig avslutade. Ingenting spärrade dem. Felet var att
// INGENTING SA ATT DE VAR KLARA: man svarar i dockan, huvudets lilla tal byter från "1 kvar" till "Klart", och
// Avsluta-knappen ligger i hel-läget, som kräver att man drar upp arket hela vägen. Och avslutet är det som gör
// rapporten till Vida — utan det finns bara data.

import { provytaStatus } from './provytor';

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

/**
 * Ska raden "Rundan är klar" visas ovanför arket?
 *
 * Raden ligger UTANFÖR dockan, i samma kolumn som Ångra-kvittot och "Visa hyttspåret" — aldrig i dockan. Skälet är
 * rundvyns hårdaste regel: inget tryckbart får flytta sig under fingret. Växer dockan när sista punkten besvaras
 * flyttar sig varje bricka, och det är precis det som fixades i PR 4b (0 px rörelse, mätt i Chromium).
 *
 * `angraVisas`: Ångra-kvittot tar SAMMA plats och står i 5 sekunder efter ett svar som ett tryck på en bricka skrev —
 * alltså just när sista punkten blir besvarad. Först får man ta tillbaka svaret, sedan erbjuds avslutet. Två saker på
 * samma plats samtidigt vore två knappar under samma finger; en i taget, och båda lika höga, så ingenting rör sig när
 * den ena ersätter den andra.
 *
 * `ritar`: medan man ritar ersätter EN rad knapparna (ett läge i taget) — då finns det ingen plats och inget avslut.
 */
export function visaAvslutaRad(i: { kan: boolean; klar: boolean; angraVisas: boolean; ritar: boolean }): boolean {
  return i.kan && !i.klar && !i.angraVisas && !i.ritar;
}

/** Sista svaret på rundan (ISO), null när ingen punkt är besvarad. Observationer räknas inte — de är alltid besvarade. */
export function sistaSvaret(punkter: { besvarad: string | null; kalla?: string | null }[]): string | null {
  let senast: string | null = null;
  for (const p of punkter) {
    if (p.kalla === 'observation' || !p.besvarad) continue;
    if (senast === null || p.besvarad > senast) senast = p.besvarad;
  }
  return senast;
}

/**
 * Så många dagar efter sista svaret räknas rundan som gången en annan dag än den avslutas.
 * Två dagar: att gå en runda över två dagar är normalt, veckor är det inte.
 */
export const GAMMAL_RUNDA_DAGAR = 2;

/**
 * Gicks rundan för länge sedan för att i dag ska kunna gälla som besöksdag?
 *
 * Avslutet sätter `klar` till NU, och rapportens huvud visar besöket som startad–klar (besokText). Avslutas Ulfsnäs i
 * dag står det "28 aug – 13 nov", vilket är sant men ser ut som en runda på elva veckor. Rundan får inget påhittat
 * datum — vi säger det i stället, i bekräftelsen, och låter den som avslutar veta vad rapporten kommer att visa.
 *
 * Jämförs som KALENDERDAGAR i lokal tid, av samma skäl som kortDatum: räknar man i UTC hamnar en kväll på fel dygn.
 */
export function arGammalRunda(sistaSvar: string | null, nu: Date): boolean {
  if (!sistaSvar) return false;
  const d = new Date(sistaSvar);
  if (Number.isNaN(d.getTime())) return false;
  const dag = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dagar = Math.round((dag(nu) - dag(d)) / 86400000);
  return dagar >= GAMMAL_RUNDA_DAGAR;
}
