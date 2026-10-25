import { describe, it, expect } from 'vitest'
import { medTimeoutRetry, arTimeoutFel } from './supabaseRetry'

const timeout = { code: '57014', message: 'canceling statement due to statement timeout' }

describe('medTimeoutRetry', () => {
  it('gör om EN gång när första läsningen föll på tidsgränsen', async () => {
    const svar = [{ data: null, error: timeout }, { data: 42, error: null }]
    let n = 0
    const res = await medTimeoutRetry(async () => svar[n++])
    expect(n).toBe(2)
    expect(res).toEqual({ data: 42, error: null })
  })

  it('ger upp efter två försök och lämnar felet', async () => {
    let n = 0
    const res = await medTimeoutRetry(async () => { n++; return { data: null, error: timeout } })
    expect(n).toBe(2)
    expect(res.error).toBe(timeout)
  })

  it('gör inte om vid andra fel', async () => {
    let n = 0
    const fel = { code: '42501', message: 'permission denied' }
    const res = await medTimeoutRetry(async () => { n++; return { data: null, error: fel } })
    expect(n).toBe(1)
    expect(res.error).toBe(fel)
  })

  it('känner igen tidsgränsen på kod eller text', () => {
    expect(arTimeoutFel({ code: '57014' })).toBe(true)
    expect(arTimeoutFel({ message: 'canceling statement due to statement timeout' })).toBe(true)
    expect(arTimeoutFel({ code: '42501', message: 'nej' })).toBe(false)
    expect(arTimeoutFel(null)).toBe(false)
  })
})
