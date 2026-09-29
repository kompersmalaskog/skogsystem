import { describe, it, expect } from 'vitest'
import {
  VIDAFAKTUROR, ACORD_PRISER, medelstamUr, tillaggUr, arAvstand,
} from './__fixtures__/vidafakturor'
import { lookupAcordPris } from './acord'
import { fordelaTillagg, delaHalften, prisPerM3, type Tillaggspost } from './prisPerM3'

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
  restTotal: number; restSkordare: number; provbar: boolean;
}

/**
 * Vem posten hör till, av etiketten på fakturan. Krönt är skördarens,
 * terräng och sortiment skotarens, traktstorleken delas. En okänd post
 * (Avlägg, "Liten skotare band", "Gallring och dåliga avlägg") går inte att
 * placera — då prövas inte delningen på den fakturan, den GISSAS inte.
 */
function mottagareUr(etikett: string): Tillaggspost['mottagare'] | null {
  const e = etikett.toLowerCase()
  if (/kr[öo]nt/.test(e)) return 'skordare'
  if (/storlek/.test(e)) return 'delas'
  if (/terr[äa]ng|bl[öo]tt/.test(e)) return 'skotare'
  if (/sort/.test(e)) return 'skotare'
  return null
}

function posterUr(till: { etikett: string; kr: number }[]): Tillaggspost[] {
  return till
    .filter(t => !arAvstand(t.etikett))
    .map(t => ({ etikett: t.etikett, belopp: t.kr, mottagare: mottagareUr(t.etikett) }))
    .filter((t): t is Tillaggspost => t.mottagare !== null)
}

