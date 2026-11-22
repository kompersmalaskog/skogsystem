// @vitest-environment jsdom
// Den GAMLA maskinvyn (maskinvy.tsx / skotare.tsx) — felet som rapporterades i prod 2026-11-22: Produktion → Analys → backa EN gång
// kastade en ur hela vyn. Hooken är det de två filerna läser sin flik, maskin och period ur.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useGammalMaskinvyNav } from './useGammalMaskinvyNav'
import { readFileSync } from 'fs'
import { resolve } from 'path'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const vanta = () => new Promise(r => setTimeout(r, 15))
const VYER = ['idag', 'oversikt', 'produktion', 'avbrott', 'analys', 'jamfor']

let nav: ReturnType<typeof useGammalMaskinvyNav>
function Prov() { nav = useGammalMaskinvyNav({ maskinParam: 'skordare', giltigaVyer: VYER, standardVy: 'idag' }); return null }

let rot: Root; let el: HTMLElement
async function montera(url: string) {
  window.history.replaceState(null, '', url)
  el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el)
  await act(async () => { rot.render(<Prov />); await vanta() })
}
afterEach(() => { act(() => rot.unmount()); el.remove() })
const gor = async (f: () => void) => { await act(async () => { f(); await vanta() }) }
const backa = () => gor(() => window.history.back())
const niv = () => ((window.history.state as any)?.mvNiva ?? 0) as number

describe('gamla maskinvyn: backa', () => {
  beforeEach(() => { /* varje test monterar själv */ })

  it('BUGGEN: Produktion → Analys → backa ETT steg = Produktion (inte ut ur vyn)', async () => {
    await montera('/maskinvy')
    expect(nav.activeView).toBe('idag')
    await gor(() => nav.setActiveView('produktion'))
    await gor(() => nav.setActiveView('analys'))
    expect(nav.activeView).toBe('analys')
    await backa()
    expect(nav.activeView).toBe('produktion')
    expect(window.location.pathname).toBe('/maskinvy')
    await backa()
    expect(nav.activeView).toBe('idag')
  })

  it('standardfliken skrivs som ingen parameter; samma flik igen ger ingen post', async () => {
    await montera('/maskinvy?vy=produktion')
    await gor(() => nav.setActiveView('idag'))
    expect(window.location.search).toBe('')
    const langd = niv()
    await gor(() => nav.setActiveView('idag'))
    expect(niv()).toBe(langd)
  })

  it('månadspilar och V/M/K/Å är replace: ett backa lämnar fliken, inte en månad', async () => {
    await montera('/maskinvy')
    await gor(() => nav.setActiveView('produktion'))
    const langd = niv()
    await gor(() => nav.valjPeriod('K'))
    await gor(() => nav.setPeriodOffset(o => o - 1))
    await gor(() => nav.setPeriodOffset(o => o - 1))
    await gor(() => nav.setPeriodOffset(o => Math.min(o + 1, 0)))
    expect(niv()).toBe(langd)
    expect(nav.period).toBe('K')
    expect(nav.periodOffset).toBe(-1)
    await gor(() => nav.valjPeriod('M'))
    expect(nav.periodOffset).toBe(0) // ett nytt periodval nollar stegen
    await backa()
    expect(nav.activeView).toBe('idag')
  })

  it('två snabba tryck på ‹ räknar var och en från senaste värdet', async () => {
    await montera('/maskinvy')
    await act(async () => { nav.setPeriodOffset(o => o - 1); nav.setPeriodOffset(o => o - 1); await vanta() })
    expect(nav.periodOffset).toBe(-2)
  })

  it('maskin är ett steg; standardmaskinen och redan vald maskin ger ingen post', async () => {
    await montera('/maskinvy')
    const langd = niv()
    await gor(() => nav.valjMaskin('R64101', 'PONS', 'PONS'))
    expect(nav.maskinId).toBe('R64101')
    expect(niv()).toBe(langd + 1)
    await gor(() => nav.valjMaskin('R64101', 'PONS', 'R64101'))
    expect(niv()).toBe(langd + 1)
    await gor(() => nav.valjMaskin('PONS', 'PONS', 'R64101'))
    expect(nav.maskinId).toBeNull() // standardmaskinen = ingen parameter
    await backa()
    expect(nav.maskinId).toBe('R64101')
  })

  it('omladdning: flik, maskin och period kommer ur adressen; okänd flik = standard', async () => {
    await montera('/maskinvy?vy=avbrott&skordare=R64101&per=Å&off=-2')
    expect(nav.activeView).toBe('avbrott')
    expect(nav.maskinId).toBe('R64101')
    expect(nav.period).toBe('Å')
    expect(nav.periodOffset).toBe(-2)
    act(() => rot.unmount()); el.remove()
    await montera('/maskinvy?vy=kapacitet')
    expect(nav.activeView).toBe('idag') // kapacitet finns bara i nya vyn — aldrig en blank sida
  })
})

describe('källvakt: de gamla vyerna och djupvyerna går genom historiken', () => {
  const las = (f: string) => readFileSync(resolve(__dirname, '../..', f), 'utf8')
  it('maskinvy.tsx och skotare.tsx har ingen egen useState för flik, maskin eller period', () => {
    for (const f of ['maskinvy.tsx', 'skotare.tsx']) {
      const s = las(f)
      expect(s, f).toContain('useGammalMaskinvyNav')
      expect(s, f).not.toMatch(/useState\('idag'\)/)
      expect(s, f).not.toMatch(/\[vald, setVald\]/)
      expect(s, f).not.toMatch(/\[period, setPeriod\]/)
      expect(s, f).not.toMatch(/\[periodOffset, setPeriodOffset\]/)
    }
  })
  it('page.tsx skriver aldrig history direkt och har ingen replaceState för fliken', () => {
    const s = las('app/maskinvy/page.tsx')
    expect(s).not.toMatch(/history\.replaceState/)
    expect(s).not.toMatch(/history\.pushState/)
  })
  it('varje djupvy och panel anropar useDjupvyHistorik', () => {
    for (const f of [
      'app/maskinvy/VolymDeepView.tsx', 'app/maskinvy/OperatorDeepView.tsx', 'app/maskinvy/ProduktionNy.tsx',
      'app/maskinvy/SkotareOversiktNy.tsx', 'app/maskinvy/SkotareProduktionNy.tsx', 'app/maskinvy/MaskinLogg.tsx',
      'skotare.tsx',
    ]) expect(las(f), f).toMatch(/useDjupvyHistorik\(/)
    expect(las('maskinvy.tsx')).toMatch(/usePanelDjupvyHistorik\('forarOverlay'/)
  })
  it('varje komponent med className="mv-djup" har en historikpost (en ny djupvy utan den lämnar vyn vid backa)', () => {
    for (const f of [
      'app/maskinvy/VolymDeepView.tsx', 'app/maskinvy/OperatorDeepView.tsx', 'app/maskinvy/ProduktionNy.tsx',
      'app/maskinvy/SkotareOversiktNy.tsx', 'app/maskinvy/SkotareProduktionNy.tsx',
    ]) {
      const s = las(f)
      const djup = (s.match(/className="mv-djup"/g) ?? []).length
      const hooks = (s.match(/useDjupvyHistorik\(true,/g) ?? []).length
      expect(hooks, f).toBeGreaterThanOrEqual(djup)
    }
  })
})
