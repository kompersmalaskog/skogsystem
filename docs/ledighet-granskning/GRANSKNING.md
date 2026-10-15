# Ledighetsvyn — designgranskning (steg 1, ingenting byggt)

2026-10-13 · `/ledighet` mot Arbetsrapport (måttstocken) · bredder 390 / 1024 / 1440

**Inget i repot är ändrat.** Allt nedan är läst ur koden och mätt i en riktig webbläsare. Skärmbilderna ligger i den här mappen (`fore/`, `arbetsrapport/`, `monster-skiss/`).

## Läs det här först

1. **Ledighet är en annan app.** Den har ett eget tema (`app/ledighet/_components/tema.ts`) och importerar ingenting ur `lib/design/tokens.ts`. Annan bakgrund (`#111110`, Arbetsrapport `#000`), andra nyanser av grönt, rött, blått och orange, en rosa färg (`#BE185D`) som bara finns här, 10 textstorlekar (Arbetsrapport: 6), vikt 500 på 11 ställen (finns inte i systemet) och 7 radier utanför skalan.
2. **Bred skärm: ledighet är en smal pelare, Arbetsrapport är utsträckt.** Ingen av dem hanterar tre bredder. Arbetsrapport har fyra olika bredder i en och samma app (se avsnitt 3), så ledighet kan inte "ärva rakt av" — det finns inget enhetligt att ärva. Därför ett förslag (avsnitt 3), som väntar på ditt ok.
3. **Värst på iPad/dator är Schema-fliken:** ett 824 px brett rutnät instängt i en 448 px kolumn. På 1440 syns 9 av 21 dagar, med horisontell scroll, och ~500 px tomt på varje sida.
4. **Två saker jag stannar vid och flaggar** (rör beteende, hör inte hemma i en designfix) — se avsnitt 5.

---

## 1. Rangordnad lista — skillnader mot Arbetsrapport

Tid: 15 min / 1 h / halvdag / dag+. Rad-nummer är i `app/ledighet/…` om inget annat anges.

### KRITISKT

**K1 · Bred skärm — Schema är trasig, resten är en pelare** · 1 h komponent + 1 h införande · *väntar på mönstret (avsnitt 3)*
`page.tsx:43` låser allt till `maxWidth: 480`. `SchemaVy.tsx:12-14` bygger ett rutnät på 110 + 21 × 34 = **824 px** som ska rymmas i 448. Bilder: `fore/ledighet-schema-1440.png`, `…-1024.png`.

**K2 · Eget tema i stället för tokens** · tema.ts: 1 h · svep över alla filer: halvdag
`tema.ts` ersätts av tokens. Eftersom *alla* ledighetsfiler läser färg och `ff` därifrån är det ett byte på ett ställe för färgerna, resten är storlekar/radier/avstånd per fil.

| | Ledighet | Arbetsrapport (tokens) |
|---|---|---|
| Bakgrund | `#111110` | `FARG.bg` `#000000` |
| Grön / röd / blå / orange | `#22c55e` `#ef4444` `#3b82f6` `#f97316` | `#30d158` `#ff453a` `#0a84ff` `#ff9f0a` |
| Extra färger | gul `#eab308`, rosa `#BE185D` (Nekad), toast `#991b1b`, `#fb923c`, `#fca5a5` | finns inte |
| Textstorlekar | 9, 10, 11, 12, 13, 14, 15, 16, 17, 26 (41 användningar utanför skalan 32/30/20/17/13/11) | 6 steg |
| Vikter | 400, **500 ×11**, 600, 700 | 400, 600, 700 |
| Radier | 2, 3, 5, 8, 10, 12, 14, 16, 20, `20 20 0 0` | 10 / 12 / 16 |
| Avstånd | 6, 9, 10, 13, 14, 18, 20, 22 m.fl. | 4/8/12/16/24/32 |

