import { describe, it, expect } from 'vitest'
import { byggListVy, kortDatum, manadsRubrik, type Hog, type OversiktsRad } from './listaVy'
import { byggFakturaLage, type FakturaLage } from './fakturaLage'

// FACIT: prod 2026-10-24, läst ur faktura_oversikt() efter migrationen
// 20261024_faktura_oversikt_allt_debiterbart.
//   137 trakter · 23 klara · 44 utan kontraktsnummer (27 utan traktrad)
//   · 4 utan traillertimmar · 31 utan kundnummer · 32 pågår · 2 ej påbörjade
//   debiterbart arbete: Skälviken 16,47 · Bågskyttebanan 15,87 · Arvidstorp 8,88
//                       · Älmehult 2,00 · Mölleryd 1,57  (+ 2,93 utan trakt)
//   manuella skotartimmar, timpeng: Krampamåla 75 · Äskebäck 30 · Krokshult 25
//                       · Bjällerhult 22 · Järnemåla 4 · Marie Krokshult 3 = 159

const bas: OversiktsRad = {
  vo_nummer: '0', namn: 'Trakt', bolag: 'Vida', fortnox_kundnr: 1,
  avtalsform: 'ackord', tillstand: 'klar', avrakningsdatum: '2026-10-01',
  objekt_antal: 1, volym_m3fub: 100, g15h: 10,
  hinder: null, hinder_typ: null, saknar_objektrad: false,
  har_maskindata: true, debiterbart_arbete_tim: 0,
  debiterbart_arbete_poster: 0, manuell_skotartid_tim: 0,
}
const rad = (o: Partial<OversiktsRad>): OversiktsRad => ({ ...bas, ...o })

/** sv-SE skriver tusental med hårt blanksteg (U+00A0/U+202F) — jämför på vanligt. */
const sp = (s: string) => s.replace(/[  ]/g, ' ')

