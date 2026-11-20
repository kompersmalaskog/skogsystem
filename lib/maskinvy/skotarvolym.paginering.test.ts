import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Supabase-RPC:er svarar med högst 1 000 rader per anrop (.range). En mock som beter sig likadant.
const db = vi.hoisted(() => ({
  lass: [] as any[], tid: [] as any[], anrop: [] as Array<{ namn: string; fran: number; till: number }>, felVidSida: -1,
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (namn: string) => ({
      range: (fran: number, till: number) => {
        db.anrop.push({ namn, fran, till })
        if (db.felVidSida >= 0 && fran / 1000 === db.felVidSida) return Promise.resolve({ data: null, error: { message: 'timeout' } })
        const kalla = namn === 'maskindata_lass' ? db.lass : db.tid
        return Promise.resolve({ data: kalla.slice(fran, Math.min(till, fran + 999) + 1), error: null })
      },
    }),
  },
}))

import { fetchAllTimeLassTid, rpcPaginerat, byggVolymPerDag, sumPerDag } from './skotarvolym'

const lassRad = (i: number) => ({ datum: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`, maskin_id: 'A030353', volym_m3sub: 10, objekt_id: i % 2 ? 'O1' : 'O2' })
const tidRad = (i: number) => ({ datum: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`, maskin_id: 'A030353', processing_sek: 3600, terrain_sek: 0, other_work_sek: 0, objekt_id: i % 2 ? 'O1' : 'O2' })

beforeEach(() => { db.lass = []; db.tid = []; db.anrop = []; db.felVidSida = -1 })

describe('fetchAllTimeLassTid — båda RPC:erna pagineras', () => {
  it('tid över 1 000 rader kapas inte längre (förut: tyst delsumma)', async () => {
    db.lass = Array.from({ length: 1255 }, (_, i) => lassRad(i))   // Wisent i produktion: 1 255 lass
    db.tid = Array.from({ length: 2300 }, (_, i) => tidRad(i))
    const { lassRows, tidRows } = await fetchAllTimeLassTid(['A030353'])
    expect(lassRows).toHaveLength(1255)
    expect(tidRows).toHaveLength(2300)
    expect(db.anrop.filter(a => a.namn === 'maskindata_tid').map(a => a.fran)).toEqual([0, 1000, 2000])
  })

  it('exakt 2 000 rader: en tom tredje sida avslutar, inga rader dubbleras', async () => {
    db.tid = Array.from({ length: 2000 }, (_, i) => tidRad(i))
    const { tidRows } = await fetchAllTimeLassTid(['A030353'])
    expect(tidRows).toHaveLength(2000)
    expect(db.anrop.filter(a => a.namn === 'maskindata_tid')).toHaveLength(3)
  })

  it('tomt resultat och under en sida', async () => {
    db.tid = Array.from({ length: 436 }, (_, i) => tidRad(i))     // Wisent i produktion: 436 tid-rader
    const { lassRows, tidRows } = await fetchAllTimeLassTid(['A030353'])
    expect(lassRows).toEqual([])
    expect(tidRows).toHaveLength(436)
  })

  it('fel på en senare sida kastar — ingen halv lista som ser komplett ut', async () => {
    db.tid = Array.from({ length: 2300 }, (_, i) => tidRad(i))
    db.felVidSida = 1
    await expect(fetchAllTimeLassTid(['A030353'])).rejects.toThrow(/maskindata_tid: timeout/)
  })

  it('siffrorna ändras inte under 1 000 rader: samma fördelning som med hela listan', async () => {
    db.lass = Array.from({ length: 300 }, (_, i) => lassRad(i))
    db.tid = Array.from({ length: 436 }, (_, i) => tidRad(i))
    const { lassRows, tidRows } = await fetchAllTimeLassTid(['A030353'])
    const manuell = [{ objekt_id: 'O1', maskin_id: 'A030353', volym_m3: 315 }]
    const fran = byggVolymPerDag(lassRows, manuell, tidRows, 'A030353', '2026-09-01', '2026-09-30')
    const facit = byggVolymPerDag(db.lass, manuell, db.tid, 'A030353', '2026-09-01', '2026-09-30')
    expect(sumPerDag(fran.perDag)).toBeCloseTo(sumPerDag(facit.perDag), 9)
    expect(fran.harManuell).toBe(true)
  })
})

describe('rpcPaginerat', () => {
  it('kastar på fel direkt', async () => {
    db.felVidSida = 0
    await expect(rpcPaginerat('maskindata_lass', {})).rejects.toThrow('maskindata_lass: timeout')
  })
})

describe('källvakt', () => {
  it('skotarvolym.ts anropar aldrig supabase.rpc utanför rpcPaginerat (ingen oavgränsad läsning)', () => {
    const kod = readFileSync(join(process.cwd(), 'lib/maskinvy/skotarvolym.ts'), 'utf-8').replace(/\/\/.*$/gm, '')
    expect((kod.match(/supabase\.rpc\(/g) || []).length).toBe(1)
  })
})
