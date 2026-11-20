// HYTTSPÅR UTAN OBJEKT → OBJEKT.
//
// Skyddsnätet på maskindatorn: ingen svarade på "Inget objekt här — Starta jobb?" → hyttspåret loggas ändå med objekt_id = NULL
// (lib/hyttsparNyckel). När ett objekt SEN täcker spåret kopplas raden dit AUTOMATISKT:
//   • import-trakt: ett Vida-objekt skapas/omimporteras med sin traktgräns → spår inom gränsen kopplas
//   • Starta jobb-kortet/listvalet på maskindatorn: objektet maskinen just startade/valde → maskinens egna spår inom 300 m kopplas
// Träffregeln är objektPlats.objektTraffPunkt (traktgräns → inne; bara en punkt → inom 300 m). Andel + minsta antal punkter inne skyddar mot ett spår
// som bara passerar förbi.
//
// Själva skrivningen kör med service-roll (en klient får inte radera hyttspar-rader — bara select/insert/update-policy). Den ÄR idempotent: en rad som
// redan flyttats syns inte längre som "utan objekt". Läser tillbaka (select) det den skrivit — antalet kopplade räknas ur raderna som verkligen ändrades.

import { objektTraffPunkt, type TraktGeometriFC } from './objektPlats';
import { slaIhopPunkter } from './hyttsparSlaIhop';

/** Så stor andel av spårpunkterna ska ligga i objektet. */
export const KOPPLA_ANDEL_MIN = 0.5;
/** Så många punkter ska minst ligga inne (import: ett riktigt pass; maskinens eget nyss loggade spår kan sänka till 1). */
export const KOPPLA_PUNKTER_MIN = 3;
/** Hur långt bakåt vi letar efter spår utan objekt. */
export const KOPPLA_DAGAR = 60;

export interface SparPunktXY { lat: number; lng: number }
export interface KopplaObjekt { id: string; lat?: number | null; lng?: number | null; geometri?: TraktGeometriFC | null }

/** Täcker objektet detta spår? (ren) */
export function objektTackerSpar(
  o: Pick<KopplaObjekt, 'lat' | 'lng' | 'geometri'>,
  points: unknown,
  opt: { punkterMin?: number; andelMin?: number } = {},
): boolean {
  const punkter = (Array.isArray(points) ? points : []).filter((p: any) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) as SparPunktXY[];
  if (punkter.length === 0) return false;
  const inne = punkter.filter((p) => objektTraffPunkt(o, p.lat, p.lng)).length;
  return inne >= (opt.punkterMin ?? KOPPLA_PUNKTER_MIN) && inne / punkter.length >= (opt.andelMin ?? KOPPLA_ANDEL_MIN);
}

export interface KopplaSvar {
  ok: boolean;
  fel?: string;
  /** Rader som flyttades till objektet. */
  kopplade: number;
  /** Av dem: rader som slogs ihop med objektets egen rad för samma roll+dag (källraden togs bort). */
  sammanslagna: number;
  /** Spår utan objekt som INTE täcktes (lämnade orörda). */
  ejTackta: number;
}

type Db = { from(t: string): any };
const dagarSedan = (n: number, nu: Date) => new Date(nu.getTime() - n * 864e5).toISOString().slice(0, 10);

/** Koppla alla hyttspår-rader utan objekt (ev. bara en maskins) som objektet täcker. Service-klient. */
export async function kopplaHyttsparTillObjekt(
  db: Db,
  objekt: KopplaObjekt,
  opt: { maskinId?: string | null; dagar?: number; punkterMin?: number; nu?: Date } = {},
): Promise<KopplaSvar> {
  const nu = opt.nu ?? new Date();
  let q = db.from('hyttspar').select('id, roll, datum, maskin_id, points').is('objekt_id', null).gte('datum', dagarSedan(opt.dagar ?? KOPPLA_DAGAR, nu));
  if (opt.maskinId) q = q.eq('maskin_id', opt.maskinId);
  const { data: rader, error } = await q;
  if (error) return { ok: false, fel: 'Kunde inte läsa spår utan objekt: ' + error.message, kopplade: 0, sammanslagna: 0, ejTackta: 0 };

  let kopplade = 0, sammanslagna = 0, ejTackta = 0;
  for (const r of rader || []) {
    if (!objektTackerSpar(objekt, r.points, { punkterMin: opt.punkterMin })) { ejTackta++; continue; }
    const { data: mal, error: malFel } = await db.from('hyttspar').select('id, points').eq('objekt_id', objekt.id).eq('roll', r.roll).eq('datum', r.datum).maybeSingle();
    if (malFel) return { ok: false, fel: 'Kunde inte läsa objektets spår: ' + malFel.message, kopplade, sammanslagna, ejTackta };
    if (mal) {
      const ihop = slaIhopPunkter(mal.points, r.points);
      const { data: upd, error: updFel } = await db.from('hyttspar')
        .update({ points: ihop, antal_punkter: ihop.length, uppdaterad_at: nu.toISOString() }).eq('id', mal.id).select('id');
      if (updFel || !upd || upd.length !== 1) return { ok: false, fel: 'Kunde inte slå ihop spåren' + (updFel ? ': ' + updFel.message : ' — raden träffades inte'), kopplade, sammanslagna, ejTackta };
      // Källraden tas bort FÖRST när målet läsbart bär punkterna.
      const { error: delFel } = await db.from('hyttspar').delete().eq('id', r.id);
      if (delFel) return { ok: false, fel: 'Kunde inte ta bort den sammanslagna raden: ' + delFel.message, kopplade, sammanslagna, ejTackta };
      sammanslagna++; kopplade++;
    } else {
      const { data: upd, error: updFel } = await db.from('hyttspar').update({ objekt_id: objekt.id }).eq('id', r.id).is('objekt_id', null).select('id');
      if (updFel || !upd || upd.length !== 1) return { ok: false, fel: 'Kunde inte koppla spåret' + (updFel ? ': ' + updFel.message : ' — raden träffades inte'), kopplade, sammanslagna, ejTackta };
      kopplade++;
    }
  }
  return { ok: true, kopplade, sammanslagna, ejTackta };
}