/** Prod-formad mängd: rätt antal i varje hög, de namngivna trakterna som de är. */
function prodRader(): OversiktsRad[] {
  const r: OversiktsRad[] = []
  // 23 klara, fördelade på de månader prod har (6 okt, 11 sep, 3 aug, 2 jul, 1 feb)
  const klaraPerManad: [string, number][] = [
    ['2026-10-20', 6], ['2026-09-22', 11], ['2026-08-11', 3], ['2026-07-31', 2], ['2026-02-18', 1],
  ]
  let i = 0
  for (const [datum, antal] of klaraPerManad) {
    for (let k = 0; k < antal; k++) {
      r.push(rad({ vo_nummer: `k${i++}`, namn: `Klar ${i}`, avrakningsdatum: datum }))
    }
  }
  // 44 utan kontraktsnummer, varav 27 utan traktrad. Fyra av prods 44 är
  // timpengstrakterna med handinknappade skotartimmar (de läggs till nedan),
  // så här genereras 40.
  for (let k = 0; k < 40; k++) {
    r.push(rad({
      vo_nummer: `c${k}`, namn: `Kontrakt ${k}`, tillstand: 'atgard',
      hinder_typ: 'kontraktsnr', hinder: 'Kontraktsnummer saknas',
      saknar_objektrad: k < 27,
    }))
  }
  // 4 utan traillertimmar
  for (let k = 0; k < 4; k++) {
    r.push(rad({
      vo_nummer: `t${k}`, namn: `Trailler ${k}`, tillstand: 'atgard',
      hinder_typ: 'traillertimmar', hinder: 'Traillerflytt utan ifyllda timmar',
    }))
  }
  // 31 utan kundnummer (Privat och Karl Hedin)
  for (let k = 0; k < 31; k++) {
    r.push(rad({
      vo_nummer: `u${k}`, namn: `Kund ${k}`, tillstand: 'ingen_gemensam_kund',
      bolag: k < 20 ? 'Privat' : 'Karl Hedin', fortnox_kundnr: null,
      hinder_typ: 'kund', hinder: 'Bolaget Privat faktureras inte på vo-nummer',
    }))
  }
  // Trakter med debiterbart arbete
  r.push(rad({ vo_nummer: '11271860', namn: 'Skälviken RP J-Hus -25', tillstand: 'ej_paborjad', avrakningsdatum: null, debiterbart_arbete_tim: 16.47, debiterbart_arbete_poster: 4 }))
  r.push(rad({ vo_nummer: '11271849', namn: 'Bågskyttebanan RP J-Hus- 25', tillstand: 'klar', avrakningsdatum: '2026-10-19', volym_m3fub: 1687, g15h: 76.6, debiterbart_arbete_tim: 15.87, debiterbart_arbete_poster: 3 }))
  r.push(rad({ vo_nummer: '11277905', namn: 'Arvidstorp RP J-Hus -25', tillstand: 'ej_paborjad', avrakningsdatum: null, har_maskindata: false, volym_m3fub: 0, g15h: 0, debiterbart_arbete_tim: 8.88, debiterbart_arbete_poster: 3 }))
  r.push(rad({ vo_nummer: '11256873', namn: 'Älmehult gallring 2026', tillstand: 'klar', avtalsform: 'timpeng', avrakningsdatum: '2026-10-07', volym_m3fub: 88, g15h: 16.1, debiterbart_arbete_tim: 2, debiterbart_arbete_poster: 1 }))
  r.push(rad({ vo_nummer: '11271883', namn: 'Mölleryd RP J-Hus -25', tillstand: 'pagar', avrakningsdatum: null, debiterbart_arbete_tim: 1.57, debiterbart_arbete_poster: 1 }))
  // Timpengstrakter med handinknappade skotartimmar
  const skot: [string, string, number, OversiktsRad['tillstand']][] = [
    ['11200001', 'Krampamåla AU 2025', 75, 'atgard'],
    ['11200002', 'Äskebäck AU 2026', 30, 'atgard'],
    ['11200003', 'Krokshult AU 2026', 25, 'klar'],
    ['11200004', 'Bjällerhult au + ga', 22, 'klar'],
    ['11200005', 'Järnemåla Rapp Au', 4, 'atgard'],
    ['11200006', 'Marie Krokshult vindf', 3, 'atgard'],
  ]
  for (const [vo, namn, tim, tillstand] of skot) {
    r.push(rad({
      vo_nummer: vo, namn, avtalsform: 'timpeng', tillstand, manuell_skotartid_tim: tim,
      avrakningsdatum: tillstand === 'klar' ? '2026-08-26' : null,
      hinder_typ: tillstand === 'atgard' ? 'kontraktsnr' : null,
      hinder: tillstand === 'atgard' ? 'Kontraktsnummer saknas' : null,
    }))
  }
  // 32 pågår och 2 ej påbörjade utan debiterbart arbete
  for (let k = 0; k < 32; k++) r.push(rad({ vo_nummer: `p${k}`, namn: `Pågår ${k}`, tillstand: 'pagar', avrakningsdatum: null }))
  for (let k = 0; k < 2; k++) r.push(rad({ vo_nummer: `e${k}`, namn: `Ej ${k}`, tillstand: 'ej_paborjad', avrakningsdatum: null }))
  return r
}

