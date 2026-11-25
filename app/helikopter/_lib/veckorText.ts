// Veckor — "Hur gick veckorna?": en veckorad har två rader (Skördat / Skotat), var och en "612 av 669" + ett ord ("57 kvar", "39 under", "Klart").
// Ren modell: samma tal som förut (plan, skördat, skotat per vecka), bara orden är nya. "Klart" = veckan nått planen (≥, som veckaFarg).
import type { BolagRad, VeckaRad } from './queries'
import { fmt } from './format'
import { bolagVy, type BolagVy } from './bolagText'
import { harPrognos as arPrognos, prognosPerBolag, type ManadStatus } from './berakningar'

const MAN = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec']
const dag = (iso: string) => ({ d: Number(iso.slice(8, 10)), m: Number(iso.slice(5, 7)) })

/** "10–14 nov" · "27 okt–31 okt" (över månadsskifte: båda månaderna). */
export function veckoDatum(fran: string, till: string): string {
  const a = dag(fran); const b = dag(till)
  return a.m === b.m ? `${a.d}–${b.d} ${MAN[b.m - 1]}` : `${a.d} ${MAN[a.m - 1]}–${b.d} ${MAN[b.m - 1]}`
}

export type VeckoRadRad = { text: string; ord: string; klart: boolean }

function rad(namn: string, varde: number, plan: number | null, status: VeckaRad['status']): VeckoRadRad {
  if (plan == null || plan <= 0) return { text: `${namn} ${status === 'kommande' ? '–' : fmt(varde)}`, ord: '', klart: false }
  if (status === 'kommande') return { text: `${namn} – av ${fmt(plan)}`, ord: '', klart: false }
  const text = `${namn} ${fmt(varde)} av ${fmt(plan)}`
  if (varde >= plan) return { text, ord: 'Klart', klart: true }
  const skillnad = fmt(plan - varde)
  // Jämnt flöde: en avslutad vecka står för sig och för inget vidare. Bara veckan som pågår säger vad som är kvar.
  return { text, ord: status === 'pagar' ? `${skillnad} kvar` : '', klart: false }
}

/** Veckans två rader. Utan beställning (plan saknas) står bara volymen, inget ord. */
export function veckoRader(v: VeckaRad): { skordat: VeckoRadRad; skotat: VeckoRadRad; egen: string | null; alla: string | null } {
  return { skordat: rad('Skördat', v.skordat, v.plan, v.status), skotat: rad('Skotat', v.skotat, v.plan, v.status), egen: egenText(v), alla: allaText(v) }
}

/** "varav egen skotning 192" — den del av skotat som markägaren skotar och som räknas på skördad volym. Inget när det inte finns. */
export function egenText(v: VeckaRad): string | null {
  const e = Math.round(v.skotat_egen ?? 0)
  return e > 0 ? `varav egen skotning ${fmt(e)}` : null
}

/** Rubrikens svar: bara när en vecka pågår — "Vecka 47 pågår" + "3 dagar kvar av veckan". Annars ingen rubrik (listan räcker). */
export function veckoSvar(veckor: VeckaRad[]): { rubrik: string; under: string } | null {
  const v = veckor.find(x => x.status === 'pagar')
  if (!v) return null
  const n = v.arbetsdagar_kvar
  return { rubrik: `Vecka ${v.isovecka} pågår`, under: `${n} ${n === 1 ? 'dag' : 'dagar'} kvar av veckan` }
}

/** "Alla bolag: skördat 239 · skotat 161" — hela veckan, även bolag utan beställning (Privat). Står bara när något sådant finns; raderna ovanför är mot beställningen. */
export function allaText(v: VeckaRad): string | null {
  const sk = Math.round(v.skordat_ovrigt ?? 0)
  const st = Math.round(v.skotat_ovrigt ?? 0)
  if (sk <= 0 && st <= 0) return null
  return `Alla bolag: skördat ${fmt(Math.round(v.skordat) + sk)} · skotat ${fmt(Math.round(v.skotat) + st)}`
}

export type ManadsRad = { rad: string; ord: string; ton: BolagVy['ton'] }

/**
 * Månadens läge för ett spår, en enda rad överst i Veckor: "Vida · 810 av 1 000 skotat" + "Ser ut att bli 1 069 · räcker".
 * SAMMA räkning som Hur går det per bolag? (bolagVy + prognosPerBolag), bara bolag med beställning (Privat utan beställning står utanför).
 * kvar = arbetsdagar kvar i månaden. Kommande månad: ingen rad. Avslutad månad: utfallet ("Klart · 60 över" / "Fattade 70").
 */
export function manadsRad(rader: BolagRad[], kvar: number, status: ManadStatus): ManadsRad | null {
  if (status === 'kommande') return null
  const med = rader.filter(r => r.lovat > 0)
  if (med.length === 0) return null
  const pagaende = status === 'pagaende'
  const harP = pagaende && med.every(r => arPrognos(r.takt_dagar))
  const lovat = med.reduce((a, r) => a + r.lovat, 0)
  const skotat = med.reduce((a, r) => a + r.skotat, 0)
  const prognos = med.reduce((a, r) => a + prognosPerBolag(r, pagaende ? kvar : 0, harP), 0)
  const v = bolagVy({ lovat, skotat, prognos }, harP)
  const namn = Array.from(new Set(med.map(r => r.bolag ?? 'Okänt'))).join(' + ')
  return { rad: `${namn} · ${v.hoger} skotat`, ord: v.ord, ton: v.ton }
}
