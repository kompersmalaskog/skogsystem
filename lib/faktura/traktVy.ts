// Maskinkortet på en trakt — vilka rader som står under vilken maskin, och vad
// de HETER. All text och alla tal här; kortet ritar bara.
//
// VARFÖR RADERNA HETER SOM DE GÖR (Martin 2026-10-24: "men det måste stå vad
// det är du gav skördaren mera vadå?"):
// En tidigare version hade raden "Andel av traktens tillägg +2,00", och sedan
// "Du gav skördaren mer +1,00" — ett delta utan namn. Raden dolde precis det
// den skulle förklara. Nu säger varje rad var posten hör och varför:
//
//   Grundpris, klass 0,60                 56,00
//   Krönt, hela till skördaren            +1,50   <- Martins regel, utskriven
//   Traktstorlek, hälften av −1,00        −0,50
//   Tillägg du flyttade från skotaren     +1,00   <- överskrivningen, namngiven
//   = Pris per m³fub                      58,00
//
// och på skotaren samma krona åt andra hållet ("Tillägg du flyttade till
// skördaren −1,00"). Varje kolumn går att räkna ihop med miniräknare och landar
// på fakturan — skillen: "Summan är summan av det som visas".
//
// Appen vet bara ATT en krona flyttades, inte från vilken POST: överskrivningen
// är ett enda tal på objektet (dim_objekt.acord_andel_skordare_manuell). Därför
// heter raden "tillägg du flyttade" och aldrig "krönt du flyttade" — att peka på
// en post vore påhittat.
import { delaHalften, type Tillaggspost } from '@/lib/ekonomi/prisPerM3';

export type Prisrad = { etikett: string; belopp: number; tecken: boolean }

export type Maskinkort = {
  /** Etiketten över kortet: "Skördning · kostnadsställe SCO". */
  etikett: string
  namn: string
  rader: Prisrad[]
  prisEtikett: string
  pris: number | null
  antal: number | null
  antalEnhet: string
  summa: number | null
}

export type MaskinRad = {
  artikelnr: string | null
  benamning: string
  antal: number | null
  kostnadsstalle: string | null
  a_pris_beraknat: number | null
  delar_grundpris: number | null
  delar_andel: number | null
  delar_avstand: number | null
  tillaggsposter: Tillaggspost[] | null
  harledning: { etikett: string; belopp: number }[] | null
  /** Maskinens namn, när radbyggaren skickar det. Annars läses det ur benämningen. */
  visningsnamn?: string | null
}

const ore = (n: number) => Math.round(n * 100)

/** "Skördning" på artikel 1 och 11, annars "Skotning". */
export function rollFor(artikelnr: string | null): 'skordare' | 'skotare' {
  return artikelnr === '1' || artikelnr === '11' ? 'skordare' : 'skotare'
}

export function arTimpeng(artikelnr: string | null): boolean {
  return artikelnr === '11' || artikelnr === '12'
}

/**
 * Maskinnamnet. Radbyggarens benämning är "Skördning ackord Gigant", alltså
 * verb + avtalsform + namn — men `faktura_rad.benamning` är en REDIGERBAR
 * textkolumn, så att klippa bort två ord går sönder så fort Martin skriver om
 * raden. Finns `visningsnamn` används det; annars är resten av benämningen en
 * nödlösning och inget att lita på.
 */
export function maskinNamn(r: MaskinRad): string {
  if (r.visningsnamn) return r.visningsnamn
  const delar = r.benamning.trim().split(/\s+/)
  return delar.length > 2 ? delar.slice(2).join(' ') : r.benamning
}

function grundEtikett(r: MaskinRad): string {
  if (arTimpeng(r.artikelnr)) return 'Timpris'
  // Härledningens grundrad heter "Grund (medelstam 0,69 → 0,6) 100" — klassen
  // är det som betyder något på maskinkortet.
  const grund = r.harledning?.find(h => h.etikett.startsWith('Grund'))?.etikett
  const klass = grund?.match(/→\s*([\d,.]+)/)?.[1]
  return klass ? `Grundpris, klass ${klass.replace('.', ',')}` : 'Grundpris'
}

const tkr = (n: number) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const heltal = (n: number) => Math.round(n).toLocaleString('sv-SE')

/**
 * @param avstandM Skotningsavståndet i meter, när det är känt. Skrivs på
 *   avståndsraden — se kommentaren vid raden.
 */
