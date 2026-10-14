// SYNTETISKA traktdirektiv-texter i den form unpdf ger (mergePages). De är byggda efter beskrivningen av Skälviken RP J-Hus -25 (VO 11161397)
// och sidhuvudet som parsern redan läser ("Traktnr Kontraktsnr Ursprung Datum <värden>"). De är INTE utdrag ur en riktig fil — den
// ligger i trakt-inbox, som den här miljön inte når. Rubrikraden och ordningen på kolumnvärdena är därför det som återstår att
// bekräfta mot en riktig fil (varningen vid saknat Ursprung citerar råtexten just för det).

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
    o.arbetsform ? `Arbetsform ${o.arbetsform}` : '',
    'Markägare VIDA ANNA TESTSSON anna@example.se Inköpare Test Person',
    'FSC PEFC',
    'Total 3,6 ha 950 m3fub',
    o.extra ?? '',
  ].filter(Boolean).join('\n');
}
