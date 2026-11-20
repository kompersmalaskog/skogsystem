// VAD GÄLLER FÖR CERTIFIERINGEN — texterna i arket "PEFC – vad gäller?" / "FSC – vad gäller?" (ⓘ-kortet, Martin 2026-11-02).
// EN källa för texterna. Varje krav har en källa. Det som inte är kontrollerat mot standarden står som "kontrollera" och visas så — aldrig som ett påstått krav.
// Ändras ett krav: ändra här och ange källan.

export type CertTyp = 'PEFC' | 'FSC';

export interface CertKrav { rubrik: string; text: string; kalla: string; kontrollera?: true }
export interface CertInfo { typ: CertTyp; namn: string; krav: CertKrav[]; lankar: { text: string; url: string }[] }

const PEFC_STANDARD = 'PEFC SWE 002:2024';
const PEFC_URL = 'https://www.mellanskog.se/wp-content/uploads/2024/03/pefc-swe-002-skogsbruksstandard-2024.pdf';
const FSC_FAKTA_URL = 'https://se.fsc.org/sites/default/files/2021-11/Faktablad%20H%C3%A4nsynstr%C3%A4d.pdf';
const FSC_STANDARD_URL = 'https://se.fsc.org/sites/default/files/2021-10/FSC-standard%20fo%CC%88r%20skogsbruk%20i%20Sverige%20FSC-STD-SWE-03-2019.pdf';

export const CERT_INFO: Readonly<Record<CertTyp, CertInfo>> = {
  PEFC: {
    typ: 'PEFC', namn: 'PEFC',
    krav: [
      { rubrik: 'Naturvärdesträd', text: 'Alla naturvärdesträd lämnas för att leva, dö och multna.', kalla: `${PEFC_STANDARD} 3.4.4.1` },
      { rubrik: 'Minst 10 träd per hektar', text: 'I medeltal minst 10 träd per hektar lämnas alltid. Finns för få naturvärdesträd fylls det på med utvecklingsträd.', kalla: `${PEFC_STANDARD} 3.4.4.1` },
      { rubrik: 'Högstubbar och död ved', text: 'I medeltal minst 3 färska högstubbar, stockar, liggande eller ringbarkade träd per hektar. Finns redan 3 färska vindfällen eller snöbrott per hektar behövs inga fler. Ingen minsta höjd anges.', kalla: `${PEFC_STANDARD} 3.4.6.3` },
      { rubrik: 'Lövträd', text: 'Där det går ska minst 20 lövträd per hektar i medeltal stå kvar fram till föryngringsavverkning.', kalla: `${PEFC_STANDARD} 3.4.5.1.2` },
      { rubrik: 'Kantzoner', text: 'Lövträd och buskar gynnas i kantzoner mot vatten och bryn. Undvik spår i kant- och skyddszoner.', kalla: `${PEFC_STANDARD} 3.11` },
    ],
    lankar: [{ text: 'PEFC:s skogsbruksstandard', url: PEFC_URL }],
  },
  FSC: {
    typ: 'FSC', namn: 'FSC',
    krav: [
      { rubrik: 'Minst 10 träd per hektar', text: 'Vid föryngringsavverkning lämnas i genomsnitt minst tio träd per hektar.', kalla: 'FSC faktablad Hänsynsträd (6.6.1–6.6.3)' },
      { rubrik: 'Större hyggen', text: 'Över 4 ha i södra Sverige: träd i avsättningar och kantzoner räknas inte in i de tio. Ingen punkt får ligga mer än 70 m från ett hänsynsobjekt eller hyggeskant.', kalla: 'FSC faktablad Hänsynsträd' },
      { rubrik: 'Högstubbar', text: 'Minst 3 högstubbar per hektar, samma som PEFC.', kalla: 'Kompersmåla Skogs praxis (Martin 2026-11-02)' },
    ],
    lankar: [{ text: 'FSC faktablad Hänsynsträd', url: FSC_FAKTA_URL }, { text: 'FSC-standarden för Sverige', url: FSC_STANDARD_URL }],
  },
};

/** Vilka certifieringar trakten har, ur objekt.cert ("FSC PEFC", "PEFC" …). "Ej certifierad", "None" och tomt = inga. */
export function certTyper(cert: string | null | undefined): CertTyp[] {
  const t = String(cert ?? '').toUpperCase();
  const ut: CertTyp[] = [];
  if (/(^|[^A-Z])PEFC([^A-Z]|$)/.test(t)) ut.push('PEFC');
  if (/(^|[^A-Z])FSC([^A-Z]|$)/.test(t)) ut.push('FSC');
  return ut;
}
