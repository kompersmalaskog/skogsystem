// Delad modell och hjälpare för utbildningsvyerna (/utbildning/**).
//
// VIKTIGT: status och utgångsdatum räknas ALDRIG ut här — de kommer färdiga
// från databasvyn `utbildning_status`. Filen mappar bara ett GIVET status-värde
// till färg/etikett och delar upp redan hämtade rader (ren presentation).
//
// Vyn har ingen egen palett. Färg, typsnitt, avstånd och form kommer ur
// lib/design/tokens, som resten av appen.

import { FARG } from './design/tokens';

export type Kravtyp = 'lag' | 'certifiering' | 'bestallare';
export type UtbStatus = 'giltig' | 'gar_ut_snart' | 'utgangen' | 'saknas';

// Tabell: utbildning_typ
export type UtbildningTyp = {
  id: string;
  namn: string;
  kravtyp: Kravtyp;
  giltighet_manader: number | null; // null = ingen utgång
  galler_alla: boolean;
  beskrivning: string | null;
  anteckning: string | null;
  aktiv: boolean;
  skapad: string;
  uppdaterad: string;
};

// Vy: utbildning_status (en rad per medarbetare × utbildning som gäller hen)
export type UtbildningStatusRad = {
  medarbetare_id: string;
  medarbetare_namn: string | null;
  utbildning_typ_id: string;
  utbildning_namn: string;
  kravtyp: Kravtyp;
  giltighet_manader: number | null;
  bevis_id: string | null;
  genomford_datum: string | null;
  pdf_url: string | null;
  giltig_till: string | null;
  status: UtbStatus;
};

export type Medarbetare = {
  id: string;
  namn: string | null;
  roll?: string | null;
  aktiv?: boolean | null;
};

// ---- Status: etikett och färg ur FARG ----

export const STATUS_META: Record<UtbStatus, { label: string; farg: string }> = {
  giltig: { label: 'Giltig', farg: FARG.gron },
  gar_ut_snart: { label: 'Går ut snart', farg: FARG.orange },
  utgangen: { label: 'Utgången', farg: FARG.rod },
  saknas: { label: 'Saknas', farg: FARG.rod },
};

export const KRAVTYP_META: Record<Kravtyp, { label: string; kort: string }> = {
  lag: { label: 'Lagkrav', kort: 'Lag' },
  certifiering: { label: 'Certifiering', kort: 'Cert' },
  bestallare: { label: 'Beställarkrav', kort: 'Beställare' },
};

export const KRAVTYP_ORDNING: Kravtyp[] = ['lag', 'certifiering', 'bestallare'];

/** Ordningen är konsekvensen, inte bokstavsordningen: ett lagkrav som saknas
 *  kostar sanktionsavgift per anställd, ett beställarkrav kostar ett jobb. */
export function kravtypRang(k: Kravtyp): number {
  const i = KRAVTYP_ORDNING.indexOf(k);
  return i === -1 ? KRAVTYP_ORDNING.length : i;
}

/** Är utbildningen IGÅNG — vet appen vilka den gäller?
 *
 *  `utbildning_status` ger en rad per person utbildningen gäller (alla i
 *  företaget när `galler_alla`, annars de som står i `utbildning_krav`). NOLL
 *  rader betyder därför inte "allt är bra" utan "ingen är vald": utbildningen
 *  gäller ingen och kan varken saknas eller gå ut. Räknas den som "i ordning"
 *  påstår vyn att ett lagkrav är uppfyllt när ingen ens är kopplad till det. */
export function arIgang(rader: unknown[]): boolean {
  return rader.length > 0;
}

/** Kräver statusen att någon gör något? Saknas och utgången är lika illa — båda
 *  betyder att personen inte får köra. Går ut snart är en förvarning. */
export function kraverAtgard(s: UtbStatus): boolean {
  return s === 'utgangen' || s === 'saknas' || s === 'gar_ut_snart';
}

// Prioritet för att välja den "värsta" statusen i en aggregerad rad.
// (Aggregering av givna statusvärden — inte beräkning av status.)
const STATUS_PRIORITET: Record<UtbStatus, number> = {
  utgangen: 3,
  saknas: 2,
  gar_ut_snart: 1,
  giltig: 0,
};

