// Maskintimmar och nedräkning till service (Martin 2026-10-21).
//
// Timmätaren finns inte i någon fil. Därför:
//  1. Någon läser av mätaren ibland — "Läs av timmätaren" (maskin_timmatare) eller timmätaren som skrivs
//     vid en servicepost (maskin_service.timmar). Den senaste avläsningen är facit.
//  2. Efter avläsningen lägger appen till maskinens motortid ur MOM-filerna (fakt_tid.engine_time_sek),
//     dag för dag, för dagarna EFTER avläsningens datum (avläsningsdagens egen tid vet vi inte om den
//     kom före eller efter avläsningen — den räknas inte, så talet hellre är lite lågt än dubbelräknat).
//  3. Talet visas med "ca" så fort något är tillagt. En ny avläsning gör det exakt igen.
//
// Nästa service räknas i FASTA STEG (Ponsses schema: 900, 1 800, 2 700 …), Martins val. En registrerad
// service strax före ett steg (inom TOLERANS av intervallet) räknas som det steget, så en service gjord
// vid 4 480 h gäller 4 500-servicen och nästa blir 5 400. Finns ingen service registrerad antas maskinen
// vara servad enligt schemat: nästa steg över dagens timmar.

export type Avlasning = { datum: string; timmar: number; kalla: 'avlasning' | 'service' }
export type MotorDag = { datum: string; sek: number }

/** En service inom så stor andel av intervallet före ett steg räknas som det steget. */
export const TOLERANS = 0.1
/** Under så många timmar kvar är servicen nära (orange). */
export const NARA_H = 50

/** Senaste avläsningen: senaste datum, och samma dag den högsta (mätaren går bara framåt). */
export function senasteAvlasning(avl: readonly Avlasning[]): Avlasning | null {
  let b: Avlasning | null = null
  for (const a of avl) {
    if (!(a.timmar > 0)) continue
    if (!b || a.datum > b.datum || (a.datum === b.datum && a.timmar > b.timmar)) b = a
  }
  return b
}

export type Uppskattning = { timmar: number; tillagdH: number; avlasning: Avlasning }

/** Dagens timmar: senaste avläsningen + motortiden dagarna efter. Null utan avläsning. */
export function uppskatta(avl: readonly Avlasning[], motor: readonly MotorDag[]): Uppskattning | null {
  const a = senasteAvlasning(avl)
  if (!a) return null
  const sek = motor.reduce((s, d) => (d.datum > a.datum && d.sek > 0 ? s + d.sek : s), 0)
  const tillagdH = sek / 3600
  return { timmar: a.timmar + tillagdH, tillagdH, avlasning: a }
}

export type Service = { nastaVid: number; kvarH: number; foregaendeVid: number }

/** Nästa service i fasta steg. `senastService` = timmätaren vid den senast registrerade servicen. */
export function nastaService(intervall: number, nu: number, senastService: number | null): Service {
  const bas = senastService != null ? senastService + intervall * TOLERANS : nu
  const nastaVid = (Math.floor(bas / intervall) + 1) * intervall
  return { nastaVid, kvarH: nastaVid - nu, foregaendeVid: nastaVid - intervall }
}

/** Timmätaren vid den senaste registrerade servicen (kategori 'service' med timmar). */
export function senastServiceTimmar(poster: readonly { kategori: string | null; timmar: number | null; datum: string }[]): number | null {
  let b: { datum: string; timmar: number } | null = null
  for (const p of poster) {
    if (p.kategori !== 'service' || !(p.timmar && p.timmar > 0)) continue
    if (!b || p.datum > b.datum || (p.datum === b.datum && p.timmar > b.timmar)) b = { datum: p.datum, timmar: p.timmar }
  }
  return b?.timmar ?? null
}

const heltal = (n: number) => Math.round(n).toLocaleString('sv-SE').replace(/ /g, ' ')

/** "ca 4 620 h" när något är tillagt, annars "4 512 h". */
export function timmarText(u: Uppskattning): string {
  return `${Math.round(u.tillagdH) >= 1 ? 'ca ' : ''}${heltal(u.timmar)} h`
}

export type ServiceLage = 'ok' | 'nara' | 'over'

export function serviceLage(s: Service): ServiceLage {
  const kvar = Math.round(s.kvarH)
  return kvar <= 0 ? 'over' : kvar < NARA_H ? 'nara' : 'ok'
}

/** "Service om 780 h" · "Dags för service" · "Dags för service · 12 h över". */
export function serviceText(s: Service): string {
  const kvar = Math.round(s.kvarH)
  if (kvar > 0) return `Service om ${heltal(kvar)} h`
  return kvar === 0 ? 'Dags för service' : `Dags för service · ${heltal(-kvar)} h över`
}

/** Raden under siffran på maskinsidan: "Avläst 2 okt: 4 512 h · sedan dess +108 h från maskinen". */
export function avlastText(u: Uppskattning, datumText: (d: string) => string): string {
  const bas = `Avläst ${datumText(u.avlasning.datum)}: ${heltal(u.avlasning.timmar)} h`
  return Math.round(u.tillagdH) >= 1 ? `${bas} · sedan dess +${heltal(u.tillagdH)} h från maskinen` : bas
}

export { heltal as timmarHeltal }
