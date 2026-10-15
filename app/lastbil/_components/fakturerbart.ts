// Fakturerbart-summan: en källa för remsan (Lastbilen, alla flikar) och kvittot i Fakturering-fliken
// (steg 3; raderna kommer ur samma läsning, så remsan och listan aldrig kan läsa olika underlag). Summan är SUMMAN AV DET SOM VISAS: varje flytt avrundas först (hela km),
// sedan summeras — aldrig råvärden som avrundas en gång (skillen, "Avläsbarhet först").
//
// En struken flytt (status 'struken') är inte fakturerbar och ingår aldrig i talet. Flyttloggens
// gamla kvitto summerade även strukna rader; i prod finns ingen struken rad än, så talen är
// desamma idag — men två ställen får inte räkna olika, och det här är det rätta.

/** Raden ur fakturaunderlag_flytt som summeringen behöver. */
export interface FaktureratRad {
  km: number | null;
  status: string;                  // 'aktiv' | 'struken'
  fakturerad_tid: string | null;
}

export interface FakturerbartSumma {
  km: number;                      // hela km, summa av avrundade flyttar
  antal: number;                   // flyttar som räknas (ej strukna)
  hos: number;                     // hos faktureringen: inte fakturerade
  fakturerad: number;
  struken: number;                 // visas bara om > 0
  utanKm: number;                  // flyttar utan km — räknas i antal men kan inte läggas till km
}

export function summeraFakturerbart(rader: readonly FaktureratRad[]): FakturerbartSumma {
  let km = 0, antal = 0, fakturerad = 0, struken = 0, utanKm = 0;
  for (const r of rader) {
    if (r.status === 'struken') { struken++; continue; }
    antal++;
    if (r.fakturerad_tid) fakturerad++;
    if (r.km == null) utanKm++;
    else km += Math.round(r.km);
  }
  return { km, antal, hos: antal - fakturerad, fakturerad, struken, utanKm };
}

/** En kvittorad: en per fakturerbar flytt, auto-skapad av databastriggern. Kvittot speglar bara status. */
export interface UnderlagRad extends FaktureratRad {
  id: string;
  kund: string | null;
  datum: string | null;            // date: 'YYYY-MM-DD'
  maskin: string | null;           // coalesce(extern_maskin, maskin_id)
  fran_objekt_id: string | null;
  fran_plats_id: string | null;
  till_objekt_id: string | null;
  till_plats_id: string | null;
  struken_tid: string | null;
  struken_anledning: string | null;
}

export type UnderlagStatus = 'hos' | 'fakturerad' | 'struken';

export const underlagStatus = (r: FaktureratRad): UnderlagStatus =>
  r.status === 'struken' ? 'struken' : r.fakturerad_tid ? 'fakturerad' : 'hos';

/** Det som väntar på faktureringen först, sedan fakturerade, sist strukna; nyast först inom varje. */
export function sorteraUnderlag<T extends UnderlagRad>(rader: readonly T[]): T[] {
  const rank: Record<UnderlagStatus, number> = { hos: 0, fakturerad: 1, struken: 2 };
  return [...rader].sort((a, b) =>
    rank[underlagStatus(a)] - rank[underlagStatus(b)] || (b.datum ?? '').localeCompare(a.datum ?? ''));
}
