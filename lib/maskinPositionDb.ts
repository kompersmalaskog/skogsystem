// DB-delen av "senast kända position": maskinens senaste hyttspår-punkt (lib/maskinPosition = det rena valet).
// Tre tunna frågor, sekvens ≈ 300 ms mot prod (objekt ≈ 90 ms → index ≈ 100 ms → punkter ≈ 100 ms):
//   1. objekt maskinen är tilldelad (skotare ELLER skördare) — spår-raderna saknar maskin_id i prod
//   2. spår-index för de objekten (UTAN points — de är hundratals KB per rad)
//   3. punkterna för DEN valda raden + hela objekt-raden, parallellt
// Tar klienten som parameter (inte en importerad singleton) så anropet kan köras mot prod från ett skript.

import {
  valjSenasteSpar, senastePunkt, valjStartPosition,
  type HyttsparIndexRad, type ObjektTilldelning, type StartPosition,
} from './maskinPosition';

/** Det vi behöver av supabase-js: from(tabell) → byggare. Strukturell typ så ett skript/test kan skicka sin egen klient. */
export interface DbLike { from(tabell: string): any }

export interface SparStart {
  start: StartPosition;          // position + spårets objekt-koppling
  objekt: any | null;            // HELA objekt-raden för spårets objekt (null = raden finns inte längre)
}

// maskin_id hamnar i ett PostgREST-.or()-filter → bara tecken som inte kan bryta filtret (kommatecken/parenteser).
const SAKER_MASKIN_ID = /^[A-Za-z0-9_.-]+$/;

export async function hamtaSenasteSparStart(
  db: DbLike,
  maskinId: string,
  /** Anropas så fort spårets objekt är känt (innan punkter/objekt-rad är hämtade) — för att förladda t.ex. geometrin parallellt. */
  vidObjektKant?: (objektId: string) => void,
): Promise<SparStart | null> {
  if (!SAKER_MASKIN_ID.test(maskinId)) return null;

  const tilld = await db.from('objekt')
    .select('id,skotare_maskin_id,skordare_maskin_id')
    .or(`skotare_maskin_id.eq.${maskinId},skordare_maskin_id.eq.${maskinId}`);
  const objekt = ((tilld?.data ?? []) as ObjektTilldelning[]);

  const ids = objekt.map((o) => o.id);
  const filter = ids.length > 0 ? `maskin_id.eq.${maskinId},objekt_id.in.(${ids.join(',')})` : `maskin_id.eq.${maskinId}`;
  const idx = await db.from('hyttspar')
    .select('id,objekt_id,roll,datum,maskin_id,antal_punkter,uppdaterad_at')
    .or(filter)
    .gt('antal_punkter', 0)
    .order('datum', { ascending: false })
    .order('uppdaterad_at', { ascending: false })
    .limit(30);
  const rad = valjSenasteSpar({ maskinId, index: ((idx?.data ?? []) as HyttsparIndexRad[]), objekt });
  if (!rad) return null;

  if (rad.objekt_id && vidObjektKant) { try { vidObjektKant(rad.objekt_id); } catch { /* förladdning är icke-kritisk */ } }
  const [pts, obj] = await Promise.all([
    db.from('hyttspar').select('points').eq('id', rad.id).maybeSingle(),
    rad.objekt_id ? db.from('objekt').select('*').eq('id', rad.objekt_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const punkt = senastePunkt(pts?.data?.points);
  if (!punkt) return null;
  const start = valjStartPosition({ lokalPos: null, spar: { rad, punkt } });
  return start ? { start, objekt: obj?.data ?? null } : null;
}
