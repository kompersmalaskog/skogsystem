// SYMBOLERNA — EN källa för hur en markeringssymbol SER UT och vad den BETYDER: färg (grupp), form, glyf, namn och förklaring.
// Karta (MapLibre-bilderna), meny, dockan, kort, teckenförklaring, briefing, egenkontrollens karta och A4-rapporten hämtar alla härifrån
// (lib/marker-icons bygger bilderna, components/SymbolIkon ritar dem i gränssnittet, lib/egenkontrollRapportKartaPdf ritar dem i PDF:en).
// Det finns ingen kopia av en glyf, en form eller en förklaring någon annanstans — en vakt (lib/symboler.test.ts) läser källorna och larmar.
//
//   Färg   = gruppen (lib/larm/grupper): vad det är och om det larmar.
//   Form   = gruppens form: rundad triangel för Röd (Fara), cirkel för ALLA andra grupper (även Lila, Att göra). Vit kant.
//   Glyf   = en egen tydlig bild per symbol (stroke-path, viewBox 24, vit). Avlägg, Ved och Rishög är tre olika bilder.
//
// Vilka symboler som larmar avgörs av gruppen (lib/larm) — här finns bara utseendet och förklaringen.

import { GRUPPER, LINJE_GRUPP, LINJE_NAMN, SYMBOL_GRUPP, SYMBOL_NAMN, YTA, VIDA, type FargGrupp, type SymbolForm, type VidaSlag } from './larm/grupper';

// ---------------------------------------------------------------------------------------------------------------------------------
// Former (viewBox 0 0 48 48, vit kant 3)
// ---------------------------------------------------------------------------------------------------------------------------------

export const FORM_PATH: Readonly<Record<SymbolForm, string>> = {
  cirkel: 'M24 2a22 22 0 1 0 0.01 0z',
  triangel: 'M24 3.5L45.5 41.5Q46.5 44.5 43 44.5L5 44.5Q1.5 44.5 2.5 41.5Z',
};
/** Glyfen (24 × 24) lagd mitt i formen: förskjutning och skala i formens 48-ruta. Triangelns tyngdpunkt ligger lägre och ytan är mindre, så glyfen krymps och flyttas ned. */
export const GLYF_PLACERING: Readonly<Record<SymbolForm, { x: number; y: number; skala: number }>> = {
  cirkel: { x: 12, y: 12, skala: 1 },
  triangel: { x: 14.4, y: 20.5, skala: 0.8 },
};
/** Samma placering som SVG-transform (gränssnittet och kartbilderna). */
export const GLYF_TRANSFORM: Readonly<Record<SymbolForm, string>> = Object.fromEntries(
  (Object.entries(GLYF_PLACERING) as [SymbolForm, { x: number; y: number; skala: number }][]).map(([f, p]) => [f, p.skala === 1 ? `translate(${p.x} ${p.y})` : `translate(${p.x} ${p.y}) scale(${p.skala})`]),
) as Record<SymbolForm, string>;
export const FORM_KANT_BREDD = 3;
export const GLYF_LINJE_BREDD = 2.2;
export const SYMBOL_VIEWBOX = 48;

// ---------------------------------------------------------------------------------------------------------------------------------
// Glyferna (stroke-paths i 24 × 24, ritas vita med runda ändar — ingen fyllning)
// ---------------------------------------------------------------------------------------------------------------------------------

