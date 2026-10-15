// Fakturerbart-summan: en källa för remsan (Lastbilen, alla flikar) och, från steg 3, kvittot i
// Fakturering-fliken. Summan är SUMMAN AV DET SOM VISAS: varje flytt avrundas först (hela km),
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
