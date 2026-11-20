# TU — teknisk utnyttjandegrad

**TU mäter maskinen, inte föraren och inte hur lönetiden används.** Det är
branschens standardmått (Skogforsk) för hur stor del av den utnyttjade tiden
som är arbete, och det går att jämföra utåt. Martin valde Skogforsks
definition 2026-10-01 av just det skälet — Ponsses egna tal används inte i vyn.

```
täljare = processing + terrain + avbrott kortare än 15 min
nämnare = täljaren + övrigt arbete + avbrott 15 min och längre

TU = täljare / nämnare
```

Rast räknas aldrig, varken i täljare eller nämnare. Flytt ligger i nämnaren
men inte i täljaren — oavsett om den bokförts som övrigt arbete (vägkörning,
flytt på egna hjul) eller som avbrott (Trailer transportation).

Var: `/maskinvy?ny=1` (hemskärmens kort "Maskinvy 2") — en rad i nyckeltalslistan
för skördare och skotare, och alla maskiner bredvid varandra överst i
Jämförelse-fliken (`components/maskinvy/TuTabell.tsx`). Samma synlighet som
G15-tid och Korta stopp (beslut 2026-09-30).

## Vad som ingår (`lib/g15.ts`, `tuProcent`)

| Del | Källa | I TU |
|---|---|---|
| Arbete | `fakt_tid`: `processing + terrain` | täljare och nämnare |
| Övrigt arbete | `fakt_tid`: `other_work` (vägkörning, förbereda körbanor, bogsering) | **bara nämnaren** |
| Avbrott 15 min och längre | **`fakt_avbrott`**, **alla kategorier** — underhåll, störning, reparation, övrigt, flytt på trailer, utan registrerad orsak | nämnaren |
| Avbrott under 15 min | `fakt_avbrott` med `langd_sek < G15_GRANS_SEK`, alla kategorier | **täljaren** — G15 räknar per definition in stopp under gränsen |
| Maskinens mikropauser | `kort_stopp_sek` | ligger **redan inuti** processing — rörs inte, aldrig additiv |
| Rast | `rast_sek` | **inte med** |
| Tomgång, motortid | `tomgang_sek`, `engine_time_sek` | inte med |

**Varför `fakt_avbrott` och inte `fakt_tid`:s DOWN-hinkar:** Avbrott-fliken i
samma vy läser `fakt_avbrott`; två tal i samma vy måste komma från samma källa.
Dessutom saknar `fakt_tid` segment på skördarna (verifierat i prod 2026-09-30,
sedan 1 aug: Scorpion 57,8 mot 65,7 h, Rottne 28,7 mot 37,5 h; skotarna exakta).

**Varför övrigt arbete bara i nämnaren:** det gör talet jämförbart mellan
maskiner som bokför samma sak olika. Elefanten skriver flytten som övrigt
arbete (17,9 h sedan aug), Scorpion som Trailer transportation (16,5 h). Med
den gamla formeln (G15 inkl. övrigt arbete i täljaren, flytt utanför) fick
Elefanten 89,3 och Scorpion 87,3 för samma slags tid. Nu räknas båda lika.
Hur flytten bokförs påverkar alltså avbrottsvyn och G15-tiden, **inte TU**.

## Korta stopp är inte korta avbrott

Två olika saker som båda ligger i täljaren, på olika sätt:

- **Korta stopp** (`kort_stopp_sek`, StanForD IndividualShortDownTime) är
  maskinens egna mikropauser, 15–60 sekunder, annoterade *inuti* arbetstiden.
  De är redan en del av processing och adderas aldrig. Bara skördarna
  rapporterar dem; nyckeltalet "Korta stopp" i vyn visar dem som andel av
  motortiden ("mikropauser · % av motortid"), och TU-tabellen som egen rad
  "maskinens egna, inuti arbetet". Ponsses Skift-rapport kallar samma sak
  **"Korta avbrottstider"** — vi säger "Korta stopp" för att det är så man
  pratar i skogen (Martin 2026-10-02); leta inte efter ordet i PDF:en.
- **Korta avbrott** är DownTime-segment i `fakt_avbrott` kortare än 15 min —
  objektbytesglapp, tankning, väntan. De ligger *utanför* arbetstiden i
  råfilen och flyttas till täljaren i TU eftersom G15 per definition räknar in
  stopp under gränsen. De är små: Wisent 3,2 h sedan aug, de andra under en
  halvtimme.

## Avbrott utan registrerad orsak

Vyn visar avbrott utan registrerad orsak dämpat under TU, i nyckeltalslistan
och i tabellen: "1 tim avbrott utan registrerad orsak". Inte larm —
osäkerheten åtgärdas av förarna genom att klassa, inte av oss genom att räkna
om. `arOklassatAvbrott` i `lib/g15.ts`: `Default` eller tom kod. "Other" och
"Unproductive terrain work" är **valda** standardkoder och räknas inte.

