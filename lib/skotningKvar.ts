// "Skotning kvar" — avslutat objekt där skotningen inte är klar. SAMMA villkor som den gamla väljaren (app/planering/ObjektValjare.tsx,
// effekten som fyller `skotKvarVo`), som lever kvar orörd för maskinläget. Här i en ren funktion så objektlistan kan testa den.
//
// Skörd klar ≠ skotning klar: ett objekt som markerats avslutat men har virke kvar på backen ska ändå synas för den som ska köra.
// skotning_avslutad styr, aldrig skördning. egen_skotning = säljaren skotar → inte vårt virke.
//
// Nyckel = vo_nummer (objekt_id i dim_objekt om vo_nummer saknas), som i vyerna fakt_lass/produktion.

import { hamtaAlla } from './supabaseAlla';

/** Mer än så här kvar (m³fub, skördat − skotat) räknas som virke på backen. Samma tal som gamla väljarens `> 5`. */
export const SKOTNING_KVAR_MIN_M3 = 5;

export interface SkotningKvarIndata {
  dim: ReadonlyArray<{ objekt_id?: string | null; vo_nummer?: string | null; skotning_avslutad?: unknown; egen_skotning?: boolean | null }>;
  prod: ReadonlyArray<{ objekt_id?: string | null; volym_m3sub?: number | null }>;
  lass: ReadonlyArray<{ objekt_id?: string | null; volym_m3sub?: number | null }>;
  manuell: ReadonlyArray<{ objekt_id?: string | null; maskin_id?: string | null; volym_egen_skotning?: number | null; volym_m3?: number | null; ar_omlastning?: boolean | null }>;
}

/** Mängden vo_nummer där skotningen inte är klar och virke finns kvar. */
export function raknaSkotningKvar(i: SkotningKvarIndata): Set<string> {
  const voAv = new Map<string, string>();
  const skotKlar = new Set<string>(), egen = new Set<string>();
  for (const d of i.dim) {
    const vo = d.vo_nummer || d.objekt_id;
    if (!vo) continue;
    if (d.objekt_id) voAv.set(d.objekt_id, vo);
    if (d.skotning_avslutad) skotKlar.add(vo);
    if (d.egen_skotning === true) egen.add(vo);
  }
  const voFor = (oid: string | null | undefined) => (oid ? voAv.get(oid) || oid : '');
  const skordat = new Map<string, number>(), skotat = new Map<string, number>();
  for (const p of i.prod) { const vo = voFor(p.objekt_id); if (vo) skordat.set(vo, (skordat.get(vo) || 0) + (p.volym_m3sub || 0)); }
  for (const l of i.lass) { const vo = voFor(l.objekt_id); if (vo) skotat.set(vo, (skotat.get(vo) || 0) + (l.volym_m3sub || 0)); }
  // Manuell EGEN skotning räknas som skotat (omlastning aldrig); grot-rader (maskin_id NULL) hoppas över.
  for (const m of i.manuell) {
    if (!m.maskin_id) continue;
    const vo = voFor(m.objekt_id);
    if (!vo) continue;
    const e = m.volym_egen_skotning ?? (m.ar_omlastning ? 0 : (m.volym_m3 ?? 0));
    skotat.set(vo, (skotat.get(vo) || 0) + (Number(e) || 0));
  }
  const kvar = new Set<string>();
  skordat.forEach((sk, vo) => {
    if (skotKlar.has(vo) || egen.has(vo)) return;
    if (sk - (skotat.get(vo) || 0) > SKOTNING_KVAR_MIN_M3) kvar.add(vo);
  });
  return kvar;
}

/** Minimal form på supabase-klienten (så funktionen går att testa utan nät). */
interface Klient {
  from: (tabell: string) => { select: (kolumner: string) => any };
}

/**
 * Hämtar underlaget i omgångar (lib/supabaseAlla, 1 000 rader per svar) tills allt är läst, och räknar.
 * PostgREST kapar tyst vid 1 000 rader; en klippt läsning ger för lite skördat/skotat och objekt som saknas ur underlaget.
 * Varje fråga sorteras på en UNIK nyckel (annars ger .range() dubbletter och saknade rader — STATUS.md, pagineringsbuggen):
 * dim_objekt och de två vyerna har en rad per objekt_id (vyerna är GROUP BY objekt_id), skotare_objekt_manuell har id.
 *
 * `null` = det gick inte att veta (någon fråga, på vilken sida som helst, gav fel) — då visas ingenting som "skotning kvar"
 * i stället för en gissning byggd på halva underlaget (supabase-js kastar inte, den returnerar { data: null, error }).
 */
export async function hamtaSkotningKvar(supabase: Klient, sidstorlek?: number): Promise<Set<string> | null> {
  try {
    const [dimR, prodR, lassR, manR] = await Promise.all([
      hamtaAlla(() => supabase.from('dim_objekt').select('objekt_id, vo_nummer, skotning_avslutad, egen_skotning'), 'objekt_id', sidstorlek),
      hamtaAlla(() => supabase.from('vy_uppf_prod_per_objekt').select('objekt_id, volym_m3sub'), 'objekt_id', sidstorlek),
      hamtaAlla(() => supabase.from('vy_uppf_lass_per_objekt').select('objekt_id, volym_m3sub'), 'objekt_id', sidstorlek),
      hamtaAlla(() => supabase.from('skotare_objekt_manuell').select('objekt_id, maskin_id, volym_egen_skotning, volym_m3, ar_omlastning').is('datum_fran', null), 'id', sidstorlek),
    ]);
    if (dimR.error || prodR.error || lassR.error || manR.error) return null;
    return raknaSkotningKvar({ dim: dimR.data, prod: prodR.data, lass: lassR.data, manuell: manR.data });
  } catch {
    return null;
  }
}