/** Räknar ut modellen för en faktura ur dess egen härledning. */
function kor(f: typeof VIDAFAKTUROR[number]): Utfall {
  const ms = medelstamUr(f.harledning)
  if (ms == null) throw new Error(`${f.dn} saknar medelstam i härledningen`)
  const rad = lookupAcordPris(ms, ACORD_PRISER as any)!
  const till = tillaggUr(f.harledning)
  const avstand = till.filter(t => arAvstand(t.etikett)).reduce((s, t) => s + t.kr, 0)
  const ovrigt = till.filter(t => !arAvstand(t.etikett)).reduce((s, t) => s + t.kr, 0)
  const forslag = fordelaTillagg(posterUr(till))
  const ore = (n: number) => Math.round(n * 100)
  return {
    dn: f.dn, ms, klass: rad.medelstam, total: rad.pris_total, ovrigt, avstand,
    restTotal: (ore(f.skordare + f.skotare) - ore(rad.pris_total + ovrigt + avstand)) / 100,
    restSkordare: (ore(f.skordare) - ore(rad.pris_skordare + forslag.skordare)) / 100,
    provbar: till.filter(t => !arAvstand(t.etikett)).every(t => mottagareUr(t.etikett) !== null),
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

describe('varje tillägg hör till en maskin — det finns ingen pott', () => {

  it('krönt till skördaren, terräng och sortiment till skotaren, storleken delas', () => {
    const poster: Tillaggspost[] = [
      { etikett: 'Krönt', belopp: 1.5, mottagare: 'skordare' },
      { etikett: 'Storlek', belopp: 2, mottagare: 'delas' },
      { etikett: 'Terräng', belopp: 2, mottagare: 'skotare' },
      { etikett: 'Sortiment', belopp: 4, mottagare: 'skotare' },
    ]
    const d = fordelaTillagg(poster)
    expect(d.skordare).toBe(2.5)     // 1,50 + halva storleken
    expect(d.skotare).toBe(7)        // 2 + 4 + halva storleken
    expect(d.ovrigt).toBe(9.5)
  })

  it('summan är ALLTID hela tillägget, vad posterna än är', () => {
    for (let ore = -400; ore <= 2000; ore += 25) {
      const d = fordelaTillagg([
        { etikett: 'a', belopp: ore / 100, mottagare: 'delas' },
        { etikett: 'b', belopp: 1.5, mottagare: 'skordare' },
        { etikett: 'c', belopp: 2, mottagare: 'skotare' },
      ])
      expect(Math.round((d.skordare + d.skotare) * 100)).toBe(Math.round(d.ovrigt * 100))
    }
  })

  it('en NEGATIV traktstorlek delas också — stora trakter drar ner båda', () => {
    // Spannen över 1 500 m³fub ger −1 och −2. Delningen måste tåla det;
    // annars hamnar hela avdraget på en maskin.
    expect(delaHalften(-1)).toEqual({ skordare: -0.5, skotare: -0.5 })
    expect(delaHalften(-2)).toEqual({ skordare: -1, skotare: -1 })
  })

  it('delningen av storleken går nedåt till femtioöring, resten till skotaren', () => {
    expect(delaHalften(5)).toEqual({ skordare: 2.5, skotare: 2.5 })
    expect(delaHalften(4)).toEqual({ skordare: 2, skotare: 2 })
    expect(delaHalften(3)).toEqual({ skordare: 1.5, skotare: 1.5 })
    expect(delaHalften(2.5)).toEqual({ skordare: 1, skotare: 1.5 })
    expect(delaHalften(0)).toEqual({ skordare: 0, skotare: 0 })
  })
})

describe('regeln träffar bättre än hälftendelningen — men inte hela vägen', () => {

  it('15 av 26 prövbara fakturor stämmer på BÅDA raderna', () => {
    // Hälftendelningen träffade 11 av 31. Att det blev bättre är inte skäl
    // att kalla regeln färdig: tretton fakturor avviker fortfarande, och
    // fördelningen ändras per trakt med acord_andel_skordare_manuell.
    const provbara = VIDAFAKTUROR.map(kor).filter(u => u.provbar && u.restTotal === 0)
    const bada = provbara.filter(u => u.restSkordare === 0)
    expect(provbara).toHaveLength(26)
    expect(bada).toHaveLength(15)
  })

  it('avvikelsen följer TERRÄNGEN — och det är därför den inte byggs in', () => {
    // Skördaren får mer än regeln säger när terrängen är stor:
    //   terräng 8 kr → +6,00 till skördaren
    //   terräng 7 kr → +5,00
    //   terräng 3 kr → +2,00
    // Vid 0–2 kr stämmer regeln oftast. Blöt mark drabbar båda när den är
    // riktigt svår, och då har Martin flyttat en del till skördaren.
    //
    // ETT MÖNSTER I TJUGOÅTTA RADER ÄR ETT STICKPROV. Vi har grävt oss ur
    // tre sådana: acord_flyttkostnad, skotningsavståndets två generationer
    // och taxornas giltig_fran. Testet LÅSER FAST mönstret så att det syns
    // om det ändras — det gör det inte till en formel.
    const medStorTerrang = VIDAFAKTUROR.map(f => {
      const u = kor(f)
      const terrang = tillaggUr(f.harledning)
        .filter(t => /terr[äa]ng|bl[öo]tt/i.test(t.etikett))
        .reduce((s, t) => s + t.kr, 0)
      return { dn: f.dn, terrang, restSkordare: u.restSkordare, provbar: u.provbar }
    }).filter(x => x.provbar && x.terrang >= 7)

    expect(medStorTerrang.map(x => `${x.dn}: terräng ${x.terrang} → +${x.restSkordare}`))
      .toEqual(['2026015: terräng 8 → +6', '2026151: terräng 7 → +5'])
  })
})

describe('prislistans rad ska gå att visa', () => {

  it('prisPerM3 lämnar tillbaka klassen och båda rollpriserna', () => {
    // "medelstam 0,57 → klass 0,55: 101 kr/m³fub — skördare 57 · skotare 44".
    // Utan den ser 57,00 och 44,00 ut som tal appen hittat på i stället för
    // en rad i avtalet.
    const p = prisPerM3({
      roll: 'skordare', medelstam: 0.57, acordList: ACORD_PRISER as any,
      sortKr: 0, traktKr: 0, kvalitetKr: 0, terrangKr: 0,
    })
    expect(p.prislista).toEqual({ medelstam: 0.57, klass: 0.55, total: 101, skordare: 57, skotare: 44 })
    // Klassen är NÄRMASTE UNDER, inte närmaste — 0,57 ger 0,55, inte 0,60.
    expect(p.klass).toBe(0.55)
  })

  it('skördare + skotare = total på VARENDA rad i prislistan', () => {
    for (const r of ACORD_PRISER) {
      expect(r.pris_skordare + r.pris_skotare, `klass ${r.medelstam}`).toBe(r.pris_total)
    }
  })

  it('tom prislista ger null — inget påhittat avtal', () => {
    const p = prisPerM3({
      roll: 'skordare', medelstam: 0.5, acordList: [],
      sortKr: 0, traktKr: 0, kvalitetKr: 0, terrangKr: 0,
    })
    expect(p.prislista).toBeNull()
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
