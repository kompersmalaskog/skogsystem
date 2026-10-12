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
- Listor grupperas efter sammanhang:
  - **Planering och uppföljning:** på **VO-nummer** — skördare och skotare under samma objekt.
  - **Maskinvyns förarlista** (maskinläge): på **Här / Pågående / Planerade / Avslutade**
    (position + status), inte VO. "Här" = GPS-positionen ligger i objektets traktgräns.
    **Avslutade** grupperas i sin tur på **objekttyp** (Slutavverkning / Gallring / Grot).
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

### Layoutmått är inte avstånd

Ett **avstånd** säger hur mycket luft det är mellan två saker: 4, 8, 12, 16, 24,
32. Ett **layoutmått** säger var ett fast element slutar: toppfältets höjd,
bottenradens höjd, iPhones systemfält. Det är två olika sorters tal. De får
aldrig bytas mot varandra, och ett layoutmått får aldrig "rättas" till närmaste
steg på avståndsskalan.

**Varför:** i PR #540 (2026-09-12) fick Min tid sina värden rättade mot tokens.
Rubriken med flikraden var fast (`position: fixed`), och innehållet under hade
`paddingTop: 126`, rubrikens uppmätta höjd. Passet bytte 126 mot `AVSTAND.xxl`
= 32, eftersom 32 fanns på skalan och 126 inte gjorde det. Rubriken är 124 px,
så 92 px innehåll hamnade under flikraden, på dator och i telefon: summeringen
och veckan helt dolda, Månaden till hälften. Samma byte gjordes i Lön (96 och 80
blev 32). Talet såg ut som ett avstånd. Det var ett mått.

Och i fem månader (maj–sep 2026) satt 27 helskärmspaneler på `top: 56`,
toppfältets höjd på en dator. På iPhone är toppfältet 56 + 47–59 px, eftersom
systemfältet ritas under det. Panelerna började alltså under toppfältet, med sin
egen flikrad dold, och ingen märkte det, för ingen testade i telefonen.

**Reglerna:**

1. **Toppfältets och bottenradens mått finns bara i tokens**, med safe-area
   inräknad: `LAYOUT.topbar`, `underTopbar(extra)`, `medSafeBotten(px)`. Aldrig
   `56` eller `calc(56px …)` i en vy.
2. **En rubrik inne i en vy är `position: sticky`** i flödet. Den reserverar
   sin egen höjd, så det finns inget mått att räkna fel, och inget att "rätta"
   senare. Aldrig `fixed` + uppmätt `paddingTop` under. Kalendern har alltid
   gjort så och har aldrig haft felet.
3. **En helskärmspanel under toppfältet** sitter på `top: underTopbar()`, med
   `underTopbar(52)` om panelen har en egen fast rad på 52 px ovanför.
4. **En fast bottenrad eller ett sheet** har `medSafeBotten(px)` som nedre
   padding. Annars ritas den in i hemindikatorn på iPhone.
5. **Testa i telefonen.** Safe-area är 0 på datorn, så fel 3 och 4 syns aldrig där.

`design-lint` larmar på ett naket `top:` med tal (utom 0) och på `fixed` med
`top` (utom helskärmspaneler med `bottom: 0`/`inset`).

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
`#a8d582`, skotare `#f0b24c` (de två sista är diagrampalett-poster, **INTE
rollfärger** — se "Färgens betydelse"). Inga andra temafärger. Ikoner: Material
Symbols, storlek 18 i text och 22 i rad.

### Färgens betydelse — en färg, en sak

På kartan och i förarlistorna BÄR färgen mening. Använd rätt färg för rätt sak —
hitta aldrig på en ny.

| Vad | Färg | Källa |
|---|---|---|
| Skördare (spår, maskin, etikett) | **lila `#bf5af2`** | `ROLLFARG_SKORDARE` / `rollFarg()` |
| Skotare (spår, maskin, etikett) | **grön `#34c759`** | `ROLLFARG_SKOTARE` / `rollFarg()` |
| Maskinens position (GPS-pricken) | blå `#0a84ff` | `FARG.bla` |
| Traktgräns / snitsel | röd `#ff453a` + gul streck `#fbbf24` | `LEGEND.fara` / `LEGEND.gul` |
| GROT | amber `#f59e0b` | kartlager |
| Hänsyn | ytans egen färg, fallback blå `#3b82f6` | `LEGEND` |
| Naturvård | grön `#30d158` | `LEGEND.naturvard` |

Kartans fulla legend (basväg, dike, brant, kultur, fornlämning …) bor i `LEGEND`
(page.tsx) och hålls medvetet på en **egen semantisk axel** skild från `FARG`-temat
— snitsel/kartmarkeringar är fysiska band i skogen, inte UI-status.

De **absoluta rollfärgerna** — skotare **grön `#34c759`**, skördare **lila `#bf5af2`** —
bor i `rollFarg()` / `ROLLFARG_SKOTARE` / `ROLLFARG_SKORDARE` (page.tsx, #543-serien) och
gäller i **alla** vyer (hyttspår, stråk, maskin, etikett). Använd dem — aldrig egna.
**OBS:** `FARG.skordare` (#a8d582) / `FARG.skotare` (#f0b24c) är INTE rollfärger — de
används bara som två poster i en diagrampalett (arbetsrapporten) och ska aldrig färga en roll.

**Status visas med STYRKA, inte med en egen färg.** Full färg = *kvar / aktivt*;
dämpad (lägre opacity) = *klart / utkört / avslutat*. En skotningshög i full
sortimentfärg är kvar, samma hög dämpad är utkörd; ett avslutat objekt ritas dämpat.
Måla aldrig om något till en "klar-grå" eller "klar-färg" — **samma färg, svagare**.
(Detta är progress-axeln. Larm-status — fel/varning/ok — är en annan sak och visas
som grön/orange/röd prick eller etikett bredvid ett ord, aldrig som fyllning.)

### Sortimentfärger — en ljushetsskala, skild från status

När en vy visar hur virket fördelar sig (timmer, kubb, massaved, övrigt) används
EN skala, och bara den: `SORTIMENTFARG` i `lib/design/tokens.ts`.

| Sortiment | Färg | Läs som |
|---|---|---|
| Timmer | **mörkgrön `#2f4b14`** | mest värt |
| Kubb | `#6e8f4a` | |
| Massaved | `#b4c4a0` | |
| Övrigt | **nästan vit `#e3e8dc`** | minst värt |

**Mörkast är mest värt.** Skalan är ljushet, inte nyans: en stapel läses som "hur mörk
den är", och de mörka delarna är de som betalar.

**Skild från status.** Grönt/orange/rött (`FARG.gron` m.fl.) säger om något är *bra eller
dåligt* och står som prick eller etikett bredvid ett ord. Sortimentskalan säger *vad det är*.
Den mörkgröna timmerfärgen betyder därför inte "godkänt", och en röd rad i samma vy betyder
inte "dåligt sortiment". Blanda aldrig: ingen statusprick i en sortimentfärg, ingen
sortimentfärg som larm.

**Färg är aldrig ensam bärare.** Varje färgad del har ordet och talet bredvid sig (rad med
prick, eller teckenförklaring under staplarna). Timmerfärgen har låg kontrast mot den svarta
sidan, så en sortimentstapel ritas med en tunn ram (`LINJE`) och med ljusare grannar.

Gäller sortimentGRUPPERNA. Kartans skotningshögar och stråk färgas per trädslag/sortimentnamn
(`getSortimentColor` i planeringsvyn) — en annan axel som inte rörs av den här.

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
