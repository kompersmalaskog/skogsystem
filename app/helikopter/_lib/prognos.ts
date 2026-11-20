// PROGNOS (2026-11-20, Martin: "hur det ska gå på varje trakt och maskin så vi vet om vi hinner").
// Samma rader som Läget nu — `koerFor` i tavla.ts ger köerna, så trakternas "hinns" och maskinernas "landar" aldrig kan läsa olika.
//   Per trakt:   hinns · hinns delvis · hinns inte, med datum, m³ kvar och m³/G15h (kvar volym / kvar G15-timmar = traktens takt).
//   Per maskin:  vad maskinen hinner i månaden och i vilken ordning.
// Regler: hinner = kvar × andel som hinns (som tavlan); en maskin som kör annat lägger inget (0, märkt); en trakt utan maskin hinns aldrig;
// m³/G15h saknas (null) när G15-timmar saknas — aldrig 0. Prognos läser bara; ändringar görs i Planera. Inga imports av React eller Supabase.
import { fmtDag } from './format'
import type { KlarRoll } from './klar'
import type { Typ } from './queries'
import type { Ton } from './kort'
import { EGEN_SKOTNING, byggTavla, flyttVal, koerFor, traktVy, type KoRad, type Tavla, type TavlaBlock, type TavlaIndata } from './tavla'
import { fmt } from './format'

export type PrognosStatus = 'hinns' | 'delvis' | 'hinns_inte' | 'ingen_maskin'

export type PrognosTrakt = {
  objekt_id: string
  roll: KlarRoll
  namn: string
  maskin_id: string | null
  maskin: string | null
  status: PrognosStatus
  /** "klar 26 nov" · "ca 26 nov" · "?" — bara när trakten hinns helt eller delvis. */
  klar: string
  /** m³ som är kvar på trakten för rollen. */
  kvar: number
  /** Det av `kvar` som hinns i månaden (0 när maskinen kör annat). */
  hinner: number
  /** 0–1. */
  andel: number
  /** m³ per G15-timme på det som är kvar. null = G15-timmar saknas. */
  takt: number | null
  korAnnat: boolean
}

export type PrognosRoll = {
  roll: KlarRoll
  rubrik: 'Skördare' | 'Skotare'
  ord: string
  ton: Ton
  bestallt: number
  nu: number
  landar: number | null
  trakter: PrognosTrakt[]
  /** Antal rader (från toppen) som hinns helt eller delvis — månadens slut ritas efter dem. -1 = ingen linje (månaden inte pågående / ingen prognos). */
  linjeEfter: number
  hinns: number
  delvis: number
  hinnsInte: number
  /** Trakterna räcker inte: så många m³ saknas. null = räcker, eller går inte att säga. */
  saknar: number | null
}

export type PrognosSpar = { typ: Typ; namn: string; bestallt: number; roller: [PrognosRoll, PrognosRoll] }

export type PrognosMaskin = {
  maskin_id: string
  namn: string
  roll: KlarRoll
  nu: number
  landar: number | null
  /** landar − nu. null när det inte finns en prognos. */
  hinner: number | null
  ca: boolean
  korAnnat: boolean
  stopp: string | null
  trakter: PrognosTrakt[]
}

export type Prognos = {
  /** "30 nov" — månadens sista arbetsdag; tom när ingen prognos finns. */
  slutDatum: string
  spar: PrognosSpar[]
  maskiner: PrognosMaskin[]
}

const tidKey = (t: PrognosTrakt, till: string | null) => (t.status === 'hinns_inte' || t.status === 'ingen_maskin' ? '9' : '0') + (till ?? '9999-99-99')

/** m³ per G15-timme: det som är kvar delat med kvarvarande timmar. Går det inte att räkna är det null. */
export function traktTakt(kvar: number, timmar: number | null): number | null {
  if (timmar == null || !(timmar > 0) || !(kvar > 0)) return null
  return Math.round((kvar / timmar) * 10) / 10
}

function rad(r: KoRad, namn: string | null, korAnnat: boolean, typ: Typ, sista: string): PrognosTrakt {
  const vy = traktVy(r, typ, sista)
  const andel = korAnnat ? 0 : r.andelIManaden
  const status: PrognosStatus = andel >= 0.999 ? 'hinns' : andel > 0 ? 'delvis' : 'hinns_inte'
  return {
    objekt_id: r.trakt.objekt_id, roll: r.trakt.roll, namn: vy.namn, maskin_id: r.trakt.maskin_id, maskin: namn,
    status, klar: status === 'hinns_inte' ? '' : vy.klar === '?' ? 'datum saknas' : vy.klar.startsWith('ca') ? vy.klar : `klar ${vy.klar}`,
    kvar: Math.round(r.kvar), hinner: Math.round(r.kvar * andel), andel, takt: traktTakt(r.kvar, r.trakt.timmar), korAnnat,
  }
}

