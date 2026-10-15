// Fakturerbart-summan: en källa för remsan (Lastbilen, alla flikar) och kvittot i Fakturering-fliken
// (steg 3; raderna kommer ur samma läsning, så remsan och listan aldrig kan läsa olika underlag). Summan är SUMMAN AV DET SOM VISAS: varje flytt avrundas först (hela km),
// sedan summeras — aldrig råvärden som avrundas en gång (skillen, "Avläsbarhet först").
//
// GODKÄNNANDET (migration 20261015150000): en flytt är ogodkänd tills admin trycker Godkänn, som en
// arbetsdag är obekräftad tills föraren trycker Stämmer. En ogodkänd flytt har inte gått till
// faktureringen än och ingår därför inte i pengatalet — den räknas som "väntar", och påminnelsen i
// Lastbilen (vantar.ts) leder till listan "Att godkänna".
//
// En struken flytt (status 'struken') är inte fakturerbar och ingår aldrig i talet. Flyttloggens
// gamla kvitto summerade även strukna rader; i prod finns ingen struken rad än, så talen är
// desamma idag — men två ställen får inte räkna olika, och det här är det rätta.

/** Raden ur fakturaunderlag_flytt som summeringen behöver. */
export interface FaktureratRad {
  km: number | null;
  status: string;                  // 'aktiv' | 'struken'
  fakturerad_tid: string | null;
  godkand_tid: string | null;      // NULL = ogodkänd (väntar på admin)
}

/**
 * Godkänd = admin har tryckt Godkänn. En redan fakturerad flytt räknas också som godkänd: den har
 * passerat hela kedjan (och raderna som fanns före godkännandet fick backfill-godkännande).
 */
export const arGodkand = (r: Pick<FaktureratRad, 'godkand_tid' | 'fakturerad_tid'>): boolean =>
  r.godkand_tid != null || r.fakturerad_tid != null;

export interface FakturerbartSumma {
  km: number;                      // hela km, summa av avrundade GODKÄNDA flyttar
  antal: number;                   // flyttar som räknas (godkända, ej strukna)
  hos: number;                     // hos faktureringen: godkända, inte fakturerade
  fakturerad: number;
  struken: number;                 // visas bara om > 0
  utanKm: number;                  // flyttar utan km — räknas i antal men kan inte läggas till km
  vantar: number;                  // ogodkända aktiva flyttar: inte i talet, väntar på Godkänn
}

export function summeraFakturerbart(rader: readonly FaktureratRad[]): FakturerbartSumma {
  let km = 0, antal = 0, fakturerad = 0, struken = 0, utanKm = 0, vantar = 0;
  for (const r of rader) {
    if (r.status === 'struken') { struken++; continue; }
    if (!arGodkand(r)) { vantar++; continue; }
    antal++;
    if (r.fakturerad_tid) fakturerad++;
    if (r.km == null) utanKm++;
    else km += Math.round(r.km);
  }
  return { km, antal, hos: antal - fakturerad, fakturerad, struken, utanKm, vantar };
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
  godkand_av: string | null;
}

export type UnderlagStatus = 'att_godkanna' | 'hos' | 'fakturerad' | 'struken';

export const underlagStatus = (r: FaktureratRad): UnderlagStatus =>
  r.status === 'struken' ? 'struken' : r.fakturerad_tid ? 'fakturerad' : r.godkand_tid ? 'hos' : 'att_godkanna';

/**
 * Det som väntar på ditt Godkänn överst (äldsta först — det som legat längst), sedan det som är hos
 * faktureringen, fakturerade och sist strukna; nyast först inom de tre sista.
 */
export function sorteraUnderlag<T extends UnderlagRad>(rader: readonly T[]): T[] {
  const rank: Record<UnderlagStatus, number> = { att_godkanna: 0, hos: 1, fakturerad: 2, struken: 3 };
  return [...rader].sort((a, b) => {
    const sa = underlagStatus(a), sb = underlagStatus(b);
    if (sa !== sb) return rank[sa] - rank[sb];
    return sa === 'att_godkanna'
      ? (a.datum ?? '').localeCompare(b.datum ?? '')
      : (b.datum ?? '').localeCompare(a.datum ?? '');
  });
}
