# Handoff: Uppföljning v6 — redesign

## Översikt

Ny design av Uppföljnings-vyn i Skogsystem-appen. Två skärmar:

1. **Lista** — alla pågående objekt grupperade efter status. "Oskotat i skogen"-rad högst upp visar hur mycket virke som ligger kvar efter skördning.
2. **Detalj** — enskilt objekt med maskinkort (skördare + skotare), tidslinje, och kollapsade sektioner för fördjupning (produktivitet, produktion per dag, trädslag, sortiment, tid & diesel, avbrott, extern skotning).

Målet: lugnare och mer iOS-mässigt än dagens vy. Fokus på *vad händer nu* och *hur mycket är kvar att göra*.

## Om designfilerna

Filerna i detta paket är **designreferenser byggda i HTML/React** — prototyper som visar hur det ska se ut och bete sig. De är **inte produktionskod att kopiera rakt av**.

Uppgiften är att **återskapa dessa designer i Skogsystem-appens befintliga kodbas** (React Native / existerande ramverk) enligt appens etablerade mönster och komponentbibliotek. Om inget befintligt bibliotek täcker något — använd native-motsvarigheter (t.ex. iOS `UISearchBar`, `UISegmentedControl`).

## Fidelity

**High-fidelity**. Exakta färger, typografi, spacing och interaktioner är specade. Återskapa pixel-perfekt.

## Skärmar

### 1. Lista (`UppfoljningListV6`)

**Syfte:** Ge arbetsledaren en snabb överblick över pågående objekt, prioriterat efter status. Oskotat-virke ska vara omedelbart synligt.

**Layout (390px bred mobilskärm, iOS-safe area ~52px top):**
- Stor titel "Uppföljning" (34px, bold, letter-spacing -0.8px) i 52px padding-top
- iOS-native sökbar (centrerad "Sök" + magnifier när inaktiv; fokuserad visar "Avbryt" till höger)
- **Oskotat-rad** (kompakt, expanderbar)
- Segmented control med fyra segment: Alla / Slutavv. / Gallring / Grot
- Grupperade listor med status-rubrik + kort-container
- Längst ner: "Visa avslutade (N)"-toggle

**Oskotat-rad (kollapsad):**
- Bakgrund: `#1c1c1e` (V6_CARD)
- Border-radius: 12
- Padding: 13px 16px
- Innehåll vänster→höger:
  - Orange prick (8×8, borderRadius 50%, `#ff9f0a`)
  - Text "Oskotat i skogen" (14px, 600, letter-spacing -0.1px)
  - Spacer (flex:1)
  - Total m³-siffra (16px, 700, tabular-nums)
  - "m³" (11px, 600, grå)
  - Chevron höger (8×8, grå — roterar 90° när öppen)

**Oskotat-rad (expanderad):**
- Visar tre rader under toppen: Slutavverkning / Gallring / Grot
- Varje rad har vänster border-top (`rgba(255,255,255,0.06)`)
- Format: `[label] [antal obj] [m³-siffra] m³ [chevron]`
- Tap på rad → sätter filter på listan + kollapsar raden

**Objekt-rad:**
- min-height: 60
- padding: 12px 16px
- gap: 12
- Innehåll:
  - Statusprick 8×8 (färgkodad — se status-färger nedan)
  - Titel (16px, 600, letter-spacing -0.2, ellipsis)
  - Meta-rad under (12px, grå): `Typ · X ha` + eventuellt orange "Oskotat N dagar · färdigskördat DD mmm"
  - m³-siffra höger (17px, 600, tabular-nums, vit — `#fff`)
  - "kvar m³" eller "m³" (11px, 500, grå)
  - Chevron (7×12, grå)
- Divider mellan rader: `0.5px solid rgba(255,255,255,0.06)`

**Statusgruppers rubriker:**
- padding: 20px 20px 8px
- 13px, 600, grå `#8e8e93`, UPPERCASE, letter-spacing 0.04em
- Antal höger: tabular-nums, grå
- Titlar: "Skördare kör" / "Skotare kör" / "Väntar på skotning" / "Övrigt pågående" / "Avslutade"

**Segmented control:**
- Bakgrund: `rgba(118,118,128,0.24)`
- Border-radius: 9, padding: 2
- Aktivt segment: `#636366` bakgrund, boxShadow `0 1px 2px rgba(0,0,0,0.2)`
- Font: 13px, 600 (aktiv) / 500 (inaktiv), vit, letter-spacing -0.1
- Transition: background 0.15s

**Sökbar (iOS-native):**
- Bakgrund: `rgba(118,118,128,0.24)`, border-radius 10, padding 7px 8px
- **Inaktiv**: magnifier + "Sök" centrerat
- **Aktiv** (fokus eller text): magnifier glider vänster, input expanderar, "Avbryt"-knapp (blå `#0a84ff`, 15px) till höger
- När text finns: litet rensa-kryss (16×16, rund, `rgba(255,255,255,0.22)`)
- Transition: flex 0.2s

**Visa avslutade-toggle:**
- padding: 24px 16px 12px
- Knapp: border `0.5px solid rgba(255,255,255,0.06)`, borderRadius 10, padding 12px 16px
- Text: "Visa avslutade (N)" eller "Dölj avslutade (N)", 13px, 500, grå, centrerat

