# TU — teknisk utnyttjandegrad

**TU mäter maskinen, inte föraren och inte hur lönetiden används.** Det är
branschens standardmått (Skogforsk) för hur stor del av den utnyttjade tiden
som är grundtid, och det går att jämföra utåt.

```
TU = G15 / U-tid          U-tid = G15 + avbrott
```

Var: `/maskinvy?ny=1` (hemskärmens kort "Maskinvy 2") — en rad i nyckeltalslistan
för skördare och skotare, och alla maskiner bredvid varandra överst i
Jämförelse-fliken (`components/maskinvy/TuTabell.tsx`). Samma synlighet som
G15-tid och Korta stopp (beslut 2026-09-30).

## Vad som ingår (`lib/g15.ts`, `tuProcent`)

| Del | Källa | I TU |
|---|---|---|
| Grundtid G15 | `fakt_tid`: `processing + terrain + other_work` | täljare och nämnare |
| Avbrott | **`fakt_avbrott`**, alla längder, **utan flytt** (Trailer transportation) | nämnaren |
| Avbrott < 15 min | delen av ovan med `langd_sek < G15_GRANS_SEK` | **till G15** (täljaren) — G15 räknar per definition in avbrott under 15 min |
| Maskinens mikropauser | `kort_stopp_sek` | ligger **redan inuti** G15 — rörs inte, aldrig additiv |
| Flytt | `fakt_avbrott` kategori Trailer transportation | **inte med** — Skogforsks avbrottstid är service, underhåll, reparation, störning |
| Rast | `rast_sek` | **inte med** — utanför både G15 och avbrott |
| Tomgång, motortid | `tomgang_sek`, `engine_time_sek` | inte med |

**Varför `fakt_avbrott` och inte `fakt_tid`:s DOWN-hinkar:** Avbrott-fliken i
samma vy läser `fakt_avbrott`; två tal i samma vy måste komma från samma källa.
Dessutom saknar `fakt_tid` segment på skördarna (verifierat i prod 2026-09-30,
sedan 1 aug: Scorpion 57,8 mot 65,7 h, Rottne 28,7 mot 37,5 h; skotarna exakta).
`fakt_avbrott` är backfyllt och MOM-komplett (juli 2026).

`/maskinvy2` hade "Utnyttjandegrad" med rasten i nämnaren — 4–6 enheter för
lågt för skördarna. Sidan tas bort.

## Branschsnitt (referens, inte omdöme)

Skogforsk: **skördare 85 %, skotare 90 %**. Skördaren är mer tekniskt komplex.
Står i `TU_BRANSCHSNITT` i `lib/g15.ts` och visas dämpat under etiketten; ett
tal under snittet står i orange. Två enheter TU ≈ 8 % högre vinst vid 3 000
maskintimmar per år (Martin, 2026-09-30).

## Läge september 2026 (sedan 1 augusti)

Räknat 2026-09-30 med exakt vyns formel (`fakt_avbrott` utan flytt):

| Maskin | G15 | Avbrott | Flytt (utanför) | TU | Snitt |
|---|---|---|---|---|---|
| Rottne R64428, skördare | 336 h | 35,7 h | 1,8 h | 90,5 | 85 |
| Scorpion, skördare | 366 h | 50,6 h | 15,1 h | 87,9 | 85 |
| Wisent A030353, skotare | 363 h | 27,3 h | 4,3 h | 93,8 | 90 |
| Elefanten A130743, skotare | 291 h | 34,5 h | 0,5 h | **89,4** | 90 |

Elefanten är den enda under sitt snitt. Med flytt inräknad hade Scorpion legat
på 84,8 — flyttfrågan flyttar Scorpion 3 enheter, därför står beslutet här.

## Tillförlitlighet — kopplingen till Lön → Dagar

TU räknas ur maskindata, Dagar ur `arbetsdag` (föraren). De två källorna
blandas aldrig. Under varje maskin i TU-tabellen står i stället hur många av
dess förardagar som har en avvikelse enligt samma regler som Dagar
(`lib/lonesystem/forarText` `dagAvvikelser` + okvitterad tidsavvikelse). Ser
man att dagarna inte stämmer vet man att talet är osäkert.

## Öppna frågor

- Skogforsks TU följs år för år. Vi har data sedan augusti 2026; en årsserie
  finns tidigast hösten 2027.
- Avbrott klassade som "Unproductive terrain work" på Wisent är i praktiken
  stillestånd vid skiftstart (förarens valda kategori). De räknas som avbrott.

## Inte TU: lönekvoten

Martins ursprungliga fråga — hur stor del av betald tid som blir maskintid —
är **lönekvoten** (debiteringsgrad, EpiForest: maskintid per lönetimme).
Grovt sedan augusti 2026: 1 710 betalda timmar, 1 338 G15-timmar, 78 %. Det
måttet kräver `arbetsdag` (lön) mot `fakt_tid` (maskin) dag för dag och bor i
admin, inte i maskinvyn. Utreds efter TU.
