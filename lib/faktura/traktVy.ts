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

export function byggMaskinkort(r: MaskinRad): Maskinkort {
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

    if (r.delar_avstand) {
      rader.push({ etikett: 'Skotningsavstånd', belopp: r.delar_avstand, tecken: true })
    }
  }

  const pris = r.a_pris_beraknat
  return {
    etikett: `${verb} · ${r.kostnadsstalle ? `kostnadsställe ${r.kostnadsstalle}` : 'kostnadsställe saknas'}`,
    namn: maskinNamn(r),
    rader,
    prisEtikett: timpeng ? 'Pris per timme' : 'Pris per m³fub',
    pris,
    antal: r.antal,
    antalEnhet: timpeng ? 'tim' : 'm³fub',
    summa: pris != null && r.antal != null ? pris * r.antal : null,
  }
}

/**
 * Meningen under maskinkorten: potten EN gång, i ord. Den ersätter kortet
 * "Delas mellan maskinerna", som visade samma tillägg en andra gång — samma
 * pengar på två ställen på samma skärm.
 */
export function pottMening(poster: Tillaggspost[] | null, forslag: { skordare: number; skotare: number } | null, andelSkordare: number | null): string | null {
  const med = (poster ?? []).filter(p => p.belopp !== 0)
  if (med.length === 0) return null
  const summa = med.reduce((s, p) => s + p.belopp, 0)
  const delar = med.map(p => `${p.etikett.toLowerCase()} ${p.belopp > 0 ? '+' : '−'}${tkr(Math.abs(p.belopp))}`).join(', ')
  let mening = `Traktens tillägg är ${tkr(summa)} kr/m³fub: ${delar}.`
  if (forslag) {
    mening += ` Appen föreslog ${tkr(forslag.skordare)} till skördaren och ${tkr(forslag.skotare)} till skotaren`
    if (andelSkordare != null && ore(andelSkordare) !== ore(forslag.skordare)) {
      const flyttat = Math.abs(Math.round((andelSkordare - forslag.skordare) * 100) / 100)
      mening += ` — du flyttade ${tkr(flyttat)}.`
    } else {
      mening += '.'
    }
  }
  return mening
}
