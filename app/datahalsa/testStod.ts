// Teststöd: bygger det useDatahalsa lämnar till sidan, ur produktionens fixtur och med de RIKTIGA reglerna
// (felNu, beskedAv). Testerna mockar bara läsningen — aldrig vad som räknas som ett fel.
import fs from 'node:fs'
import path from 'node:path'
import { beskedAv, felNu } from '@/lib/datahalsa/felNu'
import type { FilIn, ImportFelIn } from '@/lib/datahalsa/lakt'
import type { StatusRad } from '@/lib/datahalsa/status'
import type { Datahalsa, InvarianterData, KoordinatLarmData, LeveransRad } from './useDatahalsa'

export const FX = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib', 'datahalsa', '__fixtures__', 'importfel_prod_2026-11-25.json'), 'utf8')) as {
  nu: string; fel: ImportFelIn[]; filer: FilIn[]; gamlaFilfel: FilIn[]
}
/** Facit-kvällen: 2026-11-25 kl 21:00 svensk tid. */
export const NU = Date.parse(FX.nu)

export const STATUS: StatusRad[] = [
  { id: 'deploy_drift', kordTid: '2026-11-25T17:33:15Z', status: 'OK', larmAntal: 0, sammanfattning: 'OK — 9 importfiler byte-identiska med origin/main (7b03f258)' },
  { id: 'fakt_sortiment_mot_stock', kordTid: '2026-11-25T17:33:15Z', status: 'OK', larmAntal: 0, sammanfattning: 'fakt_sortiment och stockarna säger samma sak för alla objekt' },
  { id: 'fakt_tid_mot_mom', kordTid: '2026-11-25T17:33:15Z', status: 'OK', larmAntal: 0, sammanfattning: '1616 rader kontrollerade — fakt_tid matchar MOM-filerna (14 dagar)' },
  { id: 'import_live', kordTid: '2026-11-25T19:45:00Z', status: 'OK', larmAntal: 0, sammanfattning: 'Importen fungerar. Senaste fil 2026-11-25 20:42' },
  { id: 'inkommande_ko', kordTid: '2026-11-25T17:33:15Z', status: 'OK', larmAntal: 0, sammanfattning: 'Inga filer äldre än 24 h i Inkommande' },
  { id: 'parkerade_filer', kordTid: '2026-11-25T17:33:15Z', status: 'OK', larmAntal: 0, sammanfattning: 'Inga oimporterade filer i parkeringsmapparna' },
  { id: 'stammar_utan_stockar', kordTid: '2026-11-25T17:33:15Z', status: 'OK', larmAntal: 0, sammanfattning: 'Alla objekt med stammar har stockar' },
]

export const LEVERANS: LeveransRad[] = [
  { maskinId: 'PONS20SDJAA270231', namn: 'Scorpion', aktivTill: null, sanderFiler: true, bekraftad: true, senasteData: '2026-11-25', dagarSedan: 0 },
  { maskinId: 'R64428', namn: 'H8E -26', aktivTill: null, sanderFiler: true, bekraftad: true, senasteData: '2026-11-25', dagarSedan: 0 },
  { maskinId: 'A130743', namn: 'Elefant 26', aktivTill: null, sanderFiler: true, bekraftad: true, senasteData: '2026-11-13', dagarSedan: 12 },
  { maskinId: 'JD810E', namn: '810E', aktivTill: null, sanderFiler: false, bekraftad: true, senasteData: null, dagarSedan: null },
  { maskinId: 'R64101', namn: 'H8E -23', aktivTill: '2026-03-11', sanderFiler: true, bekraftad: true, senasteData: '2026-03-11', dagarSedan: 259 },
]

const INV: InvarianterData = {
  over24h: [], dubbletter: [], tomgangInkonsistenta: 0,
  motorUtanArbete: [{ maskin: 'PONS20SDJAA270231', namn: 'Scorpion', datum: '2026-11-21', objekt: 'x', objektnamn: 'Flyttobjekt', motorSek: 1140, avbrottSek: 0, rastSek: 0 }],
}
const KOORD: KoordinatLarmData = { koordlosa: [], dupTrakt: [] }

