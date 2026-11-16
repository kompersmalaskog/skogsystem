import { describe, it, expect } from 'vitest'
import { byggArbetsrader, arbetsprisNot, timmar, type Arbetspost, type Timprisrad } from './arbetspris'
import { lasDebiterbartArbete, tillArbetsposter } from './lasManuellt'

/** Den enda sats Martin bekräftat (2026-11-16). */
const PRISER: Timprisrad[] = [{ nyckel: 'manuellt', timpris: 490 }]

describe('Bågskyttebanan RP J-Hus- 25 — facit mot faktura 2026181', () => {
  // Fakturan rad 5: "Man tim" 16 tim à 490 = 7 840 kr.
  // Arbetsrapporten har tre debiterbara poster på 952 minuter = 15,87 tim.
  const poster: Arbetspost[] = [
    { typ: 'manuellt', etikett: 'Manuell fällning', minuter: 360 },
    { typ: 'manuellt', etikett: 'Manuell fällning', minuter: 352 },
    { typ: 'manuellt', etikett: 'Manuell fällning', minuter: 240 },
  ]

  it('EN rad av 15,87 tim à 490 — inte tre rader', () => {
    const r = byggArbetsrader(poster, PRISER)
    expect(r).toHaveLength(1)
    expect(r[0].etikett).toBe('Manuell fällning')
    expect(r[0].timmar).toBe(15.87)
    expect(r[0].timpris).toBe(490)
  })

  it('timmarna summeras i MINUTER och avrundas EN gång', () => {
    // 360 + 352 + 240 = 952 min → 15,87 tim.
    // Avrundat per post: 6,00 + 5,87 + 4,00 = 15,87 — stämmer här, men
    // regeln är minuter in, timmar ut, så den aldrig kan glida.
    expect(byggArbetsrader(poster, PRISER)[0].timmar).toBe(timmar(952))
  })

  it('appens belopp ligger inom Martins avrundning till 16 tim', () => {
    const r = byggArbetsrader(poster, PRISER)[0]
    const appen = r.timmar * r.timpris!
    expect(appen).toBeCloseTo(7776.3, 1)   // fakturan: 16 × 490 = 7 840
    expect(Math.abs(appen - 7840)).toBeLessThan(490)  // under en timmes skillnad
  })
})

describe('Skälviken RP J-Hus -25 — 16,47 tim som ingen fakturerat', () => {
  it('8 070 kr som annars glöms', () => {
    const r = byggArbetsrader(
      [{ typ: 'manuellt', etikett: 'Manuell fällning', minuter: 988 }],
      PRISER,
    )[0]
    expect(r.timmar).toBe(16.47)
    expect(Math.round(r.timmar * r.timpris!)).toBe(8070)
  })
})

describe('en typ utan sats prissätts ALDRIG', () => {
  const blandat: Arbetspost[] = [
    { typ: 'manuellt', etikett: 'Manuell fällning', minuter: 120 },
    { typ: 'planering', etikett: 'Planering', minuter: 120 },
  ]

  it('planeringen får null, inte 490', () => {
    const r = byggArbetsrader(blandat, PRISER)
    expect(r.find(x => x.typ === 'manuellt')!.timpris).toBe(490)
    expect(r.find(x => x.typ === 'planering')!.timpris).toBeNull()
  })

  it('noten säger vilken sort som inte faktureras — utan tabellnamn', () => {
    const not = arbetsprisNot(byggArbetsrader(blandat, PRISER))
    expect(not).toContain('planering')
    expect(not).toContain('faktureras inte')
    // Tabellnamnet hör till granskningens noter, inte till traktvyn.
    expect(not).not.toContain('arbete_timpris')
  })

  it('utan någon sats alls faktureras ingenting, och det sägs', () => {
    const not = arbetsprisNot(byggArbetsrader(blandat, []))
    expect(not).toContain('faktureras inte')
  })

  it('när allt har samma sats står satsen i noten', () => {
    const not = arbetsprisNot(byggArbetsrader(
      [{ typ: 'manuellt', etikett: 'M', minuter: 60 }], PRISER))
    expect(not).toBe('Timmarna kommer ur arbetsrapporten och faktureras à 490 kr/tim.')
  })
})

