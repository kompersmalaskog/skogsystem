# TU — teknisk utnyttjandegrad

**TU mäter maskinen, inte föraren och inte hur lönetiden används.** Det är
branschens standardmått (Skogforsk) för hur stor del av den utnyttjade tiden
som är grundtid, och det går att jämföra utåt.

```
TU = G15 / U-tid          U-tid = G15 + avbrott
```

## Vad som ingår, ur `fakt_tid` (`lib/g15.ts`, `tuProcent`)

| Del | Fält | I TU |
|---|---|---|
| Grundtid G15 | `processing_sek + terrain_sek + other_work_sek` | täljare och nämnare |
| Korta avbrott < 15 min | `fakt_avbrott.langd_sek < G15_GRANS_SEK` | **till G15** (täljaren) — G15 räknar per definition in avbrott under 15 min |
| Maskinens mikropauser | `kort_stopp_sek` | ligger **redan inuti** G15 — rörs inte, aldrig additiv |
| Avbrott | `maintenance_sek + disturbance_sek + avbrott_sek` (underhåll, störning, reparation/övrigt, alla längder) | nämnaren |
| Rast | `rast_sek` | **inte med** — utanför både G15 och avbrott |
| Tomgång | `tomgang_sek` | inte med — finns inte i StanForD, härledd vid import |
| Motortid | `engine_time_sek` | inte med — mäter bara P+T |

`/maskinvy2` hade tidigare "Utnyttjandegrad" med rasten i nämnaren. Det drog
ner skördarna 4–6 enheter (Scorpion 82,1 → 86,4; Rottne 85,9 → 92,3) och var
inte jämförbart med branschen. Rättat 2026-09-30.

## Branschsnitt (referens, inte omdöme)

Skogforsk: **skördare 85 %, skotare 90 %**. Skördaren är mer tekniskt komplex.
Står i `TU_BRANSCHSNITT` i `lib/g15.ts` och visas som dämpad referens; ett tal
under snittet står i orange. Två enheter TU ≈ 8 % högre vinst vid 3 000
maskintimmar per år (Martin, 2026-09-30).

## Läge september 2026 (sedan 1 augusti)

| Maskin | TU | Snitt |
|---|---|---|
| Rottne R64428, skördare | 92,3 | 85 |
| Scorpion, skördare | 86,4 | 85 |
| Wisent A030353, skotare | 92,7 | 90 |
| Elefanten A130743, skotare | 89,0 | 90 |

Elefanten ligger strax under snittet; störningen 17,1 h är den största
enskilda störningsposten av alla fyra.

## Tillförlitlighet — kopplingen till Lön → Dagar

TU räknas ur `fakt_tid` (maskinen), Dagar ur `arbetsdag` (föraren). De två
källorna blandas aldrig. Under varje maskin står i stället hur många av dess
förardagar som har en avvikelse enligt samma regler som Dagar
(`lib/lonesystem/forarText` `dagAvvikelser` + okvitterad tidsavvikelse). Ser man
att dagarna inte stämmer vet man att talet är osäkert.

## Öppna frågor

- `fakt_avbrott` och `fakt_tid` ger olika avbrottssummor för skördarna
  (Scorpion 64,9 mot 57,1 h, Rottne 36,9 mot 28,1 h sedan augusti). TU använder
  `fakt_tid` som nämnare (tillverkarvaliderad) och `fakt_avbrott` bara för
  15-minutersplitten. Skillnaden flyttar Scorpions TU med upp till 1,7 enheter
  och bör utredas för sig.
- Skogforsks TU följs år för år. Vi har data sedan augusti 2026; en årsserie
  finns tidigast hösten 2027.

## Inte TU: lönekvoten

Martins ursprungliga fråga — hur stor del av betald tid som blir maskintid —
är **lönekvoten** (debiteringsgrad, EpiForest: maskintid per lönetimme).
Grovt sedan augusti 2026: 1 710 betalda timmar, 1 338 G15-timmar, 78 %. Det
måttet kräver `arbetsdag` (lön) mot `fakt_tid` (maskin) dag för dag och bor i
admin, inte i maskinvyn. Utreds efter TU.
