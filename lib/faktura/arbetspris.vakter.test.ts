// Källvakter för prissättningen av vårt eget manuella arbete.
//
// De här invarianterna går inte att prova med ett enhetsprov — de handlar om
// HUR koden är kopplad, och ett fel upptäcks annars först på en faktura.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const las = (f: string) => readFileSync(f, 'utf8')

const HAMTA = las('lib/faktura/hamtaUnderlag.ts')
const ARBETSPRIS = las('lib/faktura/arbetspris.ts')
const LASMANUELLT = las('lib/faktura/lasManuellt.ts')

describe('tabellen finns inte förrän migrationen körts', () => {
  it('arbete_timpris står UTANFÖR kastet som fäller hela underlaget', () => {
    // Listan som kastar: alla register som MÅSTE finnas.
    const kast = HAMTA.match(/for \(const r of \[maskinRes[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(kast).toBeTruthy()
    expect(kast).toContain('bolagRes')
    expect(kast).not.toContain('arbPrisRes')
  })

  it('ett läsfel på satserna blir en VARNING, inte tysthet', () => {
    expect(HAMTA).toContain('if (arbPrisRes.error)')
    const block = HAMTA.match(/if \(arbPrisRes\.error\) \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(block).toContain("niva: 'varning'")
    expect(block).toContain('faktureras inte')
  })
})

describe('satsen bor i databasen, aldrig i koden', () => {
  it('ingen källfil hårdkodar 490', () => {
    // 490 står i migrationen (datarad) och i testernas facit — aldrig i logik.
    for (const [namn, kod] of [['arbetspris.ts', ARBETSPRIS], ['hamtaUnderlag.ts', HAMTA]] as const) {
      expect(kod.replace(/\/\/[^\n]*/g, ''), namn).not.toMatch(/\b490\b/)
    }
  })

  it('priset slås upp i en karta ur satserna, inte ur en gissning', () => {
    expect(ARBETSPRIS).toContain('prisKarta.get(r.typ ?? \'\') ?? null')
    // Ingen reserv: en typ utan sats får null, aldrig en annan typs pris.
    expect(ARBETSPRIS).not.toMatch(/\?\?\s*priser\[0\]/)
  })

  it('satserna filtreras på uppslagsdagen, som alla andra prislistor', () => {
    expect(HAMTA).toMatch(/byggArbetsrader\([\s\S]{0,80}?giltiga\(arbPrisRes\.data\)/)
  })

  it('posterna går genom tillArbetsposter — aldrig rakt in', () => {
    // ManuellPost bär `aktivitet`, Arbetspost vill `etikett`. Skickas posterna
    // rakt in läser byggArbetsrader p.etikett = undefined och raden heter
    // "Arbete". Klienten är `any`, så tsc fångar det inte heller.
    expect(HAMTA).toMatch(/byggArbetsrader\(tillArbetsposter\(arbSvar\.poster\)/)
    expect(HAMTA).not.toMatch(/byggArbetsrader\(arbSvar\.poster/)
  })
})

describe('ett läsfel på timmarna får inte se ut som noll timmar', () => {
  it('underlaget använder lasDebiterbartArbete, som skiljer tomt från trasigt', () => {
    expect(HAMTA).toContain('lasDebiterbartArbete')
    // lasManuelltArbete returnerar null för BÅDA och duger bara för sektionen.
    expect(HAMTA).not.toContain('lasManuelltArbete')
  })

  it('lasDebiterbartArbete säger fel när läsningen felar', () => {
    expect(LASMANUELLT).toMatch(/if \(error\) return \{ status: 'fel'/)
  })

  it('status fel ger INGA rader — aldrig en halv lista', () => {
    expect(HAMTA).toMatch(/arbSvar\.status === 'ok'\s*\n?\s*\? byggArbetsrader/)
  })
})

describe('granskningens noter säger vad som inte faktureras', () => {
  // KÄLLVAKT, inte ett riktigt prov: hamtaUnderlag läser tolv tabeller
  // parallellt och har ingen egen test. Noterna är det enda stället en
  // människa ser att timmar faller bort, så att de FINNS kontrolleras här
  // på källan. Vad de innehåller provas i arbetspris.test.ts (noten) och
  // i lasDebiterbartArbete (felet).
  it('en typ utan timsats blir en varning per rad', () => {
    expect(HAMTA).toContain("for (const r of arbetsrader.filter(r => r.timpris == null))")
    const block = HAMTA.match(/for \(const r of arbetsrader\.filter[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(block).toContain("niva: 'varning'")
    expect(block).toContain('utan timsats')
    expect(block).toContain('faktureras inte')
  })

  it('ett läsfel på timmarna blir en varning, inte tysthet', () => {
    expect(HAMTA).toMatch(/if \(arbSvar\.status === 'fel'\) \{/)
    const block = HAMTA.match(/if \(arbSvar\.status === 'fel'\) \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(block).toContain("niva: 'varning'")
    expect(block).toContain('inte med')
  })
})

describe('andras fällning prissätts inte av vår timsats', () => {
  it('bara extra_tid är källan — ingen rad byggs ur fakturatexter', () => {
    // "Fällning Jacob" (525), "Fälning Isac" (560) och "Fällning av träd
    // Kyrköns Skogstjänst" (475) finns inte i extra_tid och ska inte heller
    // hittas på här. Ett namn i koden vore början på en sådan gissning.
    for (const namn of ['Jacob', 'Isac', 'Kyrköns', 'Jocke']) {
      expect(ARBETSPRIS.replace(/\/\/[^\n]*/g, ''), namn).not.toContain(namn)
      expect(HAMTA.replace(/\/\/[^\n]*/g, ''), namn).not.toContain(namn)
    }
  })
})
