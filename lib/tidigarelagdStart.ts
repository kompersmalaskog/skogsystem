// ─────────────────────────────────────────────────────────────
// Delad SANNING för TIDIGARELAGD START — dagar där föraren angav en start > 30 min
// FÖRE maskinens egen login (mom-import 5e, arbetsdag.tidigarelagd_start). Angiven
// tid styr fortsatt arbetsdag/lön; detta är UPPFÖLJNING. Admin-kortet vill se
// MÖNSTER — samma förare gång på gång, inte enskilda dagar. En enstaka ändring är
// vardag; femtio dagar i rad är något annat. Ren funktion, ingen I/O. Samma mönster
// som lib/synkAvvikelse.
// ─────────────────────────────────────────────────────────────

export type TidigarelagdStatus = 'oforklarad' | 'forklarad' | 'hoppad'

export type TidigarelagdRad = {
  medarbetare_id: string
  datum: string
  gap_min: number
  angiven_start: string
  maskin_start: string
  aktivitet: string | null
  status: TidigarelagdStatus       // oforklarad = ej kvitterad; forklarad = aktivitet vald; hoppad = kvitterad utan aktivitet
}

export type TidigarelagdMonster = {
  medarbetare_id: string
  dagar: number
  summaMin: number
}

/**
 * Alla tidigarelagd-start-rader (arbetsdag med tidigarelagd_start != null),
 * sorterade på störst gap först. Ren — medarbetare_id lämnas rå (namn formateras
 * per yta).
 */
export function tidigarelagdRader(
  rader: { medarbetare_id: string; datum: string; tidigarelagd_start: any }[],
): TidigarelagdRad[] {
  const ut: TidigarelagdRad[] = []
  for (const d of rader || []) {
    const t = d.tidigarelagd_start
    if (!t) continue
    const status: TidigarelagdStatus = !t.kvitterad ? 'oforklarad' : (t.aktivitet ? 'forklarad' : 'hoppad')
    ut.push({
      medarbetare_id: d.medarbetare_id, datum: String(d.datum),
      gap_min: t.gap_min || 0, angiven_start: t.angiven_start, maskin_start: t.maskin_start,
      aktivitet: t.aktivitet ?? null, status,
    })
  }
  ut.sort((x, y) => y.gap_min - x.gap_min)
  return ut
}

/**
 * Per förare: antal dagar + summa gap-minuter. MÖNSTER, inte enskilda dagar.
 * Sorterat på flest dagar först (störst summa som tiebreak) — den som ändrar
 * tiden ofta hamnar överst.
 */
export function tidigarelagdMonster(
  rader: { medarbetare_id: string; datum: string; tidigarelagd_start: any }[],
): TidigarelagdMonster[] {
  const m = new Map<string, TidigarelagdMonster>()
  for (const r of tidigarelagdRader(rader)) {
    const e = m.get(r.medarbetare_id) || { medarbetare_id: r.medarbetare_id, dagar: 0, summaMin: 0 }
    e.dagar += 1
    e.summaMin += r.gap_min
    m.set(r.medarbetare_id, e)
  }
  return Array.from(m.values()).sort((a, b) => b.dagar - a.dagar || b.summaMin - a.summaMin)
}
