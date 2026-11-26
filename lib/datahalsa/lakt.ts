// LÄKT-REGELN — när slutar ett importfel vara ett fel?
//
// Martin 2026-11-25: Datahälsa visar BARA det som är fel just nu. Ett importfel räknas tills det LÄKT:
//
//   Läkt (1) NÄSTA FIL: en SENARE fil i SAMMA SERIE (samma maskin, samma objekt, samma filtyp) har importerats
//            OK efter felets tid, utan egna fel. Maskinernas filer är kumulativa (HPR bär alla stammar hittills),
//            så nästa fil skriver in det som föll bort.
//   Läkt (2) OMKÖRD: SAMMA fil står som OK i filloggen mer än OMKORD_MIN minuter efter sitt sista fel. Filloggen
//            har en rad per filnamn; filens egen rad skrivs sekunder efter felen (uppmätt 14–98 s på 34 filer),
//            en omkörning timmar senare (uppmätt 94–342 min). En omkörd fil läker också de äldre filerna i sin serie.
//
// Ett fel som INTE läkt är ett fel i FEL_NU_DYGN dygn. Sedan går det till historiken: då är det inte längre
// något som händer nu, och det som verkligen saknas i datan fångas av kontrollerna på importdatorn
// (stammar utan stockar, sortiment mot stockarna, maskintid mot maskinfilerna), som räknar på datan själv.
// Ett fel UTAN filnamn (nätfel när en dim-tabell skrevs) kan aldrig bedömas som läkt: det räknas i UTAN_FIL_TIM timmar.
//
// VARFÖR SERIEN LÄSES UR FILNAMNET (och inte ur hpr_filer.objekt_nyckel eller detalj_stam):
//  - Det gäller ALLA filtyper. objekt_nyckel finns bara för HPR, men fel skrivs också för MOM, HQC och FPR.
//  - Filen som FELADE har ofta ingen rad i hpr_filer eller detalj_stam — det var ju den som inte gick in —
//    och filloggen kan sakna maskin för den (maskin_id '' på 30 av de gamla felen). Namnet finns alltid.
//  - Maskinen namnger filen efter objektet och sätter sedan en tidsstämpel. Tre former täcker filloggen
//    (kontrollerat mot prod 2026-11-26: 1 864 filer, 1 av dem går inte att läsa — "Gallring Santhe 2026.hqc"):
//        Ponsse skördare  "<objekt>_<MASKIN>_<ÅÅÅÅMMDDTTMMSS>[_n].ext"   och   "<MASKIN>_<ÅÅÅÅMMDDTTMMSS>.hqc"
//        Ponsse skotare   "<objekt>-<DDMMÅÅ>-<TTMMSS>[-|_full].ext"
//        Rottne           "<objekt> <ÅÅÅÅ-MM-DD> <TTMM>[_n].ext"
//  - Fel åt det SÄKRA hållet: byter föraren namn på objektet mitt i jobbet blir serien en annan och felet
//    läks inte — det står då kvar som ett fel i sju dygn. Aldrig tvärtom.
//
// Rena funktioner: tiden kommer in som argument.

/** Så länge är ett fel som inte läkt ett fel just nu. */
export const FEL_NU_DYGN = 7
/** Ett fel utan filnamn kan inte bedömas som läkt. Det räknas så här länge. */
export const UTAN_FIL_TIM = 24
/** Samma fil OK i filloggen så här långt efter sitt sista fel = filen är omkörd. Måste vara längre än databasens fem minuter (mif_markera_delvis_fel). */
export const OMKORD_MIN = 15

export type Serie = {
  /** Filtypen (ändelsen, gemener): hpr | mom | hqc | fpr … En HPR läker aldrig en MOM. */
  typ: string
  /** Objektet som maskinen skrev det, normaliserat (gemener, ett mellanslag, inga skiljetecken sist). Tom för filer som bara bär maskinen (Ponsse HQC). */
  stam: string
  /** Objektet som det står i filnamnet — för visning. */
  namn: string
  /** Maskinen när den står i filnamnet (Ponsse), annars null (Rottne: tas ur filloggen). */
  maskin: string | null
}

