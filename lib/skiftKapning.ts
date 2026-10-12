// ─────────────────────────────────────────────────────────────
// SYNTETISKA SKIFT SLUTAR NÄR NÄSTA FÖRARE LOGGAR IN.
//
// Rottne-maskiner (R64101, R64428) saknar OperatorShiftDefinition. Importen bygger då syntetiska skift (shift_key
// "SYN_<datum>_<operator>") av WorkTime, och fyller utloggningen ut till filens ReportEndTime. Förr gällde fyllnaden ALLA
// förare den dagen: R64428 2026-10-07 fick Oskar (slutade 16:50) och Martin (16:50–20:50) exakt samma utloggning
// 20:50:51.132817, och Oskars arbetsdag blev 06:59–20:50.
//
// Regeln (Martin 2026-10-08): ett SYNTETISKT pass slutar när en annan förare loggar in på samma maskin medan passet är
// öppet. Äkta skift (Ponsse, ShifKey) rörs ALDRIG — där är utloggningen maskinens egen uppgift, inte en gissning.
//
// Samma regel finns i importen (skogsmaskin_import_version_6.kapa_syntetiska_skift) — håll dem i synk. Den här körs
// också i /api/mom-import som skydd, så arbetsdagen är rätt även om fakt_skift ännu inte kapats.
// ─────────────────────────────────────────────────────────────

export type SkiftRad = {
  maskin_id: string
  datum: string
  operator_id: string
  shift_key?: string | null
  inloggning_tid: string
  utloggning_tid: string
  langd_sek?: number | null
}

/** Ett skift vars slut är härlett (parsern byggde det av WorkTime), inte maskinens eget. */
export function arSyntetisktSkift(r: { shift_key?: string | null }): boolean {
  return String(r.shift_key || "").startsWith("SYN_")
}

const ms = (s: string) => Date.parse(s)

/**
 * Kapa varje syntetiskt pass till den inloggning som en ANNAN förare gör på samma maskin och dag medan passet är öppet
 * (strikt efter passets egen inloggning, strikt före dess utloggning). `langd_sek` räknas om som i importen (trunkerat).
 * Ren funktion: indatan ändras inte, och ett redan kapat pass kapas inte igen.
 */
export function kapaSyntetiskaSkift<T extends SkiftRad>(rader: T[]): T[] {
  const grupper = new Map<string, T[]>()
  for (const r of rader) {
    const k = `${r.maskin_id}|${r.datum}`
    const g = grupper.get(k)
    if (g) g.push(r)
    else grupper.set(k, [r])
  }
  return rader.map(r => {
    if (!arSyntetisktSkift(r)) return r
    const inn = ms(r.inloggning_tid)
    const ut = ms(r.utloggning_tid)
    if (!Number.isFinite(inn) || !Number.isFinite(ut)) return r
    let kap: T | null = null
    for (const o of grupper.get(`${r.maskin_id}|${r.datum}`) || []) {
      if (o.operator_id === r.operator_id) continue
      const oin = ms(o.inloggning_tid)
      if (oin > inn && oin < ut && (!kap || oin < ms(kap.inloggning_tid))) kap = o
    }
    if (!kap) return r
    return { ...r, utloggning_tid: kap.inloggning_tid, langd_sek: Math.floor((ms(kap.inloggning_tid) - inn) / 1000) }
  })
}
