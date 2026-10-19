# Månadens ordinarie — övertid först när månaden är full

Martins beslut 2026-10-19. Regeln bor i `lib/lonesystem/manadsordinarie.ts` och anropas av `loneberakning.ts`; tester i `manadsordinarie.test.ts`,
`loneberakning.manadsordinarie.test.ts`, `loneunderlag.manadsordinarie.test.ts` och `septemberbytediff.test.ts`.

## Regeln

```
månadens ordinarie = vardagar i arbetsmånaden × 8
                   − röda vardagar                (alltid; helglön betalas för dem)
                   − dagar med frånvaro           (semester, ATK, komp, sjuk, VAB, föräldraledig, tjänstledig, permission, inarbetad)
                   − vardagar före anställningsdatum
                   − frånvarotimmarna på en deldag (halv dag sjuk/VAB)

arbetad tid = maskin + extra tid + kortpass + hemskickad tid
timlön      = min(arbetad tid, månadens ordinarie)
övertid     = max(0, arbetad tid − månadens ordinarie)
premie      = timlönetimmarna (som förr)
```

Exempel: augusti 2026 har 21 vardagar = 168 tim. Oscar Ringberg september 2026 (22 vardagar = 176 tim) arbetade 28,65 tim på tre dagar:
timlön 28,65, övertid 0 (förut 24 + 4,65). Januari 2026: 22 vardagar − nyårsdagen − trettondagen = 20 × 8 = 160.

## Det som inte ändras

- **Utjämningsperiod** (tabellen `utjamningsperiod`, t.ex. Gävle 20 apr–5 jul 2026): en månad som överlappar förarens period behåller dagens
  formel (ordinarie = arbetade dagar × 8). Lagkontrollen behåller genomsnittsmodellens fördelning för samma månader (se nedan).
- **Företagsledare** (Martin, Joacim) får inga lönerader; ordinarie räknas ändå för kontrollvyerna.
- **Helglön** betalas som förut (8 tim per röd vardag som ger helglön); den röda dagen dras av ur ordinarie oavsett om helglönen betalas.

## Kända begränsningar

- **Avslut:** `medarbetare` saknar slutdatum. En förare med `aktiv = false` får en varning; dagar efter avslut dras inte av.
- **Pågående månad (lönen):** ordinarie är hela månadens timmar, så en halv månad ger 0 övertid. Lagkontrollen räknar den pågående månaden annorlunda, som "ställning hittills" (nedan).
- **Arbetad röd dag** ger 8 tim helglön + arbetade timmar; dagen är redan avdragen ur ordinarie, så de arbetade timmarna blir övertid först när
  månaden annars är full.
- **Inte byggt:** varning för "dagar utan maskindata" (Martin: falsklarm för extra-förare).

## Lagkontrollen och Min tid (2026-10-19)

Lagkontrollen (Admin → Arbetstid, gräns 1–3, och Årsövertid-kortet) och Min tid räknar årets övertid med SAMMA regel som lönen:
`beraknaArsovertid(...)` bygger `manader[]` (en post per kalendermånad) med `manadensOrdinarie` och `modeller.manad` är summan av månaderna.

| Månad | Räknas som | Nivå |
|-------|-----------|------|
| avslutad, utanför utjämningsperiod | lönens övertid exakt (`max(0, arbetad − ordinarie)`) | fastställd, kan bli RÖD |
| pågående | ställning hittills: arbetad hittills − ordinarie för vardagarna hittills (idag först när dagen har registrerad tid) | uppskattad, högst GUL; negativ = 0 |
| överlappar en markerad utjämningsperiod | avtalets genomsnitt (§5 mom 2), fördelat på månader som förut | uppskattad, högst GUL |

Årets tal = summan av månadernas tal, varje månad avrundad till en decimal först. Facit (prod 2026-10-19): Stefan jan 30,58 · Oskar jan 6,5 ·
Oscar sep 0 (= lönen); Stefans avslutade månader 200,2 + pågående ställning 8,0 = 208,2.

**Idag och ställningen:** ordinarie hittills räknar bara dagar fram till igår, och idag först när dagen har registrerad tid. Det gör att ställningen
*sjunker* med en dags ordinarie (8 tim) så fort dagen får en registrerad minut — ett tänkt beteende, inte ett fel.
