# Lönekvot — maskintid per betald timme

**Lönekvoten är en verksamhetssiffra, inte ett omdöme om föraren.** Den
svarar på Martins ursprungliga fråga: hur mycket av betald tid som blir
maskintid. Det mesta som drar ner den kan föraren inte påverka — flytt,
service, väntan på lastbil. Därför visas den **bara i admin → Lön → Dagar**,
aldrig i förarens egen vy.

```
lönekvot = maskinens G15 under förarens inloggning / betald tid
```

| Del | Källa | Så |
|---|---|---|
| Betald tid | `arbetsdag.arbetad_min` + `extra_tid.minuter` | samma som lönemotorn. Rasten ligger redan utanför (ingen särskild hantering) |
| Maskintid | `fakt_tid` processing + terrain + other_work (`lib/g15` G15) | per **förare**: `fakt_tid.operator_id` → `operator_medarbetare` → medarbetare, dag för dag |
| Dagar som räknas | bara dagar där maskinen skickar filer (`dim_maskin.sander_filer`) och föraren har betald tid | antalet dagar står alltid bredvid talet |

Räknas i `lib/lonesystem/loneunderlag.ts` (`medMaskintid`, bara dry_run) —
granskningsstöd på samma dagrader som löneunderlaget, aldrig underlag.
Visas i `components/admin/DagarUnderflik.tsx`: per dagrad ("Maskintid 7 tim
2 min av 8 tim 10 min betald · 86 %"), per förare och för månaden.

## Två hanteringar som gör talet ärligt

1. **Delad maskin och dag.** Två förare på samma maskin samma dag får var sin
   maskintid ur sin egen inloggning (operator_id), aldrig delat lika. Har
   föraren betald tid men noll maskintid medan maskinen gick, står det:
   "Ingen maskintid på förarens inloggning — maskinen gick 9 tim under annan
   inloggning".
2. **Filfria maskiner.** 810E skickar inga filer. Dagar på den får "Maskinen
   rapporterar ingen maskintid", och räknas inte i kvoten — **aldrig 0 %**.
   Den grova räkningen i september gav Martin 32 % av just det skälet, samma
   fälla som "24 timmar utan registrerad orsak" i TU.

Månadens tal visas bara över dagar där båda källorna finns, med antalet
dagar bredvid. Hellre fyra ärliga tal än ett som ljuger.

## Täljaren är G15, inte G0 — avviker från branschen

Branschen (Skogen.se, "Henriks tips", Henrik Mild) definierar
**debiteringsgrad = G0-timmar / lönetimmar**. Vi räknar med G15, Martins
beslut 2026-10-02:

- **Korta stopp är produktiv tid.** Maskinen går, föraren arbetar, han
  stannar trettio sekunder för att titta. Att räkna bort det straffar
  arbetssättet.
- **Det finns inget branschsnitt att jämföra mot.** Hela skälet att följa en
  definition man inte gillar är jämförbarhet, och den finns inte här.

G0 = G15 − korta stopp och ger cirka **sju procent lägre** på skördarna
(Giant 7,5 %, H8E -26 6,9 % av arbetet sedan augusti 2026); skotarna
rapporterar inga korta stopp, där är G0 = G15. **Talet är alltså inte
detsamma som branschens debiteringsgrad.** Inget publicerat riktvärde
hittades (sökt 2026-10-02) — vyn visar ett rent tal utan referens, och ska
inte låtsas ha en.

## Läge augusti–september 2026 (räknat 2026-10-02, rättad och ärlig tid)

Dag för dag, bara dagar med både arbetsdag och maskinfil:

| Maskin | Dagar | Betald | G15 | Lönekvot |
|---|---|---|---|---|
| Wisent | 42 | 402 h | 361 h | 89,8 % |
| H8E -26 | 43 | 372 h | 332 h | 89,2 % |
| Giant | 43 | 425 h | 362 h | 85,1 % |
| Elefant 26 | 39 | 352 h | 290 h | 82,2 % |

Per förare på samma dagar: Oskar 89,2 · Max 88,0 · Stefan 84,3 · Daniel 81,7.

Den grova totalen "1 733 betalda timmar, 1 345 G15, 77,6 %" blandar in 810E
(19 dagar, 143 h utan G15), tre dagar utan maskindata och en dag med noll
betald tid — den visas inte.

## Inte lönekvot: TU

TU (teknisk utnyttjandegrad, `docs/tu.md`) mäter maskinen: arbete delat med
all tid maskinen var i bruk. Lönekvoten mäter verksamheten: maskintid delat
med betald tid. En maskin kan ha hög TU och låg lönekvot samma månad (mycket
flytt och planering utanför maskinen).