### 2. Detalj (`UppfoljningDetailV6`)

**Syfte:** Allt om ett objekt — vad som händer, hur långt det kommit, detaljer vid behov.

**Layout:**
- Sticky nav-bar överst (44px, svart blur)
- Headline-sektion: typ/areal/ägare + objektnamn (H1, 30px)
- Maskinkort (2 kolumner: skördare + skotare) — den primära översikten
- Tidslinje — stor horisontell tidsaxel
- Kollapsade sektioner: Produktivitet, Produktion per dag, Trädslag & sortiment, Tid & diesel, Avbrott, Extern skotning

**Nav-bar:**
- Höjd 44, position sticky
- Bakgrund `rgba(0,0,0,0.78)`, backdrop-filter blur(24px) saturate(180%)
- Border-bottom `0.5px solid rgba(255,255,255,0.06)`
- "< Uppföljning"-knapp vänster (17px, letter-spacing -0.2)

**Headline:**
- padding: 22px 24px 20px
- Meta: 13px, 500, grå — `Typ · X ha · Ägare`
- H1: 30px, 700, letter-spacing -0.8px, line-height 1.05, text-wrap balance

**Maskinkort:**
- Grid: 1fr 1fr (eller 1fr om bara skördare), gap 10, padding 0 24px 24px
- Kort: bakgrund `#141416` (V6D_CARD), borderRadius 16, padding 16px 16px 14px
- Topp: färgprick 8×8 (grön för skördare, gul för skotare) + "SKÖRDARE"/"SKOTARE" (11px, 700, uppercase, letter-spacing 0.08em)
- Primär siffra: 32px, 700, letter-spacing -0.8, tabular-nums + "m³" grå
- Primär label: 11px, grå ("skördat", "utkört · N kvar")
- Divider `0.5px solid rgba(255,255,255,0.06)` + rader (12px, grå):
  - Status: "Aktiv idag" / "Klar" / "Start DD mmm"
  - Snitt/dag: Math.round(totalM3 / antalDagar) m³
  - Senast: "idag" / "igår" / "N dagar sedan"
  - Maskinmodell + förare (11px, mörkgrå)

**Tidslinje:**
- Rubrik "Tidslinje" (20px, 700) + total dagar (12px, grå)
- Kort bakgrund V6D_CARD, borderRadius 16, padding 18px
- Två spår (skördare + skotare) staplade:
  - Header: färgprick + namn (13px, 600) + datumintervall höger (11px, grå)
  - Stapel: höjd 12, bakgrund `rgba(255,255,255,0.04)`, borderRadius 6
  - Fylld del: i maskinens färg
  - Om pågående: pulsande "nu"-markör (16×16 cirkel med glow)
- Vertikal "idag"-linje som går över båda spåren (om pågående)

**Kollapsade sektioner:**
- Knapp med titel vänster (17px, 600) + chevron höger (grå, roterar 90° när öppen)
- Border-top `0.5px solid rgba(255,255,255,0.06)`
- Innehåll visas vid öppen, göms annars

Detaljerat innehåll i varje sektion: se `Uppfoljning_v6_Detail.jsx`.

## Design Tokens

### Färger

```
V6_SK        #a8d582   Skördare (mossgrön)
V6_ST        #f0b24c   Skotare (bärnsten)
V6_WARN      #ff9f0a   Oskotat / väntar (iOS orange)
V6_DONE      #30d158   Avslutat (iOS green)
V6_GREY      #8e8e93   Sekundär text / ikoner
V6_GREY2     #636366   Tertiär / disabled
V6_CARD      #1c1c1e   Kort-bakgrund (lista)
V6D_CARD     #141416   Kort-bakgrund (detalj — något mörkare)
V6_SEP       rgba(255,255,255,0.06)   Separatorer
V6_BG        #000      App-bakgrund

Blå (iOS system)   #0a84ff   Länkar, Avbryt-knappen
```

### Typografi

Font stack: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', system-ui, sans-serif`

```
Large Title    34px / 700 / letter-spacing -0.8px   "Uppföljning"
H1             30px / 700 / letter-spacing -0.8px / line-height 1.05   Objektnamn
H2             20px / 700 / letter-spacing -0.3px   Sektionstitlar
Primär siffra  32px / 700 / letter-spacing -0.8px   Maskinkort m³-tal
Body           17px / 600 / letter-spacing -0.2px   Objekttitlar, sektionstoggles
Body regular   16px / 600 / letter-spacing -0.2px   Listtitlar
Meta           13px / 500   Meta-rader
Caption        12px / 400-500   Sekundär info
Micro          11px / 600 / letter-spacing 0.04-0.08em / UPPERCASE   Sektionsrubriker
```

Alla siffror: `font-variant-numeric: tabular-nums`.

### Spacing

Genomgående iOS-mässigt: 16px horisontell padding som grund, 20px på vissa kort. 24px på detaljvyn för mer whitespace. Vertikal rytm: 8 / 12 / 14 / 16 / 20 / 24.

