// Bevisen för vilken maskin som låg på bilen, i den form `bedomMaskin` tar dem. Ren modul: databassvaren in, bevis ut.
// kor.ts hämtar (RPC lastbil_maskin_foljer / lastbil_maskin_narvaro, fakt_lass, hyttspar, maskin_position); här räknas det.

import { GPS, type MaskinBevis } from './maskin';

export interface FoljerRad { maskin_id: string; idx: number; dist_m: number }
export interface NarvaroRad { maskin_id: string; tid: string | null; dist_m: number | null }
/** En dag maskinen arbetade på en trakt (fakt_lass = skotning, hyttspar = körd bana). */
export interface ArbeteDag { maskin_id: string; dag: string; objekt_id: string; trakt: string }

const median = (v: number[]): number | null => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** RPC-raderna → per maskin: lastade punkter där den loggade, hur många inom 150 m, medianavstånd. */
export function sammanfattaFoljer(rader: readonly FoljerRad[], maskiner: readonly string[]): Map<string, NonNullable<MaskinBevis['gps']>> {
  const ut = new Map<string, NonNullable<MaskinBevis['gps']>>();
  for (const m of maskiner) {
    const mine = rader.filter(r => r.maskin_id === m && Number.isFinite(r.dist_m));
    if (!mine.length) continue;
    ut.set(m, {
      punkter: mine.length,
      traffar: mine.filter(r => r.dist_m <= GPS.FOLJER_M).length,
      medianM: Math.round(median(mine.map(r => r.dist_m)) ?? 0),
    });
  }
  return ut;
}

const dagDiff = (a: string, b: string): number => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);

/**
 * Kedjan: maskinen arbetade på lastplatsens trakt de tre dagarna före (och samma dag), och/eller på lossningsplatsens trakt
 * samma dag eller de tre dagarna efter. `lassDag` = bilens lassningsdag (svensk dag), `lossDag` = lossningsdagen.
 */
export function byggKedja(arbete: readonly ArbeteDag[], maskin_id: string, fran: { objekt_id: string | null }, till: { objekt_id: string | null }, lassDag: string, lossDag: string):
  Pick<MaskinBevis, 'kedjaFran' | 'kedjaTill'> {
  const mine = arbete.filter(a => a.maskin_id === maskin_id);
  let kedjaFran: MaskinBevis['kedjaFran'] = null;
  let kedjaTill: MaskinBevis['kedjaTill'] = null;
  if (fran.objekt_id) {
    const traff = mine.filter(a => a.objekt_id === fran.objekt_id && dagDiff(lassDag, a.dag) >= 0 && dagDiff(lassDag, a.dag) <= 3)
      .sort((a, b) => b.dag.localeCompare(a.dag))[0];
    if (traff) kedjaFran = { dag: traff.dag, trakt: traff.trakt };
  }
  if (till.objekt_id) {
    const traff = mine.filter(a => a.objekt_id === till.objekt_id && dagDiff(a.dag, lossDag) >= 0 && dagDiff(a.dag, lossDag) <= 3)
      .sort((a, b) => a.dag.localeCompare(b.dag))[0];
    if (traff) kedjaTill = { dag: traff.dag, trakt: traff.trakt };
  }
  return { kedjaFran, kedjaTill };
}

/** Samlar allt till MaskinBevis för en maskin. */
export function samlaBevis(i: {
  maskin_id: string;
  gps?: ReturnType<typeof sammanfattaFoljer>;
  ankomst?: readonly NarvaroRad[];
  avgang?: readonly NarvaroRad[];
  kedja: Pick<MaskinBevis, 'kedjaFran' | 'kedjaTill'>;
  paborjadFlytt: boolean;
  positionNara: boolean;
}): MaskinBevis {
  const ank = i.ankomst?.find(r => r.maskin_id === i.maskin_id);
  const avg = i.avgang?.find(r => r.maskin_id === i.maskin_id);
  return {
    maskin_id: i.maskin_id,
    gps: i.gps?.get(i.maskin_id),
    ankomstM: ank?.dist_m != null ? Math.round(ank.dist_m) : null,
    avgangM: avg?.dist_m != null ? Math.round(avg.dist_m) : null,
    ...i.kedja,
    paborjadFlytt: i.paborjadFlytt,
    positionNara: i.positionNara,
  };
}
