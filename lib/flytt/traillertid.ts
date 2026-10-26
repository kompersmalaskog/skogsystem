// Traillertiden för en flytt över 3 mil — tiden som faktureras på artikel 3 ("Traillerflytt", per timme).
//
// REGEL A (Martin 2026-10-24): lastbilens runda räknas från att bilen LÄMNAR (rundans start) tills den
// är TILLBAKA (rundans slut), och delas vid varje lossning:
//   - första flytten:   rundans start      → dess lossning
//   - nästa flytt:      förra lossningen   → dess lossning
//   - sista flytten:    förra lossningen   → rundans slut (hemresan följer med den sista)
// Delarna blir tillsammans exakt hela rundan — ingen tid försvinner, ingen räknas två gånger.
// Är en del en flytt som INTE faktureras på tid (under 3 mil, service) faktureras den delen inte på tid;
// hemresan följer den sista flytten även då (Martin valde A framför att flytta den till en annan kund).
//
// LASTNING HEMMA (Martin 2026-10-26): rundan börjar när bilen LÄMNAR basen. Står maskinen vid basen lastas den
// innan rundan börjar, och den tiden räknades inte (Wisent 26 okt: bilen startad 11:54, rundan 12:09). Därför
// börjar den första flyttens tid vid flyttens egen starttid när den ligger FÖRE rundans start — för en
// automatisk flytt är det när bilen startades före lastningen (skapa_flytt_ur_lass). Hämtas maskinen ute har
// bilen redan åkt och rundans start gäller som förut. Högst LASTNING_FORE_MAX_MIN före rundan: en starttid
// längre bak är inte en lastning (en flytt registrerad kvällen före, 10 aug), och då gäller rundans start.
//
// Tiden är ett FÖRSLAG. Den skrivs till fakturaunderlag_flytt.traillertimmar först när en människa
// godkänner flytten eller trycker Spara i arket — aldrig tyst (rundans tider är bara så bra som förarens
// tryck: glömd "Kör hem" ger för lång tid). Saknas något går förslaget inte att räkna och det sägs.
//
// I APPEN visas tiden som "3 h 49 min" — aldrig decimaler. Decimalerna (3,81) finns bara på fakturan
// (`timmarForFaktura`): minuterna är heltal hela vägen och blir timmar med två decimaler sist, samma
// regel som OB.

export interface TidRunda {
  start: string | null;
  slut: string | null;               // null = rundan pågår
  /** 'cron_sakerhetsnat' = stängd av nattjobbet för att "Kör hem" aldrig trycktes. */
  autoAv: string | null;
}

export interface TidBen {
  id: string;                        // maskin_flytt.id
  sluttid: string | null;            // lossningen
  /** När flytten började (maskin_flytt.starttid). Bara den FÖRSTA flyttens starttid används, och bara när den ligger före rundans start. */
  starttid?: string | null;
}

export type TidForslag =
  | {
      lage: 'ok';
      min: number;                   // hela minuter
      fran: string; till: string;    // ISO
      /** true = första flytten i rundan: tiden börjar när bilen åkte. */
      forst: boolean;
      /** true = sista flytten i rundan: tiden slutar när bilen är tillbaka. */
      medHem: boolean;
      /** true = maskinen lastades innan bilen lämnade basen: tiden börjar vid flyttens start, inte rundans. */
      lastningFore: boolean;
      varning: string | null;
    }
  | { lage: 'saknas'; orsak: string };

/** Över så här många minuter säger arket "kolla tiden" (en flytt tar sällan mer; en glömd runda gör det). */
export const LANG_TID_MIN = 6 * 60;

/** Så långt före rundans start kan en lastning hemma börja och ändå räknas. */
export const LASTNING_FORE_MAX_MIN = 60;

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

export function traillertid(flyttId: string, runda: TidRunda, ben: readonly TidBen[]): TidForslag {
  if (!runda.start || !Number.isFinite(ms(runda.start))) return { lage: 'saknas', orsak: 'Rundan saknar starttid' };
  if (!runda.slut) return { lage: 'saknas', orsak: 'Rundan pågår fortfarande' };
  if (!ben.some(b => b.id === flyttId)) return { lage: 'saknas', orsak: 'Flytten hittades inte i rundan' };
  if (ben.some(b => !Number.isFinite(ms(b.sluttid)))) return { lage: 'saknas', orsak: 'En flytt i rundan saknar lossningstid' };

  const ordnade = [...ben].sort((a, b) => ms(a.sluttid) - ms(b.sluttid));
  const i = ordnade.findIndex(b => b.id === flyttId);
  const sista = i === ordnade.length - 1;
  const egenStart = ms(ordnade[i].starttid ?? null);
  const lastningFore = i === 0 && Number.isFinite(egenStart) && egenStart < ms(runda.start)
    && ms(runda.start) - egenStart <= LASTNING_FORE_MAX_MIN * 60000;
  const fran = lastningFore ? ordnade[i].starttid! : i === 0 ? runda.start : ordnade[i - 1].sluttid!;
  const till = sista ? runda.slut : ordnade[i].sluttid!;
  const min = Math.round((ms(till) - ms(fran)) / 60000);
  if (!Number.isFinite(min) || min <= 0) return { lage: 'saknas', orsak: 'Rundans tider går inte ihop' };

  const varning = runda.autoAv === 'cron_sakerhetsnat'
    ? 'Rundan avslutades inte i appen – kolla tiden'
    : min > LANG_TID_MIN ? 'Över 6 timmar – kolla att rundan avslutades i tid' : null;
  return { lage: 'ok', min, fran, till, forst: i === 0, medHem: sista, lastningFore, varning };
}

/** Minuter → timmar på fakturan, två decimaler (217 min → 3,62). Bara för fakturan och databasen. */
export function timmarForFaktura(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}

/** Timmar ur databasen → hela minuter (3,62 → 217). */
export function minFranTimmar(timmar: number): number {
  return Math.round(timmar * 60);
}

/** "3 h 49 min", "45 min", "2 h". Så står tiden överallt i appen. */
export function fmtTid(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
