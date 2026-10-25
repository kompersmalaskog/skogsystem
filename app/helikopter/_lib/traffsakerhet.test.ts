import { describe, it, expect } from 'vitest'
import { byggPar, grupperaTrakter, kallaText, narmastText, ordna, parNarmastText, parText, summera, type FacitRad } from './traffsakerhet'

const rad = (over: Partial<FacitRad>): FacitRad => ({
  objekt_id: 'o', namn: 'Trakt', typ: 'slutavverkning', klart: '2026-10-01T00:00:00Z', skordare_g15: 52, skotare_g15: 60,
  manuell_prognos: { skordare: 56, skotare: 72 }, app_prognos: { skordare: 48, skotare: 61 }, ...over,
})

describe('byggPar', () => {
  it('ett par per roll med utfall och minst en prognos, nyast först', () => {
    const par = byggPar([rad({ objekt_id: 'a', klart: '2026-09-01' }), rad({ objekt_id: 'b', klart: '2026-10-01', skotare_g15: null })])
    expect(par.map(p => `${p.objekt_id}:${p.roll}`)).toEqual(['b:skordare', 'a:skordare', 'a:skotare'])
  })
  it('utan någon prognos finns inget par; utan utfall inte heller', () => {
    expect(byggPar([rad({ manuell_prognos: null, app_prognos: null })])).toHaveLength(0)
    expect(byggPar([rad({ skordare_g15: 0, skotare_g15: null })])).toHaveLength(0)
  })
  it('avvikelse och närmast', () => {
    const [sk, sko] = byggPar([rad({})])
    expect(sk.avvikelse.planeraren).toBeCloseTo(4 / 56)
    expect(sk.avvikelse.appen).toBeCloseTo(4 / 48)
    expect(sk.narmast).toBe('lika')              // 4 tim ifrån båda
    expect(sko.narmast).toBe('appen')            // 60: appen 61 (1), planeraren 72 (12)
    expect(parText(sk)).toBe('Skördaren blev 52 tim · planeraren 56 tim · appen 48 tim')
    expect(parNarmastText(sk)).toBe('lika nära')
    expect(parNarmastText(sko)).toBe('appen låg närmast')
  })
  it('bara en källa: ingen jämförelse, raden säger inte "–"', () => {
    const [p] = byggPar([rad({ app_prognos: null, skotare_g15: null })])
    expect(p.narmast).toBeNull()
    expect(parText(p)).toBe('Skördaren blev 52 tim · planeraren 56 tim')
    expect(parNarmastText(p)).toBeNull()
  })
  it('kommatal i gammal manuell_prognos läses', () => {
    const [p] = byggPar([rad({ manuell_prognos: { skordare: '56,5' }, app_prognos: null, skotare_g15: null })])
    expect(p.planeraren).toBe(56.5)
  })
})

describe('summera', () => {
  it('tomt: inga tal, ärlig text', () => {
    const s = summera([])
    expect(s.kallor.appen.inomProcent).toBeNull()
    expect(kallaText(s.kallor.appen)).toEqual({ tal: '–', under: 'Inga trakter än' })
    expect(narmastText(s)).toBeNull()
  })
  it('under MIN_PAR: antalet men inget tal', () => {
    const s = summera(byggPar([rad({ skotare_g15: null }), rad({ objekt_id: 'b', skotare_g15: null })]))
    expect(kallaText(s.kallor.planeraren)).toEqual({ tal: '–', under: '2 trakter – för få för ett tal' })
  })
  it('medianen över de senaste 20, i hela procent; närmast räknas bara på jämförda par', () => {
    const rader: FacitRad[] = []
    for (let i = 0; i < 25; i++) {
      // de 20 senaste: planeraren 10 % fel, appen 5 % fel; de 5 äldsta: planeraren 50 % fel (ska inte räknas)
      const senaste = i < 20
      rader.push(rad({ objekt_id: `o${i}`, klart: `2026-${String(12 - Math.floor(i / 28)).padStart(2, '0')}-${String(28 - i).padStart(2, '0')}`, skordare_g15: 100, skotare_g15: null, manuell_prognos: { skordare: senaste ? 110 : 150 }, app_prognos: senaste ? { skordare: 105 } : null }))
    }
    const s = summera(byggPar(rader))
    expect(s.kallor.planeraren).toMatchObject({ antal: 25, inomProcent: 9, narmast: 0 })   // |100−110|/110 = 9,1 %
    expect(s.kallor.appen).toMatchObject({ antal: 20, inomProcent: 5, narmast: 20 })
    expect(s.jamforda).toBe(20)
    expect(kallaText(s.kallor.planeraren)).toEqual({ tal: 'inom 9 %', under: 'på de senaste 20 trakterna' })
    expect(narmastText(s)).toBe('Appen låg närmast 20 av 20 gånger · planeraren 0')
  })
  it('lika räknas och sägs', () => {
    const s = summera(byggPar([rad({ skotare_g15: null })]))
    expect(s.lika).toBe(1)
    expect(narmastText(s)).toBe('Appen låg närmast 0 av 1 gånger · planeraren 0 · lika 1')
  })
})

describe('ordna och gruppera', () => {
  it('störst skillnad först, annars nyast; en trakt är en grupp med sina roller', () => {
    const par = byggPar([
      rad({ objekt_id: 'liten', klart: '2026-10-05', skordare_g15: 55, skotare_g15: null }),         // 1,8 % / 14,6 %
      rad({ objekt_id: 'stor', klart: '2026-10-01', skordare_g15: 30, skotare_g15: 60 }),            // 46 % / 37,5 %
    ])
    expect(ordna(par, 'senaste').map(p => p.objekt_id)).toEqual(['liten', 'stor', 'stor'])
    expect(ordna(par, 'skillnad')[0].objekt_id).toBe('stor')
    const g = grupperaTrakter(ordna(par, 'senaste'))
    expect(g.map(x => [x.objekt_id, x.par.length])).toEqual([['liten', 1], ['stor', 2]])
  })
})
