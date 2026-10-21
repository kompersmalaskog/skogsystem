// @vitest-environment jsdom
/**
 * Skotare › Jämförelse (period M), renderad mot facitets storlek (produktion, oktober 2026).
 * Felet som rättas: vyn läste den gamla Elephant King (A110148) och visade "0 lass · 0 m³", och
 * fotnoten påstod "manuell schablon tills FPR-registrering är åtgärdad" fast A130743 registrerar
 * riktiga volymer. G15 räknades dessutom utan övrigt arbete.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', async () => (await import('./jamforelseFacit.fixtur')).byggSupabaseMock())

import SkotareJamforelseNy from './SkotareJamforelseNy'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  ;(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T12:00:00'))
  rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot)
})
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = ''; vi.useRealTimers() })

const text = () => document.body.textContent || ''
const klicka = async (etikett: string) => {
  const knapp = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === etikett)!
  await act(async () => { knapp.click() })
}
const vanta = async (villkor: () => boolean) => {
  for (let i = 0; i < 80 && !villkor(); i++) await act(async () => { await new Promise(res => setTimeout(res, 5)) })
  expect(villkor(), text()).toBe(true)
}

describe('Skotare › Jämförelse mot facit', () => {
  it('oktober: EK 139 lass · 3 028 m³ (inte "0 lass · 0 m³"), Wisent 109 lass · 1 501 m³', async () => {
    await act(async () => { r.render(<SkotareJamforelseNy />) })
    await vanta(() => text().includes('139 lass'))
    expect(text()).toContain('139 lass · 3 028 m³')
    expect(text()).toContain('109 lass · 1 501 m³')
    expect(text()).not.toContain('0 lass · 0 m³')
  })

  it('m³/G15h: EK 28,8 mot Wisent 13,4 (G15 inklusive övrigt arbete)', async () => {
    await act(async () => { r.render(<SkotareJamforelseNy />) })
    await vanta(() => text().includes('139 lass'))
    await klicka('m³/G15h')
    const total = document.body.textContent || ''
    expect(total).toContain('28,8')
    expect(total).toContain('13,4')
    expect(total).not.toContain('troligen uppblåst')
  })

  it('fotnoten påstår inte längre manuell schablon', async () => {
    await act(async () => { r.render(<SkotareJamforelseNy />) })
    await vanta(() => text().includes('139 lass'))
    expect(text()).not.toContain('schablon')
    expect(text()).toContain('maskinmätt per lass')
  })

  it('juli: ingen G15 i datan → "–" med orsak, aldrig division', async () => {
    vi.setSystemTime(new Date('2026-07-20T12:00:00'))
    await act(async () => { r.render(<SkotareJamforelseNy />) })
    await vanta(() => text().includes('Juli'))
    await klicka('m³/G15h')
    await vanta(() => text().includes('Ingen G15-tid registrerad i perioden'))
    expect(text()).not.toMatch(/NaN|Infinity/)
  })
})
