// Vad Redigering kräver av ett objekt: slutavverkning ska ha AVTALSFORM (Au/Rp/LRK/VF/Bark), åtgärd är valfri där; gallring ska ha ÅTGÄRD som förut.
// (Martins beslut på #762. Importen läser avtalsformen ur TD:ns Ursprung, så en slutavverkning utan den är något att titta på.)
//
// Före migrationen 20261015090000 finns ingen avtalsform-kolumn på dim_objekt (select('*') ger inte nyckeln) — då går den inte att fylla i
// och kravet är åtgärd som förut, annars skulle varje slutavverkning varna för något som inte går att rätta.

export interface KravObjekt {
  huvudtyp?: string | null;
  atgard?: string | null;
  avtalsform?: string | null;
}

/** Gäller kravet avtalsform (i stället för åtgärd) för det här objektet? */
export function kravAvtalsform(obj: KravObjekt | null | undefined): boolean {
  return !!obj && obj.huvudtyp === 'Slutavverkning' && 'avtalsform' in obj;
}

export interface SaknarVarning { key: 'avtalsform' | 'atgard'; text: string; target: string }

/** Varningen för det som saknas (avtalsform ELLER åtgärd), eller null. Anropas inte för risjobb (de har varken huvudtyp eller åtgärd). */
export function saknarAvtalsformEllerAtgard(obj: KravObjekt): SaknarVarning | null {
  if (kravAvtalsform(obj)) {
    return obj.avtalsform ? null : { key: 'avtalsform', text: 'Saknar avtalsform', target: 'avtalsform-section' };
  }
  if (obj.huvudtyp && !obj.atgard) return { key: 'atgard', text: 'Saknar åtgärd', target: 'atgard-section' };
  return null;
}
