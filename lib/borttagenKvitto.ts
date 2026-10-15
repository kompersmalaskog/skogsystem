// "Symbol borttagen · Ångra": en borttagen markering försvinner direkt, och en rad nertill ger tillbaka den i 5 s (iOS-stil, ingen bekräftelsedialog).
// Rena regler — själva raderingen går som förut genom synkkön (en grav i lagret), Ångra lägger markeringen tillbaka i minnet och synken räknar den
// som NY (en ny ändring ersätter graven; fotot ligger kvar i Storage och följer med i `photoPath`).

export { KVITTO_MS as BORTTAGEN_MS } from './snabbMarkering';

type Mark = { id: unknown; isLine?: boolean; isZone?: boolean; isMarker?: boolean; lineType?: string };

/** Vad som togs bort, i förarens ord: Symbol / Linje / Yta. */
export function borttagenText(m: Mark | null | undefined): string {
  if (m?.isLine) return 'Linje borttagen';
  if (m?.isZone) return 'Yta borttagen';
  return 'Symbol borttagen';
}

/** Ger tillbaka en borttagen markering. Finns ett id redan (dubbeltryck på Ångra) läggs den inte dit två gånger. */
export function aterstallMarkering<T extends { id: unknown }>(markers: readonly T[], borttagen: T): T[] {
  if (markers.some((m) => String(m.id) === String(borttagen.id))) return [...markers];
  return [...markers, borttagen];
}

/** Fotot kom upp (ligger i Storage) medan markeringen väntar på Ångra: den borttagna markeringen får photoPath/photoTs, så Ångra ger tillbaka den med fotot. */
export function medUppladdatFoto<T extends { id: unknown }>(borttagen: T, foto: { markerId: string; sokvag: string; skapad: number }): T {
  if (String(borttagen.id) !== foto.markerId) return borttagen;
  return { ...borttagen, photoPath: foto.sokvag, photoTs: foto.skapad, photoData: undefined };
}
