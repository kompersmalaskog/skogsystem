// Mätare för GPS-strömmen (fixar per sekund, omrenderingar per sekund) och brytaren för strypningen (lib/gpsStrypning).
// Räkningen är ett par heltalsökningar — den kostar inget och går alltid. Brytaren finns bara för att kunna mäta "före" och "efter" på samma maskin
// (Inställningar › GPS-källa › Mät GPS-strömmen); den står alltid PÅ utom under en mätning och sparas aldrig.
export interface StromRaknare {
  /** Giltiga NMEA-rader som mottogs (kommer ur mottagaren). */
  rader: number
  /** Fixar som lämnade källan till appen (efter strypningen). */
  fixar: number
  /** Uppdateringar av sidans position (anrop av setCurrentPosition). */
  positioner: number
  /** Renderingar av planeringssidan. */
  renderingar: number
}

const nollad = (): StromRaknare => ({ rader: 0, fixar: 0, positioner: 0, renderingar: 0 })
let rak = nollad()
let strypningPa = true

export const stromRakna = (vad: keyof StromRaknare) => { rak[vad]++ }
export const stromNollstall = () => { rak = nollad() }
export const stromLas = (): StromRaknare => ({ ...rak })
export const strypningAktiv = () => strypningPa
export const sattStrypning = (pa: boolean) => { strypningPa = pa }

export interface StromPerSekund { rader: number; fixar: number; positioner: number; renderingar: number }
export const perSekund = (r: StromRaknare, ms: number): StromPerSekund => {
  const s = Math.max(ms, 1) / 1000
  const rund = (n: number) => Math.round((n / s) * 10) / 10
  return { rader: rund(r.rader), fixar: rund(r.fixar), positioner: rund(r.positioner), renderingar: rund(r.renderingar) }
}
