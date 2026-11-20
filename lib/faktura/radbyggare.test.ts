import { describe, it, expect } from 'vitest'
import { byggRader, garAttSkicka, type VoUnderlag } from './radbyggare'
import { type AcordPris } from '../ekonomi/acord'

const ACORD: AcordPris[] = [
  { medelstam: 0.20, pris_total: 130, pris_skordare: 81, pris_skotare: 49, giltig_fran: null, giltig_till: null },
  { medelstam: 0.45, pris_total: 104, pris_skordare: 60, pris_skotare: 44, giltig_fran: null, giltig_till: null },
  { medelstam: 0.60, pris_total: 100, pris_skordare: 56, pris_skotare: 44, giltig_fran: null, giltig_till: null },
]

/** Brokamåla, VO 11226833 — exakt de värden prod har 2026-09-26. */
const BROK_VOL = 2186.79
const brokamala = (): VoUnderlag => ({
  vo_nummer: '11226833',
  objektnamn: 'Brokamåla 15 V-H avd 20 -25',
  kontraktsnummer: '972114',
  bolag: 'Vida', fortnox_kundnr: 1,
  timpeng: false, avrakningsdatum: '2026-07-31',
  volymM3fub: BROK_VOL,
  medelstam: BROK_VOL / 3153,          // 0,6935
  sortimentgrupper: 6,
  terrangKr: 2,                        // dim_objekt.terrang_kr_manuell
  skotAvstandKr: 12 * BROK_VOL,        // 450 m → 3 steg à 4 kr
  andelSkordareManuell: null,
  acordList: ACORD,
  sortKr: 0, traktKr: -1, kvalitetKr: 1.5,
  maskiner: [
    { maskin_id: 'PONS20SDJAA270231', namn: 'Gigant', roll: 'skordare', kostnadsstalle: 'SCO', g15h: 50.99, timpris: 1920 },
    { maskin_id: 'A030353', namn: 'Wisent', roll: 'skotare', kostnadsstalle: 'M14', g15h: 111.56, timpris: 1015 },
  ],
  flyttar: [],
  manuellaPoster: [],
})

describe('Brokamåla reproducerar faktura 2026140', () => {

  it('58,00 / 56,50 — på kronan, med fördelningen satt som Martin satte den', () => {
    // Facit: fortnox_invoice_rows, dokument 2026140, rad 3 och 4.
    // Martin la 2,00 av tilläggets 2,50 på skördaren; förslaget säger 1,00.
    const rader = byggRader({ ...brokamala(), andelSkordareManuell: 2 })
    const sk = rader.find(r => r.artikelnr === '1')!
    const sko = rader.find(r => r.artikelnr === '2')!
    expect(sk.a_pris_beraknat).toBe(58)
    expect(sko.a_pris_beraknat).toBe(56.5)
  })

  it('TOTALEN är densamma med och utan överskrivning — bara fördelningen flyttas', () => {
    const utan = byggRader(brokamala())
    const med = byggRader({ ...brokamala(), andelSkordareManuell: 2 })
    const summa = (r: ReturnType<typeof byggRader>) =>
      Math.round(((r.find(x => x.artikelnr === '1')!.a_pris_beraknat! +
                   r.find(x => x.artikelnr === '2')!.a_pris_beraknat!)) * 100)
    expect(summa(utan)).toBe(summa(med))
    expect(summa(utan)).toBe(11450)   // 100 + 2,50 tillägg + 12 avstånd
  })

  it('AVSTÅNDET LIGGER I SKOTARENS À-PRIS — annars blir fakturan 26 241 kr för låg', () => {
    // prisPerM3.krPerM3 utesluter avståndet för /ekonomis skull. På raden
    // MÅSTE det med, eftersom raden är antal × à-pris.
    const utanAvstand = byggRader({ ...brokamala(), skotAvstandKr: 0 })
    const med = byggRader(brokamala())
    const sko = (r: ReturnType<typeof byggRader>) => r.find(x => x.artikelnr === '2')!
    expect(sko(med).a_pris_beraknat! - sko(utanAvstand).a_pris_beraknat!).toBe(12)
    expect(sko(med).harledning!.some(d => d.etikett === 'Avstånd')).toBe(true)
    // Och skördaren rörs INTE av avståndet.
    const sk = (r: ReturnType<typeof byggRader>) => r.find(x => x.artikelnr === '1')!
    expect(sk(med).a_pris_beraknat).toBe(sk(utanAvstand).a_pris_beraknat)
  })

  it('båda ackordraderna har SAMMA antal = skördad volym', () => {
    // 33 ackordfakturor i prod, noll med olika antal. Skotarens lassvolym
    // (1 168 m³ på Brokamåla) används aldrig — den läcker.
    const rader = byggRader(brokamala())
    expect(rader.find(r => r.artikelnr === '1')!.antal).toBe(2186.79)
    expect(rader.find(r => r.artikelnr === '2')!.antal).toBe(2186.79)
  })

  it('härledningen bär HELA tillägget och ligger på båda raderna', () => {
    const rader = byggRader(brokamala())
    for (const art of ['1', '2']) {
      const d = rader.find(r => r.artikelnr === art)!.harledning!
      expect(d.find(x => x.etikett === 'Krönt')?.belopp).toBe(1.5)
      expect(d.find(x => x.etikett === 'Storlek')?.belopp).toBe(-1)
      expect(d.find(x => x.etikett === 'Terräng')?.belopp).toBe(2)
    }
  })

  it('överskrivningen SYNS i härledningen med förslaget den ersatte', () => {
    const rader = byggRader({ ...brokamala(), andelSkordareManuell: 2 })
    const not = rader.find(r => r.artikelnr === '1')!.harledning!
      .find(d => d.etikett.startsWith('Fördelning ändrad'))
    expect(not?.etikett).toContain('1,00')
  })
})