// FACIT faktureringsläget, prod 2026-10-25 (fortnox_invoice_rows mot
// objekt.kontraktsnummer): av de 23 klara trakterna var 20 fakturerade, varav 5
// slutredovisade; 2 återstod att fakturera (Vällust, Östra-Hoka) och 1 saknade
// kontraktsnummer (Anders Ingemarsson, feb 2026). Dessutom var 4 pågående och
// 4 "saknar traillertimmar" redan fakturerade, 2 av dem slutredovisade.
//
// Här byggs läget ur RIKTIGA fakturarader genom byggFakturaLage, inte ur en
// handskriven karta — då provas kopplingen "Kontraktsnr 968539" → trakt också.
function prodFaktura(rader: OversiktsRad[]): FakturaLage {
  const klara = rader.filter(r => r.tillstand === 'klar').map(r => r.vo_nummer)
  const utanFaktura = klara.slice(0, 2)            // Vällust, Östra-Hoka
  const utanKnr = klara.slice(2, 3)                // Anders Ingemarsson
  const fakturerade = klara.slice(3)               // 24 i fixturen (20 i prod)
  const slutred = new Set(fakturerade.slice(0, 5))
  // Fyra pågående (två slutredovisade) och de fyra med traillertimmar.
  const pagarFakt = ['p0', 'p1', 'p2', 'p3']
  const pagarSlutred = new Set(['p1', 'p3'])
  const timmarFakt = ['t0', 't1', 't2', 't3']

  const objekt: { vo_nummer: string; kontraktsnummer: string | null }[] = []
  const fakturaRader: {
    document_number: number | null; invoice_date: string | null
    article_number: string | null; description: string | null
  }[] = []
  let knr = 970000
  let dok = 2026100

  const lagg = (vo: string, slutredovisas: boolean) => {
    const k = String(++knr)
    objekt.push({ vo_nummer: vo, kontraktsnummer: k })
    const d = ++dok
    fakturaRader.push({ document_number: d, invoice_date: '2026-09-21', article_number: '8', description: `Kontraktsnr ${k}` })
    fakturaRader.push({ document_number: d, invoice_date: '2026-09-21', article_number: '1', description: 'Skördning Gigant' })
    if (slutredovisas) {
      // Slutredovisningen ligger på en SENARE faktura, som i prod.
      const d2 = ++dok
      fakturaRader.push({ document_number: d2, invoice_date: '2026-10-19', article_number: '8', description: `Kontraktsnr ${k}` })
      fakturaRader.push({ document_number: d2, invoice_date: '2026-10-19', article_number: '7', description: 'Slutredovisning' })
    }
  }

  for (const vo of utanFaktura) objekt.push({ vo_nummer: vo, kontraktsnummer: String(++knr) })
  for (const vo of utanKnr) objekt.push({ vo_nummer: vo, kontraktsnummer: null })
  for (const vo of fakturerade) lagg(vo, slutred.has(vo))
  for (const vo of pagarFakt) lagg(vo, pagarSlutred.has(vo))
  for (const vo of timmarFakt) lagg(vo, false)
  // Alla andra trakter finns som objektrader utan kontraktsnummer.
  const kanda = new Set(objekt.map(o => o.vo_nummer))
  for (const r of rader) if (!kanda.has(r.vo_nummer)) objekt.push({ vo_nummer: r.vo_nummer, kontraktsnummer: null })

  return byggFakturaLage(objekt, fakturaRader)
}

const hog = (vy: { hogar: Hog[] }, nyckel: Hog['nyckel']): Hog | undefined =>
  vy.hogar.find(h => h.nyckel === nyckel)
const antal = (h: Hog | undefined) => (h?.grupper ?? []).reduce((s, g) => s + g.rader.length, 0)

