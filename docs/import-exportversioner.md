# Exportversioner — när samma sak kommer i flera skepnader

Skördarna (Scorpion, Rottne) exporterar en MOM-fil **varje timme**. Ett
skeende som pågår vid exporten syns i filen i sitt dåvarande läge, och i nästa
fil i ett annat. Importen måste alltid låta **en** version gälla per identitet
— annars behålls alla varianter och summorna blir för stora. Skotarna
exporterar en gång per dygn och drabbas inte.

Två fall är hittade och rättade. Familjen är densamma; leta efter ett tredje
när en summa inte stämmer mot maskinens egen rapport.

## 1. Delat segment — `fakt_tid` (#630, #634, 2026-10-01)

Ett pågående arbetssegment står med full längd i fil N. I fil N+1 är det
delat: kortare, plus ett nytt segment som börjar inuti spannet. "Störst vikt
vinner" behöll den långa varianten OCH det nya segmentet → överlapp
dubbelräknat, +6–13 min/dag, 3,7 h Scorpion / 4,2 h Rottne sedan augusti.
Regel: `avgor_tid_vinnare` — senaste vinner när ett annat segment börjar
inuti den större variantens spann. Omräknat med
`scripts/omrakna_fakt_tid_delat_segment.py`, verifierat 11/12 dagar på
minuten mot Ponsses Skift-PDF.

## 2. Ögonblicksbild av pågående stopp — `fakt_avbrott` (2026-10-01)

Så länge ett stopp pågår skriver Ponsse `OtherMachineDownTime` **"Default"**
(Rottne: **"Other"**). Föraren väljer orsak först när stoppet avslutas; nästa
fil bär samma starttid med slutlig kategori och full längd — eller som rast
eller arbete, då utan avbrottsrad alls. Nyckeln i `fakt_avbrott`
(maskin, datum, klockslag, kategori_kod) + ignore-duplicates lät
ögonblicksbilden stå kvar bredvid slutversionen:

| Maskin | Ögonblicksbilder sedan 1 aug | varav slutligt rast | Avbrott-flikens "Stopp" | TU |
|---|---|---|---|---|
| Scorpion | 27 rader, 18,0 h ("Default") | 3,7 h | 53,5 → 35,6 h | 84,0 → 87,6 |
| Rottne H8E -26 | 27 rader, 11,8 h ("Other") | 4,1 h | 36,1 → 24,3 h | 89,9 → 92,8 |
| Wisent, Elefanten | 0 | — | oförändrat | oförändrat |

Det som såg ut som "18,9 timmar utan registrerad orsak" på Scorpion var en
timme; resten var trailertransporter, raster och planering som redan fanns
som egna rader. Mönstret "kring en timme" var exportrytmen: en ögonblicksbild
kan aldrig bli längre än tiden sedan förra timexporten.

Regel: **senaste exportversion vinner per (maskin, datum, klockslag).**
`avbrott_vinnare_ur_fil` + `avbrott_att_radera` i
`skogsmaskin_import_version_6.py`; importen raderar ögonblicksbilder när filen
med slutversionen kommer (rader ur nyare filer rörs aldrig). Befintliga rader
tas bort med `scripts/omrakna_fakt_avbrott_ogonblicksbilder.py` — torrkörning
som standard, raderar bara, lägger aldrig till.

## Övriga tabeller — kontrollerade 2026-10-01

| Tabell | Nyckel | Vid ny version | Risk |
|---|---|---|---|
| `fakt_produktion` | maskin, operator, objekt, trädslag, processtyp, monitoring_start | merge → senaste skriver över | låg; byter attribution (operator/objekt) mellan versioner blir det en ny rad — samma sak som #115 för tid. Kontrollerat 2026-10-01: 0 av 1 964 segment sedan aug har mer än en rad |
| `fakt_skift` | maskin, datum, shift_key | merge | låg |
| `mom_tider` | — | delete + insert per dag | ingen |
| `fakt_lass`, `fakt_lass_sortiment` | maskin, objekt, lassnummer, datum | merge; FPR per dygn | ingen |
| `fakt_maskin_statistik` | maskin, filnamn | en rad per fil, avsiktligt | ingen |
| `fakt_avbrott` | maskin, datum, klockslag, **kategori** | ignore — **kategorin ändras mellan versioner** | rättad ovan |

Lärdomen: en nyckel får inte innehålla ett värde som ändras mellan
versionerna av samma skeende. Gör den det måste importen själv städa.
