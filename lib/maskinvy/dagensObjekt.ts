// Vilka objekt maskinen arbetade på under dagen som Idag visar (skördare: fakt_produktion, skotare: fakt_lass).
//
// Namnet kommer ur dim_objekt.object_name — samma källa som Produktion. Flera objekt_id kan dela ett namn (en VO-grupp),
// och de slås ihop till EN rad, så att listan visar det föraren känner igen. Ett objekt_id som inte finns i dim_objekt
// får inte gissas till ett namn: det blir "Okänt objekt" och räknas med. Rader utan objekt_id alls räknas separat och
// sägs, så att listans volymer aldrig ser ut att vara hela dagen när de inte är det.

export type ObjektRad = { objekt_id: string | null | undefined; volym_m3sub: number | null | undefined }

export type DagensObjektRad = {
  /** Stabil nyckel: namnet när det är känt, annars objekt_id. */
  nyckel: string
  namn: string
  /** false = objekt_id saknas i dim_objekt. */
  kand: boolean
  ids: string[]
  volym: number
}

export type DagensObjekt = {
  objekt: DagensObjektRad[]
  /** m³ på rader som saknar objekt_id helt. */
  utanObjektVolym: number
}

export const OKANT_OBJEKT = 'Okänt objekt'

export function dagensObjekt(
  rader: ObjektRad[], namnAv: Readonly<Record<string, string | null | undefined>>,
): DagensObjekt {
  const grupper = new Map<string, DagensObjektRad>()
  let utanObjektVolym = 0
  for (const r of rader) {
    const volym = r.volym_m3sub ?? 0
    if (!r.objekt_id) { utanObjektVolym += volym; continue }
    const namn = namnAv[r.objekt_id]?.trim() || null
    const nyckel = namn ?? r.objekt_id
    const g = grupper.get(nyckel) ?? { nyckel, namn: namn ?? OKANT_OBJEKT, kand: namn != null, ids: [], volym: 0 }
    if (!g.ids.includes(r.objekt_id)) g.ids.push(r.objekt_id)
    g.volym += volym
    grupper.set(nyckel, g)
  }
  const objekt = Array.from(grupper.values()).sort((a, b) => b.volym - a.volym || a.namn.localeCompare(b.namn, 'sv'))
  return { objekt, utanObjektVolym }
}
