// Prod-formade flyttar för uppföljningens "Maskiner" (Martins siffror 2026-10-20): 19 flyttar —
//   Giant 11 flyttar / 249 km (inget saknas; 10 mellanrum, 5 räknebara med snitt 2,8 dagar),
//   Elefant 26 4 / 143 km (3 saknar Från; 3 mellanrum, 1 räknebart på 9,8 dagar),
//   Wisent 2 / 54 km, 810E 1 / 31 km (saknar Från), H8E -26 1 / 16 km.
// De enskilda flyttarna är syntetiska; summorna, antalen och luckorna är prod.

import type { FlyttRad } from './maskiner';

const T = ['o-vallust', 'o-bagskytte', 'o-halaback', 'o-ostra', 'o-jatsbygd', 'o-raveboda', 'o-brokamala', 'o-tjuvon', 'o-ulfsnas', 'o-dockemala', 'o-stankelsmala', 'o-akelius', 'o-kampamala'];
const MIN = 60_000;
const TIM = 60 * MIN;
const iso = (ms: number) => new Date(ms).toISOString();

interface Del { km: number; min: number; fran: string | null; till: string | null; gapDagar: number }

/** Bygger en maskins flyttar i följd: varje flyttas lastning ligger `gapDagar` efter förra lossningen. */
function kedja(maskin: string, start: string, delar: Del[], id0: string): FlyttRad[] {
  let forraSlut = Date.parse(start);
  return delar.map((d, i) => {
    const lastad = i === 0 ? forraSlut : forraSlut + d.gapDagar * 24 * TIM;
    const lossad = lastad + d.min * MIN;
    forraSlut = lossad;
    return {
      id: `${id0}${i}`, maskin_id: maskin, extern_maskin: null,
      starttid: iso(lastad - 30 * MIN), hamtad_tid: iso(lastad), sluttid: iso(lossad),
      flytt_km: d.km, tid_flytt_min: d.min,
      fran_objekt_id: d.fran, fran_plats_id: null, till_objekt_id: d.till, till_plats_id: null,
    };
  });
}

function giant(): FlyttRad[] {
  const km = [20, 22, 25, 18, 30, 24, 21, 23, 19, 26, 21];            // 249
  const min = [57, 32, 120, 45, 60, 57, 90, 40, 75, 57, 63];
  const raknebara = [2, 3, 2, 4, 3];                                   // i = 1, 3, 5, 7, 9 → snitt 2,8
  const delar: Del[] = [];
  for (let i = 0; i < km.length; i++) {
    const till = T[(i * 2 + 1) % T.length];
    const forraTill = i > 0 ? delar[i - 1].till : null;
    let fran: string | null = i === 0 ? T[0] : T[(i + 6) % T.length];
    if (i % 2 === 1) fran = forraTill;                                 // räknebart mellanrum: förra Till = nästa Från
    else if (fran === forraTill) fran = T[(i + 7) % T.length];         // annars en annan trakt (oregistrerad förflyttning emellan)
    delar.push({ km: km[i], min: min[i], fran, till, gapDagar: i % 2 === 1 ? raknebara[(i - 1) / 2] : 10 });
  }
  return kedja('PONS20SDJAA270231', '2026-07-24T06:00:00Z', delar, 'g');
}

function elefant(): FlyttRad[] {
  return kedja('A130743', '2026-08-25T06:00:00Z', [
    { km: 36, min: 70, fran: null, till: 'o-ostra', gapDagar: 0 },
    { km: 40, min: 55, fran: 'o-ostra', till: 'o-tjuvon', gapDagar: 9.8 },       // räknebart: 9,8 dagar
    { km: 31, min: 48, fran: null, till: 'o-dockemala', gapDagar: 5 },
    { km: 36, min: 62, fran: null, till: 'o-akelius', gapDagar: 5 },
  ], 'e');
}

export function prodFlyttRader(): FlyttRad[] {
  return [
    ...giant(), ...elefant(),
    ...kedja('A030353', '2026-09-20T06:00:00Z', [
      { km: 44, min: 90, fran: 'o-kampamala', till: 'o-brokamala', gapDagar: 0 },
      { km: 10, min: 32, fran: 'o-raveboda', till: 'o-ostra', gapDagar: 3 },
    ], 'w'),
    ...kedja('JD810E', '2026-08-31T06:00:00Z', [{ km: 31, min: 100, fran: null, till: 'o-dockemala', gapDagar: 0 }], 'j'),
    ...kedja('R64428', '2026-09-16T06:00:00Z', [{ km: 16, min: 40, fran: 'o-brokamala', till: 'o-tjuvon', gapDagar: 0 }], 'h'),
  ];
}

export const MASKIN_NAMN = new Map([
  ['PONS20SDJAA270231', 'Giant'], ['A130743', 'Elefant 26'], ['A030353', 'Wisent'], ['JD810E', '810E'], ['R64428', 'H8E -26'],
]);
export const OBJEKT_NAMN = new Map(T.map(id => [id, id.replace(/^o-/, '').replace(/^./, c => c.toUpperCase())]));
