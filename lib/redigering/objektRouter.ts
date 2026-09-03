'use client'
// Två-tabell save-router — FUNDAMENT för redigeringsvyns omdesign (Etapp 0).
// Ingen UI använder den än; den wire:as in i Etapp 1.
//
// dim_objekt äger de flesta redigerbara fält; objekt-tabellen (planering) äger
// status/trakt/förare. Några fält finns i BÅDA (dubbletter) eller under olika
// kolumnnamn (object_name↔namn, markägare skogsagare↔markagare) — de speglas till
// båda så tabellerna aldrig driver isär (Rössmåla-desyncen, #407).
//
// SÄKER resolution trots svag koppling (verifierat i prod 2026-08-24: bara 3/52
// objekt-rader har dim_objekt_id, men objekt.vo_nummer är UNIKT → vo-matchning
// träffar ≤1 rad). Ordning: dim_objekt_id (FK) → vo_nummer. Saknas objekt-rad →
// objekt-delen skippas TYST. Routern SKAPAR ALDRIG en objekt-rad (Martins beslut):
// dim_objekt är källan; objekt-endast-fält utan rad går inte att spara (Etapp 2
// hanterar det separat om det behövs).
//
// Verifierad save (som #475/#476/#480): läser tillbaka VÄRDET på varje patchat
// fält, inte bara radantal.
import { supabase } from '@/lib/supabase'

// Kolumn per tabell för varje LOGISKT fält. undefined = fältet finns ej i tabellen.
export type FaltRutt = { dim?: string; objekt?: string }

export const FALT_RUTT: Record<string, FaltRutt> = {
  // ── Dubblettfält — samma kolumnnamn i båda tabellerna (speglas) ──
  vo_nummer:        { dim: 'vo_nummer', objekt: 'vo_nummer' },
  atgard:           { dim: 'atgard', objekt: 'atgard' },
  bolag:            { dim: 'bolag', objekt: 'bolag' },
  avverkningsform:  { dim: 'avverkningsform', objekt: 'avverkningsform' },
  inkopare:         { dim: 'inkopare', objekt: 'inkopare' },
  // ── Olika kolumnnamn i de två tabellerna (speglas med remap) ──
  object_name:      { dim: 'object_name', objekt: 'namn' },       // #407 speglar object_name→objekt.namn
  markagare:        { dim: 'skogsagare', objekt: 'markagare' },   // markägare bor på olika kolumner

  // ── dim_objekt-only ──
  huvudtyp:            { dim: 'huvudtyp' },
  exkludera:           { dim: 'exkludera' },
  // Etapp 1c — fält som drogs upp ur undersidorna. Maskinspecifika (stubbe/
  // extra_vagn/klippning/avslut) skrivs av ANROPAREN mot rätt maskinslags rader
  // via ref.dimObjektIds — routern vet inget om harvester/forwarder-splitten.
  grot_anpassad:           { dim: 'grot_anpassad' },
  grot_hamtad:             { dim: 'grot_hamtad' },
  stubbbehandling:         { dim: 'stubbbehandling' },
  extra_vagn:              { dim: 'extra_vagn' },
  klippning:               { dim: 'klippning' },
  skordning_avslutad_auto: { dim: 'skordning_avslutad_auto' },
  skotning_avslutad_auto:  { dim: 'skotning_avslutad_auto' },
  terrang_kr_manuell:  { dim: 'terrang_kr_manuell' },
  skotavstand_manuell: { dim: 'skotavstand_manuell' },
  tilldelad_skotare:   { dim: 'tilldelad_skotare' },
  skordning_avslutad:  { dim: 'skordning_avslutad' },
  skotning_avslutad:   { dim: 'skotning_avslutad' },
  extern_skordning:    { dim: 'extern_skordning' },
  egen_skotning:       { dim: 'egen_skotning' },
  risskotning:         { dim: 'risskotning' },

  // ── objekt-only (planering) ──
  status:                     { objekt: 'status' },
  assigned_skordare_user_id:  { objekt: 'assigned_skordare_user_id' },
  assigned_skotare_user_id:   { objekt: 'assigned_skotare_user_id' },
  traktnr:                    { objekt: 'traktnr' },
  traktkarta_url:             { objekt: 'traktkarta_url' },
  traktdirektiv_url:          { objekt: 'traktdirektiv_url' },
  trakt_data:                 { objekt: 'trakt_data' },
  skotare_band:               { objekt: 'skotare_band' },
  skotare_band_par:           { objekt: 'skotare_band_par' },
  skordare_band:              { objekt: 'skordare_band' },
  skordare_band_par:          { objekt: 'skordare_band_par' },
  skotare_utforare_namn:      { objekt: 'skotare_utforare_namn' },
  skordare_utforare_namn:     { objekt: 'skordare_utforare_namn' },
  manuell_prognos:            { objekt: 'manuell_prognos' },
  volym_planerad:             { objekt: 'volym_planerad' },
  planerad_start:             { objekt: 'planerad_start' },
  planerad_slut:              { objekt: 'planerad_slut' },
  transport_kommentar:        { objekt: 'transport_kommentar' },
  grot_status:                { objekt: 'grot_status' },
  fastighetsbeteckning:       { objekt: 'fastighetsbeteckning' },
  kontraktsnummer:            { objekt: 'kontraktsnummer' },
}

export interface SparaFaltRef {
  /** dim_objekt.objekt_id för hela VO-gruppen (dim skrivs över alla; objekt är EN rad). */
  dimObjektIds: string[]
  /** VO-gruppens vo_nummer — fallback-nyckel till objekt-raden när FK saknas. */
  voNummer?: string | null
  /** Redan känd objekt.id (hoppar över resolven). */
  objektId?: string
}

