// Kan rundan avslutas? Ren funktion: sidan (app/egenkontroll/[objektId]/page.tsx) bygger knappens text och spärr på den.
// Låg förr i den gamla serie-filen (serien är borta sedan ramen, PR 4); räkningen är oförändrad.

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