describe('timpeng frågar aldrig Fortnox om priset', () => {

  const jats = (): VoUnderlag => ({
    ...brokamala(),
    vo_nummer: '11217392', objektnamn: 'Jätsbygd au 2026',
    kontraktsnummer: '973431', timpeng: true, avrakningsdatum: '2026-08-21',
    maskiner: [
      { maskin_id: 'PONS20SDJAA270231', namn: 'Gigant', roll: 'skordare', kostnadsstalle: 'SCO', g15h: 49.46, timpris: 1920 },
      { maskin_id: 'A030353', namn: 'Wisent', roll: 'skotare', kostnadsstalle: 'M14', g15h: 61.58, timpris: 1015 },
      { maskin_id: 'A130743', namn: 'King', roll: 'skotare', kostnadsstalle: 'EP', g15h: 45.71, timpris: 1285 },
    ],
  })

  it('en rad per MASKIN, artikel 11/12, prisägare app', () => {
    // Artikel 11/12 har TOMT pris i Fortnox med flit — priset ägs av
    // maskin_timpris och maskinen identifieras av kostnadsstället. Ett
    // Fortnox-anrop hade svarat 'pris_saknas': sant men meningslöst.
    const rader = byggRader(jats()).filter(r => r.artikelnr === '11' || r.artikelnr === '12')
    expect(rader).toHaveLength(3)
    expect(rader.map(r => r.prisagare)).toEqual(['app', 'app', 'app'])
    expect(rader.map(r => r.kostnadsstalle)).toEqual(['SCO', 'M14', 'EP'])
    expect(rader.map(r => r.a_pris_beraknat)).toEqual([1920, 1015, 1285])
    expect(rader.map(r => r.antal)).toEqual([49.46, 61.58, 45.71])
  })

  it('maskin utan datumgiltigt timpris blir FEL, inte noll kronor', () => {
    const u = jats()
    u.maskiner[1].timpris = null
    const rad = byggRader(u).find(r => r.kostnadsstalle === 'M14')!
    expect(rad.status).toBe('fel')
    expect(rad.fel_kod).toBe('pris_saknas')
    expect(rad.a_pris_beraknat).toBeNull()
    expect(garAttSkicka(u, byggRader(u)).ok).toBe(false)
  })

  it('timpengsobjektet bygger INGA ackordrader', () => {
    const arter = byggRader(jats()).map(r => r.artikelnr)
    expect(arter).not.toContain('1')
    expect(arter).not.toContain('2')
  })
})

describe('flytten: egen trailer, två radtyper efter sträcka', () => {

  const flytt = (km: number, traillertimmar: number | null) => byggRader({
    ...brokamala(),
    flyttar: [{ id: 'f1', datum: '2026-09-25', maskin: 'A030353', km, traillertimmar }],
  }).find(r => r.kalla === 'flytt' || r.kalla === 'traillerflytt')!

  it('under 3 mil: artikel 5, ETT fast belopp per maskin', () => {
    // Två maskiner ger två rader à 1 500 = 3 000, alltså avtalets fasta
    // belopp. Därför antal 1 och inte "en halv flytt".
    const r = flytt(18, null)
    expect(r.artikelnr).toBe('5')
    expect(r.prisagare).toBe('fortnox')
    expect(r.antal).toBe(1)
    expect(r.enhet).toBe('st')
    expect(r.status).toBe('klar')     // timmarna spelar ingen roll här
  })

  it('över 3 mil: artikel 3 med de INSKRIVNA timmarna', () => {
    const r = flytt(44, 3.5)
    expect(r.artikelnr).toBe('3')
    expect(r.prisagare).toBe('fortnox')
    expect(r.antal).toBe(3.5)
    expect(r.enhet).toBe('h')
    expect(r.a_pris).toBeNull()       // hämtas live, lagras aldrig
    expect(r.status).toBe('klar')
  })

  it('timmarna kommer ALDRIG ur maskinens egen flyttid', () => {
    // tid_flytt_min mäter maskinens förflyttning (33–98 min). Fakturan avser
    // lastbilens rundresa från LBC, och ingen historisk rad är under två
    // timmar. Byggaren tar bara emot det inskrivna talet — finns det inte
    // går raden inte att prissätta.
    const r = flytt(44, null)
    expect(r.status).toBe('fel')
    expect(r.fel_kod).toBe('pris_saknas')
    expect(r.antal).toBeNull()
    expect(r.harledning![0].etikett).toContain('inte ifyllda')
  })

  it('en lång flytt utan timmar blockerar underlaget', () => {
    const u = {
      ...brokamala(),
      flyttar: [{ id: 'f1', datum: '2026-09-25', maskin: 'A030353', km: 44, traillertimmar: null }],
    }
    expect(garAttSkicka(u, byggRader(u)).ok).toBe(false)
  })

  it('flyttraden lämnar kostnadsstället tomt — TRA är ingen maskin', () => {
    expect(flytt(44, 3.5).kostnadsstalle).toBeNull()
    expect(flytt(18, null).kostnadsstalle).toBeNull()
  })

  it('gränsen går vid 30 km', () => {
    expect(flytt(30, null).artikelnr).toBe('5')
    expect(flytt(31, 2).artikelnr).toBe('3')
  })
})

