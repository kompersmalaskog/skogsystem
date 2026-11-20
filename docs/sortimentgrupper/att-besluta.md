# Sortimentgrupper som saknas — beslutslista till Martin

Läget 2026-10-22, läst ur prod (bara SELECT). **Ingenting är ändrat**: varken `dim_sortiment_grupp`, ackordmotorn (`lib/ekonomi/*`), faktureringen (`lib/faktura/hamtaUnderlag.ts`) eller markägarrapporten. Den här filen är underlaget för ditt beslut.

## Varför det spelar roll

Antalet olika grupper på ett objekt styr sortimentstillägget. Det räknas ur `dim_sortiment_grupp` (`sortimentgrupperAuto`), och en grupp som saknas eller är tom räknas inte. Vyn `vy_sortiment_klass` kan gruppen för alla sortiment, bland annat Hemved. Där tabellen och vyn skiljer sig kan alltså antalet grupper, och därmed tillägget, bli olika beroende på vilken väg som räknar.

Vyn är inte facit. Den svarar på "vad är det här för virke" och Hemved är ett eget beslut (migration `20260907_sortimentgrupper_hemved_utan_sortiment.sql` rörde medvetet inte tabellen).

## 1. De 7 pågående objekten där antalet grupper skiljer (rätta före fakturering)

`sortiment_grupper_manuell` är **inte satt** på något av dem, så tabellens antal gäller.

| Objekt | m³ | Tabellen räknar | Vyn skulle räkna | Skillnaden kommer från |
|---|---:|---|---|---|
| Bågskyttebanan RP J-Hus- 25 | 1 688 | 4 (Energi, Kubb, Massa, Timmer) | 5 | **Hemved** 32,2 m³ (`…_546`) |
| Mölleryd RP J-Hus -25 | 989 | 4 | 5 | **Hemved** 16,8 m³ (`…_546`) |
| Sandåsen gallring 2025 | 296 | 3 (Energi, Kubb, Massa) | 4 | **Timmer** 0,3 m³ (`R64428_882`) |
| Skälviken RP J-Hus -25 | 213 | 4 | 5 | **Hemved** 4,7 m³ (`…_546`) |
| Flyttobjekt | 115 | 4 | 5 | **Hemved** (`…_546`) |
| Toftåsa gallring 2026 | 105 | 3 | 4 | **Timmer** 0,3 m³ (`R64428_882`) |
| Intaget gallring | 41 | 3 | 4 | **Hemved** 0,1 m³ (`R64428_843`) |

Två saker att titta på först:

* **Sandåsen och Toftåsa:** en enda grupp, Timmer, kommer från 0,3 m³ Vislanda-timmer (`R64428_882`). Det är en grupp till i tillägget på ett objekt som i övrigt är massa/kubb/energi. Är de 0,3 m³ riktigt timmer eller felsorterat?
* **Hemved** står på fem av sju. Räknas Hemved som en egen grupp i ackordet eller inte? Det är en enda fråga som avgör fem objekt.

## 2. Sortiment som saknar rad i `dim_sortiment_grupp` (föreslagen grupp = vad vyn säger)

Du bestämmer grupp per rad. Kolumnen "Förslag" är vyns grupp och bara ett förslag. Kolumnen "Pågående" visar hur många av de 7 (plus övriga pågående objekt) som använder sortimentet.