**Läxan 2026-10-01:** Scorpion såg ut att ha 18,9 h "Default" — flottans
största avbrottspost. Martins invändning "orsak MÅSTE tryckas in över femton
minuter" avslöjade att det inte stämde. "Default" (Rottne: "Other") är
maskinens **platshållare för ett stopp som pågår** när timfilen exporteras;
nästa fil bär samma starttid med den valda orsaken, och importen behöll båda.
27 + 27 rader var ögonblicksbilder, varav 3,7 + 4,1 h i själva verket raster.
Rättat i importen (senaste exportversion vinner per starttid, #644) och städat
ur databasen — se `docs/import-exportversioner.md`. Äkta oklassat på Scorpion:
0,9 h (ett stopp på 39 min 18 aug och fem på 1–4 min).

## Branschsnitt (referens, inte omdöme)

Skogforsk: **skördare 85 %, skotare 90 %**. Skördaren är mer tekniskt komplex.
Står i `TU_BRANSCHSNITT` i `lib/g15.ts` och visas dämpat under etiketten; ett
tal under snittet står i orange. Två enheter TU ≈ 8 % högre vinst vid 3 000
maskintimmar per år (Martin, 2026-09-30).

## Läge oktober 2026 (sedan 1 augusti)

Räknat 2026-10-01 kl 16 med vyns formel, på tid som är rättad (#630/#634
delade segment, #644 ögonblicksbilder i fakt_avbrott) och ärlig (#638,
88 %-fallbacken borta). Tidigare tal (Rottne 90,5 · Scorpion 87,9 · Wisent
93,8 · Elefanten 89,4, och förmiddagens 89,9 · 84,0 · 91,1 · 83,7) byggde på
dubbelräknad tid, påhittade timmar, dubblerade avbrott eller den gamla formeln
— de gäller inte. Talen rör sig med dagens filer; jämför vid samma tidpunkt.

| Maskin | Avbrott i fakt_avbrott | varav "Stopp" ≥ 15 min utan flytt | utan orsak | TU | Snitt |
|---|---|---|---|---|---|
| Rottne H8E -26, skördare | 26,6 h | 24,3 h | 0 | **92,9** | 85 |
| Scorpion, skördare | 52,3 h | 35,6 h | 0,9 h | **87,6** | 85 |
| Wisent, skotare | 34,5 h | 25,5 h | 0 | **90,7** | 90 |
| Elefanten, skotare | 35,3 h | 34,8 h | 0 | **84,0** | 90 |

Elefanten är ensam under sitt snitt. Dess tapp mot den gamla formeln är
flytten som övrigt arbete (17,9 h), som tidigare låg i täljaren. Inget har
blivit sämre i maskinen — talen blev jämförbara.

## Tillförlitlighet — kopplingen till Lön → Dagar

TU räknas ur maskindata, Dagar ur `arbetsdag` (föraren). De två källorna
blandas aldrig. Under varje maskin i TU-tabellen står i stället hur många av
dess förardagar som har en avvikelse enligt samma regler som Dagar
(`lib/lonesystem/forarText` `dagAvvikelser` + okvitterad tidsavvikelse). Ser
man att dagarna inte stämmer vet man att talet är osäkert.

## Till mötet med förarna (Martin)

1. Står maskinen på trailern ska det bokföras som flytt, inte som övrigt
   avbrott. Påverkar avbrottsvyn och G15-tiden, inte TU. Kolla först om
   Scorpions Opti har en flyttkategori alls.
2. Tryck in en orsak när maskinen stannar — men det är redan nästan alltid
   gjort: äkta oklassat på Scorpion är 0,9 h sedan augusti, inte 18,9.

## Öppna frågor

- Skogforsks TU följs år för år. Vi har data sedan augusti 2026; en årsserie
  finns tidigast hösten 2027.
- Avbrott klassade som "Unproductive terrain work" på Wisent är i praktiken
  stillestånd vid skiftstart (förarens valda kategori). De räknas som avbrott.
- Rottnes "Other" är maskinens platshållare för pågående stopp (som Ponsses
  "Default"). Efter städningen återstår 4 rader / 2,2 h "Other" som stod kvar
  i slutversionen — valda, eller stopp som aldrig fick en orsak. Syns inte i
  databasen.

## Inte TU: lönekvoten

Martins ursprungliga fråga — hur stor del av betald tid som blir maskintid —
är **lönekvoten** (debiteringsgrad, EpiForest: maskintid per lönetimme).
Grovt sedan augusti 2026: 1 710 betalda timmar, 1 338 G15-timmar, 78 %. Det
måttet kräver `arbetsdag` (lön) mot `fakt_tid` (maskin) dag för dag och bor i
admin, inte i maskinvyn. Utreds efter TU.