**K3 · Träffytor under 44 px — också den viktigaste knappen** · 1 h
Uppmätt i webbläsaren (390 px): **"+ Ansök om ledighet" 38 px** (vyns enda primära handling), Ändra 36, Ta bort 36, Historik-raden 28, månadspilar i kalendern 34, Schema-pilar 34, "Lägg till stopp" 38, Avbryt 41, och **stoppblocken i Schema 20 px höga** — det är de godkännaren trycker på för att ta bort ett stopp (`SchemaVy.tsx:116,258`). Maskinen skakar; skillen kräver 44, primärknapp 48.

**K4 · Arket (sheet) är byggt på ett annat sätt än Arbetsrapports** · halvdag
Bild: `fore/ledighet-ark-viewport-390.png`, `…-1024.png`.
- **Skicka-knappen syns inte.** Mätt med period vald (knappens överkant mot skärmens höjd): **390×844** 805 px utan krock-varning (nederkanten 846 = in i hemindikatorn), 852 med varning (8 px under vikningen); **1024×768** 860–883 px, alltså **92–115 px under vikningen**; **1440×900** 875–899 px, i kanten. Kalendern tar 6 rader à 47 px (telefon) resp. 60 px (iPad/dator). Du måste scrolla i arket för att hitta vyns enda knapp.
- **Ingen hemindikator-hänsyn:** `padding: 24px 20px 32px` (`AnsokFormular.tsx:145`, `StoppFormular.tsx:117`). Skillen (regel 4): `medSafeBotten()`. På iPhone ritas knappen in i hemindikatorn.
- Radie 20 (ska vara 16), bredd 480 (Arbetsrapport 520), ingen `tona-opacity`/`sheet-upp`, grabber 40×4 i `t4` (ska vara 36×4 `FARG.fyllning`), z-index 5000.
- **Avbryt** står nederst i grå text vänster om knappen. I Arbetsrapport (PeriodForm) står den uppe till höger på rubrikraden som `KNAPP.lank`.
- **Primärknappen** är blå, 10 px radie, hugger höger, auto-bredd. Arbetsrapport: vit på svart, helbredd, 48 px, 12 px radie, och EN per skärm.

**K5 · Läsfel visar något falskt** · 15 min (visning) · se även S3
Bild: `fore/ledighet-lasfel-1440.png`. När ansökningarna inte går att läsa står saldokorten ändå och säger **"Kopplas via Fortnox"** och **"Inte satt ännu — admin sätter ditt saldo"**. Det är fel: vi vet inte, läsningen misslyckades (`useLedighetData.ts:35-40` avbryter före `setSaldo`, och `SaldoKort` får `saldo = null` utan att veta varför). CLAUDE.md: *ärlig data eller ingen data.* Fixen är ren visning (`SaldoKort` får `lasfel`, visar "—"). Själva felrutan är dessutom röd box med ram och texten "ladda om appen" utan knapp — Arbetsrapport säger vad man ska göra **och ger knappen** ("Kunde inte läsa dagen. Kontrollera uppkopplingen och försök igen." + sekundärknapp "Försök igen"). `hamtaOm` finns redan i hooken.

### VÄRT DET

**V1 · Listor: separata kort med kantremsa → grupperad lista** · halvdag
Ledighet: varje ansökan är ett eget kort med ram, 3 px färgad vänsterkant **och** en färgad piller-badge med ikon (`AnsokanKort.tsx`). Tre färgkanaler för samma sak. Arbetsrapport: ett `KORT` per grupp, rader med `RAD` och hårlinje mellan, status som prick/ord. Förslag: en grupp per rubrik (Väntar på besked / Kommande / Historik), en rad per ansökan: period (`TYP.listtitel`), "5 arbetsdagar · Semester" (`TYP.meta`, `text2`), status som prick + ord till höger. Ändra/Ta bort ligger kvar som rad-åtgärder.

**V2 · Rubrikrad och flikar** · 1 h
- Flikarna Mig/Schema är underlinjeflikar kant till kant (`page.tsx:27-40`). Appens mönster för "samma data, olika vinkel" är **flikkontrollen i Min tid** (`Arbetsrapport.tsx:3968-3974`): `FARG.linje`-bakgrund, 4 px padding, 44 px knappar, vald = `FARG.fyllning` + 600. Bild: `monster-skiss/mig-skiss-*.png`.
- Sektionsetikett: ledighet 10 px/700/`rgba(255,255,255,.4)` + egen `labelStyle`; Arbetsrapport `TYP.micro` 11/600 `FARG.text2`.
- "Mina ansökningar" är 16 px; sektionsrubrik är `TYP.rubrik` 20.
- Ingen egen H1 behövs: toppfältet säger "Ledighet", som Dag-vyn låter toppfältet säga "Arbetsrapport".

