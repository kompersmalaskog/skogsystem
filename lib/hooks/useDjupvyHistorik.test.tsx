// @vitest-environment jsdom
// Djupvyn som ett steg i historiken: backa stänger den, ✕ tar bort sin post, och en navigering från den lämnar inget skräp.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useDjupvyHistorik } from './useDjupvyHistorik'
import { skrivNavigering } from '@/lib/maskinvy/historik'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const vanta = () => new Promise(r => setTimeout(r, 15))
const niv = () => ((window.history.state as any)?.mvNiva ?? 0) as number
const djupId = () => (window.history.state as any)?.mvDjup

function Djup({ oppen, stang }: { oppen: boolean; stang: () => void }) {
  useDjupvyHistorik(oppen, stang)
  return null
}

let rot: Root
let el: HTMLElement
beforeEach(() => {
  window.history.replaceState(null, '', '/maskinvy?ny=1&vy=produktion')
  el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el)
})
afterEach(() => { act(() => rot.unmount()); el.remove() })

async function rendera(oppen: boolean, stang: () => void, strikt = false) {
  const nod = <Djup oppen={oppen} stang={stang} />
  await act(async () => { rot.render(strikt ? <StrictMode>{nod}</StrictMode> : nod); await vanta() })
  await vanta() // effekten körs när act är klar; historikposten läggs i en timeout(0) efter det
}

describe('useDjupvyHistorik', () => {
  it('öppnad djupvy lägger EN post; backa anropar stäng och stannar i vyn', async () => {
    const stang = vi.fn()
    const n0 = niv()
    await rendera(true, stang)
    expect(niv()).toBe(n0 + 1)
    expect(djupId()).toBeDefined()
    expect(window.location.search).toBe('?ny=1&vy=produktion')

    await act(async () => { window.history.back(); await vanta() })
    expect(stang).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('?ny=1&vy=produktion') // samma flik — vi lämnade inte vyn
    expect(niv()).toBe(n0)
  })

  it('stängs i appen (✕): posten tas bort, så nästa backa inte bara "gör ingenting"', async () => {
    const stang = vi.fn()
    const n0 = niv()
    await rendera(true, stang)
    expect(djupId()).toBeDefined()
    await rendera(false, stang)
    await act(async () => { await vanta() })
    expect(stang).not.toHaveBeenCalled() // ✕ är appens egen stängning, hooken anropar den inte
    // back() utfördes: vi står på posten under djupvyn igen
    expect(djupId()).toBeUndefined()
    expect(niv()).toBe(n0)
  })

  it('React StrictMode (effekten körs, städas och körs igen) ger EN post och ingen omedelbar stängning', async () => {
    const stang = vi.fn()
    const n0 = niv()
    await rendera(true, stang, true)
    expect(niv()).toBe(n0 + 1)
    expect(djupId()).toBeDefined()
    expect(stang).not.toHaveBeenCalled()
  })

  it('navigering medan djupvyn är öppen ersätter dess post och rör inte historiken vid avmontering', async () => {
    const stang = vi.fn()
    await rendera(true, stang)
    const n1 = niv()
    skrivNavigering({ vy: 'avbrott' }, 'push') // t.ex. ett val i sidolistan
    expect(niv()).toBe(n1) // ersatte djupvyns post, la ingen ny
    expect(djupId()).toBeUndefined()
    await rendera(false, stang) // vyn byts → djupvyn avmonteras
    await act(async () => { await vanta() })
    expect(window.location.search).toBe('?ny=1&vy=avbrott') // ingen back() drog tillbaka oss
    expect(stang).not.toHaveBeenCalled()
  })

  it('två djupvyer ovanpå varandra: backa stänger den översta först', async () => {
    const stangA = vi.fn(); const stangB = vi.fn()
    function Tva({ b }: { b: boolean }) { useDjupvyHistorik(true, stangA); return <Djup oppen={b} stang={stangB} /> }
    await act(async () => { rot.render(<Tva b={false} />); await vanta() })
    await vanta()
    await act(async () => { rot.render(<Tva b />); await vanta() })
    await vanta()
    await act(async () => { window.history.back(); await vanta() })
    expect(stangB).toHaveBeenCalledTimes(1)
    expect(stangA).not.toHaveBeenCalled()
    await act(async () => { window.history.back(); await vanta() })
    expect(stangA).toHaveBeenCalledTimes(1)
  })
})
