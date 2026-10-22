// Läsning för förklarade tomma dagar (se forklaradeDagar.ts). Ett TILLÄGG till Produktion-kalendern: går något inte att
// läsa kastar funktionen, och anroparen visar kalendern som förut ("Ej aktiv") — aldrig en gissad förklaring.

import { supabase } from '@/lib/supabase'
import type { ForklaringsUnderlag, LedighetRad, MaskindagRad } from './forklaradeDagar'

/** Kalendern visar ingen årsvy (> 100 dagar) — då finns inget att förklara. */
const MAX_DAGAR = 100

/** [{ar, manad}] för varje månad som [start, end] rör. */
export function manaderI(start: string, end: string): { ar: number; manad: number }[] {
  const ut: { ar: number; manad: number }[] = []
  let ar = Number(start.slice(0, 4)), manad = Number(start.slice(5, 7))
  const slutAr = Number(end.slice(0, 4)), slutManad = Number(end.slice(5, 7))
  while (ar < slutAr || (ar === slutAr && manad <= slutManad)) {
    ut.push({ ar, manad })
    manad += 1
    if (manad > 12) { manad = 1; ar += 1 }
  }
  return ut
}

function dagarMellan(start: string, end: string): number {
  return Math.round((new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000) + 1
}

export async function hamtaForklaringsUnderlag(maskinIds: string[], start: string, end: string): Promise<ForklaringsUnderlag> {
  const tomt: ForklaringsUnderlag = { maskinIds, manuella: [], rader: [], ledighet: [] }
  if (dagarMellan(start, end) > MAX_DAGAR) return tomt

  const [maskinRes, medarbRes, ...manadRes] = await Promise.all([
    supabase.from('dim_maskin').select('maskin_id, datakalla').in('maskin_id', maskinIds),
    supabase.from('medarbetare').select('id, maskin_id, aktiv').in('maskin_id', maskinIds),
    ...manaderI(start, end).map(m => supabase.rpc('helikopter_ny_maskindag', { p_ar: m.ar, p_manad: m.manad })),
  ])
  if (maskinRes.error) throw maskinRes.error
  if (medarbRes.error) throw medarbRes.error
  for (const r of manadRes) if (r.error) throw r.error

  const manuella = ((maskinRes.data || []) as { maskin_id: string; datakalla: string | null }[])
    .filter(m => m.datakalla === 'manuell').map(m => m.maskin_id)
  // Samma urval som helikopter_ny_ledig: aktiv förare knuten till maskinen.
  const forare = ((medarbRes.data || []) as { id: string; maskin_id: string; aktiv: boolean | null }[])
    .filter(m => m.aktiv !== false)
  const maskinAv = new Map(forare.map(f => [f.id, f.maskin_id]))

  const rader: MaskindagRad[] = []
  for (const r of manadRes) {
    for (const rad of (r.data || []) as MaskindagRad[]) {
      if (maskinIds.includes(rad.maskin_id) && rad.datum >= start && rad.datum <= end) rader.push(rad)
    }
  }

  let ledighet: LedighetRad[] = []
  if (forare.length > 0 && rader.some(r => r.status === 'planerat')) {
    const { data, error } = await supabase.from('ledighet_ansokningar')
      .select('medarbetare_id, typ, startdatum, slutdatum')
      .in('medarbetare_id', forare.map(f => f.id))
      .in('status', ['godkänd', 'registrerad'])
      .is('fran_tid', null).is('till_tid', null)
      .lte('startdatum', end).gte('slutdatum', start)
    if (error) throw error
    ledighet = ((data || []) as { medarbetare_id: string; typ: string; startdatum: string; slutdatum: string }[])
      .map(l => ({ maskin_id: maskinAv.get(l.medarbetare_id) ?? '', typ: l.typ, startdatum: l.startdatum, slutdatum: l.slutdatum }))
      .filter(l => l.maskin_id)
  }

  return { maskinIds, manuella, rader, ledighet }
}
