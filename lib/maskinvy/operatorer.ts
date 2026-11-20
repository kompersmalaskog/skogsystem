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
    const sorterade = [...medlemmar].sort((a, b) => a.id.localeCompare(b.id))
    const forst = sorterade[0]
    const ids = Array.from(new Set(sorterade.flatMap(m => m.ids ?? [m.id])))
    const harDatum = sorterade.every(m => m.datum !== undefined)
    const datum = harDatum ? Array.from(new Set(sorterade.flatMap(m => m.datum!))).sort() : undefined
    const g15h = sorterade.reduce((s, m) => s + m.g15h, 0)
    const volym = sorterade.reduce((s, m) => s + m.volym, 0)
    ut.push({
      ...forst,
      ids,
      datum,
      g15h,
      volym,
      stammar: sorterade.reduce((s, m) => s + m.stammar, 0),
      // utan datumlistor går bara summan (kan dubbelräkna en gemensam dag)
      dagar: datum ? datum.length : sorterade.reduce((s, m) => s + m.dagar, 0),
      prod: g15h > 0 ? volym / g15h : null,
    })
  })
  return ut.sort((a, b) => a.namn.localeCompare(b.namn, 'sv'))
}
