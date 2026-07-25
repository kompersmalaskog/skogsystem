// EN plats för avräkningsregeln — samma mönster som exkludera-regeln.
//
// Ett ackordobjekt är SLUTAVRÄKNAT när vårt arbete är klart:
//   - normalfallet: BÅDA skordning_avslutad och skotning_avslutad satta
//   - egen skotning (dim_objekt.egen_skotning — markägaren skotar själv,
//     vi fakturerar bara skördningen): skordning_avslutad räcker. Noll
//     skotad volym är KORREKT för dessa, inte saknad data.
//
// Avräkningsdatumet (styr vilken period objektet räknas i) är för egen
// skotning skördningens avslutsdatum — ett ev. manuellt satt
// skotning_avslutad IGNORERAS för flaggade objekt (kräver ingen städning
// av gamla datum).
//
// Vyer får ALDRIG tolka avslutsdatumen med egen inline-logik — använd
// dessa två. Används av /ekonomi (prel-märkningen) och /ekonomi/mot-ackord
// (urval, period, väntar-lista).

export type AvrakningsObjekt = {
  skordning_avslutad?: string | null;
  skotning_avslutad?: string | null;
  egen_skotning?: boolean | null;
};

export function arSlutavraknad(o: AvrakningsObjekt | null | undefined): boolean {
  if (!o) return false;
  if (o.egen_skotning === true) return !!o.skordning_avslutad;
  return !!(o.skordning_avslutad && o.skotning_avslutad);
}

/** Datumet objektet avräknades — null om det inte är slutavräknat. */
export function avrakningsdatum(o: AvrakningsObjekt | null | undefined): string | null {
  if (!arSlutavraknad(o)) return null;
  return o!.egen_skotning === true ? o!.skordning_avslutad! : o!.skotning_avslutad!;
}
