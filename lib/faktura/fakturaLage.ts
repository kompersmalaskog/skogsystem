// VAR I FAKTURERINGEN EN TRAKT LIGGER — läst ur VÅRA skickade fakturor i
// Fortnox (fortnox_invoice_rows), aldrig ur maskinernas avslut.
//
// VARFÖR: faktura_oversikt().tillstand säger att MASKINERNA är klara, inte att
// något återstår att fakturera. Listan kallade därför 23 trakter "klara att
// fakturera" i prod 2026-10-25 — 20 av dem var redan fakturerade och fem till
// och med slutredovisade. Två trakter var det som faktiskt återstod (Vällust RP
// M-R -25 och Östra-Hoka 17 A-C -25). Samtidigt låg fyra redan fakturerade
// trakter kvar under "saknar traillertimmar", alltså arbete att fylla i för
// fakturor som redan gått ut.
//
// KOPPLINGEN ÄR KONTRAKTSNUMRET, inte VO-nummer. Vidas kontraktsnummer står på
// vår faktura som artikel 8, "Kontraktsnr 968539". Synken (/api/fortnox/
// sync-invoices) letar VO-nummer och har matchat 0 av 822 rader —
// matched_objekt_id är tom i hela tabellen. På kontraktsnumret matchar 36 rader
// / 28 trakter, och varje faktura bär exakt ETT kontraktsnummer (kontrollerat
// mot alla 111 artikel 8-rader i prod), så kopplingen är entydig. Den här filen
// skriver inget — matched_objekt_id och manual_objekt_id rörs aldrig.
//
// SLUTREDOVISNING = artikel 7 på fakturan (Martin 2026-10-25: det är
// slutredovisningen på fakturan som gör trakten avräknad). 31 av 111 fakturor
// har en, och den ligger ofta på en SENARE faktura än den vanliga.
//
// VAD VI INTE VET, och säger: konventionen med artikel 8 började i maj 2026 —
// 23 äldre fakturor (jan–apr) saknar den, och 30 av 69 trakter saknar
// kontraktsnummer. En trakt utan kontraktsnummer går inte att bedöma; vyn säger
// det på raden och gissar den ALDRIG som ofakturerad.

/** En rad ur fortnox_invoice_rows — bara det läget behöver. */
export type FakturaRadUr = {
  document_number: number | null
  invoice_date: string | null
  article_number: string | null
  description: string | null
}

/** En rad ur objekt — kopplingen trakt → kontraktsnummer. */
export type ObjektKontrakt = { vo_nummer: string | null; kontraktsnummer: string | null }

export type Faktura = { nummer: number; datum: string | null; slutredovisning: boolean }

export type TraktFaktura = {
  kontraktsnummer: string | null
  /** Äldst först. Slutredovisningen ligger ofta på den sista. */
  fakturor: Faktura[]
  slutredovisad: boolean
}

/** Per vo_nummer. En trakt som inte finns i kartan går inte att bedöma. */
export type FakturaLage = Record<string, TraktFaktura>

export type Lage = 'ofakturerat' | 'fakturerat' | 'slutredovisat' | 'okant'

const ARTIKEL_KONTRAKTSNR = '8'
const ARTIKEL_SLUTREDOVISNING = '7'

/** Allt blanktecken bort, så "968 539" och "968539" är samma nummer. Tomt → null. */
export function normaliseraKnr(v: string | null | undefined): string | null {
  const t = (v ?? '').replace(/\s/g, '')
  return t === '' ? null : t
}

/** Kontraktsnumret ur en artikel 8-rad. Är raden något annat: null. */
export function kontraktsnrUrRad(rad: FakturaRadUr): string | null {
  if (rad.article_number !== ARTIKEL_KONTRAKTSNR) return null
  const m = /kontraktsnr\s*(.*)$/i.exec(rad.description ?? '')
  return normaliseraKnr(m ? m[1] : null)
}

export function byggFakturaLage(
  objekt: ObjektKontrakt[],
  rader: FakturaRadUr[],
): FakturaLage {
  // Fakturor med en slutredovisningsrad.
  const slutredovisade = new Set<number>()
  for (const r of rader) {
    if (r.article_number === ARTIKEL_SLUTREDOVISNING && r.document_number != null) {
      slutredovisade.add(r.document_number)
    }
  }

  // Kontraktsnummer → fakturor. En faktura räknas en gång även om den skulle
  // bära numret på två rader.
  const perKnr = new Map<string, Map<number, Faktura>>()
  for (const r of rader) {
    const knr = kontraktsnrUrRad(r)
    if (!knr || r.document_number == null) continue
    if (!perKnr.has(knr)) perKnr.set(knr, new Map())
    perKnr.get(knr)!.set(r.document_number, {
      nummer: r.document_number,
      datum: r.invoice_date,
      slutredovisning: slutredovisade.has(r.document_number),
    })
  }

  const lage: FakturaLage = {}
  for (const o of objekt) {
    if (!o.vo_nummer) continue
    const knr = normaliseraKnr(o.kontraktsnummer)
    const fakturor = knr ? [...(perKnr.get(knr)?.values() ?? [])].sort(aldstForst) : []
    lage[o.vo_nummer] = {
      kontraktsnummer: knr,
      fakturor,
      slutredovisad: fakturor.some(f => f.slutredovisning),
    }
  }
  return lage
}

function aldstForst(a: Faktura, b: Faktura): number {
  if (a.datum !== b.datum) {
    if (!a.datum) return 1
    if (!b.datum) return -1
    return a.datum < b.datum ? -1 : 1
  }
  return a.nummer - b.nummer
}

/**
 * Läget för en trakt. Utan kontraktsnummer (eller utan traktrad alls) är svaret
 * 'okant' — aldrig 'ofakturerat': att påstå att en trakt vi inte kan slå upp
 * är ofakturerad är precis det fel som gjorde listan fel.
 */
export function lageFor(f: TraktFaktura | undefined): Lage {
  if (!f || !f.kontraktsnummer) return 'okant'
  if (f.slutredovisad) return 'slutredovisat'
  return f.fakturor.length > 0 ? 'fakturerat' : 'ofakturerat'
}

/** Fakturan som slutredovisar trakten. */
export function slutredovisningen(f: TraktFaktura | undefined): Faktura | null {
  return f?.fakturor.find(x => x.slutredovisning) ?? null
}

/** Den senaste fakturan — den som säger när trakten senast fakturerades. */
export function senasteFakturan(f: TraktFaktura | undefined): Faktura | null {
  const n = f?.fakturor.length ?? 0
  return n > 0 ? f!.fakturor[n - 1] : null
}
