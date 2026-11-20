// Menyn på /helikopter: fyra sidor, var och en svarar på EN fråga (Martin 2026-11-19).
//   Läget nu — ligger vi bra till?   ·   Prognos — hinner vi?   ·   Planera — vilka trakter, i vilken ordning?   ·   Månader — hur gick det?
// Sidan ligger i adressen (?sida=planera) så att den går att öppna direkt och överlever en omladdning. Läget nu är standard och har ingen parameter.

export type Sida = 'prognos' | 'laget' | 'planera' | 'manader'

export const SIDOR: { id: Sida; namn: string; fraga: string; ikon: string }[] = [
  { id: 'prognos', namn: 'Hinner vi?', fraga: 'Hinner vi?', ikon: 'query_stats' },
  { id: 'laget', namn: 'Läget nu', fraga: 'Ligger vi bra till?', ikon: 'speed' },
  { id: 'planera', namn: 'Planera', fraga: 'Vilka trakter, i vilken ordning?', ikon: 'checklist' },
  { id: 'manader', namn: 'Månader', fraga: 'Hur gick det?', ikon: 'calendar_month' },
]

/** Okänd eller saknad parameter är Hinner vi? (första sidan) — aldrig en tom sida. */
export function tolkaSida(param: string | null): Sida {
  return SIDOR.some(s => s.id === param) ? (param as Sida) : 'prognos'
}

export function helikopterHref(ar: number, manad: number, sida: Sida = 'prognos'): string {
  return `/helikopter?ar=${ar}&manad=${manad}${sida === 'prognos' ? '' : `&sida=${sida}`}`
}