describe('spärrar som ska synas i stället för att gissa', () => {

  /** Alla radtyper på en gång: ackord, lång flytt, manuell post. */
  const alltPa = (): VoUnderlag => ({
    ...brokamala(),
    flyttar: [{ id: 'f1', datum: '2026-09-25', maskin: 'A030353', km: 44, traillertimmar: 3.5 }],
    manuellaPoster: [
      { etikett: 'Fällning', antal: 1.5, enhet: 'h' as const, a_pris: 490, kalla: 'manuell_fallning' as const },
      { etikett: 'Skotning Grot', antal: 1, enhet: 'st' as const, a_pris: null, kalla: 'manuell' as const },
    ],
  })

  it('bolag utan kundnummer går inte att fakturera', () => {
    const u = { ...brokamala(), bolag: 'Privat', fortnox_kundnr: null }
    const k = garAttSkicka(u, byggRader(u))
    expect(k.ok).toBe(false)
    expect(k.hinder[0]).toContain('Privat')
  })

  it('objekt som inte är slutavräknat blockeras', () => {
    const u = { ...brokamala(), avrakningsdatum: null }
    expect(garAttSkicka(u, byggRader(u)).hinder).toContain('Objektet är inte slutavräknat')
  })

  it('saknat kontraktsnummer är ett fel på raden, inte en utelämnad rad', () => {
    const u = { ...brokamala(), kontraktsnummer: null }
    const rad = byggRader(u).find(r => r.artikelnr === '8')!
    expect(rad.benamning).toBe('Kontraktsnr saknas')
    expect(rad.status).toBe('fel')
    expect(garAttSkicka(u, byggRader(u)).ok).toBe(false)
  })

  it('INGEN rad utom leverantörsrader bär ett belopp i a_pris', () => {
    // faktura_rad.rad_pris_agare: a_pris is null OR prisagare = 'leverantor'.
    // Kärnregeln är att bara EN radtyp får lagra belopp — ett uträknat
    // ackordspris som lagrats är acord_flyttkostnad (borttagen i #423)
    // återuppfunnen inuti radmodellen.
    const u = alltPa()
    for (const r of byggRader(u)) {
      if (r.a_pris != null) {
        expect(r.prisagare, `rad ${r.radnr} ${r.benamning}`).toBe('leverantor')
      }
    }
  })

  it('en leverantörsrad UTAN belopp väntar — den står aldrig som klar', () => {
    // Migration 20260926: likhetstecknet i rad_pris_agare gjorde det omöjligt
    // att spara en leverantörsrad som väntar på sitt belopp, trots att
    // statusen finns för exakt det. Fem av sex aktiva flyttar är över 30 km,
    // så det är normalfallet. Paret rad_leverantor_vantar hindrar att en
    // sådan rad tyst blir noll kronor på fakturan.
    for (const r of byggRader(alltPa())) {
      if (r.prisagare === 'leverantor' && r.a_pris == null) {
        expect(r.status, `rad ${r.radnr} ${r.benamning}`).toBe('vantar_leverantorsfaktura')
      }
    }
  })

  it('leverantörsraden finns kvar — för manuell fällning, inte för flytt', () => {
    // Migrationen 20260926 var inte bortkastad när flytten flyttade till
    // artikel 3: manuell fällning betalas med det pris underleverantören
    // tar, och det varierar med vem som lejs in.
    const fallning = byggRader(alltPa()).find(r => r.kalla === 'manuell_fallning')!
    expect(fallning.prisagare).toBe('leverantor')
    expect(fallning.a_pris).toBe(490)
    const grot = byggRader(alltPa()).find(r => r.benamning === 'Skotning Grot')!
    expect(grot.status).toBe('vantar_leverantorsfaktura')
  })
})
