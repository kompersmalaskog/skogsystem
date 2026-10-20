// FÄRGGRUPPER — EN källa för symbolens, ytans, ringens och kortets färg, och för vad som larmar.
// Färgen säger vad det är och om det larmar (skissen "Färgspråket", tavla 10–12).
//
//   Röd    Fara     larmar alltid (även kvitterad: kvitteringen sparas som bevis men tystar inte)
//   Grön   Natur    larmar tills föraren kvitterat
//   Brun   Kultur   larmar tills föraren kvitterat
//   Blå    Blött    larmar tills föraren kvitterat
//   Lila   Att göra larmar aldrig
//   Mörk   Info     larmar aldrig
//
// Orange betyder bara tall: ingen grupp är orange. Kultur är brun.
// Ytor man inte får köra in i (Hänsyn, Nyckelbiotop, Fornlämning, Ej framkomlig) larmar ALLTID vid inkörning, även kvitterade.
// Form och glyf ändras inte här (egen PR) — bara färg.

export type FargGrupp = 'fara' | 'natur' | 'kultur' | 'blott' | 'att_gora' | 'info';
export type LarmRegel = 'alltid' | 'tills_kvitterat' | 'aldrig';

/** Formen säger hur allvarligt det är: rundad triangel = Fara, rundad ruta = Att göra (en bock att pricka av), cirkel = övriga grupper. */
export type SymbolForm = 'cirkel' | 'triangel' | 'ruta';

export interface GruppDef { id: FargGrupp; namn: string; farg: string; larm: LarmRegel; form: SymbolForm }

export const FARG_FARA = '#FF453A';
export const FARG_NATUR = '#30D158';
export const FARG_KULTUR = '#B5651D';
export const FARG_BLOTT = '#0A84FF';
export const FARG_ATT_GORA = '#AF52DE';
export const FARG_INFO = '#1C1C1E';

export const GRUPPER: Record<FargGrupp, GruppDef> = {
  fara: { id: 'fara', namn: 'Fara', farg: FARG_FARA, larm: 'alltid', form: 'triangel' },
  natur: { id: 'natur', namn: 'Natur', farg: FARG_NATUR, larm: 'tills_kvitterat', form: 'cirkel' },
  kultur: { id: 'kultur', namn: 'Kultur', farg: FARG_KULTUR, larm: 'tills_kvitterat', form: 'cirkel' },
  blott: { id: 'blott', namn: 'Blött', farg: FARG_BLOTT, larm: 'tills_kvitterat', form: 'cirkel' },
  att_gora: { id: 'att_gora', namn: 'Att göra', farg: FARG_ATT_GORA, larm: 'aldrig', form: 'ruta' },
  info: { id: 'info', namn: 'Info', farg: FARG_INFO, larm: 'aldrig', form: 'cirkel' },
};
export const GRUPP_ORDNING: readonly FargGrupp[] = ['fara', 'natur', 'kultur', 'blott', 'att_gora', 'info'];

/** Markeringssymbolens (lib/marker-icons) grupp. Okänd typ = Info (aldrig ett påhittat larm). */
export const SYMBOL_GRUPP: Readonly<Record<string, FargGrupp>> = {
  // Fara
  powerline: 'fara', warning: 'fara', steep: 'fara', huntingtower: 'fara', groundcable: 'fara',
  // Natur
  eternitytree: 'natur', naturecorner: 'natur', highstump: 'natur',
  // Kultur
  culturemonument: 'kultur', culturestump: 'kultur',
  // Blött
  wet: 'blott',
  // Att göra (Manuell fällning är INTE fara längre)
  manualfelling: 'att_gora', felloutside: 'att_gora',
  // Info
  gate: 'info', landing: 'info', firewood: 'info', brashpile: 'info', windfall: 'info', road: 'info', turningpoint: 'info',
  ditch: 'info', bridge: 'info', corduroy: 'info', trail: 'info', default: 'info',
};

/** Larmar ALDRIG, oavsett vem som satte dem: förarens pillräknare och planerarens symboler av samma typ (Martin 2026-10-20). Ritas gröna (Natur) som förut. */
export const LARMFRIA_SYMBOLER: readonly string[] = ['highstump', 'eternitytree'];

/**
 * Symbolens NAMN — EN källa för menyn (symbolkategorierna), namnet under symbolen på kartan (markers-korvy-label) och larmkortet/Om trakten.
 * Förut hette samma symbol "El-ledning" i menyn men "Kraftledning" under symbolen, och "Varning" i kortet men "Fara" på kartan.
 * (Kraftledning är Vidas LINJE-lager, se VIDA nedan — det är en annan sak än symbolen El-ledning.)
 */
export const SYMBOL_NAMN: Readonly<Record<string, string>> = {
  eternitytree: 'Evighetsträd', naturecorner: 'Naturhörna',
  // Kulturlämning = stenröse, tjärdal, kolbotten, råsten. Gamla Kulturstubbar ritas och heter Kulturlämning (ingen data ändras).
  culturemonument: 'Kulturlämning', culturestump: 'Kulturlämning',
  highstump: 'Högstubbe', landing: 'Avlägg', brashpile: 'Rishög', windfall: 'Vindfälle', manualfelling: 'Manuell fällning', felloutside: 'Träd att avverka',
  powerline: 'El-ledning', road: 'Väg', turningpoint: 'Vändplats',
  ditch: 'Dike', bridge: 'Bro', corduroy: 'Kavling', wet: 'Fuktig mark', steep: 'Brant', trail: 'Stig / Led',
  warning: 'Varning', firewood: 'Ved', huntingtower: 'Jakttorn', groundcable: 'Markkabel', gate: 'Grind',
};
export const symbolNamn = (typ: string | null | undefined): string => (typ && SYMBOL_NAMN[typ]) || 'Markering';