describe('byggListVy — svaret', () => {
  it('ett tal: det som ÅTERSTÅR att fakturera, inte allt maskinerna är klara med', () => {
    const rader = prodRader()
    const vy = byggListVy(rader, { poster: 2, timmar: 2.93 }, prodFaktura(rader))
    // 27 klara i fixturen, men bara 2 är ofakturerade. Talet 27 var felet:
    // 20 av prods 23 "klara" var redan fakturerade.
    expect(vy.svar.tal).toBe('2')
    expect(vy.svar.text).toBe('trakter att fakturera')
    // atgard: 40 kontraktsnr + 4 traillertimmar + 4 skot = 48, som i prod.
    // De 31 utan kundnummer räknas inte hit — de har sin egen rad.
    expect(vy.svar.under).toBe('48 trakter kräver något av dig')
  })

  it('talet är summan av raderna i "Att fakturera" — inget räknas som inte visas', () => {
    const rader = prodRader()
    const vy = byggListVy(rader, null, prodFaktura(rader))
    expect(String(antal(hog(vy, 'att_fakturera')))).toBe(vy.svar.tal)
  })

  it('en enda klar trakt skrivs i singular', () => {
    const r = [rad({ vo_nummer: '1' })]
    const vy = byggListVy(r, null, byggFakturaLage([{ vo_nummer: '1', kontraktsnummer: '970001' }], []))
    expect(vy.svar.tal).toBe('1')
    expect(vy.svar.text).toBe('trakt att fakturera')
    expect(vy.svar.under).toBeNull()
  })

  it('utan läsbara fakturor står det gamla talet kvar — och högen säger varför', () => {
    const rader = prodRader()
    const vy = byggListVy(rader, null, null)
    expect(vy.svar.tal).toBe('27')
    expect(vy.svar.text).toBe('trakter klara att fakturera')
    expect(vy.hogar.map(h => h.nyckel)).toEqual(['klara'])
    expect(vy.hogar[0].under).toContain('kunde inte läsas')
  })
})

describe('byggListVy — vad ska du göra', () => {
  const prod = prodRader()
  const vy = byggListVy(prod, { poster: 2, timmar: 2.93 }, prodFaktura(prod))
  const rader = Object.fromEntries(vy.attGora.map(r => [r.nyckel, r]))

  it('kontraktsnummer: antalet och hur många som inte är upplagda', () => {
    expect(rader.kontraktsnr.titel).toBe('44 saknar kontraktsnummer')
    expect(rader.kontraktsnr.under).toBe('27 av dem är inte upplagda som trakt än')
  })

  it('traillertimmar och kundnummer säger vad som ska göras, inte vad som gick fel', () => {
    expect(rader.traillertimmar.titel).toBe('4 saknar traillertimmar')
    expect(rader.kund.titel).toBe('31 saknar kundnummer i Fortnox')
    expect(rader.kund.under).toContain('Karl Hedin och Privat')
  })

  it('traillertimmar säger när trakterna redan är fakturerade — tiden ändrar ingen faktura då', () => {
    // Prod 2026-10-25: alla fyra var redan fakturerade.
    expect(rader.traillertimmar.under).toBe('Tiden för en flytt över 3 mil — alla är redan fakturerade')
    // Utan läsbara fakturor påstås ingenting om det.
    const utan = byggListVy(prod, null, null)
    const t = utan.attGora.find(r => r.nyckel === 'traillertimmar')!
    expect(t.under).toBe('Tiden för en flytt över 3 mil')
  })

  it('de handinknappade skotartimmarna syns med sitt tal och sin orsak', () => {
    expect(rader.skotartimmar.titel).toBe('159 skotartimmar är inte med i priset')
    expect(rader.skotartimmar.under).toContain('6 timpengstrakter')
    expect(rader.skotartimmar.under).toContain('810E kan inte skicka filer')
  })

  it('arbete utan trakt räknas i poster och timmar', () => {
    expect(rader.arbete_utan_trakt.titel).toBe('2 poster manuellt arbete saknar trakt')
    expect(rader.arbete_utan_trakt.under).toContain('2,93 tim')
  })

  it('en hög som är tom ger ingen rad alls', () => {
    const vy2 = byggListVy([rad({ vo_nummer: '1' })], null, null)
    expect(vy2.attGora).toEqual([])
  })
})