export const GLYF: Readonly<Record<string, string>> = {
  // Fara
  powerline: 'M13 3L6 13h5l-1 8 7-10h-5z',
  warning: 'M12 5v9 M12 18.5v.5',
  steep: 'M4 19L20 6 M4 19h16 M20 6v13',
  huntingtower: 'M8 21l2.5-11 M16 21l-2.5-11 M8.5 10h7V4h-7z M9.4 16h5.2',
  groundcable: 'M3 12h5l2-5 4 10 2-5h5',
  // Natur
  eternitytree: 'M12 3l5 7h-3l4 6H6l4-6H7z M12 16v5',
  highstump: 'M8 21V10l2 1.5L12 9l2 2 2-1.5V21z M6 21h12',
  naturecorner: 'M5 19C5 11 11 5 19 5c0 8-6 14-14 14z M5 19l7-7',
  // Kultur
  culturemonument: 'M4 9l8-5 8 5z M6 20h12 M7.5 20v-8 M12 20v-8 M16.5 20v-8',
  // Blött
  wet: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  // Att göra
  manualfelling: 'M6 20L17 5 M17 5l-5.5 1.5 M17 5l-.5 5.5 M3 20h8',
  felloutside: 'M12 3l5 7H7z M12 10v4 M14 15l6 6 M20 15l-6 6',
  // Info
  landing: 'M8 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M16 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M12 11m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  firewood: 'M12 3c3 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z',
  brashpile: 'M3 19c3-5 6-5 9 0 3-5 6-5 9 0 M7 15L5 9 M12 14V7 M17 15l2-6',
  windfall: 'M3 17h12 M18 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M7 17l-2-4 M11 17l-1-4',
  road: 'M7 21L10 3 M17 21L14 3 M12 6v2 M12 12v2 M12 18v2',
  turningpoint: 'M8 21V10a4 4 0 0 1 8 0v5 M13 12l3 3 3-3',
  ditch: 'M3 9c2-3 4 3 6 0s4 3 6 0 4 3 6 0 M3 16c2-3 4 3 6 0s4 3 6 0 4 3 6 0',
  bridge: 'M3 15h18 M5 15c2-6 12-6 14 0 M7 15v4 M17 15v4',
  corduroy: 'M6 4v16 M10 4v16 M14 4v16 M18 4v16',
  trail: 'M6 20h.5 M8.5 15.5h.5 M11.5 12h.5 M14 8h.5 M17 4.5h.5',
  gate: 'M4 20V5 M20 20V5 M4 9h16 M4 15h16 M8 9l4 6 M12 9l4 6',
  default: 'M12 8.5a3.5 3.5 0 1 0 0.01 0z',
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Alias, meny, förklaring
// ---------------------------------------------------------------------------------------------------------------------------------

/** Gamla typer som slagits ihop: markeringarna i databasen ändras inte, men de ritas och heter som sin efterträdare. */
export const SYMBOL_ALIAS: Readonly<Record<string, string>> = { culturestump: 'culturemonument' };
export const symbolDefTyp = (typ: string | null | undefined): string => {
  const t = typ && (typ in GLYF || typ in SYMBOL_GRUPP) ? typ : 'default';
  return SYMBOL_ALIAS[t] ?? t;
};

/** Symbolerna som finns i MENYN (symbolarket), per kategori — samma kategorier som förut. Dike, Stig, Brant (ytan finns) och Kulturstubbe (slogs ihop) finns inte i menyn men ritas fortfarande. */
export const MENY_KATEGORIER: ReadonlyArray<{ namn: string; symboler: readonly string[] }> = [
  { namn: 'Naturvård', symboler: ['eternitytree', 'naturecorner'] },
  { namn: 'Kultur', symboler: ['culturemonument'] },
  { namn: 'Avverkning', symboler: ['highstump', 'landing', 'brashpile', 'windfall', 'manualfelling', 'felloutside'] },
  { namn: 'Infrastruktur', symboler: ['powerline', 'huntingtower', 'groundcable', 'road', 'turningpoint', 'gate'] },
  { namn: 'Terräng', symboler: ['bridge', 'corduroy', 'wet'] },
  { namn: 'Övrigt', symboler: ['warning'] },
];
export const UR_MENYN: readonly string[] = ['culturestump', 'ditch', 'trail', 'steep'];

/** EN mening om vad symbolen betyder — i kortet vid tryck och i "Vad betyder kartan". */
export const SYMBOL_FORKLARING: Readonly<Record<string, string>> = {
  powerline: 'Ledning – håll avstånd och fäll inte åt det hållet.',
  warning: 'Något farligt här – läs kommentaren.',
  steep: 'Brant – risk för att maskinen glider.',
  huntingtower: 'Jakttorn – människor kan finnas i eller nära tornet.',
  groundcable: 'Nedgrävd kabel – kör försiktigt och gräv inte.',
  eternitytree: 'Ska stå kvar – fäll inte.',
  highstump: 'Hög stubbe som ska lämnas kvar.',
  naturecorner: 'Hörn som sparas för naturvården – kör och fäll inte här.',
  culturemonument: 'Stenröse, tjärdal, kolbotten eller råsten – lagskyddat, kör inte på det.',
  wet: 'Blött – kör försiktigt, risa vid behov.',
  manualfelling: 'Fälls för hand – kör inte skördaren hit.',
  felloutside: 'Träd som ska avverkas utanför ordinarie yta.',
  landing: 'Här läggs virket för skotning.',
  firewood: 'Ved åt markägaren – lämna den för sig.',
  brashpile: 'Hög med ris och grot.',
  windfall: 'Vindfälle – var försiktig, träd kan vara under spänning.',
  road: 'Väg eller stickväg.',
  turningpoint: 'Här kan maskinen vända.',
  ditch: 'Dike – kör inte över utan bro.',
  bridge: 'Bro över dike eller bäck.',
  corduroy: 'Kavling – risad väg över blött.',
  trail: 'Stig eller led.',
  gate: 'Grind med hänglås – stäng efter dig. Koden visas när du är nära.',
  default: 'Markering.',
};

/** Förklaring av ytorna (egna zoneType och Vidas lager) — samma mening i kortet och i teckenförklaringen. */
export const YTA_FORKLARING: Readonly<Record<string, string>> = {
  wet: 'Blött – kör försiktigt, risa vid behov.',
  steep: 'Brant – risk för att maskinen glider.',
  protected: 'Hänsynsyta – ska sparas. Kör inte in.',
  culture: 'Kulturmiljö – kör och fäll varsamt.',
  noentry: 'Ej framkomlig – kör inte in.',
  fornlamning: 'Fornlämning – lagskyddad. Kör inte in.',
  gallring: 'Gallringszon.',
};
export const VIDA_FORKLARING: Readonly<Record<VidaSlag, string>> = {
  kraftledning: 'Kraftledning – håll avstånd och fäll inte åt det hållet.',
  hansynsyta: 'Hänsynsyta – ska sparas. Kör inte in.',
  nyckelbiotop: 'Nyckelbiotop – skyddad skog. Kör inte in.',
  raa_yta: 'Fornlämning – lagskyddad. Kör inte in.',
  raa_punkt: 'Fornlämning (RAÄ) – lagskyddad, håll avstånd.',
};
export const LINJE_FORKLARING: Readonly<Record<string, string>> = {
  stonewall: 'Stenmur – kör inte över, fäll inte på den.',
  powerline: 'El-ledning – håll avstånd och fäll inte åt det hållet.',
};

/**
 * KORTET FÖR EN LINJE (tryck på en linje på kartan): namn, grupp och EN mening — samma uppbyggnad som för symboler och ytor. Stenmur och Vidas Kraftledning
 * har en riktig grupp (Kultur resp. Fara, ur lib/larm/grupper) och en mening ur teckenförklaringens tabeller. Övriga linjer (basväg, stickväg, dike, stig,
 * traktgräns, naturvård) är snitselfärger i skogen: de ritas i sin egen färg och hör inte till larmet, men får ändå ett kort — gruppen är då Info
 * (Naturvård: Natur). Gruppen på kortet ändrar aldrig linjens färg eller larmet.
 */
export interface LinjeKort { namn: string; grupp: FargGrupp; forklaring: string }
const LINJE_KORT_OVRIGA: Readonly<Record<string, LinjeKort>> = {
  mainRoad: { namn: 'Basväg', grupp: 'info', forklaring: 'Basväg – huvudväg för maskiner och lastbil.' },
  sideRoadRed: { namn: 'Stickväg', grupp: 'info', forklaring: 'Stickväg – här går maskinen in i beståndet.' },
  sideRoadYellow: { namn: 'Stickväg', grupp: 'info', forklaring: 'Stickväg – här går maskinen in i beståndet.' },
  sideRoadBlue: { namn: 'Stickväg', grupp: 'info', forklaring: 'Stickväg – här går maskinen in i beståndet.' },
  boundary: { namn: 'Traktgräns', grupp: 'info', forklaring: 'Traktgräns – avverkningen stannar vid linjen.' },
  nature: { namn: 'Naturvård', grupp: 'natur', forklaring: 'Naturvårdslinje – hänsyn, kör och fäll varsamt.' },
  ditch: { namn: 'Dike', grupp: 'info', forklaring: 'Dike – korsa med försiktighet.' },
  trail: { namn: 'Stig / Led', grupp: 'info', forklaring: 'Stig eller led – ingen körväg.' },
};
/** Alla linjetyper som kan ritas (egna): varje en har ett kort. Vakt: lib/linjeKort.test.ts läser kartstilens och sidans linjelistor. */
export const LINJE_KORT_TYPER: readonly string[] = ['stonewall', 'powerline', ...Object.keys(LINJE_KORT_OVRIGA)];
export function linjeKort(lineType: string | null | undefined): LinjeKort {
  const t = lineType ?? '';
  if (t in LINJE_GRUPP) return { namn: LINJE_NAMN[t] ?? 'Linje', grupp: LINJE_GRUPP[t], forklaring: LINJE_FORKLARING[t] ?? '' };
  return LINJE_KORT_OVRIGA[t] ?? { namn: 'Linje', grupp: 'info', forklaring: '' };
}
/** Vidas linjer (objekt_geometri, lagret L_TILLAGGSLINJER): Kraftledning = Fara; allt annat är en basväg ur Vidas data = Info. `flbeskr` = Vidas egen beskrivning. */
export function vidaLinjeKort(flbeskr: string | null | undefined): LinjeKort & { slag: 'kraftledning' | 'basvag' } {
  const beskr = (flbeskr ?? '').trim();
  if (/kraftled/i.test(beskr)) return { slag: 'kraftledning', namn: VIDA.kraftledning.namn, grupp: VIDA.kraftledning.grupp, forklaring: VIDA_FORKLARING.kraftledning };
  return { slag: 'basvag', namn: beskr || 'Basväg', grupp: 'info', forklaring: LINJE_KORT_OVRIGA.mainRoad.forklaring };
}

/** Gruppens korta rad i teckenförklaringen: vad färgen och formen betyder. */
export const GRUPP_FORKLARING: Readonly<Record<FargGrupp, string>> = {
  fara: 'Triangel. Larmar alltid, även kvitterad.',
  natur: 'Cirkel. Larmar tills du kvitterat.',
  kultur: 'Cirkel. Larmar tills du kvitterat.',
  blott: 'Cirkel. Larmar tills du kvitterat.',
  att_gora: 'Ruta, som en bock att pricka av. Larmar aldrig.',
  info: 'Mörk cirkel. Larmar aldrig.',
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Uppslag
// ---------------------------------------------------------------------------------------------------------------------------------

export interface SymbolDef {
  /** Typen som ritas (efter alias): culturestump → culturemonument. */
  id: string;
  grupp: FargGrupp;
  farg: string;
  form: SymbolForm;
  glyf: string;
  namn: string;
  forklaring: string;
}

export function symbolDef(typ: string | null | undefined): SymbolDef {
  const id = symbolDefTyp(typ);
  const grupp: FargGrupp = SYMBOL_GRUPP[id] ?? 'info';
  return {
    id, grupp, farg: GRUPPER[grupp].farg, form: GRUPPER[grupp].form,
    glyf: GLYF[id] ?? GLYF.default, namn: SYMBOL_NAMN[id] ?? 'Markering', forklaring: SYMBOL_FORKLARING[id] ?? SYMBOL_FORKLARING.default,
  };
}

/** Symbolen som ren SVG i viewBox 48 (kant + glyf). `kant` = formens kantfärg (vit på kartan, mörk för en mörk symbol på ljus yta). */
export function symbolSvgInnehall(typ: string | null | undefined, kant = '#ffffff'): string {
  const d = symbolDef(typ);
  return `<path d="${FORM_PATH[d.form]}" fill="${d.farg}" stroke="${kant}" stroke-width="${FORM_KANT_BREDD}" stroke-linejoin="round"/>`
    + `<g transform="${GLYF_TRANSFORM[d.form]}"><path d="${d.glyf}" fill="none" stroke="#ffffff" stroke-width="${GLYF_LINJE_BREDD}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

export function symbolSvg(typ: string | null | undefined, storlek: number, kant = '#ffffff'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${storlek}" height="${storlek}" viewBox="0 0 ${SYMBOL_VIEWBOX} ${SYMBOL_VIEWBOX}">${symbolSvgInnehall(typ, kant)}</svg>`;
}

/** Alla typer som ritas (för bilder och kontroller): de i GLYF, utom 'default' som är reservbilden. */
export const SYMBOL_TYPER: readonly string[] = Object.keys(GLYF).filter((t) => t !== 'default');

/**
 * Larmkortets ikon för det som INTE är en symbol (linje, yta, Vidas lager): formen och färgen kommer från GRUPPEN (samma som kartan), glyfen från
 * den symbol som betyder samma sak — Kraftledning (Vida) får ledningens blixt, Fornlämning/Kulturmiljö kulturlämningens glyf. Två glyfer finns
 * bara här: Stenmurens stenar och Ej framkomligs kryss.
 */
const ANNAN_IKON_SYMBOL: Readonly<Record<string, string>> = {
  kraftledning: 'powerline', hansynsyta: 'naturecorner', nyckelbiotop: 'naturecorner', raa_yta: 'culturemonument', raa_punkt: 'culturemonument',
  protected: 'naturecorner', culture: 'culturemonument', fornlamning: 'culturemonument', wet: 'wet', steep: 'steep',
};
const ANNAN_IKON_GLYF: Readonly<Record<string, string>> = {
  stonewall: 'M3 19h18 M5 19v-5h5v5 M12 19v-5h6v5 M8 14V9h6v5',
  noentry: 'M6 6l12 12 M18 6L6 18',
};
export function larmIkonDef(kalla: 'symbol' | 'linje' | 'yta', typ: string | null | undefined, grupp: FargGrupp): SymbolDef {
  if (kalla === 'symbol') return symbolDef(typ);
  const t = typ ?? '';
  const glyf = ANNAN_IKON_GLYF[t] ?? GLYF[ANNAN_IKON_SYMBOL[t] ?? ''] ?? GLYF.default;
  return { id: t || 'default', grupp, farg: GRUPPER[grupp].farg, form: GRUPPER[grupp].form, glyf, namn: '', forklaring: '' };
}

/** Egna ytor och Vidas lager: grupp, namn och förklaring från samma tabeller som kartan. */
export function ytaForklaring(zoneType: string): { grupp: FargGrupp; namn: string; forklaring: string; forbjuden: boolean } | null {
  const d = YTA[zoneType];
  if (!d) return null;
  return { grupp: d.grupp, namn: d.namn, forklaring: YTA_FORKLARING[zoneType] ?? '', forbjuden: d.forbjuden };
}
export function vidaForklaring(slag: VidaSlag): { grupp: FargGrupp; namn: string; forklaring: string; forbjuden: boolean } {
  const d = VIDA[slag];
  return { grupp: d.grupp, namn: d.namn, forklaring: VIDA_FORKLARING[slag], forbjuden: d.forbjuden };
}

/**
 * Vad ett Vida-/trakt-objekt BETYDER på kortet (gruppen, EN mening och om ytan är förbjuden att köra in i) — ur samma tabeller som teckenförklaringen och larmet.
 * Linjer bär sin grupp och mening på kortet (`byggTraktKort`/`vidaLinjeKort`); hänsynsyta, nyckelbiotop och fornlämning kommer ur `VIDA`, avlägg ur symbolen
 * Avlägg. Traktdelen är bara traktens yta: Info, ingen mening.
 */
export interface TraktKortBetydelse { grupp: FargGrupp; forklaring: string | null; forbjuden: boolean; ikon: { kalla: 'symbol' | 'linje' | 'yta'; typ: string } }
export function traktKortBetydelse(k: { kategori: string; grupp?: FargGrupp; forklaring?: string }): TraktKortBetydelse {
  const vida = (slag: VidaSlag, typ: string): TraktKortBetydelse => { const v = vidaForklaring(slag); return { grupp: v.grupp, forklaring: v.forklaring, forbjuden: v.forbjuden, ikon: { kalla: 'yta', typ } }; };
  switch (k.kategori) {
    case 'linje': return { grupp: k.grupp ?? 'info', forklaring: k.forklaring || null, forbjuden: false, ikon: { kalla: 'linje', typ: k.grupp === 'fara' ? 'kraftledning' : 'mainRoad' } };
    case 'hansyn': return vida('hansynsyta', 'hansynsyta');
    case 'nyckelbiotop': return vida('nyckelbiotop', 'nyckelbiotop');
    case 'lamning': return vida('raa_yta', 'raa_yta');
    case 'punkt': { const d = symbolDef('landing'); return { grupp: d.grupp, forklaring: d.forklaring || null, forbjuden: false, ikon: { kalla: 'symbol', typ: 'landing' } }; }
    default: return { grupp: 'info', forklaring: null, forbjuden: false, ikon: { kalla: 'yta', typ: 'default' } };
  }
}
