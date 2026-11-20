// SKARP START — datumgolvet under alla åtgärdsräknare, larm och automatiska
// skrivningar. Beslut av Martin 2026-09-09.
//
// Varför: appen byggdes om under tiden. Före 2026-08-01 räknades km på tre
// sätt, koordinater skrevs över, fälten km_kalla och brandrisk_beordrad fanns
// inte. Att jaga avvikelser i den datan är att leta fel i byggmaterial.
// Uppmätt i prod 2026-09-09: 873 arbetsdagar före golvet varav 735 obekräftade
// och 735 utan km; 122 dagar efter, 13 obekräftade.
//
// Vad golvet GÖR: klipper rullande fönster (7/14/30/60 dagar) underifrån så att
// ett vidgat fönster aldrig drar in gamla dagar; stoppar automatiska
// skrivningar (nattjobbets km, beräkna-vid-öppning, vilobrottsanalys,
// dagsslut-notiser) på dagar före golvet; tar bort åtgärdsprickar och larm.
//
// Vad golvet INTE rör (skulle skada): lönemotorn (löneperiod augusti =
// arbetsmånad JULI), km-summary per månad, vilobrottsrapporten till
// Arbetsmiljöverket (3 mån, lagkrav), årsövertiden mot 250 h-taket,
// objekt-/maskinuppföljningen (kumulativ), kalenderns läsbarhet, ledighet
// som löper över golvet, dupTrakt. Datan före golvet raderas ALDRIG.
//
// Form: konstant, inte env. En omimport är ett operativt handgrepp
// (MOM_SYNK_FRAN är därför env-överstyrbar); ett startdatum är ett beslut och
// ska kräva en deploy och en commit-text. Python-paret i gap_check.py
// (SKARP_START) bär samma värde — flyttas gränsen görs det ALLTID i par.

/** YYYY-MM-DD. Första dagen som räknas skarpt. */
export const SKARP_START = "2026-08-01";

/** Klipp ett fönsterstart mot golvet: `max(fran, SKARP_START)`. */
export function franGolv(fran: string): string {
  return fran > SKARP_START ? fran : SKARP_START;
}

/** True om datumet ligger före golvet — då varken räknas, larmas eller skrivs det automatiskt. */
export function foreSkarpStart(datum: string | null | undefined): boolean {
  return !!datum && datum < SKARP_START;
}
