---
name: skogsystem-design
description: Designkonventioner för Skogsystem. Använd vid all UI-byggnation — nya vyer, sheets, listor, formulär, tabbar, knappar, tomma tillstånd och felmeddelanden. Använd även vid ändring av befintlig UI. Använd INTE för ren datalogik, SQL, migrationer eller importskript.
---

# Skogsystem — designkonventioner

Skogsystem används av maskinförare i hytt. Maskinen vibrerar, ljuset växlar
mellan direkt sol och mörker, och blicken hör hemma i skogen — inte i
skärmen. Varje beslut nedan följer av det.

## Avläsbarhet först

En vy ska kunna läsas på en sekund, med blicken tillbaka i arbetet.

- **Ett tal per vy är huvudsaken.** Stort, överst. Allt annat är stöd.
- **Tillstånd syns, det räknas aldrig ut.** Om något pågår, är försenat
  eller väntar på godkännande ska det stå — inte härledas ur siffror.
- **Ingen dekoration som inte är data.** Ramar, gradienter och ikoner utan
  betydelse gör vyn långsammare att läsa.
- **Färg är aldrig ensam informationsbärare.** Rött i solljus är brunt.
  Färg förstärker en text som redan säger samma sak.
- **Summan är summan av det som visas.** Avrunda varje del först, summera
  sedan — aldrig tvärtom. Summerar man råvärdena och avrundar en gång i
  slutet adderas småfelen åt samma håll, och totalen hamnar bredvid det
  som står i listan. Gallringsvyn visade 6 553,5 medan raderna summerade
  till 6 553,6. En total som inte går att kontrollräkna med miniräknare
  läses som ett räknefel, och då tappar man förtroendet för hela vyn —
  inte bara för den siffran. Gäller varje total, delsumma och procentsats
  som står bredvid sina delar.

## Grundprinciper

1. **En sak per skärm.** Om en vy svarar på två frågor är den två vyer.
2. **Systemet föreslår, användaren godkänner.** Automatik skriver aldrig
   utan bekräftelse. Visa förslaget, låt användaren trycka.
3. **Hellre färre val än fler.** Varje valfritt fält är en fråga föraren
   måste besvara. Ta bort det eller gör det obligatoriskt.
4. **Ingen siffra utan syfte.** Leder den inte till ett beslut ska den bort.

## Struktur

- Formulär byggs som iOS Settings: grupperade subsections med rubrik,
  inte en lång kolumn med fält.
- Obligatoriska fält först, valfria sist och tydligt märkta.
- Listor grupperas på VO-nummer. Skördare och skotare under samma objekt.
- Tabbar används när samma data ses ur olika vinklar
  (Beställning / Kapacitet / Utfall), inte som navigation.

## Interaktion

- **Dirty-state hör hemma på spara-knappen**, inte som banner eller dialog.
  Knappen är inaktiv tills något ändrats.
- Träffytor minst 44 pt. Maskinen skakar och fingret träffar snett.
- Destruktiva och irreversibla åtgärder kräver bekräftelse.
  Inget annat gör det.
- Ingen hover-beroende funktionalitet. Allt ska fungera på touch.

## Text

- Svenska, och de facktermer förarna faktiskt använder: trakt, avlägg, VO,
  skotat, G15. Inte översatt engelska.
- Felmeddelanden säger vad användaren ska göra, inte vad som gick fel.
- Tomma tillstånd förklarar varför listan är tom och vad som fyller den.

## Att undvika

- Modaler ovanpå modaler.
- Spinners utan kontext — visa vad som laddas.
- Nya vyer när ett fält i en befintlig vy räcker.
