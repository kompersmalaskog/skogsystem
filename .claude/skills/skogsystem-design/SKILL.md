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

## Värden

Principerna ovan räcker inte för att bygga en knapp. Värdena nedan gör det.
De finns i kod i `lib/design/tokens.ts` — **importera därifrån, skriv aldrig
literaler**. Utredningen 2026-09-08 fann 33 textstorlekar, 234 färger, 109
padding-kombinationer och 28 radier i appen; premiumkänsla kommer från att
allt sitter på samma linjer, inte från vad som visas. `scripts/design-lint.mjs`
räknar nya literaler i varje PR och varnar.

### Typografi — sex steg, tre vikter, en stack

| Token | Storlek / vikt | Används till |
|---|---|---|
| `TYP.tal` | 32 / 700, tabular | Skärmens huvudsiffra. Ett per vy. |
| `TYP.titel` | 30 / 700 | Vyns rubrik eller tillstånd ("Väntar på maskin") |
| `TYP.rubrik` | 20 / 700 | Sektionsrubrik |
| `TYP.text` / `TYP.listtitel` | 17 / 400 resp. 600 | Brödtext, listradens namn |
| `TYP.meta` | 13 / 400 | Sekundär rad under en titel |
| `TYP.micro` | 11 / 600 versaler | Grupprubrik i lista |

Vikter: 400, 600, 700. Ingen 500. Typsnitt: `FONT` på vyns rot, `inherit`
under. Siffror alltid `TNUM`.

### Avstånd och form

Skalan är **4 / 8 / 12 / 16 / 24 / 32** (`AVSTAND`). Sidmarginal 16, mellan
sektioner 24, mellan rader 12, inuti en rad 8. Radie (`RADIE`): rad och fält
10, knapp och kort 12, sheet 16, cirklar 50 %. Träffyta minst 44, primärknapp 48.

### Hierarki — fem nivåer, högst en primär per skärm

| Nivå | Utseende | När |
|---|---|---|
| `KNAPP.primar` | Fylld vit på svart, full bredd, 48 px | Skärmens EN handling |
| `KNAPP.sekundar` | Fylld `white/0.10`, 44 px | Vanlig handling |
| `KNAPP.tertiar` | Grå text, 44 px träffyta, ingen ram | Undantag ("Starta manuellt", "Sjuk idag?") |
| `KNAPP.lank` | Blå text | **Bara "navigerar eller avbryter"**: Avbryt, Klar, Se alla, tillbaka |
| `KNAPP.destruktiv` | Röd text | Radera. Kräver alltid bekräftelse |

Blått är därmed aldrig knappfyllning, aldrig vald rad, aldrig stapel, aldrig
status. Inaktiv knapp = `INAKTIV` (samma form, 40 % opacity), inga egna grå.
Status (grön/orange/röd) bara som prick eller etikett bredvid ett ord, en nyans
var. Konturknappar finns inte.

### Rörelse — tre tider, en kurva

`RORELSE.tryck` 150 ms (tryckfeedback), `RORELSE.byte` 250 ms (tillstånd tonar
in: opacity + 8 px), `RORELSE.sheet` 350 ms. Kurva
`cubic-bezier(0.2, 0, 0, 1)` på allt. Ett tal som ändras räknar upp på 400 ms
(`useRaknaUpp`). Tillstånd **tonar över** i nästa (`<Tillstand nyckel=…>`),
element försvinner aldrig utan att nästa tonar in på samma plats, och höjden
reserveras så inget under hoppar. `designCss` renderas en gång per vy — inga
egna `@keyframes`. Puls (`.puls`) bara för "pågår just nu".
`prefers-reduced-motion` stänger av allt utom opacity.

### Färg — ett tema

`FARG`: bakgrund `#000`, kort `#1c1c1e`, upphöjt `#2c2c2e`, linje
`white/0.08`, text `#fff`, sekundär `#8e8e93`, tertiär `#636366`, blå
`#0a84ff`, grön `#30d158`, orange `#ff9f0a`, röd `#ff453a`, skördare
`#a8d582`, skotare `#f0b24c`. Inga andra färger. Ikoner: Material Symbols,
storlek 18 i text och 22 i rad.

### Så används det

```tsx
import { TYP, TNUM, AVSTAND, FARG, KNAPP, KORT, VY_ROT, designCss } from "@/lib/design/tokens";
import Tillstand from "@/components/design/Tillstand";
import { useRaknaUpp } from "@/lib/design/raknaUpp";

<div style={VY_ROT}><style>{designCss}</style>
  <Tillstand nyckel={pagar ? "pagar" : "vantar"}>
    <h1 style={{ margin: 0, ...TYP.titel }}>{pagar ? "Pågående sedan 06:02" : "Väntar på maskin"}</h1>
  </Tillstand>
  <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Wisent2015</p>
  <button style={{ ...KNAPP.primar, marginTop: AVSTAND.xl }}>Extra arbete</button>
</div>
```

En vy som rörs importerar tokens och lämnar inga nya literaler efter sig.
Rättade filer listas i `SKARPA` i `scripts/design-lint.mjs` och får då inte
driva igen.
