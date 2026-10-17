// Fakturerbar-regeln för en flytt — och vad en ändrad typ gör med fakturaunderlaget.
//
// TVÅ implementationer, ett test. Regeln måste hållas där datan ändras: databasen räknar om fakturerbar vid
// varje rättning (`fakturerbar_for` i migration 20261015170000) så en klient som skickar fel flagga aldrig kan
// lämna datan i fel läge, och appen behöver samma regel för att säga vad som kommer hända INNAN man sparar och
// för förarflödet som sätter flaggan när en flytt avslutas. De två hålls ihop av `__fixtures__/fakturerbar_tabell.json`:
// TS-testet kör tabellen mot den här filen, och migrationens kvitto kör samma tabell mot SQL-funktionen (ska ge
// 0 rader). `fakturerbar.test.ts` vaktar att migrationen innehåller exakt tabellens rader.

export type FlyttTyp = 'produktion' | 'service' | 'kunduppdrag' | 'annat';

export const FLYTT_TYPER: readonly FlyttTyp[] = ['produktion', 'service', 'kunduppdrag', 'annat'];
export const FLYTT_TYP_ORD: Record<FlyttTyp, string> = { produktion: 'Produktion', service: 'Service', kunduppdrag: 'Kunduppdrag', annat: 'Annat' };

/** km-gränsen för en produktionsflytt (3 mil). */
export const FAKTURERBAR_KM = 30;

/**
 * produktion = km-gränsen, service = aldrig (egen kostnad), kunduppdrag = alltid (vi kör åt någon annan),
 * annat och okänt = aldrig automatiskt. Saknat km (null) räknas som 0 — aldrig fakturerbart på en gissning.
 */
export function beraknaFakturerbar(typ: string, flyttKm: number | null): boolean {
  if (typ === 'produktion') return (flyttKm ?? 0) >= FAKTURERBAR_KM;
  if (typ === 'kunduppdrag') return true;
  return false;
}

/** Underlagets läge så som formuläret känner det (läst av admin). */
export interface UnderlagLage {
  status: 'aktiv' | 'struken';
  godkand: boolean;
  fakturerad: boolean;
  /** Strukits av en rättning av just den här flytten (då kan samma rad återställas). */
  strukenAvRattning: boolean;
  strykAnledning: string | null;
}

export type KonsekvensAtgard = 'ingen' | 'skapas' | 'stryks' | 'aterstalls' | 'foljer' | 'last' | 'vagras';

export interface Konsekvens {
  atgard: KonsekvensAtgard;
  /** Meningen som står under formuläret INNAN man sparar. */
  text: string;
  /** Rättningen går inte att spara (låst eller vägrad av databasen). */
  blockerar: boolean;
}

/**
 * Vad som händer med fakturaunderlaget om flytten rättas till `nyTyp`. Speglar `ratta_flytt` i databasen fall för
 * fall (provat i Postgres). `kopiorAndras` = maskin, från, till eller kund ändras (underlagets kopior följer då med).
 */
export function underlagKonsekvens(
  flytt: { km: number | null }, nyTyp: string, underlag: UnderlagLage | null, kopiorAndras: boolean,
): Konsekvens {
  const nyFakt = beraknaFakturerbar(nyTyp, flytt.km);

  if (underlag?.fakturerad) return { atgard: 'last', blockerar: true, text: 'Flytten är fakturerad och går inte att rätta.' };
  if (underlag?.godkand) return { atgard: 'last', blockerar: true, text: 'Flytten är godkänd för fakturering. Lämna tillbaka den till Att godkänna för att kunna rätta den.' };

  if (!nyFakt) {
    if (underlag && underlag.status === 'aktiv') {
      return { atgard: 'stryks', blockerar: false, text: 'Flytten är inte längre fakturerbar — dess underlag stryks (märkt med din anledning) och försvinner ur Att godkänna.' };
    }
    return { atgard: 'ingen', blockerar: false, text: 'Inget ändras i faktureringen.' };
  }

  if (!underlag) return { atgard: 'skapas', blockerar: false, text: 'Flytten blir fakturerbar och hamnar under Att godkänna.' };

  if (underlag.status === 'struken') {
    if (underlag.strukenAvRattning) return { atgard: 'aterstalls', blockerar: false, text: 'Flytten blir fakturerbar igen — det underlag som stroks vid förra rättningen återställs under Att godkänna.' };
    return {
      atgard: 'vagras', blockerar: true,
      text: `Underlaget är struket i faktureringen${underlag.strykAnledning ? ` (${underlag.strykAnledning})` : ''}. Flytten går inte att göra fakturerbar igen härifrån.`,
    };
  }

  return kopiorAndras
    ? { atgard: 'foljer', blockerar: false, text: 'Flytten ligger kvar under Att godkänna — dess underlag uppdateras med det du rättar.' }
    : { atgard: 'ingen', blockerar: false, text: 'Inget ändras i faktureringen.' };
}