### Border-radius

- Liten rad (oskotat, sök, segmented): 9–12
- Kort: 14–16
- Cirklar / pricks: 50%

### Skuggor

Knappt använda. Bara segmented control har subtil `0 1px 2px rgba(0,0,0,0.2)` på aktivt segment.

## Interaktioner

- **Oskotat-rad**: tap → expanderar + visar tre kategorirader. Tap på kategorirad → sätter filter på listan och kollapsar.
- **Oskotat-filter aktivt**: chip överst visar "Oskotat · [typ]" med "Rensa"-knapp. Segmented control göms.
- **Objekt-tap**: öppnar detaljvyn (full-screen, z-index 50, bakgrund svart).
- **< Uppföljning** i detaljvyn: tillbaka till listan, filter-state bevaras.
- **Segmented control**: sätter `typ`-filter. Grot visar bara objekt där `grotSkotning===true`.
- **Sökbar**: fokus → aktiv state, "Avbryt" avslutar sökning och rensar.
- **Visa avslutade**: togglar visning av avslutade objekt som egen grupp längst ner.
- **Kollapsade sektioner i detalj**: tap → öppnar/stänger, chevron roterar.

## Filstruktur

```
source/
  Uppfoljning_v6.html           Demo-skal (två iPhone-ramar sida vid sida)
  Uppfoljning_v6_List.jsx       Listvyn + Oskotat + sök + segmented
  Uppfoljning_v6_Detail.jsx     Detaljvyn med alla sektioner
  Uppfoljning_v4_Data.jsx       Mockdata (OBJEKT_V4)

screenshots/
  phones.png                     Lista + detalj sida vid sida
  02-list-oskotat-open.png       Listan med Oskotat expanderat
  03-detail-expanded.png         Detaljvyn med flera sektioner öppna
```

## Data-modell

Mockdatan i `Uppfoljning_v4_Data.jsx` visar vilka fält komponenterna förväntar sig. Viktiga fält:

```
{
  vo_nummer, namn, typ ('slutavverkning'|'gallring'),
  status ('pagaende'|'avslutat'),
  areal, agare,
  skordareModell, skordareStart, skordareSlut, skordareLastDate,
  skotareModell, skotareStart, skotareSlut, skotareLastDate,
  operatorSkordare, operatorSkotare,
  volymSkordare, volymSkotare,
  grotSkotning, egenSkotning, externSkotning,
  // Produktivitet:
  skordareM3G15h, skordareStammarG15h, skordareMedelstam, flertradAndel,
  skotareM3G15h, skotareLassG15h, skotareSnittlass, skotningsavstand,
  // Per dag:
  prodSkordarePerDag: [{datum, m3}],
  lassPerDag: [{datum, m3, lass}],
  // Trädslag & sortiment:
  tradslag: [{namn, pct}],
  sortiment: [{namn, m3}],
  // Tid:
  skordareG15h, skordareG0, skordareTomgang, skordareKortaStopp, skordareRast, skordareAvbrott,
  skotareG15h, ... (samma för skotare)
  // Diesel:
  dieselTotal, skordareL, skotareL,
  // Avbrott:
  avbrottSkordare: [{orsak, typ, antal, tid}], avbrottSkordareTotalt,
  avbrottSkotare, avbrottSkotareTotalt,
  // Extern skotning:
  externForetag, externPris, externAntal,
}
```

## Status-logik

"Vad händer just nu" härleds från datum-fälten. En aktivitet räknas som "aktiv" om senaste datum är inom 7 dagar. Se funktionen `v6Status()` i `Uppfoljning_v6_List.jsx`.

**Statusprioritering (i listan):**

1. `skordare` — skördaren är aktiv (senaste datum inom 7 dagar, ej slut)
2. `skotare` — skördaren klar, skotaren aktiv
3. `vantar` — skördaren klar, skotaren inte aktiv, m³ kvar att skota (= oskotat)
4. `pagaende` — tilldelad men inget hänt än
5. `done` — `status === 'avslutat'`

**Oskotat-dagar** beräknas som `(idag - skordareSlut)` i dagar. Visas bara på `vantar`-rader där `skordareSlut` finns.

## Att tänka på vid implementation

- **Tabular numerals** överallt där siffror visas — annars hoppar det när värden ändras.
- **Safe area** i iOS: nav-bar ska respektera statusbar (använd `SafeAreaView` eller motsvarande i React Native).
- **Haptic feedback** är lämplig på primära tap-actions (oskotat-toggle, öppna objekt, segmented control) — inte specat i designen men rekommenderas för iOS-känsla.
- **List performance**: om antal objekt växer — använd `FlatList` / `VirtualizedList`.
- **Färgprickar**: `borderRadius: 50%` på kvadratiska element för att få cirklar, även om SVG kan vara tydligare.
- **Svensk lokalisering**: datum formaterade som "3 nov" (ej engelska "Nov 3"). Se `v6Fmt()`-funktionen.

## Referenser till tidigare versioner

Tidigare iterationer (v2–v5) finns i `ui_kits/skogsystem-app/` i designprojektet och visar utvecklingen av designspråket. V6 är den slutgiltiga versionen.
