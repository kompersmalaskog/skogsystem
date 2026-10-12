// Kostnadsställe per maskin OCH DATUM.
//
// Kostnadsstället är maskinens identitet i bokföringen, och det har bytt:
// Scorpionen låg på M13 till mars 2026 och på SCO därefter. Ett uppslag utan
// datum svarar självsäkert fel om det förflutna — bygger man om ett underlag
// för januari hamnar SCO på en rad som bokfördes på M13.
//
// Två Rottne delade dessutom M12. Först med datum går de att skilja åt:
// R64101 till och med 2026-03-11, R64428 från 2026-03-12.
//
// NULL ÄR ETT SVAR. Saknas kostnadsställe för dagen returneras null, och
// fakturaraden ska visa det som saknat — aldrig falla tillbaka på "den enda
// raden för maskinen". Det var precis den fallbacken som gjorde
// ovrigtKrPerM3 till en tyst lögn innan #575.

import { isValidOn } from '@/lib/ekonomi/acord';

export type KostnadsstalleRad = {
  maskin_id: string;
  kostnadsstalle_kod: string;
  giltig_fran: string | null;
  giltig_till: string | null;
};

/**
 * Kostnadsstället som gällde för maskinen på datumet.
 * null = ingen giltig rad. Det är ett TILLSTÅND som ska ytas, inte lagas.
 */
export function kostnadsstalleFor(
  maskinId: string,
  datum: string,
  rader: KostnadsstalleRad[] | null | undefined,
): string | null {
  const traff = (rader || []).filter(
    r => r.maskin_id === maskinId && isValidOn(datum, r.giltig_fran, r.giltig_till),
  );
  // Två giltiga rader samtidigt är ett datafel som migrationen 20260926
  // avbryter på. Skulle det ändå hända ska det INTE lösas med "ta den
  // första" — då döljer uppslaget felet i stället för att visa det.
  if (traff.length !== 1) return null;
  return traff[0].kostnadsstalle_kod;
}

/**
 * OMVÄNDA uppslaget: vilken maskin ägde kostnadsstället på datumet?
 * Det är resultatrapportens fråga — varje Fortnox-RADS transaktionsdatum
 * avgör vilken maskin dess kostnad hörde till DÅ. M12 var R64101 t.o.m.
 * 2026-03-11 och R64428 från 2026-03-12; utan datum smetas januari-
 * kostnader på fel maskin.
 * null = ingen maskin ägde koden den dagen (eller två samtidigt — samma
 * datafel som ovan: ytas, gissas aldrig). Raden ska då redovisas under
 * "övriga kostnadsställen", inte tappas.
 */
export function maskinForKostnadsstalle(
  kod: string,
  datum: string,
  rader: KostnadsstalleRad[] | null | undefined,
): string | null {
  const traff = (rader || []).filter(
    r => r.kostnadsstalle_kod === kod && isValidOn(datum, r.giltig_fran, r.giltig_till),
  );
  if (traff.length !== 1) return null;
  return traff[0].maskin_id;
}

/**
 * Som maskinForKostnadsstalle, men en kod som BARA EN maskin någonsin haft
 * ägs av den maskinen även utanför datumfönstret. Det är INGEN gissning —
 * det finns ingen annan kandidat, och luckan är ett registreringsglapp:
 * M6-rader 1 jan när mappningen registrerades 9 jan, SCO använt i
 * bokföringen redan i januari fast koden registrerades 9 mars. Utan
 * fallbacken blev de raderna falska "övriga"-rader med Fortnox-beskrivningen
 * som namn — såg ut som dubblettmaskiner i resultatvyn.
 * Koder med FLERA ägare genom tiderna (M12: R64101 → R64428) avgörs
 * fortfarande STRIKT av datumet — där vore fallbacken exakt den smetning
 * som #611 rättade.
 */
export function maskinForKostnadsstalleEntydig(
  kod: string,
  datum: string,
  rader: KostnadsstalleRad[] | null | undefined,
): string | null {
  const perDatum = maskinForKostnadsstalle(kod, datum, rader);
  if (perDatum) return perDatum;
  const agare = new Set((rader || []).filter(r => r.kostnadsstalle_kod === kod).map(r => r.maskin_id));
  return agare.size === 1 ? Array.from(agare)[0] : null;
}

/** true när maskinen har flera giltiga rader samma dag — ett datafel att yta. */
export function harKrockandeKostnadsstalle(
  maskinId: string,
  datum: string,
  rader: KostnadsstalleRad[] | null | undefined,
): boolean {
  return (rader || []).filter(
    r => r.maskin_id === maskinId && isValidOn(datum, r.giltig_fran, r.giltig_till),
  ).length > 1;
}
