// Vad Redigering kräver av ett objekt: slutavverkning ska ha AVTALSFORM (Au/Rp/LRK/VF/Bark), åtgärd är valfri där; gallring ska ha ÅTGÄRD som förut.
// (Martins beslut på #762. Importen läser avtalsformen ur TD:ns Ursprung, så en slutavverkning utan den är något att titta på.)
//
// Före migrationen 20261014125836 finns ingen avtalsform-kolumn på dim_objekt (select('*') ger inte nyckeln) — då går den inte att fylla i
// och kravet är åtgärd som förut, annars skulle varje slutavverkning varna för något som inte går att rätta.

import { arPrivat } from './faltGaller';

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
export function saknarAvtalsformEllerAtgard(obj: KravObjekt & { bolag?: string | null; special?: boolean | null }): SaknarVarning | null {
  if (kravAvtalsform(obj)) {
    // Ett special-objekt (vindfälle, storm, special vid hus) har ingen avtalsform att fråga om — Martin 2026-10-24.
    if (obj.special === true) return null;
    // Ett privat jobb har ingen avtalsform (faltGaller) — och åtgärd är valfri på slutavverkning. Inget saknas.
    if (arPrivat(obj.bolag)) return null;
    return obj.avtalsform ? null : { key: 'avtalsform', text: 'Saknar avtalsform', target: 'avtalsform-section' };
  }
  if (obj.huvudtyp && !obj.atgard) return { key: 'atgard', text: 'Saknar åtgärd', target: 'atgard-section' };
  return null;
}
