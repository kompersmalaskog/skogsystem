// Kapacitet: hur många skotare en skördare sysselsätter.
//
//   kvot = skotning-G15 / skörd-G15   (timmar via lib/g15, aldrig motortid)
//
// Talet visas ALDRIG som rå kvot ("1,4×" säger ingenting i hytten). Det
// rundas till begripliga halvsteg — ½, 1, 1½, 2 … — och läses som
// "1½ skotare per skördare", med en stödrad i klockspråk:
// "1 h 24 min skotning per timme skörd". Prod 2026-09-10 på färdiga objekt:
// gallring ~0,6 (½ skotare), slutavverkning ~1,4 (1½ skotare).
//
// Måttet är ett PLANERINGSMÅTT och visas bara i maskinvyn över tid (per
// objekt läses "1 skotare" fel — som historik, inte behov). Formulering:
// "Behöver 1½ skotare bakom skördaren". EN källa: klarspråket OCH
// uteslutningsreglerna bor här, inte i vyn.
//
// BARA RENA OBJEKT RÄKNAS I SNITTET (Martins fyra undantag + två grundkrav):
//   1. Nyår — data pålitlig från 2027-01-01; före = uppbyggnad, märks
//      "ej pålitlig data", aldrig en siffra som ser säker ut.
//   2. JD810E kan inte sända filer — skotartid ur skotare_objekt_manuell
//      räknas, men blandas inte med maskinmätt som lika exakt (egen rad).
//   3. Vindfälle (dim_objekt.atgard = 'VF/Bark') är egen kategori, aldrig i
//      gallringens eller slutavverkningens snitt. Oplanerat arbete.
//   4. Extern skördare/skotare utesluts helt — halva paret saknas.
//   + färdigskotat, båda maskintyperna med egen G15, och rimlighetsvakt mot
//     skotning utan maskintid (Karsemåla: 834 m³ på 2 h skotartid).

import { harledTyp } from '@/lib/objekt/typ';

/** Data pålitlig från och med detta datum. Före = uppbyggnad. */
export const KAPACITET_PALITLIG_FRAN = '2027-01-01';

/**
 * Rimlighetsvakt: skördad volym per skotartimme, räknat på SAMMA VO-grupp.
 * Prod 2026-09-10 (53 färdiga objekt): median 19,6 · p90 34,4 · högsta
 * normala 39,4 m³/skotartimme. Sedan Ålshult 70 och Karsemåla 401 — båda
 * skotade utan maskintid (volymen manuellt inlagd, skotaren sände inget).
 * Gränsen 60 ligger i gapet mellan 39 och 70.
 */
export const SKOTNING_UTAN_MASKINTID_M3_PER_H = 60;

/** Under så här många färdiga objekt visas ingen siffra — "för få färdiga objekt". */
export const MIN_OBJEKT_FOR_SNITT = 3;
export const MIN_OBJEKT_FOR_HINK = 2;

export type KapacitetKategori = 'gallring' | 'slutavverkning' | 'vindfalle';

export const KATEGORI_LABEL: Record<KapacitetKategori, string> = {
  gallring: 'Gallring',
  slutavverkning: 'Slutavverkning',
  vindfalle: 'Vindfälle',
};

/** Är åtgärden vindfälle/barkborre? Vallistan skriver exakt 'VF/Bark'. */
export function arVindfalle(atgard: string | null | undefined): boolean {
  return typeof atgard === 'string' && atgard.trim().toLowerCase() === 'vf/bark';
}

/**
 * Kapacitetskategori ovanpå appens typregel (lib/objekt/typ.ts, orörd):
 * vindfälle först (undantag 3), grot/risjobb är inget skördare–skotare-par
 * → null, annars gallring/slutavverkning. Saknad huvudtyp → null (aldrig gissad).
 */
export function kapacitetKategori(o: {
  risskotning?: boolean | null; huvudtyp?: string | null; atgard?: string | null;
}): KapacitetKategori | null {
  if (arVindfalle(o.atgard)) return 'vindfalle';
  const typ = harledTyp(o.risskotning, o.huvudtyp);
  if (typ === 'gallring' || typ === 'slutavverkning') return typ;
  return null;
}

/** Extern skördare (kolumn) eller extern skotare (JSON i ovrigt_info). */
export function arExtern(o: { extern_skordning?: boolean | null; ovrigt_info?: unknown }): boolean {
  if (o.extern_skordning === true) return true;
  const oi = o.ovrigt_info;
  if (!oi) return false;
  try {
    const obj = typeof oi === 'string' ? JSON.parse(oi) : oi;
    return !!obj && typeof obj === 'object' && (obj as any).extern_skotning === true;
  } catch {
    return false;
  }
}

export type Uteslutning =
  | 'extern'                    // undantag 4
  | 'okand_typ'                 // ingen huvudtyp, eller grot
  | 'ej_fardig'                 // skotningen inte avslutad
  | 'saknar_skordartid'
  | 'saknar_skotartid'
  | 'skotning_utan_maskintid';  // rimlighetsvakten

export const UTESLUTNING_LABEL: Record<Uteslutning, string> = {
  extern: 'extern maskin',
  okand_typ: 'typ okänd',
  ej_fardig: 'inte färdigskotat',
  saknar_skordartid: 'saknar skördartid',
  saknar_skotartid: 'saknar skotartid',
  skotning_utan_maskintid: 'skotning utan maskintid',
};