const PONSSE = /^(?:(.*)_)?([A-Za-z]+\d[A-Za-z0-9]{4,})_(\d{14})(?:_\d+)?$/
const ROTTNE = /^(.*?)[\s._-]*\d{4}-\d{2}-\d{2}[ _]\d{4,6}(?:_\d+)?$/
const SKOTARE = /^(.*?)-\d{6}-\d{6}(?:[-_][A-Za-z]*)?$/

// Understreck räknas som mellanslag: skotarens dator skriver "Mölleryd_RP_J_Hus__25".
const renNamn = (s: string) => s.replace(/[_\s]+/g, ' ').replace(/^[\s.-]+|[\s.-]+$/g, '').trim()
const normStam = (s: string) => renNamn(s).toLowerCase()

/** Serien en fil hör till, eller null när namnet inte följer någon känd form (då kan felet aldrig bedömas som läkt). */
export function filSerie(filnamn: string | null | undefined): Serie | null {
  const namn = String(filnamn ?? '').trim()
  const punkt = namn.lastIndexOf('.')
  if (punkt <= 0 || punkt === namn.length - 1) return null
  const typ = namn.slice(punkt + 1).toLowerCase()
  const bas = namn.slice(0, punkt)
  const p = PONSSE.exec(bas)
  if (p) return { typ, stam: normStam(p[1] ?? ''), namn: renNamn(p[1] ?? ''), maskin: p[2].toUpperCase() }
  const r = ROTTNE.exec(bas)
  if (r && normStam(r[1])) return { typ, stam: normStam(r[1]), namn: renNamn(r[1]), maskin: null }
  const k = SKOTARE.exec(bas)
  if (k && normStam(k[1])) return { typ, stam: normStam(k[1]), namn: renNamn(k[1]), maskin: null }
  return null
}

export type ImportFelIn = { tid: string; tabell: string; filnamn: string | null; felkod: string | null; feltext: string | null }

/** En rad i filloggen (meta_importerade_filer). */
export type FilIn = { filnamn: string; maskinId: string | null; importeradTid: string; status: string; felmeddelande: string | null }

/**
 * Skilj OFARLIGT från ÄKTA. Importen lagrar felkod = HTTP-status vid en avvisning, feltext = svaret.
 *  - 409 / unik nyckel (23505) / "already exists": raden fanns redan. Inget tappades — dubbletten stoppades rätt.
 *  - flytt-/arkiveringsstrul: filen sparades, bara flytten föll.
 *  - VADER_*: importens egen minnesanteckning om att vädret till en kontrollstam inte går att hämta. Kontrollen är importerad.
 *  - allt annat = något skrevs inte.
 */
export function importFelKlass(r: Pick<ImportFelIn, 'felkod' | 'feltext'>): 'ofarligt' | 'akta' {
  const kod = (r.felkod || '').toLowerCase()
  const txt = (r.feltext || '').toLowerCase()
  if (kod === '409') return 'ofarligt'
  if (kod.startsWith('vader')) return 'ofarligt'
  if (txt.includes('duplicate key') || txt.includes('23505') || txt.includes('already exists')) return 'ofarligt'
  if (txt.includes('flytt') || /\bmove\b/.test(txt)) return 'ofarligt'
  return 'akta'
}

export type FelFil = {
  /** Filen som felade. null = felen saknar filnamn (kan aldrig läka). */
  filnamn: string | null
  serie: Serie | null
  maskinId: string | null
  /** ISO. Sista felet är det som räknas: en senare fil måste komma EFTER det. */
  forstaFel: string
  sistaFel: string
  /** Antal felrader (import_fel) + 1 om filen står som FEL i filloggen utan egna felrader. */
  antalFel: number
  /** Tabellerna som inte skrevs (import_fel), i den ordning de kom. Tom när felet bara står i filloggen. */
  tabeller: string[]
  /** Första felets text, kort. */
  orsak: string
  /** Filen som läkte och hur, eller null. */
  lakt: { filnamn: string; tid: string; hur: 'nasta_fil' | 'omkord' } | null
}

export type FelBedomning = {
  /** Fel just nu: inte läkta och yngre än FEL_NU_DYGN. Nyaste först. */
  nu: FelFil[]
  /** Läkta fel i underlaget. Nyaste först. */
  lakta: FelFil[]
  /** Inte läkta men äldre än FEL_NU_DYGN: inte ett fel nu, men aldrig bekräftat läkta. Nyaste först. */
  gamla: FelFil[]
}

const ms = (iso: string) => Date.parse(iso)