| sortiment_id | Namn | Förslag | Objekt | m³ | Pågående objekt (m³) |
|---|---|---|---:|---:|---|
| R64428_888 | Massa: BmavFall_V3 | Massa | 3 | 211,2 | 3 (211,2) |
| R64428_889 | Massa: BmavFall_V3 | Massa | 3 | 89,5 | 3 (89,5) |
| PONS20SDJAA270231_546 | Massa: HemvedFall_V3 | **Hemved** | 3 | 53,6 | 3 (53,6) |
| PONS20SDJAA270231_353 | Massa: Bokmav3mV3 | Massa | 2 | 101,7 | 2 (101,7) |
| R64428_890 | Kubb: Alvesta275_V3 | Kubb | 2 | 38,6 | 2 (38,6) |
| R64428_885 | Massa: BmavFall_V3 | Massa | 2 | 36,4 | 2 (36,4) |
| PONS20SDJAA270231_542 | kubb: BERGoBERG EK-KUBB_V3 | Kubb | 2 | 21,0 | 2 (21,0) |
| R64428_882 | Timmer: Vislanda_195_1-2_V3 | Timmer | 4 | 3,9 | 2 (0,6) |
| R64428_881 | Massa: BmavFall_V3 | Massa | 3 | 268,4 | 1 (26,4) |
| R64428_886 | Massa: BmavFall_V3 | Massa | 1 | 36,9 | 1 (36,9) |
| PONS20SDJAA270231_543 | Energi: Engved3mÖvLöv_V3 | Energi | 1 | 24,6 | 1 (24,6) |
| PONS20SDJAA270231_541 | kubb: BERGoBERG EK-KUBB_V3 | Kubb | 1 | 17,8 | 1 (17,8) |
| PONS20SDJAA270231_544 | kubb: BERGoBERG EK-KUBB_V3 | Kubb | 1 | 2,9 | 1 (2,9) |
| PONS20SDJAA270231_545 | kubb: BERGoBERG EK-KUBB_V3 | Kubb | 1 | 2,8 | 1 (2,8) |
| PONS20SDJAA270231_342 | kubb: BERGoBERG EK-KUBB_V3 | Kubb | 1 | 1,1 | 1 (1,1) |
| PONS20SDJAA270231_341 | kubb: BERGoBERG Ek A-KUBB_V3 | Kubb | 1 | 0,7 | 1 (0,7) |
| R64428_843 | Massa: HemvedFall_V3 | **Hemved** | 1 | 0,1 | 1 (0,1) |
| PONS20SDJAA270231_351 | Massa: Bokmavfall_V3 | Massa | 1 | 69,8 | 0 |
| PONS20SDJAA270231_530 | Massa: HemvedFall_V3 | **Hemved** | 2 | 6,3 | 0 |
| PONS20SDJAA270231_386 | Avkap Gran V3 | *(vyn saknar grupp)* | 9 | 4,8 | 0 |
| R64428_880 | Energi: EngvedFallÖvLöv_V3 | Energi | 1 | 1,6 | 0 |
| PONS20SDJAA270231_435 | Avkap Tall V3 | *(vyn saknar grupp)* | 6 | 1,5 | 0 |
| PONS20SDJAA270231_316 | Timmer: Stödlängd_V3 | Timmer | 1 | 0,2 | 0 |
| R64428_869 | Timmer: Vislanda Tall_V3 | Timmer | 1 | 0,2 | 0 |
| PONS20SDJAA270231_515 | Energi: Engved3mBjörk_V3 | Energi | 1 | 0,0 | 0 |

Beslut som behövs, i ordning efter hur många pågående objekt de rör:

1. **Hemved** (`…_546`, `…_530`, `R64428_843`): egen grupp, eller ingen grupp (och då ska vyn också sluta räkna den)?
2. **Avkap Gran/Tall V3** (`…_386`, `…_435`): vyn har ingen grupp heller. Avkap hamnar idag i Övrigt i maskinvyn. Ska de få en grupp i ackordet, eller stå utan?
3. Resten är rena namnträffar (Massa/Kubb/Energi/Timmer). Säg "följ vyn" för dem så blir det en rad var.

## 3. Sortiment med rad men tom grupp

`Unclassified` (Ponsse, `…_6`, `…_10`, `…_15`, `…_16`) och `Unspecified` (Rottne, `R64428_253/258/259/659`, `R64101_253/258/259/659/1048`) har en rad i tabellen med tom grupp. Vyn kallar dem "Utan sortiment". Volymerna är små (1–4 m³ per pågående objekt, 90 m³ som mest över alla 72 objekt). Det rimliga är att de **förblir utan grupp** och inte räknas som en grupp. Bekräfta det, så rör jag dem inte.

Några sortiment i tabellen har också en tom grupp fast namnet är tydligt (grupp = tom men vyn säger Massa/Kubb/Energi från namnet): `…_299`, `…_289`, `…_297`, `…_266`, `…_294`, `…_261`, `…_301`, `…_218`, `…_300`, `…_208`. De används bara på avslutade objekt (1–6 objekt var), inget pågående. Samma fråga: följ vyn?

## Hur det rättas när du bestämt

Jag gör ingenting förrän du svarat. Då blir det en migration som lägger raderna i `dim_sortiment_grupp` (`insert … on conflict do nothing`, `grupp_manuell = true` så ingen automatik skriver över dem), körs med `apply_migration` före release, och filen döps om till den version prod stämplar. Motorn rörs inte. Alternativet för bara de 7 pågående är att sätta `dim_objekt.sortiment_grupper_manuell` per objekt, men det lämnar hålet för nästa objekt som använder samma sortiment, så raderna är bättre.