**V3 · Knapphierarki och placering** · 1 h
| Var | Idag | Ska vara |
|---|---|---|
| Ansök om ledighet | blå fylld, höger i rubrikraden | `KNAPP.primar`, helbredd, under saldot (vyns enda primära) |
| Skicka ansökan / Spara stopp | blå resp. röd fylld, höger | `KNAPP.primar` helbredd |
| Godkänn / Neka (×4 i listan) | grön fylld + mörkröd fylld | Godkänn `KNAPP.sekundar`, Neka `KNAPP.destruktiv` (text). Skillen: högst en primär per skärm. |
| Lägg till stopp | röd-dim fylld | `KNAPP.sekundar` (röd är för "radera") |
| Rensa | konturknapp | `KNAPP.tertiar` (konturknappar finns inte) |
| Ändra / Ta bort | grå/röd text, 36 px | `KNAPP.tertiar` / `KNAPP.destruktiv`, 44 px |
| Avbryt | grå text nederst | `KNAPP.lank` överst i arket |

**V4 · `window.confirm` → inline tvåstegsbekräftelse** · 30 min
`MigVy.tsx:60` och `SchemaVy.tsx:60` använder webbläsarens dialog. Arbetsrapport (PeriodForm): "Ta bort posten? Nej / Ja, ta bort" på plats. Bekräftelsen finns kvar — det är ingen beteendeändring, bara hur den ser ut.

**V5 · Felmeddelanden: en stil** · 30 min
Ledighet har tre: röd pill-toast fixed överst (`Toast.tsx`, `#991b1b`), röd ruta med ram (läsfel), och rosa/orange rutor inne i arket (`dubbelbokning`, `kollision`). Arbetsrapport har en: `TYP.meta` i `FARG.rod`/`FARG.orange` direkt under det som gick fel; viktigt-kort som `varningsKort` (ikon i statusfärg + ordet). Samma ska gälla här, och toasten försvinner efter 5 s medan Arbetsrapports fel står kvar vid det som gick fel.

**V6 · Kontrast i solljus** · 15 min (följer av K2)
Ledighets gråa (`t3` 40 % vit) ger **3,8 : 1** mot kortet — Arbetsrapports `text2` ger 5,2 : 1. `t4` (20 %, används till hjälptexten i Schema och Schema-etiketterna) ger **1,85 : 1**. "Nekad" i rosa på sin egen dim-bakgrund: **2,6 : 1**. Vit text på ledighets blå knapp: 3,7 : 1.

**V7 · Vald dag i kalendern är blå fylld** · 30 min
`ValjKalender.tsx:122`: vald start/slut = blå cirkel, spannet = blå dim. Skillen: *blått är aldrig knappfyllning, aldrig vald rad.* Förslag: ändpunkterna vit fyllning + svart siffra (som valda typknappar), spannet `FARG.fyllning`, idag = blå ring (som i Arbetsrapports kalender).

**V8 · Ark-formulär: gruppera som iOS Settings** · halvdag
Typ → period → kommentar som grupperade avsnitt med `TYP.micro`-rubrik; "Välj typ + datum för att skicka" ersätts av orange förklaring + `INAKTIV` (PeriodForm: *"Trakt krävs för …"*); typknapparna med 1 px ram → `KNAPP.sekundar`/`primar`; "Rensa" flyttas in i period-raden som `KNAPP.tertiar`. Kalenderns celler är `aspect-ratio: 1` (47 px på telefon, 60 px på iPad/dator): en fast radhöjd på 44 px gör kalendern lägre på iPad/dator och hjälper K4, men löser den inte ensam — knappen behöver också ligga fast nederst i arket.

