// Notiser i hytten: vet appen att den är framme? Appen känner bara sitt EGET fönster — inget annat program, ingen Windows-API.
// Framme = fönstret är synligt OCH vald (föraren rörde appen senast). Allt annat — minimerad, helt täckt (Chrome räknar ett täckt fönster som dolt),
// synligt men ett annat program valt — är "borta" och ger Windows-notis. Hellre en notis för mycket än en för lite: osäker läsning = borta.

export type FonsterLage = 'framme' | 'borta';

export type FonsterIndata = { visibilityState?: string | null; harFokus?: boolean | null };

export function fonsterLage(i: FonsterIndata): FonsterLage {
  return i.visibilityState === 'visible' && i.harFokus === true ? 'framme' : 'borta';
}

/** Läser det riktiga fönstret (webbläsaren). Utan document (server) är läget "borta" — aldrig "framme" på gissning. */
export function lasFonsterLage(doc: Pick<Document, 'visibilityState' | 'hasFocus'> | undefined = typeof document !== 'undefined' ? document : undefined): FonsterLage {
  if (!doc) return 'borta';
  let harFokus = false;
  try { harFokus = doc.hasFocus(); } catch { /* saknas hasFocus → borta */ }
  return fonsterLage({ visibilityState: doc.visibilityState, harFokus });
}
