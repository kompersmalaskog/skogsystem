// @vitest-environment jsdom
/**
 * Maskinlådan (hem-knappen i maskinläge): montera den riktiga komponenten och kontrollera det föraren behöver kunna
 * lita på — Byt objekt överst och fungerar, Till kartan / kartan / Esc stänger, samma vyer som startsidan, inga
 * adminvyer för förare eller vid okänd roll, och att länkar till sidan man står på stänger lådan i stället för att
 * navigera osynligt.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ roll: 'forare' as string | null, ek: 0, favoriter: null as string[] | null }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 't@exempel.se' } } }) },
    from: (tabell: string) => tabell === 'startsida_favoriter'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.favoriter ? { vyer: h.favoriter } : null, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: h.roll ? { roll: h.roll } : null }) }) }) },
    rpc: async () => ({ data: { att_godkanna: 0, nya_beslut: 0, nya_beslut_ids: [], nya_beslut_till: null }, error: null }),
  },
}))
vi.mock('@/app/datahalsa/useDatahalsa', () => ({ useDatahalsa: () => ({ besked: { niva: 'rod', rubrik: '3 saker att titta på' } }) }))
vi.mock('@/lib/egenkontroll', () => ({ hamtaVantande: async () => ({ antalVantande: h.ek }) }))

import MaskinMeny, { ladaBredd } from './MaskinMeny'

let rot: ReturnType<typeof createRoot> | null = null
let el: HTMLDivElement | null = null

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  h.roll = 'forare'; h.ek = 0; h.favoriter = null
  ;(window as any).matchMedia = (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })
  el = document.createElement('div'); document.body.appendChild(el)
})
afterEach(() => { act(() => { rot?.unmount() }); el?.remove(); rot = null; el = null })

const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve() }) }
function spion() {
  const anrop: string[] = []
  return {
    anrop,
    props: {
      maskinNamn: 'Rottne H8E',
      objektNamn: 'Trestensdal' as string | null,
      onBytObjekt: () => anrop.push('byt'),
      onStang: () => anrop.push('stang'),
      onSammaSida: (href: string) => anrop.push(`samma:${href}`),
    },
  }
}
async function montera(props: React.ComponentProps<typeof MaskinMeny>) {
  rot = createRoot(el!)
  await act(async () => { rot!.render(<MaskinMeny {...props} />) })
  await flush()
}
const knapp = (text: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes(text)) as HTMLButtonElement
const lankar = (s: Element | Document = document) => Array.from(s.querySelectorAll('a')).map(a => a.getAttribute('href'))
const sektion = (namn: string) => document.querySelector(`section[aria-label="${namn}"]`)
const klicka = async (e: Element) => { await act(async () => { (e as HTMLElement).click() }) }

describe('Maskinlådan', () => {
  it('överst: maskinen, objektet och Byt objekt — Byt objekt stänger lådan och går till objektlistan', async () => {
    const s = spion()
    await montera(s.props)
    const text = document.body.textContent!
    expect(text).toContain('Rottne H8E')
    expect(text).toContain('Trestensdal')
    // Byt objekt står före Dina vyer
    const byt = knapp('Byt objekt')
    expect(byt.compareDocumentPosition(sektion('Dina vyer')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await klicka(byt)
    expect(s.anrop).toEqual(['stang', 'byt'])
  })

  it('inget objekt valt → "Välj objekt"', async () => {
    const s = spion()
    await montera({ ...s.props, objektNamn: null })
    expect(document.body.textContent).toContain('Inget objekt valt')
    await klicka(knapp('Välj objekt'))
    expect(s.anrop).toEqual(['stang', 'byt'])
  })

  it('Till kartan, ett tryck på kartan och Esc stänger', async () => {
    const s = spion()
    await montera(s.props)
    await klicka(knapp('Till kartan'))
    await klicka(document.querySelector('.lada-skugga')!)
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(s.anrop).toEqual(['stang', 'stang', 'stang'])
  })

  it('samma innehåll som startsidan: förarens vyer, inga adminvyer', async () => {
    await montera(spion().props)
    expect(lankar(sektion('Dina vyer')!)).toEqual(['/planera', '/planering', '/ledighet', '/lastbil', '/kalibrering', '/maskin-service', '/uppfoljning', '/utbildning'])
    expect(lankar()).not.toContain('/admin')
    expect(document.body.textContent).not.toContain('Kompersmåla Skog')   // lådans eget huvud ersätter startsidans
  })

  it('okänd roll → förarens vyer, aldrig adminvyer på en gissning', async () => {
    h.roll = null
    await montera(spion().props)
    expect(lankar()).not.toContain('/admin')
    expect(lankar()).not.toContain('/ekonomi')
  })

  it('admin får sina vyer och sina sparade favoriter', async () => {
    h.roll = 'admin'; h.favoriter = ['ekonomi', 'kalibrering']
    await montera(spion().props)
    expect(lankar(sektion('Dina vyer')!)).toEqual(['/ekonomi', '/kalibrering'])
  })

  it('Planering (sidan man står på) stänger lådan i stället för att navigera; Inställningar skickar sin adress', async () => {
    const s = spion()
    await montera(s.props)
    const planering = sektion('Dina vyer')!.querySelector('a[href="/planering"]')!
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    await act(async () => { planering.dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(true)
    expect(s.anrop).toEqual(['stang', 'samma:/planering'])

    // Inställningar ligger i Mer-arket (inuti lådan) och går också till sidan man står på.
    await klicka(document.querySelector('button[aria-label^="Mer"]')!)
    const inst = document.querySelector('a[href="/planering?installningar=1"]')!
    const ev2 = new MouseEvent('click', { bubbles: true, cancelable: true })
    await act(async () => { inst.dispatchEvent(ev2) })
    expect(ev2.defaultPrevented).toBe(true)
    expect(s.anrop).toEqual(['stang', 'samma:/planering', 'stang', 'samma:/planering?installningar=1'])
  })

  it('en länk till en annan vy navigerar som vanligt', async () => {
    const s = spion()
    await montera(s.props)
    const kal = sektion('Dina vyer')!.querySelector('a[href="/kalibrering"]')!
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    // Stoppa jsdoms egen navigering EFTER att lådan sett klicket.
    document.addEventListener('click', e => e.preventDefault(), { once: true })
    await act(async () => { kal.dispatchEvent(ev) })
    expect(s.anrop).toEqual([])
  })
})

describe('ladaBredd', () => {
  it('maskindatorn 1280: panel 880 med karta bredvid; smal skärm: hela bredden', () => {
    expect(ladaBredd(1280)).toBe(880)
    expect(ladaBredd(960)).toBe(840)
    expect(ladaBredd(390)).toBe(390)
  })
})