**V9 · Ikoner** · 30 min
Handritade SVG:er på 11–12 px (`AnsokanKort.tsx:9-37`) och text-tecken (`›`, `‹`) som pilar. Arbetsrapport: Material Symbols, `IKON.text` 18 / `IKON.rad` 22.

**V10 · Tomma och laddande tillstånd** · 15 min
Ledighet: "Laddar..." (tre punkter, 40 px luft) och tomt i en ruta med ram. Arbetsrapport: "Laddar…" i `TYP.meta`/`text2`, tomt som text utan ram — *med förklaring och vad som fyller listan* (ledighets text är bra: "Inga ansökningar ännu. Tryck … för att skapa din första"). Skillen: inga spinners utan kontext → "Läser dina ansökningar…". Behåll texten, ta bort ramen.

**V11 · Saldokorten** · 30 min — *beslut: se avsnitt 6*
Två lika stora kort med 26 px tal (utanför skalan). Skillen: ett tal per vy är huvudsaken, `TYP.tal` 32. Förslag: ett `KORT` med två kolumner, båda `TYP.tal`, "uppdaterad 1 okt" som en rad under.

**V12 · Rotelementet** · 15 min
`page.tsx:20`: `minHeight: calc(100vh - 56px)` — ett naket 56 (toppfältets mått). Skillen/`LAYOUT.topbar`: aldrig 56 i en vy. `page.tsx:43`: `paddingBottom: 100` finns för ett bottennav som inte finns här; → `AVSTAND.xxl`.

**V13 · Schema-rutnätets text** · 30 min (+ ingår i K1)
Veckodagsbokstäver 9 px, månadsnamn 9 px, "MASKINER" 10 px, personnamn 13 px, maskinnamn 11 px, teckenförklaring 11 px i 1,85 : 1. Skalan går ner till 11 (`TYP.micro`), och `text2`.

### NICE-TO-HAVE

**N1** · 15 min — Historik-raden (28 px) som hel rad ≥ 44 px (`KNAPP.tertiar`, med `chevron_right`).
**N2** · 30 min — `<Tillstand>` runt laddar → innehåll så listan tonar in i stället för att hoppa.
**N3** · 15 min — Godkänn-sektionen: gul ruta (`#eab308`, finns inte i temat) → `KORT` med orange prick + "4 att godkänna".
**N4** · halvdag — *Informationsarkitektur, Martins beslut:* admin-uppgiften "att godkänna" bor i förarens egen "Mig"-vy. Skillen: en sak per skärm. Jag har inte rört den.

---

## 2. Ledighet idag vid 390 / 1024 / 1440

| | 390 (telefon) | 1024 (iPad liggande) | 1440 (stor skärm) |
|---|---|---|---|
| **Mig** | Fungerar. Full bredd minus 16, korten läsbara. `fore/ledighet-mig-390.png` | **En 448 px-pelare i ett 1024 px-hav.** Flikraden är däremot kant till kant, så flikarna sitter på x≈260 och x≈760 medan innehållet börjar på x≈288. Raden och kolumnen är inte samma sak. `fore/ledighet-mig-1024.png` | Samma pelare, nu 31 % av bredden; flikarna 700 px isär. `fore/ledighet-mig-1440.png` |
| **Schema** | 6 dagar syns, 21 finns; sticky namnkolumn och scroll i sidled. Fungerar, men 9–12 px text. `fore/ledighet-schema-390.png` | 9 dagar av 21 i en 448 px ruta, ~290 px tomt på varje sida. `…-schema-1024.png` | **9 av 21 dagar**, ~500 px tomt på varje sida; Anders ledighet klipps vid kanten. `…-schema-1440.png` |
| **Ark** | Fullbredd; knappen i/under vikningen. `fore/ledighet-ark-viewport-390.png` | 468 px-ark mitt på skärmen; 768 px hög skärm → knappen 92–115 px under vikningen. `…-1024.png` | Samma ark mitt på 1440; knappen i kanten. `…-1440.png` |