export interface SparaFaltResultat {
  ok: boolean
  message?: string
  /** false = ingen objekt-rad fanns; objekt-delen av patchen skrevs INTE (dim skrevs). */
  objektRadFanns: boolean
}

// Kanonisk jämförelse för verifierad save — måste klara JSONB-objekt
// (manuell_prognos {skotare,skordare}) och arrayer, inte bara skalärer.
// Nyckelordning normaliseras (Postgres jsonb sorterar om vid läsning) så
// {a,b} och {b,a} räknas lika. Skalärer jämförs via JSON.stringify → '1'
// (text) skiljs från 1 (number), vilket är avsiktligt: skriv rätt typ.
function kanonisk(v: any): string {
  if (v === undefined || v === null) return 'null'
  if (typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(kanonisk).join(',') + ']'
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + kanonisk(v[k])).join(',') + '}'
}
const lika = (a: any, b: any) => kanonisk(a) === kanonisk(b)

/**
 * Hitta objekt-raden (planering) för en dim_objekt-VO-grupp. FK (objekt.dim_objekt_id)
 * först, sedan unikt objekt.vo_nummer. Returnerar { id } eller null. Läser aldrig fel
 * rad — vo_nummer är unikt i objekt.
 */
export async function resolveObjektRad(dimObjektIds: string[], voNummer?: string | null): Promise<{ id: string } | null> {
  if (dimObjektIds.length > 0) {
    const fk = await supabase.from('objekt').select('id').in('dim_objekt_id', dimObjektIds).limit(1)
    if (fk.data && fk.data.length > 0) return { id: fk.data[0].id }
  }
  const vo = String(voNummer ?? '').trim()
  if (vo) {
    const r = await supabase.from('objekt').select('id').eq('vo_nummer', vo).limit(1)
    if (r.data && r.data.length > 0) return { id: r.data[0].id }
  }
  return null
}

/**
 * Spara en patch keyed på LOGISKA fält (se FALT_RUTT) till rätt tabell(er).
 * dim-delen skrivs över hela VO-gruppen (dimObjektIds); objekt-delen till den ENA
 * objekt-raden. Verifierad save: läser tillbaka värdet på varje fält. Saknas
 * objekt-rad skrivs bara dim (objektRadFanns=false). Skapar aldrig objekt-rader.
 */
export interface SparaFaltOpts {
  /** Begränsa vilka tabeller som skrivs (default båda). T.ex. ['objekt'] för att
   *  BARA spegla till objekt-raden när dim redan sparats i ett annat flöde. */
  tabeller?: ('dim' | 'objekt')[]
}

export async function sparaFalt(ref: SparaFaltRef, patch: Record<string, any>, opts?: SparaFaltOpts): Promise<SparaFaltResultat> {
  const skrivDim = !opts?.tabeller || opts.tabeller.includes('dim')
  const skrivObjekt = !opts?.tabeller || opts.tabeller.includes('objekt')
  const dimPatch: Record<string, any> = {}
  const objPatch: Record<string, any> = {}
  for (const [logisk, varde] of Object.entries(patch)) {
    const rutt = FALT_RUTT[logisk]
    if (!rutt) return { ok: false, message: `Okänt fält: ${logisk}`, objektRadFanns: false }
    if (rutt.dim) dimPatch[rutt.dim] = varde
    if (rutt.objekt) objPatch[rutt.objekt] = varde
  }

  // ── dim_objekt över hela VO-gruppen ──
  if (skrivDim && Object.keys(dimPatch).length > 0) {
    const ids = ref.dimObjektIds || []
    if (ids.length === 0) return { ok: false, message: 'Inga dim_objekt-id att spara mot', objektRadFanns: false }
    const kol = ['objekt_id', ...Object.keys(dimPatch)].join(',')
    const { data, error } = await supabase.from('dim_objekt').update(dimPatch).in('objekt_id', ids).select(kol)
    if (error) return { ok: false, message: 'dim_objekt: ' + error.message, objektRadFanns: false }
    const rader = (data || []) as any[]
    if (rader.length !== ids.length || rader.some(r => Object.keys(dimPatch).some(k => !lika(r[k], dimPatch[k])))) {
      return { ok: false, message: 'dim_objekt-ändringen landade inte — ladda om och försök igen', objektRadFanns: false }
    }
  }

  // ── objekt (planering) — EN rad, resolvad via FK→vo. Skapar aldrig. ──
  let objektRadFanns = false
  if (skrivObjekt && Object.keys(objPatch).length > 0) {
    let objektId = ref.objektId
    if (!objektId) {
      const rad = await resolveObjektRad(ref.dimObjektIds || [], ref.voNummer)
      objektId = rad?.id
    }
    if (objektId) {
      objektRadFanns = true
      const kol = ['id', ...Object.keys(objPatch)].join(',')
      const { data, error } = await supabase.from('objekt').update(objPatch).eq('id', objektId).select(kol)
      if (error) return { ok: false, message: 'objekt: ' + error.message, objektRadFanns }
      const rad = (data || [])[0] as any
      if (!rad || Object.keys(objPatch).some(k => !lika(rad[k], objPatch[k]))) {
        return { ok: false, message: 'objekt-ändringen landade inte — ladda om och försök igen', objektRadFanns }
      }
    }
    // Ingen objekt-rad → objekt-delen skippas tyst (dim är källan; skapar aldrig rad).
  }

  return { ok: true, objektRadFanns }
}
