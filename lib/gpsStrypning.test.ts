import { describe, expect, it } from 'vitest'
import { nyStryp, skaNotifiera, STRYP_MS } from './gpsStrypning'
import { perSekund } from './gpsStrom'

const fix = (giltig = true) => ({ giltig, fordrojd: false }) as any

describe('skaNotifiera — högst en fix per sekund till appen', () => {
  it('första fixen går igenom', () => expect(skaNotifiera(nyStryp(), fix(), 1000).notifiera).toBe(true))
  it('50 meningar på en sekund ger en notifiering', () => {
    let s = nyStryp(); let n = 0
    for (let i = 0; i < 50; i++) { const r = skaNotifiera(s, fix(), 10_000 + i * 20); s = r.state; if (r.notifiera) n++ }
    expect(n).toBe(1)
  })
  it('en fix per sekund går alltid igenom', () => {
    let s = nyStryp(); let n = 0
    for (let i = 0; i < 10; i++) { const r = skaNotifiera(s, fix(), i * STRYP_MS); s = r.state; if (r.notifiera) n++ }
    expect(n).toBe(10)
  })
  it('att fixen tappas (giltig → ogiltig) släpps igenom direkt, aldrig fördröjt', () => {
    let s = nyStryp()
    s = skaNotifiera(s, fix(true), 0).state
    expect(skaNotifiera(s, fix(false), 100).notifiera).toBe(true)
  })
  it('klockan som går bakåt fastnar inte', () => {
    let s = nyStryp()
    s = skaNotifiera(s, fix(), 100_000).state
    expect(skaNotifiera(s, fix(), 50_000).notifiera).toBe(true)
  })
})

describe('perSekund', () => {
  it('räknar per sekund med en decimal', () => {
    expect(perSekund({ rader: 300, fixar: 30, positioner: 30, renderingar: 45 }, 30_000)).toEqual({ rader: 10, fixar: 1, positioner: 1, renderingar: 1.5 })
  })
})
