// ─────────────────────────────────────────────────────────────
// Delad logik för DAGSEGMENT — tid MÄRKT inom en inloggad dag (brandvakt,
// markägarbesök). Redan betald, annoteras bara för fakturering. Ren funktioner
// som BÅDE redigera-vyns segment-formulär OCH synk-kortets omriktning använder,
// så de räknar likadant. Ingen I/O.
// ─────────────────────────────────────────────────────────────

const tMin = (t: string | null | undefined): number => {
  const m = String(t || '').match(/(\d{1,2}):(\d{2})/)
  return m ? (+m[1]) * 60 + (+m[2]) : 0
}
const hhmm = (t: string | null | undefined): string => (t ? String(t).slice(0, 5) : '')

export type Gap = { start: string; slut: string; minuter: number }

/**
 * Härled VAR icke-maskintiden fanns ur en synk_avvikelse: gapet FÖRE maskinen
 * startade (bekräftad_start → mom_start) och EFTER den stannade (mom_slut →
 * bekräftad_slut). Inte en gissning — det är exakt där skillnaden ligger. Bara
 * gap ≥ 1 min. Rast-differensen går inte att placera i tiden och tas inte med.
 * Sorterat störst först (så formuläret default:ar till största gapet).
 */
export function harledGap(a: {
  bekraftad_start: string; bekraftad_slut: string; mom_start: string; mom_slut: string
}): Gap[] {
  const gaps: Gap[] = []
  const bs = tMin(a.bekraftad_start), bsl = tMin(a.bekraftad_slut)
  const ms = tMin(a.mom_start), msl = tMin(a.mom_slut)
  if (ms - bs >= 1) gaps.push({ start: hhmm(a.bekraftad_start), slut: hhmm(a.mom_start), minuter: ms - bs })
  if (bsl - msl >= 1) gaps.push({ start: hhmm(a.mom_slut), slut: hhmm(a.bekraftad_slut), minuter: bsl - msl })
  return gaps.sort((x, y) => y.minuter - x.minuter)
}

export type SegmentValidering = { ok: true } | { ok: false; fel: string }

/**
 * Validera ett segment före insert: positiv längd, ryms INOM dagens start/slut
 * (kan inte uttryckas i DB — ligger i arbetsdag), och överlappar inte något
 * befintligt segment (DB:n har överlapp som backstop; detta ger begripligt fel).
 */
export function valideraSegment(
  seg: { start: string; slut: string },
  dag: { start_tid: string | null; slut_tid: string | null },
  befintliga: { start_tid: string; slut_tid: string }[],
): SegmentValidering {
  const s = tMin(seg.start), e = tMin(seg.slut)
  if (e <= s) return { ok: false, fel: 'Sluttiden måste vara efter starttiden.' }
  if (dag.start_tid && s < tMin(dag.start_tid)) return { ok: false, fel: `Perioden börjar före dagens start (${hhmm(dag.start_tid)}).` }
  if (dag.slut_tid && e > tMin(dag.slut_tid)) return { ok: false, fel: `Perioden slutar efter dagens slut (${hhmm(dag.slut_tid)}).` }
  for (const b of befintliga) {
    if (s < tMin(b.slut_tid) && tMin(b.start_tid) < e) {
      return { ok: false, fel: `Överlappar en period du redan märkt (${hhmm(b.start_tid)}–${hhmm(b.slut_tid)}).` }
    }
  }
  return { ok: true }
}

export const segHhmm = hhmm