export function byggPrognos(d: TavlaIndata, tavla: Tavla): Prognos {
  const { koer, sista } = koerFor(d)
  const maskinNamn = new Map((d.klar?.maskiner ?? []).map(m => [m.maskin_id, m.namn]))
  const pagar = d.klar != null && d.status !== 'avslutad'

  const roll = (typ: Typ, b: TavlaBlock, bestallt: number, saknar: number | null): PrognosRoll => {
    const korAnnat = new Set(b.maskiner.filter(m => m.korAnnat).map(m => m.maskin_id))
    const trakter: PrognosTrakt[] = []
    for (const m of b.maskiner) {
      for (const r of koer.get(m.maskin_id) ?? []) {
        if (r.trakt.typ !== typ || r.trakt.roll !== b.roll) continue
        trakter.push(rad(r, m.namn, korAnnat.has(m.maskin_id), typ, sista))
      }
    }
    // Hinns först (efter datum), sedan det som inte hinns; trakter utan maskin allra sist.
    const tillPer = new Map(b.maskiner.flatMap(m => (koer.get(m.maskin_id) ?? []).map(r => [`${m.maskin_id}:${r.trakt.objekt_id}`, r.till] as const)))
    trakter.sort((a, c) => tidKey(a, tillPer.get(`${a.maskin_id}:${a.objekt_id}`) ?? null).localeCompare(tidKey(c, tillPer.get(`${c.maskin_id}:${c.objekt_id}`) ?? null)))
    for (const u of b.utan) {
      trakter.push({ objekt_id: u.objekt_id, roll: b.roll, namn: u.namn, maskin_id: null, maskin: null, status: 'ingen_maskin', klar: '', kvar: u.volym, hinner: 0, andel: 0, takt: null, korAnnat: false })
    }
    const hinns = trakter.filter(t => t.status === 'hinns').length
    const delvis = trakter.filter(t => t.status === 'delvis').length
    return {
      roll: b.roll, rubrik: b.roll === 'skordare' ? 'Skördare' : 'Skotare', ord: b.ord, ton: b.ton, bestallt, nu: b.nu, landar: b.landar,
      trakter, linjeEfter: pagar && b.landar != null ? hinns + delvis : -1,
      hinns, delvis, hinnsInte: trakter.length - hinns - delvis, saknar,
    }
  }

  const spar = tavla.spar.filter(s => s.bestallt > 0).map((s): PrognosSpar => {
    const saknarFor = (r: KlarRoll) => { const x = s.racker.find(y => y.roll === r); return x && x.diff < 0 ? -x.diff : null }
    return { typ: s.typ, namn: s.namn, bestallt: s.bestallt, roller: [roll(s.typ, s.block[0], s.bestallt, saknarFor(s.block[0].roll)), roll(s.typ, s.block[1], s.bestallt, saknarFor(s.block[1].roll))] }
  })

  // Per maskin: en maskin kan stå i båda spåren (slutavverkning och gallring) — då är det EN kort med båda spårens trakter.
  const map = new Map<string, PrognosMaskin>()
  for (const s of tavla.spar) {
    if (s.bestallt <= 0) continue
    for (const b of s.block) {
      for (const m of b.maskiner) {
        const trakter = (koer.get(m.maskin_id) ?? []).filter(r => r.trakt.typ === s.typ && r.trakt.roll === b.roll).map(r => rad(r, m.namn, m.korAnnat, s.typ, sista))
        const finns = map.get(m.maskin_id)
        if (finns) {
          finns.nu += m.nu
          finns.landar = finns.landar == null || m.landar == null ? null : finns.landar + m.landar
          finns.hinner = finns.landar == null ? null : finns.landar - finns.nu
          finns.ca = finns.ca || m.ca
          finns.trakter.push(...trakter)
        } else {
          map.set(m.maskin_id, { maskin_id: m.maskin_id, namn: maskinNamn.get(m.maskin_id) ?? m.namn, roll: m.roll, nu: m.nu, landar: m.landar, hinner: m.landar == null ? null : m.landar - m.nu, ca: m.ca, korAnnat: m.korAnnat, stopp: m.stopp, trakter })
        }
      }
    }
  }
  const maskiner = [...map.values()].sort((a, b) => Number(a.roll === 'skotare') - Number(b.roll === 'skotare') || a.namn.localeCompare(b.namn, 'sv'))

  return { slutDatum: pagar ? fmtDag(sista) : '', spar, maskiner }
}

