// Operatörskorten i maskinvyn: EN rad per PERSON, inte per operator_id.
//
// Samma förare kan ha flera operator_id på en maskin (Max Karlsson på Wisent:
// A030353_1 och A030353_3 — två rader, 15,7 och 11,7 m³/G15h). operator_medarbetare
// knyter varje operator_id till en medarbetare; ihopslagningen går på den. Saknas
// kopplingen (ny operatör, tabellen oläsbar) faller den tillbaka på normaliserat
// namn — samma namn i samma lista är samma person.
//
// Siffrorna summeras, aldrig snitt av snitt: g15h, volym och stammar adderas och
// produktiviteten räknas om (volym / g15h). Dagar är DISTINKTA datum över alla
// personens operator_id — en dag med två id räknas en gång.

import { kvotVolymUrDagar } from './skotarlass'

/**
 * Appens lass har ingen operator_id utan en medarbetare. De får ett syntetiskt id `app:<medarbetare_id>` (som kopplas till samma person
 * i `OperatorKoppling`), så en förare som kört både med Opti-fil och registrerat i appen blir EN rad.
 */
export const APP_OPERATOR_PREFIX = 'app:'
const arApp = (id: string): number => (id.startsWith(APP_OPERATOR_PREFIX) ? 1 : 0)

export type OperatorSumma = {
  id: string
  namn: string
  g15h: number
  volym: number
  stammar: number
  dagar: number
  prod: number | null
  /** Alla operator_id som hör till personen (djupvyn hämtar på dem). */
  ids?: string[]
  /** Distinkta produktionsdatum — behövs för att dagar ska kunna slås ihop utan dubbelräkning. */
  datum?: string[]
  /**
   * Skotare: volym och G15-sekunder per dag. Produktiviteten (m³/G15h) räknas bara på volym från dagar som har G15-tid — appens lass
   * har ingen maskintid, och volym utan tid i täljaren blåser upp kvoten (lib/maskinvy/skotarlass).
   */
  volymPerDag?: Record<string, number>
  g15SekPerDag?: Record<string, number>
}

/** operator_id → medarbetare_id (ur operator_medarbetare). */
export type OperatorKoppling = Map<string, string>

export const normaliseraNamn = (namn: string | null | undefined): string =>
  (namn ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()

export function slaIhopOperatorer<T extends OperatorSumma>(
  ops: T[], koppling: OperatorKoppling = new Map(),
): T[] {
  // Normaliserat namn → medarbetare, ur operatörer i listan som HAR en koppling:
  // en okopplad operatör med exakt samma namn hör till samma person.
  const namnTillMed = new Map<string, string>()
  for (const o of ops) {
    const med = koppling.get(o.id)
    const n = normaliseraNamn(o.namn)
    if (med && n && !namnTillMed.has(n)) namnTillMed.set(n, med)
  }

  const grupper = new Map<string, T[]>()
  for (const o of ops) {
    const med = koppling.get(o.id) ?? namnTillMed.get(normaliseraNamn(o.namn))
    const n = normaliseraNamn(o.namn)
    const nyckel = med ? `m:${med}` : n ? `n:${n}` : `o:${o.id}`
    const g = grupper.get(nyckel)
    if (g) g.push(o); else grupper.set(nyckel, [o])
  }

  const ut: T[] = []
  grupper.forEach(medlemmar => {
    if (medlemmar.length === 1) {
      const o = medlemmar[0]
      ut.push({ ...o, ids: o.ids ?? [o.id] })
      return
    }
    // Appens syntetiska id sist: personens namn ska vara det Opti-namn som finns (fullt namn), inte appens förnamn.
    const sorterade = [...medlemmar].sort((a, b) => arApp(a.id) - arApp(b.id) || a.id.localeCompare(b.id))
    const forst = sorterade[0]
    const ids = Array.from(new Set(sorterade.flatMap(m => m.ids ?? [m.id])))
    const harDatum = sorterade.every(m => m.datum !== undefined)
    const datum = harDatum ? Array.from(new Set(sorterade.flatMap(m => m.datum!))).sort() : undefined
    const g15h = sorterade.reduce((s, m) => s + m.g15h, 0)
    const volym = sorterade.reduce((s, m) => s + m.volym, 0)
    // Per-dag-kartorna adderas dag för dag; finns de på alla medlemmar räknas kvoten på volym från dagar med G15-tid.
    const harDagar = sorterade.every(m => m.volymPerDag !== undefined && m.g15SekPerDag !== undefined)
    let volymPerDag: Record<string, number> | undefined
    let g15SekPerDag: Record<string, number> | undefined
    if (harDagar) {
      volymPerDag = {}; g15SekPerDag = {}
      for (const m of sorterade) {
        for (const [d, v] of Object.entries(m.volymPerDag!)) volymPerDag[d] = (volymPerDag[d] ?? 0) + v
        for (const [d, v] of Object.entries(m.g15SekPerDag!)) g15SekPerDag[d] = (g15SekPerDag[d] ?? 0) + v
      }
    }
    const kvotVolym = harDagar ? kvotVolymUrDagar(volymPerDag!, g15SekPerDag!) : volym
    ut.push({
      ...forst,
      ids,
      datum,
      g15h,
      volym,
      volymPerDag,
      g15SekPerDag,
      stammar: sorterade.reduce((s, m) => s + m.stammar, 0),
      // utan datumlistor går bara summan (kan dubbelräkna en gemensam dag)
      dagar: datum ? datum.length : sorterade.reduce((s, m) => s + m.dagar, 0),
      prod: g15h > 0 ? kvotVolym / g15h : null,
    })
  })
  return ut.sort((a, b) => a.namn.localeCompare(b.namn, 'sv'))
}