/** Kort feltext: PostgREST-svarets message om det är JSON, annars början av texten. */
export function kortOrsak(feltext: string | null | undefined): string {
  const t = String(feltext ?? '').trim()
  if (!t) return 'okänt fel'
  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t) as { message?: unknown }
      if (typeof o.message === 'string' && o.message.trim()) return o.message.trim().slice(0, 120)
    } catch { /* inte JSON — ta texten som den är */ }
  }
  return t.slice(0, 120)
}

/** Hör två filer till samma serie? Samma filtyp och objekt; maskinen måste stämma när båda är kända. */
export function sammaSerie(a: Serie, aMaskin: string | null, b: Serie, bMaskin: string | null): boolean {
  if (a.typ !== b.typ || a.stam !== b.stam) return false
  const ma = (a.maskin ?? aMaskin ?? '').toUpperCase()
  const mb = (b.maskin ?? bMaskin ?? '').toUpperCase()
  // En fil utan objektnamn (Ponsse HQC) är bara en serie tillsammans med sin maskin.
  if (!a.stam) return !!ma && ma === mb
  // Filen som felade kan sakna maskin i filloggen. Då räcker objektnamnet och filtypen.
  if (!ma || !mb) return true
  return ma === mb
}

/**
 * Bedöm felen: vilka är fel nu, vilka har läkt, vilka är bara gamla.
 * `fel` = raderna i import_fel, `filer` = filloggen för samma tid (alla statusar). En fil som står som FEL i
 * filloggen är ett fel också utan rader i import_fel; står den i båda är det EN felande fil, inte två.
 */
export function bedomFel(fel: readonly ImportFelIn[], filer: readonly FilIn[], nu: number): FelBedomning {
  const filPerNamn = new Map<string, FilIn>()
  for (const f of filer) filPerNamn.set(f.filnamn, f)

  const perFil = new Map<string, FelFil>()
  const utanFil: FelFil[] = []
  const lagg = (filnamn: string | null, tid: string, tabell: string | null, orsak: string) => {
    if (!filnamn) {
      utanFil.push({ filnamn: null, serie: null, maskinId: null, forstaFel: tid, sistaFel: tid, antalFel: 1, tabeller: tabell ? [tabell] : [], orsak, lakt: null })
      return
    }
    const f = perFil.get(filnamn)
    if (!f) {
      const m = (filPerNamn.get(filnamn)?.maskinId ?? '').trim()
      perFil.set(filnamn, { filnamn, serie: filSerie(filnamn), maskinId: m || null, forstaFel: tid, sistaFel: tid, antalFel: 1, tabeller: tabell ? [tabell] : [], orsak, lakt: null })
      return
    }
    f.antalFel += 1
    if (ms(tid) < ms(f.forstaFel)) { f.forstaFel = tid; f.orsak = orsak }
    if (ms(tid) > ms(f.sistaFel)) f.sistaFel = tid
    if (tabell && !f.tabeller.includes(tabell)) f.tabeller.push(tabell)
  }

  for (const r of [...fel].sort((a, b) => ms(a.tid) - ms(b.tid))) {
    if (importFelKlass(r) === 'akta') lagg(r.filnamn, r.tid, r.tabell, kortOrsak(r.feltext))
  }
  for (const f of filer) {
    // Filen står som FEL i filloggen. Har den redan felrader är den samma felande fil (triggern mif_markera_delvis_fel sätter FEL på dem).
    if (f.status !== 'OK' && !perFil.has(f.filnamn)) lagg(f.filnamn, f.importeradTid, null, kortOrsak(f.felmeddelande))
  }

  // (2) OMKÖRD: samma fil står som OK i filloggen långt efter sitt sista fel.
  for (const felFil of perFil.values()) {
    const rad = filPerNamn.get(felFil.filnamn!)
    if (rad && rad.status === 'OK' && ms(rad.importeradTid) - ms(felFil.sistaFel) > OMKORD_MIN * 60_000) {
      felFil.lakt = { filnamn: rad.filnamn, tid: rad.importeradTid, hur: 'omkord' }
    }
  }

  // (1) NÄSTA FIL: det som kan läka är filer som gick in OK — de som aldrig felade och de som körts om utan fel.
  const friska = filer
    .filter((f) => f.status === 'OK' && (!perFil.has(f.filnamn) || perFil.get(f.filnamn)!.lakt?.hur === 'omkord'))
    .map((f) => ({ f, serie: filSerie(f.filnamn), tid: ms(f.importeradTid) }))
    .filter((x): x is { f: FilIn; serie: Serie; tid: number } => !!x.serie && Number.isFinite(x.tid))
    .sort((a, b) => a.tid - b.tid)

  const alla = [...perFil.values(), ...utanFil]
  for (const felFil of alla) {
    if (!felFil.serie || felFil.lakt) continue
    const efter = ms(felFil.sistaFel)
    const lakare = friska.find((x) => x.f.filnamn !== felFil.filnamn && x.tid > efter
      && sammaSerie(felFil.serie!, felFil.maskinId, x.serie, (x.f.maskinId ?? '').trim() || null))
    if (lakare) felFil.lakt = { filnamn: lakare.f.filnamn, tid: lakare.f.importeradTid, hur: 'nasta_fil' }
  }

  // Ett fel utan filnamn kan inte läka och räknas ett dygn; alla andra i FEL_NU_DYGN.
  const arNu = (f: FelFil) => ms(f.sistaFel) >= nu - (f.filnamn ? FEL_NU_DYGN * 24 : UTAN_FIL_TIM) * 3_600_000
  const nyastForst = (a: FelFil, b: FelFil) => ms(b.sistaFel) - ms(a.sistaFel)
  return {
    nu: alla.filter((f) => !f.lakt && arNu(f)).sort(nyastForst),
    lakta: alla.filter((f) => !!f.lakt).sort(nyastForst),
    gamla: alla.filter((f) => !f.lakt && !arNu(f)).sort(nyastForst),
  }
}

