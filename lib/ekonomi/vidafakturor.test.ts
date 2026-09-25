import { describe, it, expect } from 'vitest'
import {
  VIDAFAKTUROR, ACORD_PRISER, medelstamUr, tillaggUr, arAvstand,
} from './__fixtures__/vidafakturor'
import { lookupAcordPris } from './acord'
import { fordelaOvrigt, prisPerM3 } from './prisPerM3'

/**
 * ACCEPTANSTESTET: ackordsformeln mot 31 riktiga Vida-fakturor.
 *
 * Detta är inte ett enhetstest med påhittade tal — facit är vad som faktiskt
 * skickades till kund. Åbogen-reproduktionen som en gång "bevisade" formeln
 * byggde på ett handmatat terrängvärde som inte fanns i databasen; det här
 * kan inte göra samma sak, eftersom både indata och utdata är fakturans egna.
 */

type Utfall = {
  dn: number; ms: number; klass: number; total: number;
  ovrigt: number; avstand: number;
  restTotal: number; restSkordare: number;
}

/** Räknar ut modellen för en faktura ur dess egen härledning. */
function kor(f: typeof VIDAFAKTUROR[number]): Utfall {
  const ms = medelstamUr(f.harledning)
  if (ms == null) throw new Error(`${f.dn} saknar medelstam i härledningen`)
  const rad = lookupAcordPris(ms, ACORD_PRISER as any)!
  const till = tillaggUr(f.harledning)
  const avstand = till.filter(t => arAvstand(t.etikett)).reduce((s, t) => s + t.kr, 0)
  const ovrigt = till.filter(t => !arAvstand(t.etikett)).reduce((s, t) => s + t.kr, 0)
  const forslag = fordelaOvrigt(ovrigt)
  const ore = (n: number) => Math.round(n * 100)
  return {
    dn: f.dn, ms, klass: rad.medelstam, total: rad.pris_total, ovrigt, avstand,
    restTotal: (ore(f.skordare + f.skotare) - ore(rad.pris_total + ovrigt + avstand)) / 100,
    restSkordare: (ore(f.skordare) - ore(rad.pris_skordare + forslag.skordare)) / 100,
  }
}

describe('totalen: pris_total(klass) + Σ tillägg, EN gång', () => {

  // De två enda fakturorna vars total inte går ihop — båda förklarade, och
  // båda beror på att TEXTRADEN inte är komplett, inte på formeln.
  const FORKLARADE: Record<number, { rest: number; varfor: string }> = {
    // 100 m³ ligger i traktspannet 0–200 = +5 kr. Tillägget ligger i priset
    // men skrevs aldrig som nollrad. Appen läser spannet ur volymen och
    // hade fått med det.
    2026013: { rest: 5, varfor: 'Storlek +5kr (0–200 m³) saknas i texten' },
    // Textraden säger "Storlek +2kr", men objektet är 2 187 m³ och spannet
    // 1500–2500 ger −1. Terrängen (+2, satt i dim_objekt.terrang_kr_manuell)
    // skrevs inte alls. −1 + 2 = +1 mot textens +2 → fakturan är 1 kr lägre
    // än sin egen text. BELOPPET är rätt: appens data ger exakt 114,50.
    // Det svarar också på vilken volym traktstorleken slås upp på —
    // maskinens 2 187, inte de fakturerade 2 000.
    2026140: { rest: -1, varfor: 'texten säger Storlek +2kr, datan ger −1 och terräng +2' },
  }

  it('29 av 31 fakturor går ihop på kronan', () => {
    const traff: number[] = []
    const miss: string[] = []
    for (const f of VIDAFAKTUROR) {
      const u = kor(f)
      if (u.restTotal === 0) traff.push(u.dn)
      else miss.push(`${u.dn}: rest ${u.restTotal}`)
    }
    expect(miss).toEqual([
      '2026013: rest 5',
      '2026140: rest -1',
    ])
    expect(traff).toHaveLength(29)
  })

  it('de två avvikelserna är de förklarade, med exakt den rest de ska ha', () => {
    for (const f of VIDAFAKTUROR) {
      const u = kor(f)
      const f_ = FORKLARADE[u.dn]
      expect(u.restTotal, `${u.dn} ${f_?.varfor ?? ''}`).toBe(f_ ? f_.rest : 0)
    }
  })
})

