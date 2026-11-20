// @vitest-environment jsdom
/**
 * Startsidan på en maskin: förarens egna saker visas med lås (rad, favorit, sökträff) och öppnar "Vem är du?" i stället för sidan; Ekonomi,
 * Personal, Avtal och Affärsuppföljning finns inte alls (varken i grupperna, favoriterna, sökningen eller Behöver dig). Upplåst förare ser sina
 * egna saker men aldrig Ekonomi/Personal; upplåst admin ser dem. På en telefon (vanlig) är allt oförändrat och Mer har "Kod för maskinen".
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ mk: { lage: 'last', maskinId: 'R64428', upplast: null as any, oppnaVemArDu: vi.fn(), las: vi.fn(), loggaUtMaskinen: vi.fn() } as any }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/components/maskinkonto/MaskinKontoProvider', async () => {
  const orig = await vi.importActual<typeof import('@/components/maskinkonto/MaskinKontoProvider')>('@/components/maskinkonto/MaskinKontoProvider')
  return { ...orig, useMaskinKonto: () => h.mk }
})
vi.mock('@/components/maskinkonto/KodArk', () => ({ default: () => <div data-kod-ark /> }))

import Startsida from './Startsida'
import type { Roll } from '@/lib/vyer'

let rot: ReturnType<typeof createRoot> | null = null
let el: HTMLDivElement | null = null
beforeEach(() => { ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; h.mk.oppnaVemArDu.mockClear(); el = document.createElement('div'); document.body.appendChild(el) })
afterEach(() => { act(() => { rot?.unmount() }); el?.remove(); rot = null; el = null })
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }
async function montera(roll: Roll, extra: Record<string, unknown> = {}) {
  rot = createRoot(el!)
  await act(async () => { rot!.render(<Startsida roll={roll} marken={{}} {...extra} />) }); await flush()
}
const lankar = () => Array.from(document.querySelectorAll('a')).map(a => a.getAttribute('href'))
const lasta = () => Array.from(document.querySelectorAll('[data-last-rad]')).map(b => b.getAttribute('data-last-rad'))
const sok = async (q: string) => {
  const input = document.querySelector('input[type="search"]') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => { setter.call(input, q); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
const DOLDA = ['/ekonomi', '/personal', '/avtal', '/affarsuppfoljning/rakna', '/admin']

describe('maskinkontot (låst)', () => {
  beforeEach(() => { h.mk.lage = 'last'; h.mk.upplast = null })
  it('förarens egna saker har lås och är knappar — inga länkar till dem', async () => {
    await montera('forare', { favoritIds: ['planera', 'planering', 'ledighet'] })
    expect(lasta()).toEqual(expect.arrayContaining(['planera', 'ledighet']))
    for (const href of ['/planera', '/ledighet']) expect(lankar()).not.toContain(href)
    expect(lankar()).toContain('/planering')                     // kartan är öppen
    expect(document.querySelectorAll('[data-last-rad] [class*="material"]').length).toBeGreaterThan(0)
  })
  it('alla vyer i grupperna: arbetsrapport, planera, ledighet, utbildning låsta; planering, uppföljning, objekt öppna', async () => {
    // ihopfälld lista på telefon: öppna alla grupper
    rot = createRoot(el!); await act(async () => { rot!.render(<Startsida roll="forare" marken={{}} bred />) }); await flush()
    expect(lasta()).toEqual(expect.arrayContaining(['arbetsrapport', 'ledighet', 'planera', 'utbildning']))
    for (const href of ['/arbetsrapport', '/ledighet', '/planera', '/utbildning']) expect(lankar()).not.toContain(href)
    for (const href of ['/planering', '/uppfoljning', '/objekt', '/oversikt', '/maskinvy']) expect(lankar()).toContain(href)
  })
  it('Ekonomi, Personal, Avtal och Affärsuppföljning syns ingenstans — inte ens som låsta rader, inte i sökningen, inte för admin-roll heller (maskinkontot är aldrig admin)', async () => {
    rot = createRoot(el!); await act(async () => { rot!.render(<Startsida roll="forare" marken={{}} bred />) }); await flush()
    for (const href of DOLDA) expect(lankar()).not.toContain(href)
    // ("Personal och tid" är gruppen för tid och ledighet — inte vyn Personal)
    expect(document.body.textContent).not.toMatch(/Ekonomi|Personal(?! och tid)|Avtal|Affärsuppföljning|Markägarrapport|Objektöversikt/)
    for (const q of ['ekonomi', 'personal', 'avtal', 'faktura', 'telefon', 'lön', 'medarbetare', 'affär']) {
      await sok(q)
      const traffar = Array.from(document.querySelectorAll('section[aria-label="Träffar"] a, section[aria-label="Träffar"] button')).map(x => x.textContent)
      expect(traffar.join('|'), q).not.toMatch(/Ekonomi|Personal(?! och tid)|Avtal|Affärsuppföljning/)
    }
  })
  it('sökträff på en låst vy är också låst', async () => {
    await montera('forare'); await sok('semester')
    expect(document.querySelector('section[aria-label="Träffar"] [data-last-rad="ledighet"]')).not.toBeNull()
    expect(lankar()).not.toContain('/ledighet')
  })
  it('ett tryck på en låst rad öppnar "Vem är du?" med raden man ville till', async () => {
    await montera('forare', { favoritIds: ['arbetsrapport'] })
    await act(async () => { (document.querySelector('[data-last-rad="arbetsrapport"]') as HTMLButtonElement).click() })
    expect(h.mk.oppnaVemArDu).toHaveBeenCalledWith('/arbetsrapport')
  })
  it('inga personliga uppgifter på maskinen (ledighet, "fyll i telefon", introduktion) — och Mer har varken Logga ut eller Kod för maskinen', async () => {
    await montera('forare', { marken: { ledighet: 3 }, egnaUppgifter: 'Fyll i telefon och anhörig', introduktion: 'Gör introduktionen · 2 av 5 klart', konto: { namn: 'H8', epost: 'h8@x' }, onLoggaUt: vi.fn() })
    expect(document.querySelector('section[aria-label="Behöver dig"]')).toBeNull()
    await act(async () => { (document.querySelector('button[aria-label^="Mer"]') as HTMLButtonElement).click() })
    expect(document.querySelector('[data-kod-rad]')).toBeNull()
    expect(document.body.textContent).not.toContain('Logga ut')
  })
})

describe('upplåst', () => {
  it('förare: egna saker öppna (inga lås), Ekonomi/Personal/Avtal borta', async () => {
    h.mk.lage = 'upplast'; h.mk.upplast = { id: 'p', namn: 'Oskar', roll: 'forare', aktivitet: 1 }
    rot = createRoot(el!); await act(async () => { rot!.render(<Startsida roll="forare" marken={{}} bred />) }); await flush()
    expect(lasta()).toEqual([])
    expect(lankar()).toEqual(expect.arrayContaining(['/arbetsrapport', '/ledighet', '/planera']))
    for (const href of DOLDA) expect(lankar()).not.toContain(href)
  })
  it('admin: Ekonomi, Personal och Avtal finns, och Logga ut maskinen finns i Mer', async () => {
    h.mk.lage = 'upplast'; h.mk.upplast = { id: 'a', namn: 'Martin', roll: 'admin', aktivitet: 1 }
    rot = createRoot(el!); await act(async () => { rot!.render(<Startsida roll="admin" marken={{}} bred konto={{ namn: 'Martin', epost: 'm@x' }} onLoggaUt={vi.fn()} />) }); await flush()
    for (const href of ['/ekonomi', '/personal', '/avtal', '/admin']) expect(lankar()).toContain(href)
    await act(async () => { (document.querySelector('button[aria-label^="Mer"]') as HTMLButtonElement).click() })
    expect(document.body.textContent).toContain('Logga ut')
  })
  it('upplåst förare får inget Logga ut i Mer (hen låser med pillen)', async () => {
    h.mk.lage = 'upplast'; h.mk.upplast = { id: 'p', namn: 'Oskar', roll: 'forare', aktivitet: 1 }
    await montera('forare', { konto: { namn: 'Oskar', epost: 'o@x' }, onLoggaUt: vi.fn() })
    await act(async () => { (document.querySelector('button[aria-label^="Mer"]') as HTMLButtonElement).click() })
    expect(document.body.textContent).not.toContain('Logga ut')
  })
})

describe('telefon och dator (vanlig) — oförändrat', () => {
  beforeEach(() => { h.mk.lage = 'vanlig' })
  it('inga lås, förare ser Personal och Avtal som förut, admin ser Ekonomi', async () => {
    rot = createRoot(el!); await act(async () => { rot!.render(<Startsida roll="forare" marken={{}} bred />) }); await flush()
    expect(lasta()).toEqual([])
    expect(lankar()).toEqual(expect.arrayContaining(['/arbetsrapport', '/ledighet', '/personal', '/avtal', '/affarsuppfoljning/rakna']))
    act(() => { rot?.unmount() }); rot = createRoot(el!); await act(async () => { rot!.render(<Startsida roll="admin" marken={{}} bred />) }); await flush()
    expect(lankar()).toEqual(expect.arrayContaining(['/ekonomi', '/personal']))
  })
  it('Mer har "Kod för maskinen" — och den öppnar kodarket — plus Logga ut som förut', async () => {
    await montera('forare', { konto: { namn: 'Oskar', epost: 'o@x' }, onLoggaUt: vi.fn() })
    await act(async () => { (document.querySelector('button[aria-label^="Mer"]') as HTMLButtonElement).click() })
    expect(document.body.textContent).toContain('Logga ut')
    await act(async () => { (document.querySelector('[data-kod-rad]') as HTMLButtonElement).click() })
    expect(document.querySelector('[data-kod-ark]')).not.toBeNull()
  })
})
