// Serviceloggen — ren logik (ingen databas, ingen React). Vyn läser `maskin_service` och visar det här.
//
// Datan (prod 2026-10-21): 65 av 70 poster kommer automatiskt ur maskinernas MOM-filer (`kalla = 'mom'`), resten är
// skrivna för hand. MOM-posterna bär Ponsses/Rottnes engelska delsystem och detalj ("Carrier: Tracks and chains"),
// och kategorin är nästan alltid `ovrigt`. Förut stod alla som "Reparation" med den engelska texten, och samma sak
// samma dag (två stopp "band på bak") stod som två poster. Här blir de:
//   - en TYP föraren känner igen (Service, Reparation, Band, Däck, Underhåll),
//   - en svensk RUBRIK (förarens egen text när den finns, annars detaljen på svenska),
//   - EN rad per sak och dag (`slaIhop`), med tiden summerad och antalet utskrivet.
//
// Inget här räknar motortimmar eller nästa service: det finns ingen mätarställning i datan (fakt_maskin_statistik
// är tom) och inga serviceintervall (service_paminnelser är tom). Ärlig data eller ingen data.

export type ServicePost = {
  id: string
  maskin_id: string
  del: string | null
  kategori: string
  beskrivning: string | null
  timmar: number | null
  datum: string // YYYY-MM-DD
  skapad_at?: string | null
  kalla?: string | null
  langd_sek?: number | null
  reservdel_antal?: number | null
  delsystem?: string | null
  underorsak?: string | null
  detalj?: string | null
  reservdel_namn?: string | null
}

export type Typ = 'service' | 'reparation' | 'band' | 'dack' | 'underhall'

export const TYP_NAMN: Record<Typ, string> = {
  service: 'Service',
  reparation: 'Reparation',
  band: 'Band',
  dack: 'Däck',
  underhall: 'Underhåll',
}

/** Ponsses och Rottnes delsystem på svenska (StanForD-ord i MOM-filen). */
const DELSYSTEM: Record<string, string> = {
  carrier: 'Maskin',
  harvestinghead: 'Aggregat',
  loaderlinkage: 'Kran',
  other: 'Övrigt',
}

/** Detaljerna som faktiskt förekommer i MOM-filerna, på svenska. Okänd detalj visas som den står. */
const DETALJ: Record<string, string> = {
  'tracks and chains': 'Band och kedjor',
  'hose (pipe)': 'Hydraulslang',
  'pipes (hoses)': 'Hydraulslang',
  'saw unit': 'Sågenhet',
  'measuring devices': 'Mätutrustning',
  'color marking': 'Färgmärkning',
  'grapple': 'Grip',
  'delimbing knives': 'Kvistknivar',
  'fire extinguisher': 'Brandsläckare',
  'harnesses': 'Kablage',
  'working lights': 'Arbetsbelysning',
  'gearbox': 'Växellåda',
  'miscellaneous': 'Övrigt',
  'hydraulic cylinder': 'Hydraulcylinder',
  'filter': 'Filter',
  'not defined': 'Ej angivet',
  'chain tensioner': 'Kedjesträckare',
  'feed roller arms': 'Matarvalsarmar',
  'solenoide': 'Magnetventil',
  'hitch, oscillation joint': 'Dragkoppling',
}

const SPECIFIK_REPARATION = new Set(['hydraulik', 'slang', 'motor', 'kran', 'aggregat', 'elektrisk'])

const tom = (s: string | null | undefined) => !s || !s.trim() || s.trim() === '-'

export function delsystemSv(d: string | null | undefined): string | null {
  if (tom(d)) return null
  return DELSYSTEM[d!.trim().toLowerCase()] ?? d!.trim()
}

export function detaljSv(d: string | null | undefined): string | null {
  if (tom(d)) return null
  return DETALJ[d!.trim().toLowerCase()] ?? d!.trim()
}

/** Är texten maskinens egen autotext ("Carrier: Tracks and chains") och inte något föraren skrev? */
function arAutotext(text: string, p: ServicePost): boolean {
  if (!p.delsystem) return false
  return text.trim().toLowerCase().startsWith(`${p.delsystem.trim().toLowerCase()}:`)
}