export function byggMaskinkort(r: MaskinRad, avstandM?: number | null): Maskinkort {
  const roll = rollFor(r.artikelnr)
  const timpeng = arTimpeng(r.artikelnr)
  const verb = roll === 'skordare' ? 'Skördning' : 'Skotning'
  const rader: Prisrad[] = []

  if (r.delar_grundpris != null) {
    rader.push({ etikett: grundEtikett(r), belopp: r.delar_grundpris, tecken: false })
  }

  if (!timpeng) {
    const poster = (r.tillaggsposter ?? []).filter(p => p.belopp !== 0)
    let egen = 0

    // EGNA poster först, DELADE sedan: "det här är mitt" före "det här delar
    // vi". Prislistans egen ordning (krönt, storlek, terräng, sortiment) la
    // skotarens delade traktstorlek före dess egen terräng, och då blev kortet
    // svårare att läsa än det behövde vara.
    const vart = roll === 'skordare' ? 'skördaren' : 'skotaren'
    for (const post of poster.filter(p => p.mottagare === roll)) {
      egen += post.belopp
      rader.push({ etikett: `${post.etikett}, hela till ${vart}`, belopp: post.belopp, tecken: true })
    }
    for (const post of poster.filter(p => p.mottagare === 'delas')) {
      const del = delaHalften(post.belopp)[roll]
      if (del === 0) continue
      egen += del
      rader.push({
        etikett: `${post.etikett}, hälften av ${tkr(post.belopp)}`,
        belopp: del, tecken: true,
      })
    }

    // Överskriven fördelning: skillnaden mot regeln är en EGEN rad som säger
    // vart kronan gick. Utan den summerar kolumnen inte till à-priset.
    if (r.delar_andel != null && ore(r.delar_andel) !== ore(egen)) {
      const flyttat = Math.round((r.delar_andel - egen) * 100) / 100
      // Den andra maskinen, åt båda hållen: plus = hit, minus = dit.
      const andra = roll === 'skordare' ? 'skotaren' : 'skördaren'
      rader.push({
        etikett: flyttat > 0 ? `Tillägg du flyttade från ${andra}` : `Tillägg du flyttade till ${andra}`,
        belopp: flyttat,
        tecken: true,
      })
    }

    // METRARNA STÅR PÅ RADEN (Martin 2026-11-20: "jag ser ju inte
    // skotningsavståndet"). Raden sa bara vad avståndet KOSTAR. Metrarna stod
    // ingenstans på sidan, och på en trakt där de satts för hand försvann även
    // frågan ur "saker att kolla" — talet som flyttar mest pengar på en
    // skotarrad (Skälviken +12,00 av 57,50) var det enda man inte kunde se.
    if (r.delar_avstand) {
      rader.push({
        etikett: avstandM != null ? `Skotningsavstånd, ${heltal(avstandM)} m` : 'Skotningsavstånd',
        belopp: r.delar_avstand,
        tecken: true,
      })
    }
  }

  const pris = r.a_pris_beraknat
  return {
    // Kostnadsstället (SCO, EP) är en Fortnox-uppgift, inte något den som läser
    // sidan behöver — och ett "kostnadsställe SCO" i rubriken är fyra ord som
    // inte betyder något för den som ska godkänna en faktura. Det står kvar
    // bara när det SAKNAS, alltså när det är något att göra åt.
    etikett: r.kostnadsstalle ? verb : `${verb} · kostnadsställe saknas`,
    namn: maskinNamn(r),
    rader,
    prisEtikett: timpeng ? 'Pris per timme' : 'Pris per m³fub',
    pris,
    antal: r.antal,
    antalEnhet: timpeng ? 'tim' : 'm³fub',
    summa: pris != null && r.antal != null ? pris * r.antal : null,
  }
}

// POTTMENINGEN ÄR BORTTAGEN (Martin 2026-11-20: "kan man göra sidan lättare så
// ett barn förstår direkt", "inte för mycket text, det blir rörigt då").
//
// Den stod under maskinkorten och lät så här:
//   "Traktens tillägg är 2,50 kr/m³fub: krönt +1,50, traktstorlek −1,00,
//    sortiment +2,00. Appen föreslog 1,00 till skördaren och 1,50 till
//    skotaren — du flyttade 1,00."
//
// Varje tal i den stod redan som en namngiven rad i korten ovanför, i en annan
// ordning och i sidans minsta grad — och den flyttade kronan har sedan
// 2026-10-24 en EGEN rad ("Tillägg du flyttade från skotaren +1,00"), vilket
// var hela poängen med den omgången. Meningen var alltså sidans längsta text
// och sa ingenting som inte redan stod. Fördelningen i detalj hör hemma bakom
// "Hur räknades priset?", inte på sidan.
