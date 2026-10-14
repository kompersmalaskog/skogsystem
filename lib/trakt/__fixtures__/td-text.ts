// Traktdirektiv-texter i den form unpdf ger (mergePages), byggda efter Skälviken RP J-Hus -25 (VO 11161397). Två rader är hämtade ordagrant ur
// den RIKTIGA filens utläsning (Martins test av #762) och får inte "förbättras":
//   sidhuvudet   "883966 969670 (anges vid fakturering) Rotpost 2026-04-01"            (värdet Ursprung står före datumet)
//   Arbetsform   "Fastighetsbeteckning Cert ArbetsformLKF SKS-anmält:"                  (rubrikrad; unpdf klistrar ihop Arbetsform och LKF)
//                "JOHANNISHUS 1:2 FSC PEFC 108101 Föryngringsavverkning"                (värdet står sist på raden UNDER rubrikraden)
// Resten av texten är syntetisk (markägare, volym m.m.).

export function tdText(o: { ursprung?: string | null; arbetsform?: string | null; kontrakt?: string | null; namn?: string; vo?: string; extra?: string } = {}): string {
  const namn = o.namn ?? 'Skälviken RP J-Hus- 25';
  const vo = o.vo ?? '11161397';
  const kontrakt = o.kontrakt === undefined ? '972548' : o.kontrakt;
  // Rubrikrad + värden i kolumnordning. Utan ursprung (null) saknas värdet helt; '' = tom kolumn.
  const huvud = `Traktnr Kontraktsnr Ursprung Datum 887818 ${kontrakt ? kontrakt + ' ' : ''}(anges vid fakturering) ${o.ursprung ?? ''} ${o.ursprung === null ? '' : '2026-09-01'}`.replace(/\s+/g, ' ');
  const huvudUtanUrsprungsrubrik = `Traktnr Kontraktsnr Datum 887818 ${kontrakt ?? ''} 2026-09-01`;
  return [
    `Traktdirektiv - ${namn} Traktnr 887818`,
    o.ursprung === null ? huvudUtanUrsprungsrubrik : huvud,
    `Virkesorder ${vo}`,
    // arbetsform: undefined/null = filen har ingen Arbetsform-kolumn; en sträng (även '') = riktig rubrikrad + raden under med värdet sist.
    ...(typeof o.arbetsform === 'string'
      ? ['Fastighetsbeteckning Cert ArbetsformLKF SKS-anmält:', `JOHANNISHUS 1:2 FSC PEFC 108101 ${o.arbetsform}`.trim()]
      : []),
    'Markägare VIDA ANNA TESTSSON anna@example.se Inköpare Test Person',
    'FSC PEFC',
    'Total 3,6 ha 950 m3fub',
    o.extra ?? '',
  ].filter(Boolean).join('\n');
}