function stor(s: string): string {
  const t = s.trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function postTyp(p: ServicePost): Typ {
  const kat = (p.kategori || '').toLowerCase()
  if (kat === 'service') return 'service'
  if (kat === 'punktering') return 'dack'
  const text = `${p.beskrivning ?? ''} ${p.del ?? ''}`.toLowerCase()
  if (/punkter|däck/.test(text) || (p.underorsak ?? '').toLowerCase() === 'air') return 'dack'
  if ((p.detalj ?? '').toLowerCase() === 'tracks and chains' || /\bband\b/.test(text) || (p.del ?? '').toLowerCase() === 'band') return 'band'
  if (/koppla|hjälpstart|montering/.test(text)) return 'underhall'
  return 'reparation'
}

/** Rubriken på raden: förarens egen text när den finns, annars detaljen på svenska. Aldrig tom. */
export function postRubrik(p: ServicePost): string {
  const egen = p.beskrivning && !tom(p.beskrivning) && !arAutotext(p.beskrivning, p) ? p.beskrivning.trim() : null
  const det = detaljSv(p.detalj)
  if (egen) {
    // Ett enda ord ("Byte", "spruckit.") säger inte vad: sätt detaljen före, om den inte redan står i texten.
    const ettOrd = !/\s/.test(egen)
    const nyDetalj = det && det !== 'Övrigt' && det !== 'Ej angivet'
      && !det.toLowerCase().includes(egen.toLowerCase().replace(/[.!]+$/, '')) && !egen.toLowerCase().includes(det.toLowerCase())
    return ettOrd && nyDetalj ? `${det} – ${egen.toLowerCase()}` : stor(egen)
  }
  if (det && det !== 'Övrigt' && det !== 'Ej angivet') return det
  const sys = delsystemSv(p.delsystem)
  if (sys && sys !== 'Övrigt') return `${sys}, övrigt`
  if (SPECIFIK_REPARATION.has((p.kategori || '').toLowerCase())) return stor(p.kategori)
  return TYP_NAMN[postTyp(p)]
}

/** En kort detalj till raden under rubriken: reservdelen eller hjulet, när det säger något mer än rubriken. */
export function postDetalj(p: ServicePost): string | null {
  const del = !tom(p.reservdel_namn) ? p.reservdel_namn! : !tom(p.del) ? p.del! : null
  if (!del) return null
  const d = del.trim()
  const lag = d.toLowerCase()
  if (['ovrigt', 'service', 'punktering', 'band', p.kategori?.toLowerCase()].includes(lag)) return null
  if (postRubrik(p).toLowerCase().includes(lag)) return null
  if (lag === (p.beskrivning ?? '').trim().toLowerCase()) return null
  if (/^[vh][1-4]$/i.test(d)) return `hjul ${d.toUpperCase()}`
  return d.charAt(0).toLowerCase() + d.slice(1)
}

export type Rad = {
  /** Första postens id (React-nyckel). */
  id: string
  ids: string[]
  datum: string
  typ: Typ
  rubrik: string
  detalj: string | null
  /** Hur många poster raden står för (två stopp samma dag = 2). */
  antal: number
  /** Summerad stopptid i sekunder, eller null när ingen post har någon. */
  langdSek: number | null
  franMaskinen: boolean
  /** Mätarställning (h) som skrevs för hand, när den finns. */
  timmar: number | null
}

/** Samma maskin, dag, typ och rubrik = EN rad. Nyast först (datum, sedan när den skapades). */
export function slaIhop(poster: ServicePost[]): Rad[] {
  const sorterade = [...poster].sort((a, b) =>
    a.datum === b.datum ? (b.skapad_at ?? '').localeCompare(a.skapad_at ?? '') : b.datum.localeCompare(a.datum))
  const rader: Rad[] = []
  const index = new Map<string, Rad>()
  for (const p of sorterade) {
    const typ = postTyp(p)
    const rubrik = postRubrik(p)
    const nyckel = `${p.maskin_id}|${p.datum}|${typ}|${rubrik.toLowerCase()}`
    const sek = p.langd_sek && p.langd_sek > 0 ? p.langd_sek : null
    const finns = index.get(nyckel)
    if (finns) {
      finns.ids.push(p.id)
      finns.antal += 1
      if (sek != null) finns.langdSek = (finns.langdSek ?? 0) + sek
      if (finns.detalj == null) finns.detalj = postDetalj(p)
      if (p.kalla === 'mom') finns.franMaskinen = true
      if (finns.timmar == null && p.timmar != null) finns.timmar = p.timmar
      continue
    }
    const rad: Rad = {
      id: p.id, ids: [p.id], datum: p.datum, typ, rubrik, detalj: postDetalj(p), antal: 1,
      langdSek: sek, franMaskinen: p.kalla === 'mom', timmar: p.timmar ?? null,
    }
    index.set(nyckel, rad)
    rader.push(rad)
  }
  return rader
}

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
const MAN_KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

/** "2026-10" → "Oktober" (året med bara när det inte är `iAr`). */
export function manadRubrik(manad: string, iAr: number): string {
  const [a, m] = manad.split('-').map(Number)
  const namn = MANADER[m - 1] ?? manad
  const stort = namn.charAt(0).toUpperCase() + namn.slice(1)
  return a === iAr ? stort : `${stort} ${a}`
}

export type ManadGrupp = { manad: string; rader: Rad[] }

/** Rader (nyast först) grupperade per kalendermånad, i samma ordning. */
export function perManad(rader: Rad[]): ManadGrupp[] {
  const ut: ManadGrupp[] = []
  for (const r of rader) {
    const m = r.datum.slice(0, 7)
    const sista = ut[ut.length - 1]
    if (sista && sista.manad === m) sista.rader.push(r)
    else ut.push({ manad: m, rader: [r] })
  }
  return ut
}

/** Lokal dag "YYYY-MM-DD" (svensk tid) för ett ögonblick. Aldrig toISOString — den ger UTC och fel dag efter midnatt. */
export function lokalDag(d: Date): string {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const v = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return `${v('year')}-${v('month')}-${v('day')}`
}

function dagarMellan(fran: string, till: string): number {
  const a = Date.UTC(+fran.slice(0, 4), +fran.slice(5, 7) - 1, +fran.slice(8, 10))
  const b = Date.UTC(+till.slice(0, 4), +till.slice(5, 7) - 1, +till.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

/** "idag", "igår", "21 okt", "4 mar 2025". */
export function datumText(datum: string, idag: string): string {
  const d = dagarMellan(datum, idag)
  if (d === 0) return 'idag'
  if (d === 1) return 'igår'
  const [a, m, dag] = datum.split('-').map(Number)
  const kort = `${dag} ${MAN_KORT[m - 1]}`
  return a === +idag.slice(0, 4) ? kort : `${kort} ${a}`
}

/** 2925 s → "49 min", 3898 s → "1 tim 5 min". Under en minut: null (säger inget). */
export function langdText(sek: number | null | undefined): string | null {
  if (!sek || sek < 60) return null
  const min = Math.round(sek / 60)
  if (min < 60) return `${min} min`
  const tim = Math.floor(min / 60)
  const rest = min % 60
  return rest === 0 ? `${tim} tim` : `${tim} tim ${rest} min`
}

/** Raden under rubriken: "Band · 2 gånger · snabbfäste risgrip · från maskinen". */
export function radUnder(r: Rad): string {
  const delar: string[] = [TYP_NAMN[r.typ]]
  if (r.antal > 1) delar.push(`${r.antal} gånger`)
  if (r.detalj) delar.push(r.detalj)
  if (r.timmar != null) delar.push(`vid ${r.timmar.toLocaleString('sv-SE')} h`)
  if (r.franMaskinen) delar.push('från maskinen')
  return delar.join(' · ')
}

export type Svar = { rubrik: string; rad: string | null }

/** Maskinsidans svar överst: senaste service, och den senaste posten oavsett typ. */
export function maskinSvar(rader: Rad[], idag: string): Svar {
  const service = rader.find(r => r.typ === 'service')
  const senast = rader[0]
  const rubrik = service ? `Senaste service ${datumText(service.datum, idag)}` : 'Ingen service registrerad'
  const rad = senast && senast !== service ? `Senast: ${senast.rubrik.toLowerCase()} · ${datumText(senast.datum, idag)}` : null
  return { rubrik, rad }
}

/** Listans rad under maskinnamnet: senaste posten, eller att loggen är tom. */
export function senastText(rader: Rad[], idag: string): string {
  const s = rader[0]
  return s ? `${s.rubrik} · ${datumText(s.datum, idag)}` : 'Inget registrerat'
}

/** Vad formuläret skriver till `maskin_service` för vald typ. Kategorin följer tabellens CHECK (ingen 'band'). */
export function nyPost(typ: Typ, falt: { beskrivning: string; datum: string; timmar: number | null; hjul: string | null }) {
  const beskrivning = falt.beskrivning.trim()
  switch (typ) {
    case 'service':
      return { kategori: 'service', del: 'service', beskrivning, datum: falt.datum, timmar: falt.timmar, kalla: 'manuell' }
    case 'dack':
      return { kategori: 'punktering', del: falt.hjul ?? 'punktering', beskrivning, datum: falt.datum, timmar: null, kalla: 'manuell' }
    case 'band':
      return { kategori: 'ovrigt', del: 'band', delsystem: 'Carrier', detalj: 'Tracks and chains', beskrivning, datum: falt.datum, timmar: null, kalla: 'manuell' }
    case 'underhall':
    case 'reparation':
      return { kategori: 'ovrigt', del: 'ovrigt', beskrivning, datum: falt.datum, timmar: null, kalla: 'manuell' }
  }
}

/** Vad som saknas innan Spara går att trycka. Tom lista = klart. */
export function saknas(typ: Typ, falt: { beskrivning: string; datum: string; timmar: string; hjul: string | null }): string[] {
  const ut: string[] = []
  if (!falt.beskrivning.trim()) ut.push('vad som gjordes')
  if (!falt.datum) ut.push('datum')
  if (typ === 'service') {
    const t = Number(falt.timmar.replace(',', '.'))
    if (!falt.timmar.trim() || !Number.isFinite(t) || t <= 0) ut.push('timmätaren')
  }
  if (typ === 'dack' && !falt.hjul) ut.push('vilket hjul')
  return ut
}
