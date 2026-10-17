// @vitest-environment jsdom
/**
 * PDF-förhandsvisningen (Dela som PDF på Månadsfacit och Veckoläge): skapar PDF:en när panelen öppnas, visar den (pdf.js → canvas),
 * delar den RIKTIGA filen först när man trycker Dela, och städar när den stängs. pdf.js och delningen är utbytta (jsdom har ingen canvas/PDF).
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  destroy: vi.fn(),
  render: vi.fn(),
  getDocument: vi.fn(),
  delaFil: vi.fn(),
  datan: [] as Uint8Array[],
}))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: (arg: { data: Uint8Array }) => {
    m.datan.push(arg.data)
    return m.getDocument(arg)
  },
}))
vi.mock('../_lib/veckolageDela', () => ({ delaFil: m.delaFil }))

import PdfForhandsvisning from './PdfForhandsvisning'

let root: Root | null = null
let cont: HTMLDivElement
async function monter(el: React.ReactElement) {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  cont = document.createElement('div'); document.body.appendChild(cont)
  root = createRoot(cont)
  await act(async () => { root!.render(el) })
}
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve() }) }
// Tillstand tonar över i nästa (RORELSE.byte = 250 ms) — vänta ut det innan texten läses.
const tonaOver = async () => { await act(async () => { await new Promise(r => setTimeout(r, 320)) }) }
const text = () => cont.textContent ?? ''
const knapp = (t: string) => Array.from(cont.querySelectorAll('button')).find(b => b.textContent === t || b.getAttribute('aria-label') === t) as HTMLButtonElement | undefined

const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]) // "%PDF-1.4"

beforeEach(() => {
  m.destroy.mockReset(); m.render.mockReset(); m.getDocument.mockReset(); m.delaFil.mockReset(); m.datan.length = 0
  m.render.mockReturnValue({ promise: Promise.resolve() })
  m.getDocument.mockReturnValue({
    promise: Promise.resolve({
      getPage: async () => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }), render: m.render }),
      destroy: m.destroy,
    }),
  })
  m.delaFil.mockResolvedValue('delad')
  HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof HTMLCanvasElement.prototype.getContext
})
afterEach(async () => { await act(async () => { root?.unmount() }); cont?.remove(); root = null })

describe('PdfForhandsvisning', () => {
  it('laddar-läge med text medan PDF:en skapas; Dela är avstängd tills den finns', async () => {
    let klar!: (b: Uint8Array) => void
    await monter(<PdfForhandsvisning skapa={() => new Promise<Uint8Array>(r => { klar = r })} filnamn="manadsfacit-2026-09" titel="Månadsfacit september 2026" onStang={() => {}} />)
    expect(text()).toContain('Skapar PDF…')
    expect(knapp('Dela')!.disabled).toBe(true)
    await act(async () => { klar(PDF) })
    await tick()
    expect(knapp('Dela')!.disabled).toBe(false)
    expect(m.render).toHaveBeenCalledTimes(1)
  })

  it('Dela skickar den riktiga PDF-filen (namn, typ, innehåll) — inte kopian som gick till pdf.js', async () => {
    await monter(<PdfForhandsvisning skapa={async () => PDF} filnamn="manadsfacit-2026-09" titel="Månadsfacit september 2026" onStang={() => {}} />)
    await tick()
    await act(async () => { knapp('Dela')!.click() })
    await tick()
    expect(m.delaFil).toHaveBeenCalledTimes(1)
    const [blob, namn, titel] = m.delaFil.mock.calls[0] as [Blob, string, string]
    expect(namn).toBe('manadsfacit-2026-09.pdf')
    expect(titel).toBe('Månadsfacit september 2026')
    expect(blob.type).toBe('application/pdf')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(PDF)
    // pdf.js fick en kopia (den skickar bufferten till sin worker och tömmer den).
    expect(m.datan[0]).not.toBe(PDF)
    expect(m.datan[0]).toEqual(PDF)
  })

  it('bakåt och Esc stänger; pdf.js-dokumentet förstörs när vyn stängs', async () => {
    const stang = vi.fn()
    await monter(<PdfForhandsvisning skapa={async () => PDF} filnamn="x" titel="x" onStang={stang} />)
    await tick()
    await act(async () => { knapp('Tillbaka')!.click() })
    expect(stang).toHaveBeenCalledTimes(1)
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(stang).toHaveBeenCalledTimes(2)
    await act(async () => { root!.unmount() })
    root = null
    expect(m.destroy).toHaveBeenCalled()
  })

  it('PDF:en kunde inte skapas: fel med Försök igen, Dela avstängd — sedan fungerar det', async () => {
    const skapa = vi.fn().mockRejectedValueOnce(new Error('nej')).mockResolvedValueOnce(PDF)
    await monter(<PdfForhandsvisning skapa={skapa} filnamn="x" titel="x" onStang={() => {}} />)
    await tick()
    await tonaOver()
    expect(text()).toContain('Kunde inte skapa PDF:en')
    expect(knapp('Dela')!.disabled).toBe(true)
    await act(async () => { knapp('Försök igen')!.click() })
    await tick()
    await tonaOver()
    expect(skapa).toHaveBeenCalledTimes(2)
    expect(knapp('Dela')!.disabled).toBe(false)
    expect(text()).not.toContain('Kunde inte skapa PDF:en')
  })

  it('sidan gick inte att visa men PDF:en finns: säger det och Dela fungerar ändå', async () => {
    m.getDocument.mockReturnValue({ promise: Promise.reject(new Error('pdf.js')) })
    await monter(<PdfForhandsvisning skapa={async () => PDF} filnamn="x" titel="x" onStang={() => {}} />)
    await tick()
    await tonaOver()
    expect(text()).toContain('Kan inte visa sidan här')
    expect(knapp('Dela')!.disabled).toBe(false)
    await act(async () => { knapp('Dela')!.click() })
    await tick()
    expect(m.delaFil).toHaveBeenCalledTimes(1)
  })

  it('ligger under toppfältet (underTopbar), inte på ett nakent top-tal', async () => {
    await monter(<PdfForhandsvisning skapa={async () => PDF} filnamn="x" titel="x" onStang={() => {}} />)
    const panel = cont.querySelector('[role=dialog]') as HTMLElement
    expect(panel.style.position).toBe('fixed')
    expect(panel.style.top).toContain('safe-area-inset-top')
  })
})