// ── Vad ska vi göra? (2026-11-20, Martin: "jag måste kunna ta beslut vad vi ska göra") ─────────────────────────────────────────────────
// För varje spår och maskintyp som inte hinner: de val som faktiskt flyttar talet, räknade med SAMMA tavla (en simulering per val) —
// aldrig ett påstående utan siffra. Störst vinst först. "Lägg in ny trakt" har ingen siffra (vi vet inte vilken trakt) och står sist.
export type Forslag = {
  id: string
  typ: Typ
  roll: KlarRoll
  titel: string
  under: string
  /** Spårets dom före och efter valet ("Fattas 1 501" → "Fattas 380"). efter = null när vi inte kan räkna. */
  fore: string
  efter: string | null
  eftertons: Ton | null
  /** m³ valet flyttar landar (positivt = bättre). null = går inte att räkna. */
  vinst: number | null
  aktion: { slag: 'maskin'; objekt_id: string } | { slag: 'planera' }
}

export function byggForslag(d: TavlaIndata, tavla: Tavla): Forslag[] {
  if (d.klar == null || d.status === 'avslutad') return []
  const ut: Forslag[] = []
  const diffAv = (t: Tavla, typ: Typ, roll: KlarRoll) => t.spar.find(s => s.typ === typ)?.block.find(b => b.roll === roll) ?? null
  for (const s of tavla.spar) {
    if (s.bestallt <= 0) continue
    for (const b of s.block) {
      // För mycket skördat (bara skördaren): en trakt flyttas till nästa månad.
      if (b.diff != null && b.diff > 0 && b.ton === 'orange' && b.roll === 'skordare') {
        ut.push({ id: `over:${s.typ}:${b.roll}`, typ: s.typ, roll: b.roll, titel: 'Flytta en trakt till nästa månad', under: `${fmt(b.diff)} m³ över beställt`, fore: b.ord, efter: null, eftertons: null, vinst: null, aktion: { slag: 'planera' } })
        continue
      }
      if (b.diff == null || b.diff >= 0) continue
      const lista: Forslag[] = []
      // 1. Trakter utan maskin: den maskin som ger mest.
      for (const u of b.utan) {
        const val = flyttVal(d, u.objekt_id, b.roll)?.val ?? []
        let bast: { namn: string; b2: TavlaBlock } | null = null
        for (const v of val) {
          if (v.nuvarande || v.maskin_id === EGEN_SKOTNING) continue
          const t2 = byggTavla({ ...d, flytt: { objekt_id: u.objekt_id, roll: b.roll, maskin_id: v.maskin_id } })
          const b2 = diffAv(t2, s.typ, b.roll)
          if (b2?.diff != null && (bast == null || b2.diff > (bast.b2.diff ?? -Infinity))) bast = { namn: v.namn, b2 }
        }
        if (bast && bast.b2.diff != null && bast.b2.diff - b.diff >= 1) {
          lista.push({ id: `maskin:${s.typ}:${b.roll}:${u.objekt_id}`, typ: s.typ, roll: b.roll, titel: `Ge ${u.namn} till ${bast.namn}`, under: `${fmt(u.volym)} m³ som ingen maskin har`, fore: b.ord, efter: bast.b2.ord, eftertons: bast.b2.ton, vinst: Math.round(bast.b2.diff - b.diff), aktion: { slag: 'maskin', objekt_id: u.objekt_id } })
        }
      }
      // 2. Maskin som kör annat: vad vi vinner om den är tillbaka på kön.
      for (const m of b.maskiner) {
        if (!m.korAnnat) continue
        const t2 = byggTavla({ ...d, senaste: (d.senaste ?? []).filter(x => x.maskin_id !== m.maskin_id) })
        const b2 = diffAv(t2, s.typ, b.roll)
        if (b2?.diff != null && b2.diff - b.diff >= 1) {
          lista.push({ id: `kor:${s.typ}:${b.roll}:${m.maskin_id}`, typ: s.typ, roll: b.roll, titel: `${m.namn} tillbaka på sina trakter`, under: `Kör annat just nu — räknas inte in`, fore: b.ord, efter: b2.ord, eftertons: b2.ton, vinst: Math.round(b2.diff - b.diff), aktion: { slag: 'planera' } })
        }
      }
      lista.sort((a, c) => (c.vinst ?? 0) - (a.vinst ?? 0))
      // 3. Räcker inte skogen: en ny trakt behövs, hur många m³ som saknas.
      const saknar = s.racker.find(r => r.roll === b.roll && r.diff < 0)
      if (saknar) lista.push({ id: `ny:${s.typ}:${b.roll}`, typ: s.typ, roll: b.roll, titel: 'Lägg in en ny trakt', under: `Trakterna räcker inte — ${fmt(-saknar.diff)} m³ saknas`, fore: b.ord, efter: null, eftertons: null, vinst: null, aktion: { slag: 'planera' } })
      ut.push(...lista)
    }
  }
  return ut
}