describe('EN rad per TYP, aldrig per fritext', () => {
  it('två olika fritexter av samma typ blir en rad', () => {
    const r = byggArbetsrader([
      { typ: 'manuellt', etikett: 'Fällning vid vägen', minuter: 60 },
      { typ: 'manuellt', etikett: 'Fällning', minuter: 60 },
    ], PRISER)
    expect(r).toHaveLength(1)
    expect(r[0].timmar).toBe(2)
    // Typens eget namn vinner över fritexten — fakturan ska inte heta
    // "Fällning vid vägen" bara för att den posten råkade komma först.
    expect(r[0].etikett).toBe('Manuell fällning')
  })

  it('en okänd typ behåller sin egen text', () => {
    const r = byggArbetsrader(
      [{ typ: 'rojning', etikett: 'Röjning av stickväg', minuter: 90 }], PRISER)
    expect(r[0].etikett).toBe('Röjning av stickväg')
    expect(r[0].timpris).toBeNull()
  })

  it('ordningen är posternas — listan ligger still mellan hämtningar', () => {
    const r = byggArbetsrader([
      { typ: 'planering', etikett: 'Planering', minuter: 60 },
      { typ: 'manuellt', etikett: 'Manuell fällning', minuter: 60 },
    ], PRISER)
    expect(r.map(x => x.typ)).toEqual(['planering', 'manuellt'])
  })

  it('noll minuter ger ingen rad', () => {
    expect(byggArbetsrader([{ typ: 'manuellt', etikett: 'M', minuter: 0 }], PRISER)).toEqual([])
  })

  it('inga poster ger ingen not', () => {
    expect(arbetsprisNot([])).toBe('')
  })
})

describe('noten när flera satser gäller samtidigt', () => {
  // Martins fakturor visar också planering 490, brandbevakning 450 och
  // täckpapp 30 kr/m. Läggs två av dem in som satser får noten INTE påstå
  // att allt faktureras à en av dem — då står ett pris i texten som inte
  // gäller halva listan.
  const tva: Timprisrad[] = [
    { nyckel: 'manuellt', timpris: 490 },
    { nyckel: 'planering', timpris: 450 },
  ]

  it('en enda sats nämns i kronor', () => {
    const r = byggArbetsrader([{ typ: 'manuellt', etikett: 'Manuell fällning', minuter: 60 }], tva)
    expect(arbetsprisNot(r)).toBe('Timmarna kommer ur arbetsrapporten och faktureras à 490 kr/tim.')
  })

  it('två olika satser nämner ingen av dem', () => {
    const r = byggArbetsrader([
      { typ: 'manuellt', etikett: 'Manuell fällning', minuter: 60 },
      { typ: 'planering', etikett: 'Planering', minuter: 60 },
    ], tva)
    expect(r.map(x => x.timpris)).toEqual([490, 450])
    const not = arbetsprisNot(r)
    expect(not).toBe('Timmarna kommer ur arbetsrapporten och faktureras per timme.')
    expect(not).not.toContain('490')
    expect(not).not.toContain('450')
  })

  it('samma sats på två typer nämns i kronor', () => {
    const sammaPris: Timprisrad[] = [
      { nyckel: 'manuellt', timpris: 490 },
      { nyckel: 'planering', timpris: 490 },
    ]
    const r = byggArbetsrader([
      { typ: 'manuellt', etikett: 'Manuell fällning', minuter: 60 },
      { typ: 'planering', etikett: 'Planering', minuter: 60 },
    ], sammaPris)
    expect(arbetsprisNot(r)).toContain('à 490 kr/tim')
  })
})

