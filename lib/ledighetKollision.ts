// ─────────────────────────────────────────────────────────────
// Delad SANNING för ledighet-på-arbetsdag — godkänd ledighet på en dag med
// registrerat arbete (arbetad_min > 0). "Arbete vinner" i visning/lön, men en
// uttagen semesterdag som samtidigt jobbades är en avvikelse att granska före
// lön. Ren funktion, medarbetare_id rå (yta formaterar namn).
// ─────────────────────────────────────────────────────────────

export type LedighetKollision = {
  medarbetare_id: string; datum: string; typ: string; arbetad_min: number
}

/**
 * Expanderar varje godkänd ledighet till datum och matchar mot arbetsdagar med
 * arbetad_min > 0. Sorterad datum desc. Anroparen scopar in-data (t.ex. till en
 * löneperiod) — funktionen matchar bara det den får.
 */
export function ledighetKollisioner(
  ledigheter: { medarbetare_id: string; typ: string | null; startdatum: string | null; slutdatum: string | null }[],
  arbetsdagar: { medarbetare_id: string; datum: string; arbetad_min: number | null }[],
): LedighetKollision[] {
  const arb = new Map<string, number>()
  for (const a of arbetsdagar || []) arb.set(`${a.medarbetare_id}|${a.datum}`, a.arbetad_min || 0)
  const ut: LedighetKollision[] = []
  for (const l of ledigheter || []) {
    if (!l.startdatum || !l.slutdatum) continue
    const start = new Date(l.startdatum + 'T00:00:00')
    const slut = new Date(l.slutdatum + 'T00:00:00')
    for (let dt = new Date(start); dt <= slut; dt.setDate(dt.getDate() + 1)) {
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      const min = arb.get(`${l.medarbetare_id}|${iso}`)
      if (min && min > 0) ut.push({ medarbetare_id: l.medarbetare_id, datum: iso, typ: l.typ || 'ledig', arbetad_min: min })
    }
  }
  ut.sort((a, b) => b.datum.localeCompare(a.datum))
  return ut
}