export const gruppForSymbol = (typ: string | null | undefined): FargGrupp => (typ && SYMBOL_GRUPP[typ]) || 'info';
export const symbolFarg = (typ: string | null | undefined): string => GRUPPER[gruppForSymbol(typ)].farg;

/** Egna ritade linjer som ingår i en grupp. Övriga linjer (basväg, stickväg, traktgräns …) är snitselfärger i skogen och rörs inte. */
/** Stenmur = Kultur (brun): en stenmur i skogen är en kulturlämning (Martin 2026-10-20). Larmar tills kvitterat, som övrig Kultur. */
export const LINJE_GRUPP: Readonly<Record<string, FargGrupp>> = { stonewall: 'kultur' };
export const gruppForLinje = (lineType: string | null | undefined): FargGrupp | null => (lineType && LINJE_GRUPP[lineType]) || null;
/** Linjens färg ur sin grupp (Stenmur: brun). null = linjen är ingen grupp (snitselfärger i skogen). */
export const linjeFarg = (lineType: string | null | undefined): string | null => { const g = gruppForLinje(lineType); return g ? GRUPPER[g].farg : null; };
/** Stenmurens färg = gruppens (brun). Ett namn så att kartlagren och testerna kan hänvisa till den. */
export const FARG_STENMUR = GRUPPER[LINJE_GRUPP.stonewall].farg;
export const LINJE_NAMN: Readonly<Record<string, string>> = { stonewall: 'Stenmur' };

export interface YtaDef { grupp: FargGrupp; namn: string; forbjuden: boolean }

/** Egna ritade ytor (zoneType). `forbjuden` = ytor man inte får köra in i: larmar alltid vid inkörning, även kvitterade. Gallringszonen är ingen varningsyta. */
export const YTA: Readonly<Record<string, YtaDef>> = {
  wet: { grupp: 'blott', namn: 'Blött', forbjuden: false },
  steep: { grupp: 'fara', namn: 'Brant', forbjuden: false },
  protected: { grupp: 'natur', namn: 'Hänsyn', forbjuden: true },
  culture: { grupp: 'kultur', namn: 'Kulturmiljö', forbjuden: false },
  noentry: { grupp: 'fara', namn: 'Ej framkomlig', forbjuden: true },
  fornlamning: { grupp: 'kultur', namn: 'Fornlämning', forbjuden: true },
};
export const ytaDef = (zoneType: string | null | undefined): YtaDef | null => (zoneType && YTA[zoneType]) || null;

/** Vidas lager (objekt_geometri) → grupp. Nyckelbiotop och hänsynsyta är förbjudna ytor, RAÄ-ytor är Fornlämning, RAÄ-punkter är Kultur. */
export type VidaSlag = 'kraftledning' | 'hansynsyta' | 'nyckelbiotop' | 'raa_yta' | 'raa_punkt';
export const VIDA: Readonly<Record<VidaSlag, { grupp: FargGrupp; namn: string; forbjuden: boolean }>> = {
  kraftledning: { grupp: 'fara', namn: 'Kraftledning', forbjuden: false },
  hansynsyta: { grupp: 'natur', namn: 'Hänsyn', forbjuden: true },
  nyckelbiotop: { grupp: 'natur', namn: 'Nyckelbiotop', forbjuden: true },
  raa_yta: { grupp: 'kultur', namn: 'Fornlämning', forbjuden: true },
  raa_punkt: { grupp: 'kultur', namn: 'Fornlämning (RAÄ)', forbjuden: false },
};

/** Texten på inkörningskortet för en förbjuden yta. */
export const forbjudenYtaText = (namn: string): string => `${namn} – Du är inne i ytan, kör inte här`;
export const ytaText = (namn: string): string => `${namn} – Du är inne i ytan`;

// ---------------------------------------------------------------------------------------------------------------------------------
// FÄLLNINGSCIRKELN (skördaren, 30 m = trädlängd): vad som är "något man inte får fälla på", och vilken grupp (= färg) det ger.
// Skild från larmet: cirkeln är tyst och tar med det som inte larmar (Evighetsträd). Röd vinner över Brun/Grön.
// Brant, Ej framkomlig, Blött, Högstubbe, Manuell fällning och Info påverkar inte cirkeln.
// ---------------------------------------------------------------------------------------------------------------------------------

export type FallningGrupp = 'fara' | 'kultur' | 'natur';

export const FALLNING_SYMBOL: Readonly<Record<string, FallningGrupp>> = {
  powerline: 'fara', warning: 'fara', huntingtower: 'fara',   // Jakttorn (Röd); Markkabel ligger i marken och räknas inte
  culturemonument: 'kultur', culturestump: 'kultur',
  naturecorner: 'natur', eternitytree: 'natur',
};
export const FALLNING_LINJE: Readonly<Record<string, FallningGrupp>> = { stonewall: 'kultur' };
export const FALLNING_YTA: Readonly<Record<string, FallningGrupp>> = { protected: 'natur', culture: 'kultur', fornlamning: 'kultur' };
export const FALLNING_VIDA: Readonly<Record<VidaSlag, FallningGrupp>> = {
  kraftledning: 'fara', hansynsyta: 'natur', nyckelbiotop: 'natur', raa_yta: 'kultur', raa_punkt: 'kultur',
};
