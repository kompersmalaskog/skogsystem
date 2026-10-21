// Facitets storlek (produktion, oktober 2026) som Supabase-svar — delas av render-testerna
// för Jämförelse (toppfliken) och Skotare › Jämförelse.
//   A130743 (Elefant 26): 139 lass · 3 028 m³ · 105,0 G15h
//   A030353 (Wisent): 1 547 m³ rått → 1 501 efter manuell korrigering (Kroksjömåla 315) · 112,2 G15h
export const DIM = [
  { maskin_id: 'JD810E',  visningsnamn: '810E',       modell: '810E',               maskin_typ: 'Forwarder', aktiv_fran: '2015-12-01', aktiv_till: null,         bekraftad: true },
  { maskin_id: 'A110148', visningsnamn: 'Elefant AF', modell: 'Elephant King AF',   maskin_typ: 'Forwarder', aktiv_fran: '2021-03-01', aktiv_till: '2026-07-08', bekraftad: true },
  { maskin_id: 'A030353', visningsnamn: 'Wisent',     modell: 'Wisent2015',         maskin_typ: 'Forwarder', aktiv_fran: '2024-07-01', aktiv_till: null,         bekraftad: true },
  { maskin_id: 'A130743', visningsnamn: 'Elefant 26', modell: 'Elephant King 2026', maskin_typ: 'Forwarder', aktiv_fran: '2026-08-13', aktiv_till: null,         bekraftad: true },
]
const dag = (n: number) => `2026-10-${String(n).padStart(2, '0')}`
export const lassRader: any[] = []
export const tidRader: any[] = []

// objekt: maskin, objekt, volym per lass, körsträcka tur-retur, antal dagar, p/t/ow (timmar per dag)
function lagg(maskin: string, objekt: string, volymer: number[], kor: number, dagar: number, p: number, t: number, ow: number) {
  volymer.forEach((v, i) => lassRader.push({
    datum: dag(1 + (i % dagar)), maskin_id: maskin, operator_id: 'x', lossnings_tid: null,
    volym_m3sub: v, korstracka_m: kor, objekt_id: objekt,
  }))
  for (let d = 0; d < dagar; d++) tidRader.push({
    datum: dag(1 + d), maskin_id: maskin, operator_id: 'x', objekt_id: objekt,
    processing_sek: p * 3600, terrain_sek: t * 3600, other_work_sek: ow * 3600,
    kort_stopp_sek: 0, rast_sek: 0, bransle_liter: 10, tomgang_sek: 0, engine_time_sek: 0,
  })
}

// EK: 139 lass = 99 × 22 + 40 × 21,25 = 3 028 m³ · G15 = 10 × 7,5 + 5 × 6,0 = 105,0 h
lagg('A130743', 'EK_A', Array(99).fill(22), 730, 10, 5, 2, 0.5)
lagg('A130743', 'EK_B', Array(40).fill(21.25), 740, 5, 5, 0.76, 0.24)
// Wisent: Kroksjömåla rått 361 m³ (manuellt 315) + övrigt 1 186 m³ = 1 547 rått, 1 501 korrigerat
// G15 = 5 × 6,04 + 10 × 8,2 = 112,2 h
lagg('A030353', 'W_K', [...Array(24).fill(14), 25], 640, 5, 4, 1.5, 0.54)
lagg('A030353', 'W_2', Array(84).fill(1186 / 84), 650, 10, 6, 2, 0.2)

export const MANUELL = [{ objekt_id: 'W_K', maskin_id: 'A030353', volym_m3: 315 }]

/** Supabase-mock i samma form som maskinvyns RPC:er och tabeller. */
export function byggSupabaseMock() {
  const tabeller: Record<string, any[]> = {
    dim_maskin: DIM, dim_objekt: [], objekt: [], skotare_objekt_manuell: MANUELL,
  }
  const from = (t: string) => {
    const q: any = { select: () => q, eq: () => q, then: (res: any) => Promise.resolve({ data: tabeller[t] ?? [], error: null }).then(res) }
    return q
  }
  const rpc = (namn: string, p: any) => {
    const kalla = namn === 'maskindata_lass' ? lassRader : tidRader
    const rader = kalla.filter(r =>
      p.p_maskin_ids.includes(r.maskin_id)
      && (!p.p_datum_start || r.datum >= p.p_datum_start)
      && (!p.p_datum_slut || r.datum <= p.p_datum_slut))
    const pr: any = Promise.resolve({ data: rader, error: null })
    pr.range = (a: number, b: number) => Promise.resolve({ data: rader.slice(a, b + 1), error: null })
    return pr
  }
  return { supabase: { from, rpc } }
}