**Bedömning iPad (liggande, 1024): "smal pelare i svart hav", inte utsträckt.** Och det sticker mer än på 1440, eftersom 1024 är en skärm man håller i handen: man ser ytorna runt och de är tomma. Schema-fliken är den enda som direkt *förlorar funktion* på bred skärm (man ser mindre än man skulle behöva, trots att det finns plats).

---

## 3. Hur Arbetsrapport hanterar tre bredder — och förslaget

### Arbetsrapport idag (bilder i `arbetsrapport/`)

| Vy | Kodens bredd | 1440 |
|---|---|---|
| **Dag** (`Arbetsrapport.tsx:3467`) | ingen `maxWidth` | **Kortet 1408 px brett; "Objekt" till vänster och "Karatorp 1:4" 1 300 px bort.** Stämmer-knappen 1408 px. `dag-kvall-1440.png` |
| **Kalender** (`:6888`) | ingen `maxWidth` | Rutor på 200 px; månadskortet 1408 px. `kalender-1440.png` |
| **Min tid** (`:3976`) | ingen `maxWidth` | Flikkontrollen och staplarna över hela bredden. `mintid-1024.png` |
| **Lön, översikt** (`:5107`) | `maxWidth: 448` | **Pelare**, centrerad. `lon-1440.png` |
| **Lön, detaljer** (`:4921`) | `maxWidth: 640` | Pelare, 640 |
| **Redigera** (`:5765`) | `shell` (`width:100%`) | Full bredd (ur koden; jag nådde inte vyn i testet) |
| **Sheets** | 500 / 520 / 560 (`:6600`, `:1938`, `:6663`) | Bottenförankrad, centrerad |
| **Bottennav** (`:250`) | `position: fixed; width: 100%` | Fem flikar, ~280 px mellan varje |

**Slutsats: Arbetsrapport hanterar inte de tre bredderna.** På telefon är den förebilden. På iPad/dator är den utsträckt och gles (Dag, Kalender, Min tid) utom Lön som är en pelare — fyra olika bredder för samma app, ingen regel. Att "ärva rakt av" skulle betyda att ledighet blir utsträckt och att Schema-problemet *försvinner inte* (rutnätet är ju fortfarande för brett för en pelare).

### Förslag: EN regel — "Kolumnen"

En komponent (`components/design/VyKolumn.tsx`) och två mått i `tokens.ts`:

- **`KOLUMN.smal = 640`** — listor, kort, formulär (Dag, Lön, Min tid, ledighet "Mig").
- **`KOLUMN.bred = 1120`** — rutnät, tidslinjer, kalendermånad (Schema, Kalender).

Regler:
1. **Allt i vyn bor i samma centrerade kolumn** — flikraden, saldot, listan. Aldrig kant till kant (toppfältet och bottennavet är globala och undantagna).
2. **Under ~670 px händer ingenting.** 16 px sidmarginal, full bredd — telefonen är orörd.
3. **Rutnät får bred kolumn och fyller den:** antal dagar i Schema = så många hela veckor som ryms (21 på 1024, 28 på 1440) i stället för fast `FONSTER = 21`.
4. **Sheets: 520, bottenförankrade, centrerade** — det Arbetsrapport redan gör mest. 500 och 560 blir 520.
5. **Flikraden är Min tids flikkontroll**, inuti kolumnen.

Varför 640: en läsbredd där kort och listor håller ihop — en label och dess värde är aldrig mer än ~600 px från varandra (i dag upp till 1 300 px på Dag). Varför inte lista+detalj (två paneler): Mig och Schema är *alternativ*, inte lista och detalj; en tvåpanelsvy skulle kräva ny informationsarkitektur, och skulle aldrig kunna bli samma regel som Arbetsrapports Dag/Lön/Kalender.

**Kostnad och effekt:**
- I ledighet: 1 h komponent + 1 h införande (ingår i K1).
- **Effekt på hela appen när Arbetsrapport senare införs:** Dag/Kalender/Min tid skulle krympa från 1408 till 640 px på dator och iPad (telefon oförändrad). Det är ett synligt beslut — därför ditt val. Jag bygger det **bara i ledighetsvyn**.

### Så ser ledighet ut i mönstret (skiss, ej byggt)

