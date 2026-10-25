import { describe, expect, it } from 'vitest'
import { enhetSvar, forberedelser, maskinVal } from './enhetMaskinKort'
import { avgorAppStart } from './appStart'
import { arMaskinlage } from './maskindatorStart'

const reg = [
  { maskin_id: 'A1', visningsnamn: 'Wisent', maskin_typ: 'Forwarder', aktiv_till: null },
  { maskin_id: 'R1', visningsnamn: 'H8E -26', maskin_typ: 'Harvester', aktiv_till: null },
  { maskin_id: 'S1', visningsnamn: 'Såld', maskin_typ: 'Forwarder', aktiv_till: '2026-01-01' },
  { maskin_id: 'X1', visningsnamn: 'Okänd typ', maskin_typ: null, aktiv_till: null },
]

describe('maskinVal', () => {
  it('bara aktiva maskiner med känd roll, sorterade på namn, med rollen i ord', () => {
    expect(maskinVal(reg, '2026-10-25')).toEqual([
      { maskinId: 'R1', namn: 'H8E -26', slag: 'Skördare' },
      { maskinId: 'A1', namn: 'Wisent', slag: 'Skotare' },
    ])
  })
})

describe('enhetSvar', () => {
  it('svarar vad enheten ÄR', () => {
    expect(enhetSvar('Wisent')).toBe('Den här enheten är maskin: Wisent')
    expect(enhetSvar(null)).toBe('Den här enheten är ingen maskin')
  })
})

describe('forberedelser', () => {
  it('installerad + plats ok: app och plats Ok, Autolås kan appen inte läsa', () => {
    const f = forberedelser({ installerad: true, plats: 'ok' })
    expect(f.map((x) => x.ok)).toEqual([true, true, null])
  })
  it('plats nekad är ett fel som säger var man ändrar det', () => {
    const p = forberedelser({ installerad: true, plats: 'nekad' }).find((x) => x.id === 'plats')!
    expect(p.ok).toBe(false)
    expect(p.under).toContain('Platstjänster')
  })
  it('inte installerad säger hur man installerar', () => {
    const a = forberedelser({ installerad: false, plats: 'okand' }).find((x) => x.id === 'app')!
    expect(a.ok).toBe(false)
    expect(a.under).toContain('Lägg till på hemskärmen')
  })
  it('Autolås nämns alltid (Aldrig)', () => {
    expect(forberedelser({ installerad: true, plats: 'ok' }).find((x) => x.id === 'skarm')!.titel).toContain('Aldrig')
  })
})

describe('en enhet med vald maskin startar som maskin — utan serial-GPS', () => {
  it('maskinläge och start i /planering', () => {
    expect(arMaskinlage(false, false, 'A1')).toBe(true)
    expect(avgorAppStart({ enhetMaskinId: 'A1', serialGps: false })).toEqual({ typ: 'planering' })
  })
  it('utan maskin och utan serial: vanlig meny, ingen maskinfråga', () => {
    expect(arMaskinlage(false, false, null)).toBe(false)
    expect(avgorAppStart({ enhetMaskinId: null, serialGps: false })).toEqual({ typ: 'meny' })
  })
})