// ── Felen samlade per serie: en rad per objekt och maskin, inte en rad per fil ──

export type FelSerie = {
  nyckel: string
  /** Objektets namn som maskinen skrev det, eller null (filnamn saknas / okänd namnform). */
  objekt: string | null
  maskinId: string | null
  /** HPR, MOM … i versaler; null när filnamnet saknas. */
  filtyp: string | null
  antalFiler: number
  antalFel: number
  forstaFel: string
  sistaFel: string
  tabeller: string[]
  orsak: string
  /** Senaste läkande filen i serien (bara för läkta). */
  laktTid: string | null
}

/** Slå ihop felande filer till en rad per serie. Ordningen (nyaste först) behålls. */
export function perSerie(filer: readonly FelFil[]): FelSerie[] {
  const ut = new Map<string, FelSerie>()
  for (const f of filer) {
    const maskin = (f.serie?.maskin ?? f.maskinId ?? '').toUpperCase() || null
    // Nyckeln bär bara maskinen när den står i filnamnet: en Rottne-fil som ännu saknar rad i filloggen (ingen maskin känd)
    // ska hamna på samma rad som objektets övriga filer, inte på en egen.
    const nyckel = f.serie ? `${f.serie.typ}|${f.serie.stam}|${f.serie.maskin ?? ''}` : `fil|${f.filnamn ?? `utan:${f.tabeller.join(',')}`}`
    const s = ut.get(nyckel)
    if (!s) {
      ut.set(nyckel, {
        nyckel, objekt: f.serie?.namn || null, maskinId: maskin, filtyp: f.serie ? f.serie.typ.toUpperCase() : null,
        antalFiler: f.filnamn ? 1 : 0, antalFel: f.antalFel, forstaFel: f.forstaFel, sistaFel: f.sistaFel,
        tabeller: [...f.tabeller], orsak: f.orsak, laktTid: f.lakt?.tid ?? null,
      })
      continue
    }
    if (f.filnamn) s.antalFiler += 1
    if (!s.maskinId) s.maskinId = maskin
    s.antalFel += f.antalFel
    if (ms(f.forstaFel) < ms(s.forstaFel)) { s.forstaFel = f.forstaFel; s.orsak = f.orsak }
    if (ms(f.sistaFel) > ms(s.sistaFel)) s.sistaFel = f.sistaFel
    for (const t of f.tabeller) if (!s.tabeller.includes(t)) s.tabeller.push(t)
    if (f.lakt && (!s.laktTid || ms(f.lakt.tid) > ms(s.laktTid))) s.laktTid = f.lakt.tid
  }
  return [...ut.values()]
}