`monster-skiss/` — `mig-skiss-{390,1024,1440}.png` och `schema-skiss-{390,1024,1440}.png`. **Skisserna är CSS injicerad i den körande vyn** (ingenting i repot): bakgrund `#000`, kolumn 640/1120, flikkontrollen i kolumnen. Det de *inte* visar: tokens-färgerna, grupperade listor och fler dagar i Schema (skissen visar fasta 21 dagar, vilket är varför rutnätet på 1440 slutar vid ~1000 px i en 1120 px kolumn — i förslaget fyller det kolumnen).

| | 390 | 1024 | 1440 |
|---|---|---|---|
| Mig | som idag + flikkontroll | 640 px-kolumn, 192 px luft per sida | 640 px-kolumn, 400 px luft per sida |
| Schema | som idag, 6 dagar + scroll | **alla 21 dagar syns, ingen scroll** (kolumn 992 px) | **alla 21 dagar syns, kolumn 1120 px**; 28 dagar i förslaget |

---

## 4. Vad som ingår i steg 2 (när du säger ok)

En PR mot `main`: **K1–K5 + V1–V13**. Ingen ny funktion, ingen ändring av spar-/godkänn-flödet, `useLedighetData`/`useSchemaData` och alla `supabase`-anrop orörda.

Totalt ungefär **1,5–2 dagar**. Ordning om du vill dela: (1) tema.ts → tokens + knappar + träffytor (K2, K3, V3, V6, V12) — störst enhetlighet per timme; (2) Kolumnen + Schema (K1, V13); (3) ark (K4, V7, V8); (4) listgrupperingen (V1).

Test enligt överenskommelse: renderingstest för det ändrade, `tsc` på ändrade filer jämfört mot baslinje, webbläsarkontroll före/efter vid 390/1024/1440. Inga mutationskontroller. Webbläsare och dev-server stängs efteråt.

## 5. Stoppflaggor — rör beteende, byggs INTE i designfixen

**S1 · "Ansök om ledighet" är aktiv när ansökningarna inte kunde läsas.** Då är `ansokningar` en tom lista, och dubbelbokningskontrollen i `AnsokFormular` (`useMemo dubbelbokning`) jämför mot ingenting. Man kan alltså skicka en överlappande ansökan utan varning. Att spärra knappen vid läsfel är en beteendeändring. *Din fråga: ska den spärras? Jag föreslår ja (och att K5:s felruta får "Försök igen").*

**S2 · "Neka" saknar bekräftelse.** Skillen: irreversibla åtgärder kräver bekräftelse. Det finns ingen "ångra neka" i vyn. Att lägga till bekräftelse är beteende. *Din fråga.*

**S3 · Saldo och ansökningar läses i samma anrop och faller ihop.** `useLedighetData.ts:35-40`: om *en* av de två läsningarna felar förkastas båda. K5 lagar bara visningen ("—" i saldot); att läsa dem var för sig vore en hook-ändring.

Allt annat i listan går att göra utan att röra datalogiken.

## 6. Beslut jag behöver från dig

1. **Mönstret "Kolumnen"** (smal 640 / bred 1120, rutnät fyller bredden, ledighet först) — ok, eller något annat?
2. **Saldokorten:** två tal med lika vikt i ett kort (mitt förslag), eller ett huvudtal (Semester) och ATK som rad?
3. **S1/S2:** ska jag få spärra Ansök vid läsfel och lägga bekräftelse på Neka (egen liten PR, inte designfixen)?
4. **Admin-uppgiften i Mig (N4):** ligger kvar tills vidare.

## Om skärmbilderna

Ingen riktig inloggning är möjlig härifrån. Bilderna är den **riktiga appen** (`next dev`, riktig layout, riktiga komponenter, Chromium 390/1024/1440) mot en **fejkad Supabase med påhittad data** (Stefan/Oskar/Joacim m.fl., inga prod-uppgifter). Typsnitt och ikoner är de riktiga. Det som en fejk *inte* bevisar: RLS, riktiga ansökningar, riktiga tider. Arbetsrapport-bilderna kör med klockan satt till 18:00 (kvällsläge).