export type Over = {
  nu?: number
  laddar?: boolean
  status?: StatusRad[] | { fel: string }
  fel?: ImportFelIn[] | { fel: string }
  filer?: FilIn[] | { fel: string }
  invarianter?: InvarianterData | { fel: string }
  koordinat?: KoordinatLarmData | { fel: string }
  lass?: { antal: number; m3: number } | { fel: string }
  leverans?: LeveransRad[] | { fel: string }
  lasOm?: () => void
  lasOmLass?: () => void
}

const sek = <T,>(v: T | { fel: string }, laddar: boolean) =>
  laddar ? { laddar: true, fel: null, data: null }
    : v && typeof v === 'object' && !Array.isArray(v) && 'fel' in (v as object) && Object.keys(v as object).length === 1
      ? { laddar: false, fel: (v as { fel: string }).fel, data: null }
      : { laddar: false, fel: null, data: v as T }

/** Det sidan får av useDatahalsa. Utan argument: facit-kvällen i produktion (allt läkt, allt OK). */
export function byggDatahalsa(o: Over = {}): Datahalsa {
  const nu = o.nu ?? NU
  const laddar = !!o.laddar
  const status = sek<StatusRad[]>(o.status ?? STATUS, laddar)
  const importFel = sek<ImportFelIn[]>(o.fel ?? FX.fel, laddar)
  const filerRa = sek<FilIn[]>(o.filer ?? FX.filer, laddar)
  const invarianter = sek<InvarianterData>(o.invarianter ?? INV, laddar)
  const koordinatLarm = sek<KoordinatLarmData>(o.koordinat ?? KOORD, laddar)
  const lass = sek<{ antal: number; m3: number }>(o.lass ?? { antal: 0, m3: 0 }, laddar)
  const leverans = sek<LeveransRad[]>(o.leverans ?? LEVERANS, laddar)
  const gamla = FX.gamlaFilfel.filter((f) => f.importeradTid >= '2026-08-01')
  const filer = {
    laddar, fel: filerRa.fel,
    data: filerRa.data && {
      senasteImport: '2026-11-25T19:42:00Z', timmarSedan: 0.3, filer7d: filerRa.data,
      gamlaFel: { antal: gamla.length, forsta: gamla[0]?.importeradTid ?? null, sista: gamla[gamla.length - 1]?.importeradTid ?? null },
    },
  }
  const namn = new Map((leverans.data ?? []).map((m) => [m.maskinId.toUpperCase(), m.namn]))
  const bedomt = laddar ? null : felNu({
    nu,
    status: { fel: status.fel, data: status.data },
    filer: { fel: filer.fel, data: filer.data?.filer7d ?? null },
    importFel: { fel: importFel.fel, data: importFel.data },
    invarianter: { fel: invarianter.fel, data: invarianter.data && { over24h: invarianter.data.over24h.length, dubbletter: invarianter.data.dubbletter.length, tomgang: invarianter.data.tomgangInkonsistenta } },
    koordinat: { fel: koordinatLarm.fel, data: koordinatLarm.data && { koordlosa: koordinatLarm.data.koordlosa.length, dupTrakt: koordinatLarm.data.dupTrakt.length } },
    lass: { fel: lass.fel, data: lass.data },
    leverans: { fel: leverans.fel },
    maskinNamn: (id) => namn.get(id.toUpperCase()) ?? id,
  })
  const problem = bedomt?.problem ?? []
  return {
    filer, leverans, invarianter, importFel, koordinatLarm, lass,
    status: { ...status, tabellSaknas: false },
    problem, importfel: bedomt?.importfel ?? null, besked: beskedAv(problem, laddar),
    lasOm: o.lasOm ?? (() => {}), lasOmLass: o.lasOmLass ?? (() => {}),
  }
}