describe('byggListVy — utan läsbara fakturor: en hög per avräkningsmånad', () => {
  const vy = byggListVy(prodRader(), null, null)
  const klara = hog(vy, 'klara')!

  it('grupperas per avräkningsmånad, nyast först', () => {
    expect(klara.grupper.map(g => g.rubrik)).toEqual([
      'Oktober 2026', 'September 2026', 'Augusti 2026', 'Juli 2026', 'Februari 2026',
    ])
  })

  it('summan av gruppernas rader är antalet klara — en trakt räknas en gång', () => {
    expect(String(antal(klara))).toBe(vy.svar.tal)
  })

  it('raden bär båda talen: det som faktureras till höger, det andra under', () => {
    const okt = klara.grupper.find(g => g.rubrik === 'Oktober 2026')!
    const bag = okt.rader.find(r => r.titel.startsWith('Bågskyttebanan'))!
    expect(sp(bag.hoger)).toBe('1 687')
    expect(bag.hogerUnder).toBe('m³fub')
    expect(sp(bag.under)).toBe('Vida · ackord · 76,6 tim')

    const alm = okt.rader.find(r => r.titel.startsWith('Älmehult'))!
    expect(alm.hoger).toBe('16,1')
    expect(alm.hogerUnder).toBe('tim')
    expect(alm.under).toBe('Vida · timpeng · 88 m³fub')
  })
})

describe('byggListVy — faktureringens högar', () => {
  const prod = prodRader()
  const faktura = prodFaktura(prod)
  const vy = byggListVy(prod, null, faktura)

  it('fyra högar i faktureringens ordning, och en trakt ligger i exakt en', () => {
    expect(vy.hogar.map(h => h.nyckel)).toEqual([
      'att_fakturera', 'okant_lage', 'fakturerat', 'slutredovisat',
    ])
    const vo = vy.hogar.flatMap(h => h.grupper.flatMap(g => g.rader.map(r => r.vo)))
    expect(new Set(vo).size).toBe(vo.length)
  })

  it('facit: 2 att fakturera, 1 går inte att se, 5+2 slutredovisade', () => {
    expect(antal(hog(vy, 'att_fakturera'))).toBe(2)
    expect(antal(hog(vy, 'okant_lage'))).toBe(1)
    expect(antal(hog(vy, 'slutredovisat'))).toBe(7)   // 5 klara + 2 pågående
    // De fakturerade: 19 klara (24 minus de 5 slutredovisade) + 2 pågående + 4
    // med traillertimmar = 25.
    expect(antal(hog(vy, 'fakturerat'))).toBe(25)
  })

  it('en trakt utan kontraktsnummer gissas aldrig som ofakturerad — raden säger varför', () => {
    const h = hog(vy, 'okant_lage')!
    const r = h.grupper[0].rader[0]
    expect(r.under).toBe('Inget kontraktsnummer — går inte att se om den är fakturerad')
    expect(h.under).toContain('Utan kontraktsnummer')
    // Pricken står på högen, en gång — inte på varje rad.
    expect(h.varning).toBe(true)
    expect(h.grupper.flatMap(g => g.rader).some(x => x.varning)).toBe(false)
    expect(hog(vy, 'fakturerat')!.varning).toBe(false)
  })

  it('fakturerat säger numret och datumet, grupperat på FAKTURAmånaden', () => {
    const h = hog(vy, 'fakturerat')!
    expect(h.grupper.map(g => g.rubrik)).toEqual(['September 2026'])
    expect(h.grupper[0].rader[0].under).toMatch(/^Faktura 20261\d\d · 21 sep$/)
  })

  it('slutredovisat säger slutredovisningens datum och faktura, inte den första fakturans', () => {
    const h = hog(vy, 'slutredovisat')!
    expect(h.grupper.map(g => g.rubrik)).toEqual(['Oktober 2026'])
    expect(h.grupper[0].rader[0].under).toMatch(/^Slutredovisat 19 okt · faktura 20261\d\d$/)
  })

  it('en fakturerad trakt räknas inte en andra gång under "Vad väntar?"', () => {
    // 33 pågår i fixturen: Mölleryd ligger i arbetshögen och p0–p3 i sina
    // fakturahögar. Utan fakturaläget hade de fyra stått kvar här.
    expect(vy.vantar!.under).toBe('28 pågår · 2 inte påbörjade')
    expect(byggListVy(prod, null, null).vantar!.under).toBe('32 pågår · 2 inte påbörjade')
  })

  it('en fakturerad trakt med debiterbart arbete står i BÅDA — det är två olika saker', () => {
    // Fakturan är skickad, och arbetet går ändå inte att fakturera än. Vi vet
    // inte om arbetet låg med på fakturan, så ingetdera döljs.
    const r = [rad({ vo_nummer: 'x', namn: 'Mölleryd', tillstand: 'pagar', avrakningsdatum: null, debiterbart_arbete_tim: 1.57 })]
    const vy2 = byggListVy(r, null, byggFakturaLage(
      [{ vo_nummer: 'x', kontraktsnummer: '970001' }],
      [{ document_number: 2026175, invoice_date: '2026-10-13', article_number: '8', description: 'Kontraktsnr 970001' }],
    ))
    expect(vy2.hogar.map(h => h.nyckel)).toEqual(['fakturerat'])
    expect(vy2.arbeteVantar.map(x => x.vo)).toEqual(['x'])
    // Men den räknas inte som "väntar" — den högen är de som inte syns någon annanstans.
    expect(vy2.vantar).toBeNull()
  })

  it('en hög som är tom finns inte', () => {
    const en = [rad({ vo_nummer: '1' })]
    const vy2 = byggListVy(en, null, byggFakturaLage([{ vo_nummer: '1', kontraktsnummer: '970001' }], []))
    expect(vy2.hogar.map(h => h.nyckel)).toEqual(['att_fakturera'])
  })
})

