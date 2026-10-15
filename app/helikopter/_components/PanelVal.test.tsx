// @vitest-environment jsdom
/** En panel åt gången, även när flera flikar visas samtidigt: att öppna en i en flik stänger den i en annan. */
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, afterEach } from 'vitest'
import { PanelContext, usePanelVal, type PanelPost } from './PanelVal'

function Flik({ agare }: { agare: string }) {
  const [val, setVal] = usePanelVal<'a' | 'b'>(agare)
  return (
    <div>
      <button data-testid={`${agare}-a`} onClick={() => setVal('a')} />
      <button data-testid={`${agare}-stang`} onClick={() => setVal(null)} />
      <span data-testid={`${agare}-val`}>{val ?? '-'}</span>
    </div>
  )
}
function Skal() {
  const [panel, setPanel] = useState<PanelPost>(null)
  return <PanelContext.Provider value={{ panel, satt: setPanel }}><Flik agare="lage" /><Flik agare="planering" /><Flik agare="uppfoljning" /></PanelContext.Provider>
}

let root: Root | null = null
let cont: HTMLDivElement
afterEach(async () => { await act(async () => { root?.unmount() }); cont?.remove(); root = null })
const val = (id: string) => document.querySelector(`[data-testid=${id}-val]`)!.textContent
const klick = async (id: string) => { await act(async () => { (document.querySelector(`[data-testid=${id}]`) as HTMLElement).click() }) }

describe('usePanelVal', () => {
  it('bara en panel är öppen i taget över alla flikar', async () => {
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    cont = document.createElement('div'); document.body.appendChild(cont)
    root = createRoot(cont)
    await act(async () => { root!.render(<Skal />) })
    await klick('lage-a')
    expect([val('lage'), val('planering'), val('uppfoljning')]).toEqual(['a', '-', '-'])
    await klick('uppfoljning-a')
    expect([val('lage'), val('planering'), val('uppfoljning')]).toEqual(['-', '-', 'a'])
    await klick('uppfoljning-stang')
    expect([val('lage'), val('planering'), val('uppfoljning')]).toEqual(['-', '-', '-'])
  })
})
