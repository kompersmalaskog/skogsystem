// Veckor — "Hur gick veckorna?": en veckorad har två rader (Skördat / Skotat), var och en "612 av 669" + ett ord ("57 kvar", "39 under", "Klart").
// Ren modell: samma tal som förut (plan, skördat, skotat per vecka), bara orden är nya. "Klart" = veckan nått planen (≥, som veckaFarg).
import type { VeckaRad } from './queries'
import { fmt } from './format'

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
  return { text, ord: status === 'pagar' ? `${skillnad} kvar` : `${skillnad} under`, klart: false }
}

/** Veckans två rader. Utan beställning (plan saknas) står bara volymen, inget ord. */
export function veckoRader(v: VeckaRad): { skordat: VeckoRadRad; skotat: VeckoRadRad; egen: string | null } {
  return { skordat: rad('Skördat', v.skordat, v.plan, v.status), skotat: rad('Skotat', v.skotat, v.plan, v.status), egen: egenText(v) }
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