describe('byggListVy — debiterbart arbete som inte kan faktureras än', () => {
  const vy = byggListVy(prodRader(), null, null)

  it('tar bara trakter som INTE är klara, störst först', () => {
    expect(vy.arbeteVantar.map(r => r.titel)).toEqual([
      'Skälviken RP J-Hus -25', 'Arvidstorp RP J-Hus -25', 'Mölleryd RP J-Hus -25',
    ])
    expect(vy.arbeteVantar.map(r => r.hoger)).toEqual(['16,47', '8,88', '1,57'])
  })

  it('säger VARFÖR trakten inte går att fakturera, och skiljer ingen maskindata från inte påbörjad', () => {
    const [skalviken, arvidstorp, molleryd] = vy.arbeteVantar
    expect(skalviken.under).toBe('Ingen maskin har rapporterat — trakten räknas som inte påbörjad')
    expect(arvidstorp.under).toBe('Trakten har ingen maskindata alls')
    expect(molleryd.under).toBe('Trakten pågår')
  })

  it('en klar trakt med debiterbart arbete ligger bland de klara, inte här', () => {
    expect(vy.arbeteVantar.map(r => r.titel)).not.toContain('Bågskyttebanan RP J-Hus- 25')
    expect(vy.arbeteVantar.map(r => r.titel)).not.toContain('Älmehult gallring 2026')
  })
})

describe('byggListVy — vad väntar', () => {
  it('räknar inte trakterna med debiterbart arbete en andra gång', () => {
    const vy = byggListVy(prodRader(), null, null)
    // 32 pågår + 2 ej påbörjade, utan Skälviken, Arvidstorp och Mölleryd
    expect(vy.vantar!.titel).toBe('34 trakter väntar')
    expect(vy.vantar!.under).toBe('32 pågår · 2 inte påbörjade')
  })

  it('inget som väntar ger ingen hög', () => {
    expect(byggListVy([rad({ vo_nummer: '1' })], null, null).vantar).toBeNull()
  })
})

describe('manadsRubrik', () => {
  it('skriver svensk månad med stor bokstav', () => {
    expect(manadsRubrik('2026-10-19')).toBe('Oktober 2026')
    expect(manadsRubrik('2026-02-18')).toBe('Februari 2026')
  })
  it('utan datum blir en egen hög, aldrig en påhittad månad', () => {
    expect(manadsRubrik(null)).toBe('Utan avräkningsdatum')
    expect(manadsRubrik('trasigt')).toBe('Utan avräkningsdatum')
  })
})
