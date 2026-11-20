// ─────────────────────────────────────────────────────────────
// Delad SANNING för synk-avvikelser — bekräftade dagar vars maskintider byggts
// om till andra värden än föraren skrev under på (mom-import 5d). Räknar EN gång:
// skillnaden i arbetad tid + status. Så Lön-fliken och löneexportens varning
// aldrig kan säga olika om samma dag. Samma mönster som lib/kmErsattning och
// datumLokal. FRÅGAN (vilka dagar, hur stor skillnad, hanterad?) bor här;
// formatering av visningssträngar sker per yta (presentation).
// ─────────────────────────────────────────────────────────────

export type SynkAvvikelseStatus = 'oforklarad' | 'forklarad' | 'hoppad'

export type SynkAvvikelse = {
  medarbetare_id: string
  datum: string
  deltaMin: number                 // bekräftad arbetad_min − MOM arbetad_min
  bekraftad_start: string; bekraftad_slut: string; bekraftad_rast_min: number
  mom_start: string; mom_slut: string; mom_rast_min: number
  aktivitet: string | null
  status: SynkAvvikelseStatus      // oforklarad = ej kvitterad; forklarad = aktivitet vald; hoppad = kvitterad utan aktivitet
}

const tMin = (t: any): number => {
  const m = String(t || '').match(/(\d{2}):(\d{2})/)
  return m ? (+m[1]) * 60 + (+m[2]) : 0
}

// Aktivitet-nyckel → svensk etikett (samma taxonomi som AKTIVITETER i arbetsrapporten).
export const AKT_ETIKETT: Record<string, string> = {
  reservdelar: 'Hämta reservdelar', service: 'Service', reparation: 'Reparation',
  utbildning: 'Utbildning', markagare: 'Markägarmöte', flytt: 'Flytt av maskin',
  brandkontroll: 'Brandkontroll', mote: 'Möte', rotben: 'Kapa rotben', annat: 'Annat',
}
export const aktEtikett = (a: string | null | undefined): string | null =>
  a ? (AKT_ETIKETT[a] || a) : null

/**
 * Alla synk-avvikelser ur arbetsdag-rader (med synk_avvikelse != null), sorterade
 * på störst skillnad i arbetad tid först. Ren funktion — ingen I/O, ingen
 * namnuppslagning (medarbetare_id lämnas rå så varje yta formaterar namnet själv).
 */
export function synkAvvikelser(
  rader: { medarbetare_id: string; datum: string; synk_avvikelse: any }[],
): SynkAvvikelse[] {
  const ut: SynkAvvikelse[] = []
  for (const d of rader || []) {
    const a = d.synk_avvikelse
    if (!a) continue
    const conf = (tMin(a.bekraftad_slut) - tMin(a.bekraftad_start)) - (a.bekraftad_rast_min || 0)
    const mom = (tMin(a.mom_slut) - tMin(a.mom_start)) - (a.mom_rast_min || 0)
    const status: SynkAvvikelseStatus = !a.kvitterad ? 'oforklarad' : (a.aktivitet ? 'forklarad' : 'hoppad')
    ut.push({
      medarbetare_id: d.medarbetare_id, datum: String(d.datum), deltaMin: conf - mom,
      bekraftad_start: a.bekraftad_start, bekraftad_slut: a.bekraftad_slut, bekraftad_rast_min: a.bekraftad_rast_min ?? 0,
      mom_start: a.mom_start, mom_slut: a.mom_slut, mom_rast_min: a.mom_rast_min ?? 0,
      aktivitet: a.aktivitet ?? null, status,
    })
  }
  ut.sort((x, y) => y.deltaMin - x.deltaMin)
  return ut
}
