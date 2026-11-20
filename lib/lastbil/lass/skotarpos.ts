// Skotarnas egna lossningspositioner som bevis för vilken maskin som låg på bilen.
//
// Källa: skotar_lass_del.lat/lng = maskinens GPS-fix när föraren registrerade en lossning i appen, tid = lossad_tid. Positionerna är
// GLESA (en per lossning) och kommer bara när föraren registrerat — ingen position bevisar ingenting, åt något håll. Därför ger en
// saknad position aldrig ett skäl, och en ensam position litas på bara inom fasta fönster:
//
//   avgång    senaste position FÖRE lastningen (högst 12 h innan) ≤ 1 km från lastplatsen: maskinen skotade där precis innan bilen kom
//   ankomst   första position EFTER lossningen (högst 36 h efter) ≤ 1 km från lossplatsen — bara när lossplatsen är en trakt
//   kvar      position EFTER lastningen (medan bilen är på väg) ≤ 1 km från lastplatsen: maskinen stannade kvar → utesluten
//   långt     senaste position före lastningen > 5 km bort, eller en position under transporten > 5 km från lastplatsen och inte
//             vid lossplatsen: maskinen var någon annanstans → utesluten
//
// Skotarna lossar för hand, så en falsk lossning på bilen förekommer inte; ingen tidsmarginal läggs på. Ren modul: kor.ts läser
// raderna, maskin.ts väger bevisen.

import { haversine } from '@/utils/geo';

export const SKOTARPOS = {
  /** Inom så här nära platsen ger avgången/ankomsten flest poäng. */
  NARA_M: 300,
  /** Avgång, ankomst och "stannade kvar": så nära platsen. */
  PLATS_M: 1_000,
  /** Längre bort än så från lastplatsen = maskinen var inte på väg med bilen. */
  LANGT_M: 5_000,
  AVGANG_FONSTER_TIM: 12,
  ANKOMST_FONSTER_TIM: 36,
} as const;

const TIM = 3_600_000;

/** En lossningsposition ur skotar_lass_del (struket lass är redan bortfiltrerat av anroparen). */
export interface SkotarPos { maskin_id: string; tid: string; lat: number; lng: number }

/** Var och när en position låg, i det en förare känner igen: meter, klockslag, och dag om den inte är lasset/lossningens egen. */
export interface PosTraff { avstandM: number; dag: string; kl: string; annanDag: boolean }

export interface SkotarBevis {
  avgang?: PosTraff | null;
  ankomst?: PosTraff | null;
  /** Stannade kvar vid lastplatsen medan bilen var på väg. */
  kvar?: PosTraff | null;
  /** Var någon annanstans: före lastningen (`fore`) eller under transporten (`under`). */
  langt?: (PosTraff & { nar: 'fore' | 'under' }) | null;
}

interface Punkt { tid: string; lat: number | null; lng: number | null }
export interface SkotarIndata {
  lassning: Punkt;
  lossning: Punkt;
  /** Lossplatsen är en trakt (inte verkstad/hemmabas): bara då säger en position vid den något om maskinen. */
  lossningArTrakt: boolean;
}

export function skotarUtesluten(b: SkotarBevis | undefined): boolean {
  return !!b && !!(b.kvar || b.langt);
}

const sthlmDag = (ms: number): string => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const klockan = (ms: number): string => new Date(ms).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hour12: false });
const metersFran = (a: { lat: number; lng: number }, lat: number, lng: number): number => Math.round(haversine(a.lat, a.lng, lat, lng) * 1000);

/** Bevisen för EN maskin ur dess positioner (alla maskiner får samma indata, så en saknad position är bara ett bevis mindre). */
export function skotarBevis(pos: readonly SkotarPos[], i: SkotarIndata): SkotarBevis {
  const lassMs = Date.parse(i.lassning.tid);
  const lossMs = Date.parse(i.lossning.tid);
  if (!Number.isFinite(lassMs) || !Number.isFinite(lossMs)) return {};
  const lass = i.lassning.lat != null && i.lassning.lng != null ? { lat: i.lassning.lat, lng: i.lassning.lng } : null;
  const loss = i.lossning.lat != null && i.lossning.lng != null ? { lat: i.lossning.lat, lng: i.lossning.lng } : null;

  const giltiga = pos
    .map(p => ({ p, ms: Date.parse(p.tid) }))
    .filter(x => Number.isFinite(x.ms) && Number.isFinite(x.p.lat) && Number.isFinite(x.p.lng))
    .sort((a, b) => a.ms - b.ms);

  const traff = (ms: number, avstandM: number, refMs: number): PosTraff =>
    ({ avstandM, dag: sthlmDag(ms), kl: klockan(ms), annanDag: sthlmDag(ms) !== sthlmDag(refMs) });

  const ut: SkotarBevis = {};

  if (lass) {
    // Före lastningen: den SENASTE positionen inom 12 h.
    const fore = giltiga.filter(x => x.ms <= lassMs && x.ms >= lassMs - SKOTARPOS.AVGANG_FONSTER_TIM * TIM).pop();
    if (fore) {
      const m = metersFran(lass, fore.p.lat, fore.p.lng);
      if (m <= SKOTARPOS.PLATS_M) ut.avgang = traff(fore.ms, m, lassMs);
      else if (m > SKOTARPOS.LANGT_M) ut.langt = { ...traff(fore.ms, m, lassMs), nar: 'fore' };
    }

    // Under transporten: den första positionen som visar att maskinen stannade kvar, annars en som visar att den var långt borta.
    const under = giltiga.filter(x => x.ms > lassMs && x.ms <= lossMs);
    const kvar = under.find(x => metersFran(lass, x.p.lat, x.p.lng) <= SKOTARPOS.PLATS_M);
    if (kvar) ut.kvar = traff(kvar.ms, metersFran(lass, kvar.p.lat, kvar.p.lng), lassMs);
    if (!ut.langt && loss) {
      const borta = under.find(x => metersFran(lass, x.p.lat, x.p.lng) > SKOTARPOS.LANGT_M && metersFran(loss, x.p.lat, x.p.lng) > SKOTARPOS.PLATS_M);
      if (borta) ut.langt = { ...traff(borta.ms, metersFran(lass, borta.p.lat, borta.p.lng), lassMs), nar: 'under' };
    }
  }

  if (loss && i.lossningArTrakt) {
    const efter = giltiga.find(x => x.ms > lossMs && x.ms <= lossMs + SKOTARPOS.ANKOMST_FONSTER_TIM * TIM);
    if (efter) {
      const m = metersFran(loss, efter.p.lat, efter.p.lng);
      if (m <= SKOTARPOS.PLATS_M) ut.ankomst = traff(efter.ms, m, lossMs);
    }
  }
  return ut;
}

/** Per maskin. Maskiner utan någon position får ett tomt bevis. */
export function skotarBevisPerMaskin(pos: readonly SkotarPos[], maskiner: readonly string[], i: SkotarIndata): Map<string, SkotarBevis> {
  return new Map(maskiner.map(m => [m, skotarBevis(pos.filter(p => p.maskin_id === m), i)]));
}
