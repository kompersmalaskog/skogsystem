// WMO weather code (Open-Meteo) → enkel ikon. Delas av förarflödet och
// sammanställningen så samma kod aldrig visas olika.
export function vaderIkon(kod: number | null): string {
  if (kod == null) return ''
  if (kod === 0) return '☀️'
  if (kod <= 2) return '🌤️'
  if (kod === 3) return '☁️'
  if (kod === 45 || kod === 48) return '🌫️'
  if (kod >= 51 && kod <= 67) return '🌧️'
  if (kod >= 71 && kod <= 77) return '🌨️'
  if (kod >= 80 && kod <= 82) return '🌧️'
  if (kod === 85 || kod === 86) return '🌨️'
  if (kod >= 95) return '⛈️'
  return ''
}
