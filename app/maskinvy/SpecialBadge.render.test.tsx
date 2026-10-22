// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { SpecialBadge, ObjektNamn } from './SpecialBadge'

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; rot = document.createElement('div'); document.body.appendChild(rot); r = createRoot(rot) })
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = '' })
const visa = (el: React.ReactElement) => act(() => { r.render(el) })

describe('SpecialBadge', () => {
  it('ordet Special står i text, skälet ligger i title och aria-label', () => {
    visa(<SpecialBadge skal="Vindfällor" />)
    const b = document.querySelector('[data-special-badge]') as HTMLElement
    expect(b.textContent).toBe('Special')
    expect(b.getAttribute('title')).toBe('Special-objekt: Vindfällor')
    expect(b.getAttribute('aria-label')).toBe('Special-objekt: Vindfällor')
  })
  it('utan skäl: bara "Special-objekt"', () => {
    visa(<SpecialBadge skal={null} />)
    expect(document.querySelector('[data-special-badge]')!.getAttribute('title')).toBe('Special-objekt')
  })
})

describe('ObjektNamn', () => {
  it('visar namnet och en badge när objektet är special', () => {
    visa(<ObjektNamn namn="Hushållningssällskapet" special skal="Vindfällor" />)
    expect(rot.textContent).toContain('Hushållningssällskapet')
    expect(document.querySelectorAll('[data-special-badge]')).toHaveLength(1)
  })
  it('radbryt: namnet kortas aldrig med … utan får gå över flera rader', () => {
    visa(<ObjektNamn namn="Ett långt namn" radbryt />)
    const namn = rot.querySelector('span > span') as HTMLElement
    expect(namn.style.whiteSpace).not.toBe('nowrap')
    expect(namn.style.textOverflow).toBe('')
    visa(<ObjektNamn namn="Ett långt namn" />)
    expect((rot.querySelector('span > span') as HTMLElement).style.whiteSpace).toBe('nowrap')
  })
  it('vanligt objekt: bara namnet, ingen badge', () => {
    visa(<ObjektNamn namn="Vanligt objekt" />)
    expect(rot.textContent).toBe('Vanligt objekt')
    expect(document.querySelector('[data-special-badge]')).toBeNull()
  })
})
