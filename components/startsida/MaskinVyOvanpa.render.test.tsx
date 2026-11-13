// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import MaskinVyOvanpa, { VY_OVANPA_Z } from './MaskinVyOvanpa'
import { INBADDAD_KALLA } from '@/lib/inbaddad'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
let rot: Root | null = null; let el: HTMLElement | null = null
afterEach(() => { act(() => rot?.unmount()); el?.remove(); rot = null; el = null })

function rita() {
  const anrop: string[] = []
  el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el)
  act(() => rot!.render(<MaskinVyOvanpa href="/arbetsrapport" onHem={() => anrop.push('hem')} onKarta={(h) => anrop.push(`karta:${h}`)} />))
  const ruta = el.querySelector('iframe') as HTMLIFrameElement
  const skicka = (data: unknown, o: { origin?: string; source?: unknown } = {}) => act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin: o.origin ?? window.location.origin, source: (o.source === undefined ? ruta.contentWindow : o.source) as any }))
  })
  return { anrop, ruta, skicka }
}

describe('MaskinVyOvanpa', () => {
  it('visar vyn i en ruta över hela skärmen, ovanpå appens låda', () => {
    const { ruta } = rita()
    expect(ruta.getAttribute('src')).toBe('/arbetsrapport')
    const yta = el!.querySelector('[data-testid="maskin-vy-ovanpa"]') as HTMLElement
    expect(yta.style.position).toBe('fixed')
    expect(Number(yta.style.zIndex)).toBe(VY_OVANPA_Z)
    expect(VY_OVANPA_Z).toBeGreaterThan(1600)
  })
  it('hemknappen i vyn ger hem, en kartlänk ger till kartan', () => {
    const { anrop, skicka } = rita()
    skicka({ kalla: INBADDAD_KALLA, typ: 'hem' })
    skicka({ kalla: INBADDAD_KALLA, typ: 'karta', href: '/planering?installningar=1' })
    expect(anrop).toEqual(['hem', 'karta:/planering?installningar=1'])
  })
  it('meddelanden från någon annan än rutan, från en annan sajt eller med fel form gör ingenting', () => {
    const { anrop, skicka } = rita()
    skicka({ kalla: INBADDAD_KALLA, typ: 'hem' }, { source: window })
    skicka({ kalla: INBADDAD_KALLA, typ: 'hem' }, { origin: 'https://ond.se' })
    skicka({ typ: 'hem' })
    skicka({ kalla: INBADDAD_KALLA, typ: 'karta', href: 'https://ond.se' })
    expect(anrop).toEqual([])
  })
})