describe('klassen under — inte den närmaste', () => {

  it('de sex fakturorna där reglerna skiljer sig väljer alla klassen UNDER', () => {
    const narmaste = (ms: number) =>
      [...ACORD_PRISER].sort((a, b) => Math.abs(a.medelstam - ms) - Math.abs(b.medelstam - ms))[0]

    const skiljer: string[] = []
    for (const f of VIDAFAKTUROR) {
      const ms = medelstamUr(f.harledning)!
      const under = lookupAcordPris(ms, ACORD_PRISER as any)!
      const nar = narmaste(ms)
      if (under.medelstam !== nar.medelstam) {
        skiljer.push(`${f.dn} ms=${ms} under=${under.medelstam} närmast=${nar.medelstam}`)
        // Och den som stämmer med fakturan är UNDER.
        const till = tillaggUr(f.harledning)
        const summa = till.reduce((s, t) => s + t.kr, 0)
        expect(Math.round((f.skordare + f.skotare - summa) * 100) / 100,
          `faktura ${f.dn}`).toBe(under.pris_total)
      }
    }
    expect(skiljer).toEqual([
      '2026016 ms=0.53 under=0.5 närmast=0.55',
      '2026017 ms=0.44 under=0.4 närmast=0.45',
      '2026052 ms=0.38 under=0.35 närmast=0.4',
      '2026053 ms=0.49 under=0.45 närmast=0.5',
      '2026066 ms=0.28 under=0.25 närmast=0.3',
      '2026151 ms=0.49 under=0.45 närmast=0.5',
    ])
  })

  it('klampar i BÅDA ändarna, och klampningen syns i etiketten', () => {
    // 0,86 över listans tak (bekräftat på faktura 2026011: 56/44 = taket).
    const hog = prisPerM3({
      roll: 'skordare', medelstam: 0.86, acordList: ACORD_PRISER as any,
      sortKr: 0, traktKr: 0, kvalitetKr: 0, terrangKr: 0,
    })
    expect(hog.klass).toBe(0.6)
    expect(hog.krPerM3).toBe(56)
    expect(hog.delar[0].etikett).toContain('→')

    // Under listans golv klampas till 0,20 — INTE null, som hade gett
    // grundpris 0 och en rad som ser ut som en riktig uträkning.
    const lag = prisPerM3({
      roll: 'skordare', medelstam: 0.05, acordList: ACORD_PRISER as any,
      sortKr: 0, traktKr: 0, kvalitetKr: 0, terrangKr: 0,
    })
    expect(lag.klass).toBe(0.2)
    expect(lag.krPerM3).toBe(81)
    expect(lag.delar[0].etikett).toContain('→')
  })
})

describe('fördelningen är ett FÖRSLAG — och förslaget är hälften nedåt till 50 öre', () => {

  it('delar hälften, avrundat ned till femtioöring, överskottet till skotaren', () => {
    expect(fordelaOvrigt(5.5)).toEqual({ skordare: 2.5, skotare: 3 })
    expect(fordelaOvrigt(3.5)).toEqual({ skordare: 1.5, skotare: 2 })
    expect(fordelaOvrigt(2.5)).toEqual({ skordare: 1, skotare: 1.5 })
    expect(fordelaOvrigt(4)).toEqual({ skordare: 2, skotare: 2 })
    expect(fordelaOvrigt(0)).toEqual({ skordare: 0, skotare: 0 })
    // Summan är ALLTID hela tillägget — aldrig mer, aldrig mindre.
    for (let ore = -400; ore <= 4000; ore += 25) {
      const d = fordelaOvrigt(ore / 100)
      expect(Math.round((d.skordare + d.skotare) * 100)).toBe(ore)
    }
  })

  it('11 av 31 fakturor följer förslaget rakt av — resten är Martins överskrivning', () => {
    // Att det är 11 och inte 31 är POÄNGEN: fördelningen är en bedömning per
    // objekt, precis som terrängposten. Förslaget ska stämma på normalfallet
    // och gå att skriva över på raden. Skulle siffran krypa mot 31 har någon
    // gjort förslaget till en formel som inte finns i avtalet.
    const enligtForslag = VIDAFAKTUROR
      .map(kor)
      .filter(u => u.restTotal === 0 && u.restSkordare === 0)
      .map(u => u.dn)
    expect(enligtForslag).toEqual([
      2026011, 2026014, 2026016, 2026036, 2026037,
      2026053, 2026076, 2026082, 2026141, 2026143, 2026146,
    ])
  })

  it('överskrivningarna är små — 16 av 17 ligger inom 2,50 kr', () => {
    const avvikelser = VIDAFAKTUROR.map(kor)
      .filter(u => u.restTotal === 0 && u.restSkordare !== 0)
      .map(u => Math.abs(u.restSkordare))
    expect(avvikelser.filter(a => a <= 2.5)).toHaveLength(16)
    // Den enda stora: 2026066 Krampamåla, −9,50. Objektet har "Liten skotare
    // band 10kr" i härledningen — ett tillägg som helt tillfaller skotaren,
    // precis som avståndet. Den dagen fler sådana dyker upp är det ett skäl
    // att märka enskilda tillägg med mottagare, inte att ändra förslaget.
    expect(Math.max(...avvikelser)).toBe(9.5)
  })
})

describe('den gamla formeln hade fallit — larmet larmar', () => {

  it('dubbelräkning + närmaste klass träffar 0 av 31 utanför nollfallen', () => {
    // Negativt test: utan det kan hela sviten vara grön av fel skäl.
    // Gamla beteendet: krPerM3 = rollens grundpris + HELA tillägget, och
    // klassen vald som den närmaste.
    let gamlaTraffar = 0
    for (const f of VIDAFAKTUROR) {
      const ms = medelstamUr(f.harledning)!
      const nar = [...ACORD_PRISER].sort(
        (a, b) => Math.abs(a.medelstam - ms) - Math.abs(b.medelstam - ms))[0]
      const till = tillaggUr(f.harledning)
      const avstand = till.filter(t => arAvstand(t.etikett)).reduce((s, t) => s + t.kr, 0)
      const ovrigt = till.filter(t => !arAvstand(t.etikett)).reduce((s, t) => s + t.kr, 0)
      const gammalSk = nar.pris_skordare + ovrigt
      const gammalSko = nar.pris_skotare + ovrigt + avstand
      if (gammalSk === f.skordare && gammalSko === f.skotare) gamlaTraffar++
    }
    // Enda fakturorna gamla formeln kunde träffa är de utan tillägg alls,
    // där dubbelt av noll är noll — och även där faller 2026013 på att
    // storlekstillägget saknas i texten.
    expect(gamlaTraffar).toBe(1)
  })
})
