// @vitest-environment jsdom
/**
 * Märket på en volymsiffra. Blandade perioder (Elefant november: manuell totalvolym på fyra objekt, förarens uppskattning i appen
 * på Lidhem) visar BÅDA märkena — annars ser 16 % av siffran säkrare ut än den är.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { VolymBadge } from './OversiktShared'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = '' })

const visa = (el: React.ReactElement) => { act(() => { r.render(el) }); return Array.from(rot.querySelectorAll('[data-volym-mark]')).map(e => e.getAttribute('data-volym-mark')) }

describe('VolymBadge', () => {
  it('bara manuell: ett märke', () => expect(visa(<VolymBadge harManuell appMark={null} />)).toEqual(['manuell']))
  it('bara app, oskalad: "uppskattad"', () => expect(visa(<VolymBadge harManuell={false} appMark="uppskattad" />)).toEqual(['uppskattad']))
  it('bara app, skalad: "skalad"', () => expect(visa(<VolymBadge harManuell={false} appMark="skalad" />)).toEqual(['skalad']))
  it('blandat (manuell + app-lass): båda märkena, manuell först', () => {
    expect(visa(<VolymBadge harManuell appMark="uppskattad" />)).toEqual(['manuell', 'uppskattad'])
    expect(visa(<VolymBadge harManuell appMark="skalad" />)).toEqual(['manuell', 'skalad'])
  })
  it('rent Opti: "preliminär", inget app- eller manuellt märke', () => {
    expect(visa(<VolymBadge harManuell={false} appMark={null} />)).toEqual([])
    expect(rot.textContent).toBe('preliminär')
  })
})
