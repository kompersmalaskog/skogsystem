// NÄR APPEN BÖRJADE FAKTURERA — ett datum, ett svar, ett ställe.
//
// VARFÖR: faktureringsvyn räknade fram arbete på allt som någonsin varit klart.
// I prod 2026-11-20 stod "45 saknar kontraktsnummer" (7 jan – 26 okt, 28 av dem
// inte ens upplagda som trakt) och "4 saknar traillertimmar" (alla fyra redan
// fakturerade). Knappen "Gå igenom dem" bad alltså om 49 uppgifter för jobb som
// fakturerades för månader sedan, utanför appen. Det som FAKTISKT skulle
// faktureras var fem novembertrakter — begravda under kön.
//
// Beslut Martin 2026-11-20: 1 november 2026. Allt som blev klart före det
// datumet är hanterat utanför appen och ska inte be om något.
//
// FACIT PROD 2026-11-20, mätt före och efter:
//   saknar kontraktsnummer   45 → 0   (alla daterade 7 jan – 26 okt)
//   saknar traillertimmar     4 → 0   (6 aug – 5 okt, alla redan fakturerade)
//   "Vad går inte att se?"    1 → 0   (Anders Ingemarsson RP ATA, 18 feb)
//   tystade totalt                50
//   klart att fakturera       5 → 5   (Vashult, Skälviken, Arvidstorp,
//                                      Krokshult, Edestad — alla november)
//   väntar på slutredovisning 6 → 6   (sep–okt, orörda)
//   saknar kundnummer        34 → 34  (ett beslut om BOLAGET, inte om trakten)
//
// VAD DATUMET STYR — och inte:
//   TYSTAR   "Vad ska du göra?" (kontraktsnummer, traillertimmar) och
//            "Vad går inte att se?" — arbete respektive en fråga vi inte kan
//            svara på, på trakter som redan är betalda.
//   RÖR INTE "Vad är klart att fakturera?" — där ligger pengar VI ska ha. Att
//            dölja en sådan trakt för att den är gammal vore att dölja en
//            obetald faktura, och det är fel håll: ingen ska bli lurad, inte
//            heller vi.
//   RÖR INTE "Vad väntar på slutredovisning?" — fakturan är skickad men Vidas
//            avräkning saknas. Sex trakter från sep–okt i prod. Det är pengar
//            vi väntar på, hur gamla de än är.
//   RÖR INTE "Vad är klart?" — historiken ligger kvar, ingenting försvinner ur
//            datan eller ur vyn.
//
// Ändra datumet HÄR. Ingen annan fil får ha ett eget startdatum.

/** Första dagen appen fakturerar. ISO, svensk dag. */
export const FAKTURERING_START = '2026-11-01'

const MANADER = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
]

/** "2026-11-01" → "1 november 2026". Ett oläsligt datum skrivs som det är. */
export function startText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const manad = MANADER[Number(m[2]) - 1]
  if (!manad) return iso
  return `${Number(m[3])} ${manad} ${m[1]}`
}

/** "1 november 2026" — så datumet står likadant överallt det nämns. */
export const FAKTURERING_START_TEXT = startText(FAKTURERING_START)

/**
 * Blev trakten klar före appen började fakturera?
 *
 * Utan avräkningsdatum är svaret NEJ: en trakt vi inte kan datera är inte
 * bevisligen gammal, och då tystar vi den inte. (`ej_paborjad` saknar datum —
 * de är nya, inte gamla.)
 */
export function hanteradUtanforAppen(
  avrakningsdatum: string | null | undefined,
  start: string = FAKTURERING_START,
): boolean {
  if (!avrakningsdatum) return false
  return avrakningsdatum < start
}
