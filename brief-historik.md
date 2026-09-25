# Brief — Historik: "Så här flyttade vi"

En egen vy (ingång från startsidan) som visar hur maskinerna flyttat över tid, så
man kan visa uppdragsgivaren onödiga flyttar och planera smartare. Schemat är
verifierat i Supabase (projekt `mxydghzfacbenbgpodex`).

## Princip
Lätt för hjärnan = visa EN sak i taget. Återhållsam, lugn karta (samma dämpade
stil och markörspråk som förarvyn — det ska kännas som samma app). Det onödiga
ska sticka ut; allt annat ska vara tyst.

## Samordning
Denna vy rör INTE `app/planering/page.tsx` eller `app/oversikt/`. Ett parallellt
spår jobbar i planeringsvyn — håll dig i historikens egna filer så vi slipper
merge-konflikter.

## Huvuduppdelning: typ-växel (det viktigaste)
Högst upp en växel: **Slutavverkning ↔ Gallring**. EN typ i taget, aldrig blandat.
Det är den bärande regeln — den håller vyn ren och hjärnan klar. Filtrera på
`objekt.typ`. (Maskin är ett VALFRITT filter man kan lägga på, inte en andra
uppdelning man måste hantera.)

## Vad vyn visar (enkel version först)
1. **Karta** med den faktiska rörelsen i tidsordning, numrerad 1→2→3…
   - Normala flyttar i lugn färg.
   - **Återbesök** (när man återvänder till ett område man redan lämnat) i ORANGE,
     streckat — det är det onödiga som ska skrika. Markera området + "+X km i onödan".
2. **Stopplista** i tidsordning: vecka/datum · objekt · nederbörd · brandrisk.
   Återbesök märks tydligt ("↩ Återbesök").
3. **Summering** längst ner: körd sträcka · antal återbesök · uppskattad onödig flytt (km).

Bygg INTE "kört vs optimalt"-jämförelsen nu — den sparas som nästa steg.

## Datakällor & beroenden (viktigt — var ärlig om vad som finns)
- **Rörelsen FINNS**: GPS-spår (`detalj_gps_spar`, `gps_tracks`, `gps_position`).
  Körd sträcka och rutt byggs från riktig data.
- **Objekt/typ FINNS**: `objekt` (typ, lat/lng, namn, timestamps för
  pagaende/avslutad → tidsordning).
- **Brandrisk**: använd MCF-skalan (myndighetsstandard, egna färger:
  1 `#007AFF` · 2 `#34C759` · 3 `#FFD60A` · 4 `#FF9F0A` · 5 `#FF453A` · 6 `#AF52DE`).
  Kommer från brandrisk-spåret (`brandrisk-steg2`) — samordna, bygg inte dubbelt.
- **Nederbörd/väder FINNS INTE i databasen.** Kräver en EXTERN historisk väderkälla
  (API per koordinat + datum). Bygg rörelse + återbesök FÖRST utan väder; koppla på
  nederbörd när källan finns. Föreslå källa och stäm av innan integration.

## "Återbesök" — definition att bekräfta
Ett återbesök = maskinen återvänder till ett objekt/område nära ett tidigare besökt,
efter att ha varit någon annanstans emellan. Föreslå en konkret regel (t.ex. inom
X km från ett tidigare stopp, efter minst ett mellanliggande stopp) och stäm av
innan du räknar "onödig flytt".

## Designtokens
Följ appens låsta palett (mörk): chrome-färger iOS-paletten, ytor
`rgba(255,255,255,0.06)`, border `rgba(255,255,255,0.08)`, text `#fff`/`#8e8e93`,
radier 8/12/16, pills 50. Brandrisk = MCF (ovan), rör inte. Orange (`#ff9f0a`) =
återbesök/onödig flytt. Färg betyder alltid något, aldrig dekoration.

## Klart när
- Typ-växeln (Slutavverkning/Gallring) styr hela vyn; aldrig båda samtidigt.
- Rörelsen ritas i tidsordning från riktiga GPS-spår.
- Återbesök framlyfta i orange, med uppskattad onödig flytt.
- Lugn karta, samma känsla som förarvyn.
- Väder/brandrisk inkopplat ELLER tydligt utelämnat tills källan finns (aldrig fejk).