export function varstaStatus(statusar: UtbStatus[]): UtbStatus | null {
  if (statusar.length === 0) return null;
  return statusar.reduce((varst, s) =>
    STATUS_PRIORITET[s] > STATUS_PRIORITET[varst] ? s : varst
  );
}

/** Delar redan hämtade rader i "kräver något" och "i ordning", värst först.
 *  Ingen beräkning — bara sortering av givna statusvärden. */
export function delaPaAtgard<R extends { status: UtbStatus }>(rader: R[]): { atgarda: R[]; klara: R[] } {
  const atgarda = rader
    .filter((r) => kraverAtgard(r.status))
    .sort((a, b) => STATUS_PRIORITET[b.status] - STATUS_PRIORITET[a.status]);
  const klara = rader.filter((r) => !kraverAtgard(r.status));
  return { atgarda, klara };
}

export function formatDatum(d: string | null): string {
  if (!d) return '';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('sv-SE');
}

// Namn att visa när medarbetare_namn saknas.
export function visaNamn(namn: string | null | undefined): string {
  return namn && namn.trim() ? namn : 'Namnlös';
}

// ---- Presentation (ren formatering av redan hämtad data) ----

const MANAD_LANG = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

// "vart 5:e år" / "ingen utgång" / "vart 18 mån" — räknar om jämna år.
export function fornyelseText(giltighet_manader: number | null): string {
  if (giltighet_manader == null) return 'ingen utgång';
  if (giltighet_manader % 12 === 0) return `vart ${giltighet_manader / 12}:e år`;
  return `vart ${giltighet_manader} mån`;
}

// "gäller alla" / "4 personer"
export function omfattningText(galler_alla: boolean, antalPersoner: number): string {
  if (galler_alla) return 'gäller alla';
  // "0 personer" läses som en siffra bland andra. Att ingen är vald är inte en
  // nolla — det är att utbildningen inte är igång, och det ska stå i ord.
  if (antalPersoner === 0) return 'ingen vald';
  return `${antalPersoner} ${antalPersoner === 1 ? 'person' : 'personer'}`;
}

/** "mars 2026" — månad och år, för ett utgångsdatum. */
export function manadAr(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${MANAD_LANG[d.getMonth()]} ${d.getFullYear()}`;
}

// "3 mars"
export function dagManad(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MANAD_LANG[d.getMonth()]}`;
}

/** Datum som en rad läser det: "19 oktober", med år bara när det inte är i år. */
export function datumMedAr(dateStr: string | null, nu: Date = new Date()): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const dag = dagManad(dateStr);
  return d.getFullYear() === nu.getFullYear() ? dag : `${dag} ${d.getFullYear()}`;
}

/** Hela månader från `nu` till `datum`, nedåt. Negativt när datumet passerat. */
export function manaderTill(datum: string, nu: Date = new Date()): number | null {
  const d = new Date(datum);
  if (isNaN(d.getTime())) return null;
  const dagar = Math.floor((d.getTime() - nu.getTime()) / 86_400_000);
  return Math.floor(dagar / 30.44);
}

/** Talet högst upp när inget behöver åtgärdas: tiden till nästa utgång.
 *  Saknas giltighetsdatum helt (allt utan utgång) finns inget tal att visa. */
export function tidTillNasta(
  rader: { giltig_till: string | null }[],
  nu: Date = new Date()
): { tal: string; under: string } | null {
  const datum = rader
    .map((r) => r.giltig_till)
    .filter((d): d is string => !!d)
    .sort();
  const nasta = datum[0];
  if (!nasta) return null;
  const man = manaderTill(nasta, nu);
  if (man == null) return null;
  if (man >= 24) return { tal: `${Math.floor(man / 12)} år`, under: 'tills nästa går ut' };
  if (man >= 1) return { tal: `${man} mån`, under: 'tills nästa går ut' };
  return { tal: 'Snart', under: 'går nästa ut' };
}

/** "5 utbildningar är i ordning" / "1 utbildning är i ordning" */
export function iOrdningText(antal: number, ord: 'utbildning' | 'medarbetare' = 'utbildning'): string {
  const flertal = ord === 'utbildning' ? 'utbildningar' : 'medarbetare';
  return `${antal} ${antal === 1 ? ord : flertal} är i ordning`;
}
