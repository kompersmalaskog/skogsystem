// Kartlagrens utseende i A4-rapporten: EN tabell som bade modellen (teckenforklaringen) och PDF-ritaren (linjer, ytor, symboler) laser,
// sa att forklaringen aldrig kan saga nagot annat an det som ritas. Ren data - inget React, ingen PDF.
//
// FARG AR ALDRIG ENSAM: varje linje har en egen bredd/streckning, och symboler bar sitt NAMN bredvid sig pa kartan. En rapport skrivs ofta ut
// i svartvitt. Farger ur appens LEGEND (lib/kartstil.ts) sa att kartan i rapporten och kartan i appen kanns igen.

export type KartMarkering =
  /** `backvag` = vägen är en backväg (lib/backvag): dubbla tvärstreck ritas i den änden. Sätts bara på en väg (basväg, stickväg). */
  | { slag: 'linje'; typ: string; punkter: { lat: number; lng: number }[]; backvag?: 'start' | 'slut' }
  | { slag: 'zon'; typ: string; punkter: { lat: number; lng: number }[] }
  | { slag: 'symbol'; typ: string; plats: { lat: number; lng: number } };

export type MarkeringStil = {
  /** Stabil nyckel - teckenforklaringen har en rad per nyckel som finns. */
  nyckel: string;
  etikett: string;
  farg: string;
  /** Linjebredd i pt (linjer och ytornas kant). */
  bredd: number;
  streck: number[] | null;
};

const LINJER: Record<string, Omit<MarkeringStil, 'nyckel'>> = {
  mainRoad: { etikett: 'Basväg', farg: '#3b82f6', bredd: 2.2, streck: null },
  ditch: { etikett: 'Dike', farg: '#0e7490', bredd: 0.9, streck: [3, 2] },
  stonewall: { etikett: 'Stenmur', farg: '#5f5e5a', bredd: 1.6, streck: [2, 1] },
  nature: { etikett: 'Naturvård (linje)', farg: '#30d158', bredd: 1.4, streck: [4, 2] },
  trail: { etikett: 'Stig', farg: '#8e8e93', bredd: 0.9, streck: [2, 2] },
};

const ZONER: Record<string, Omit<MarkeringStil, 'nyckel'>> = {
  protected: { etikett: 'Hänsynsyta', farg: '#30d158', bredd: 1, streck: null },
  fornlamning: { etikett: 'Fornlämning', farg: '#b45309', bredd: 1, streck: [3, 2] },
  culture: { etikett: 'Kulturmiljö', farg: '#f59e0b', bredd: 1, streck: [3, 2] },
  wet: { etikett: 'Blöt zon', farg: '#3b82f6', bredd: 1, streck: [1.5, 1.5] },
  steep: { etikett: 'Brant', farg: '#a855f7', bredd: 1, streck: [1.5, 1.5] },
};

const NATUR = '#30d158', KULTUR = '#f59e0b', FARA = '#ff453a', NEUTRAL = '#3a3a3c';
const SYMBOLER: Record<string, Omit<MarkeringStil, 'nyckel' | 'bredd' | 'streck'>> = {
  eternitytree: { etikett: 'Evighetsträd', farg: NATUR },
  highstump: { etikett: 'Högstubbar', farg: NATUR },
  naturecorner: { etikett: 'Naturvårdsyta', farg: NATUR },
  culturemonument: { etikett: 'Kulturlämning', farg: KULTUR },
  culturestump: { etikett: 'Kulturstubbe', farg: KULTUR },
  warning: { etikett: 'Varning', farg: FARA },
  steep: { etikett: 'Brant', farg: FARA },
  wet: { etikett: 'Blöt fläck', farg: FARA },
  bridge: { etikett: 'Överfart', farg: NEUTRAL },
  corduroy: { etikett: 'Kavelbro', farg: NEUTRAL },
  landing: { etikett: 'Avlägg', farg: NEUTRAL },
  turningpoint: { etikett: 'Vändplats', farg: NEUTRAL },
  brashpile: { etikett: 'Rishög', farg: NEUTRAL },
  manualfelling: { etikett: 'Manuell fällning', farg: FARA },
  firewood: { etikett: 'Ved', farg: NEUTRAL },
};

/** Vag-linjer (sideRoadXxx) har fargen i namnet - men ritas i en egen bredd/streckning sa farg inte ar ensam. */
function vagStil(typ: string): Omit<MarkeringStil, 'nyckel'> | null {
  const farg = typ.endsWith('Red') ? '#ff453a' : typ.endsWith('Yellow') ? '#d99a00' : typ.endsWith('Blue') ? '#3b82f6' : null;
  if (!farg) return null;
  if (typ.startsWith('sideRoad')) return { etikett: 'Stickväg', farg, bredd: 1.2, streck: [3, 1.5] };
  return null;
}

/**
 * Stilen for en markering. Okand typ blir "Ovrigt" i neutral grå - ritad och namngiven, aldrig dold och aldrig en gissad typ.
 * null = ska inte ritas som markering (traktgransen har ett eget lager).
 */
export function markeringsStil(slag: KartMarkering['slag'], typ: string): MarkeringStil | null {
  if (slag === 'linje') {
    if (typ === 'boundary') return null;
    const s = LINJER[typ] ?? vagStil(typ);
    return s ? { nyckel: `linje:${typ}`, ...s } : { nyckel: 'linje:ovrigt', etikett: 'Övrig linje', farg: '#8e8e93', bredd: 1, streck: [2, 2] };
  }
  if (slag === 'zon') {
    const s = ZONER[typ];
    return s ? { nyckel: `zon:${typ}`, ...s } : { nyckel: 'zon:ovrigt', etikett: 'Övrig yta', farg: '#8e8e93', bredd: 1, streck: [2, 2] };
  }
  const s = SYMBOLER[typ];
  return s ? { nyckel: `symbol:${typ}`, ...s, bredd: 1, streck: null } : { nyckel: 'symbol:ovrigt', etikett: 'Övrig symbol', farg: NEUTRAL, bredd: 1, streck: null };
}

/** Stammolnets, traktgransens och hyttsparets fasta stilar. */
export const STAMMOLN_FARG = '#d32f2f';
export const TRAKTGRANS_FARG = '#111111';
export const HYTTSPAR_FARG = { skordare: '#bf5af2', skotare: '#34c759' } as const;
export const HYTTSPAR_ETIKETT = { skordare: 'Skördarens spår', skotare: 'Skotarens spår' } as const;