/** Ett objekt (VO-grupp) som det ser ut i data, innan bedömning. */
export type KapacitetObjektIn = {
  grupp: string;                 // VO-nummer eller objekt_id
  namn: string;
  kategori: KapacitetKategori | null;
  extern: boolean;
  skotningAvslutad: string | null;   // ISO-datum, null = inte färdig
  skordG15h: number;                 // skördarens egna maskinmätta timmar
  skotG15h: number;                  // maskinmätt skotartid (fakt_tid)
  skotG15hManuell: number;           // manuellt rapporterad skotartid (JD810E)
  skordadM3: number;                 // skördad volym på samma VO-grupp
};

export type KapacitetObjekt = KapacitetObjektIn & {
  uteslutning: Uteslutning | null;
  kvot: number | null;      // skotartid / skördartid, null när utesluten
  manuell: boolean;         // skotartiden innehåller manuellt rapporterad tid
  palitlig: boolean;        // skotningen avslutad ≥ KAPACITET_PALITLIG_FRAN
};

/** Reglerna i ordning. Första träffen utesluter. */
export function bedomObjekt(o: KapacitetObjektIn): KapacitetObjekt {
  const skotTot = o.skotG15h + o.skotG15hManuell;
  const grund = { ...o, kvot: null as number | null, manuell: o.skotG15hManuell > 0, palitlig: !!o.skotningAvslutad && o.skotningAvslutad >= KAPACITET_PALITLIG_FRAN };
  if (o.extern) return { ...grund, uteslutning: 'extern' };
  if (!o.kategori) return { ...grund, uteslutning: 'okand_typ' };
  if (!o.skotningAvslutad) return { ...grund, uteslutning: 'ej_fardig' };
  if (o.skordG15h <= 0) return { ...grund, uteslutning: 'saknar_skordartid' };
  if (skotTot <= 0) return { ...grund, uteslutning: 'saknar_skotartid' };
  if (o.skordadM3 / skotTot > SKOTNING_UTAN_MASKINTID_M3_PER_H) return { ...grund, uteslutning: 'skotning_utan_maskintid' };
  return { ...grund, uteslutning: null, kvot: skotTot / o.skordG15h };
}

export type KapacitetSnitt = {
  kvot: number | null;   // viktat: SUM(skotartid) / SUM(skördartid) — aldrig snitt av snitt
  antal: number;
  skordG15h: number;
  skotG15h: number;
};

/** Viktat snitt över de objekt som räknas. Manuella och maskinmätta summeras ALDRIG ihop — anroparen delar upp. */
export function kapacitetSnitt(objekt: KapacitetObjekt[]): KapacitetSnitt {
  const med = objekt.filter(o => o.uteslutning === null && o.kvot !== null);
  const skordG15h = med.reduce((s, o) => s + o.skordG15h, 0);
  const skotG15h = med.reduce((s, o) => s + o.skotG15h + o.skotG15hManuell, 0);
  return { kvot: skordG15h > 0 && med.length > 0 ? skotG15h / skordG15h : null, antal: med.length, skordG15h, skotG15h };
}

/** Huvudraden i maskinvyn: "Behöver 1½ skotare bakom skördaren". */
export function behovText(kvot: number): { tal: string; text: string } {
  const k = kapacitetKlarsprak(kvot);
  return { tal: k.tal, text: `Behöver ${k.tal} skotare bakom skördaren` };
}

/** Kvoten, eller null när någon av tiderna saknas — då finns inget att säga. */
export function kapacitetKvot(skordG15h: number | null | undefined, skotningG15h: number | null | undefined): number | null {
  if (!skordG15h || !skotningG15h || skordG15h <= 0 || skotningG15h <= 0) return null;
  return skotningG15h / skordG15h;
}

/** Närmaste halvsteg (0,5 · 1 · 1,5 · 2 …). Under 0,25 → 0, som texten läser "under ½". */
export function kapacitetHalvsteg(kvot: number): number {
  return Math.round(kvot * 2) / 2;
}

/** 0,5 → "½", 1 → "1", 1,5 → "1½", 2 → "2", 2,5 → "2½". */
export function halvstegText(steg: number): string {
  const hel = Math.floor(steg);
  const halv = steg - hel >= 0.5;
  if (hel === 0) return halv ? '½' : '0';
  return halv ? `${hel}½` : `${hel}`;
}

/** "1 h 24 min" / "36 min" / "2 h" — minuter skotning per timme skörd. */
export function minuterPerTimmeText(kvot: number): string {
  const min = Math.round(kvot * 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export type KapacitetKlarsprak = {
  /** Huvudtalet, t.ex. "1½" eller "under ½". */
  tal: string;
  /** Huvudtalets efterled: "skotare per skördare". */
  enhet: string;
  /** Hela huvudraden: "1½ skotare per skördare". */
  huvud: string;
  /** Stödraden: "1 h 24 min skotning per timme skörd". */
  stod: string;
};

export function kapacitetKlarsprak(kvot: number): KapacitetKlarsprak {
  const steg = kapacitetHalvsteg(kvot);
  const tal = steg < 0.5 ? 'under ½' : halvstegText(steg);
  const enhet = 'skotare per skördare';
  return {
    tal,
    enhet,
    huvud: `${tal} ${enhet}`,
    stod: `${minuterPerTimmeText(kvot)} skotning per timme skörd`,
  };
}