describe('frågan mot databasen — FÄLLAN som tappade 2 034 av 2 687 minuter', () => {
  // extra_tid.objekt_id bär ett VO-nummer som inte alltid är traktens eget:
  // Bågskyttebanan (11271849) nås via 11166440, Skälviken (11271860) via
  // 11161397. Läses bara traktens eget nummer försvinner timmarna TYST.
  // Därför provas den faktiska frågan, inte bara att koden ser rätt ut.
  const fake = (alt: string[], rader: any[], fel: string | null = null) => {
    const sett: { tabell: string; eq: [string, unknown][]; in: [string, unknown[]][] } = {
      tabell: '', eq: [], in: [],
    }
    const from = (tabell: string) => {
      const svar: any = {
        select: () => svar,
        order: () => (tabell === 'extra_tid'
          ? { data: fel ? null : rader, error: fel ? { message: fel } : null }
          : { data: [], error: null }),
        limit: () => (tabell === 'objekt'
          ? { data: [{ id: 'obj-1' }], error: null }
          : { data: [], error: null }),
        eq: (kol: string, v: unknown) => { if (tabell === 'extra_tid') sett.eq.push([kol, v]); return svar },
        in: (kol: string, v: unknown[]) => { sett.in.push([kol, v]); return svar },
        then: undefined,
      }
      if (tabell === 'objekt_alt_nummer') {
        svar.eq = () => ({ data: alt.map(n => ({ nummer: n })), error: null })
      }
      if (tabell === 'extra_tid') sett.tabell = tabell
      return svar
    }
    return { sb: { from }, sett }
  }

  it('alla traktens nummer går med i frågan — eget plus extranumren', async () => {
    const { sb, sett } = fake(['11166440'], [])
    const svar = await lasDebiterbartArbete(sb as any, '11271849')
    expect(svar.status).toBe('ok')
    expect(sett.in).toHaveLength(1)
    expect(sett.in[0][0]).toBe('objekt_id')
    expect(sett.in[0][1]).toEqual(['11271849', '11166440'])
  })

  it('bara DEBITERBART arbete läses', async () => {
    const { sb, sett } = fake([], [])
    await lasDebiterbartArbete(sb as any, '11271849')
    expect(sett.eq).toContainEqual(['debiterbar', true])
  })

  it('ett läsfel är ett fel — aldrig noll timmar', async () => {
    const { sb } = fake([], [], 'timeout')
    const svar = await lasDebiterbartArbete(sb as any, '11271849')
    expect(svar.status).toBe('fel')
    expect(svar).toMatchObject({ fel: 'timeout' })
  })

  it('aktivitet_typ följer med posten så priset kan slås upp', async () => {
    const { sb } = fake([], [
      { datum: '2026-10-01', minuter: 360, aktivitet_typ: 'manuellt',
        aktivitet_text: null, kommentar: null, medarbetare: { namn: 'Stefan Ek' } },
    ])
    const svar = await lasDebiterbartArbete(sb as any, '11271849')
    if (svar.status !== 'ok') throw new Error('läsningen felade')
    expect(svar.poster[0]).toMatchObject({ typ: 'manuellt', minuter: 360, forare: 'Stefan' })
    // SAMMA mappning som hamtaUnderlag använder — inte en egen kopia här,
    // för då kan de glida isär utan att något blir rött.
    expect(byggArbetsrader(tillArbetsposter(svar.poster), PRISER)[0].timpris).toBe(490)
  })
})

describe('mappningen ManuellPost → Arbetspost', () => {
  // Fälten heter olika: posten bär `aktivitet`, prissättningen vill `etikett`.
  // Glöms mappningen läser byggArbetsrader p.etikett = undefined, och raden
  // heter "Arbete" i stället för förarens egen text. Typfelet syns inte,
  // eftersom supabase-klienten är `any` hela vägen in.
  it('aktivitet blir etikett', () => {
    const ut = tillArbetsposter([
      { datum: '2026-10-01', forare: 'Stefan', aktivitet: 'Röjning av stickväg',
        minuter: 120, kommentar: null, typ: 'rojning' },
    ])
    expect(ut).toEqual([{ typ: 'rojning', etikett: 'Röjning av stickväg', minuter: 120 }])
  })

  it('en okänd typ behåller förarens text på fakturaraden', () => {
    const rader = byggArbetsrader(tillArbetsposter([
      { datum: '2026-10-01', forare: 'Stefan', aktivitet: 'Röjning av stickväg',
        minuter: 120, kommentar: null, typ: 'rojning' },
    ]), PRISER)
    expect(rader[0].etikett).toBe('Röjning av stickväg')
    expect(rader[0].etikett).not.toBe('Arbete')
    expect(rader[0].timpris).toBeNull()
  })
})
