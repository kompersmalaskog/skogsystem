# Arbetsrapport på telefon, iPad och stor skärm — granskning (steg 1, ingenting byggt)

2026-10-14 · Dag, Kvällsrapport, Redigera, Min tid, Mitt avtal, Inställningar · 390 / 820 / 1180 / 1440 px

**Status 2026-10-14: byggt i samma PR efter Martins beslut — se avsnitt 8 (utfall, pixeljämförelse på 390 px, vad som återstår).** Avsnitt 1–7 är granskningen som den skrevs, före bygget; mätvärdena där är "idag" = före.

(Granskningen i sig ändrade ingen kod. Allt i avsnitt 1–7 är mätt i den riktiga appen och läst ur koden.)

## Läs det här först

1. **Arbetsrapport har ingen breddregel.** Alla sex vyer sträcks kant till kant på 820, 1180 och 1440. På 1440 är en rad "Objekt … Hössjömåla" **1 376 px bred**: etiketten sitter längst till vänster och värdet längst till höger. Telefonen är förebilden, resten är en utdragen telefonvy.
2. **Förslaget är det som redan är beslutat för ledighet: Kolumnen** (`KOLUMN.smal` 640, `bred` 1120, ark 520, under 670 px händer ingenting). Komponenten och måtten finns redan i repot (`components/design/VyKolumn.tsx`, `lib/design/tokens.ts`). Jag föreslår inget nytt mönster.
3. **Ett fel som drabbar telefonen också:** varje vy är minst **56 px högre än skärmen** (rotens `minHeight: 100vh` + layoutens `paddingTop: 56`). På Redigera ligger "Tillbaka" därför halvt under kanten på alla bredder. Rättas på 15 minuter och gör telefonen bättre.
4. **Tryckytor under 44 px finns kvar på telefonen** (Vila-flikens segment 33 px, "Se alla nätter →" 17 px). De försvinner inte av en breddregel.
5. **Det blir inte sämre på telefon:** Kolumnen är en `max-width` som är större än skärmen under 670 px. Jag har inte mätt det på 390 med förslaget påslaget (skisserna är bara 820/1180/1440), så det är en slutsats ur CSS:en, inte ett mätvärde.

---

## 1. Hur det mättes (och vad det inte bevisar)

- **Riktiga appen** (`next dev`, riktig layout, riktiga komponenter, riktiga typsnitt och ikoner, Chromium) mot en **attrapp av Supabase med påhittad data** ("Test Förare", påhittade objekt). Ingen riktig inloggning är möjlig härifrån. Inloggningen går via appens egen `/login` mot attrappen.
- Klockan satt till **11:00** (Dag, pass pågår) respektive **18:00** (Kvällsrapport, pass klart), svensk tid.
- Bredder: **390×844** (telefon, 2×), **820×1180** (iPad 11" stående), **1180×820** (iPad 11" liggande), **1440×900** (dator).
- `/api/fortnox/employee-details` och `/api/lon/min-manad` svarar med påhittade värden (Fortnox finns inte härifrån).
- **Bevisar inte:** riktig iPad-Safari (adressfält, hemindikator, tangentbord), riktig data (perioddagar, frånvaro, flera maskiner, många extra poster), RLS. Ett enda scenario: en vanlig maskindag.
- **Ingår inte:** Kalender och Lön (granskades vid 390/1024/1440 i ledighetsgranskningen), formulärarken (Period, Ändra tider) och Starta-flödet.

## 2. Skärmbilder: varje vy i varje bredd

Kontaktbladen visar de fyra bredderna sida vid sida, **i samma skala** så att relativa bredder syns. Originalen (och en "botten"-bild där sidan scrollar) länkas i tabellen.

| Vy | 390 | 820 | 1180 | 1440 |
|---|---|---|---|---|
| Dag (11:00, pass pågår) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/dag-390.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/dag-820.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/dag-1180.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/dag-1440.png?raw=true) |
| Kvällsrapport (18:00) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/kvall-390.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/kvall-820.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/kvall-1180.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/kvall-1440.png?raw=true) |
| Kvällsrapport, arket "Något fel?" | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/kvall-ark-390.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/kvall-ark-820.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/kvall-ark-1180.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/kvall-ark-1440.png?raw=true) |
| Redigera (Hela dagen) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/redigera-390.png?raw=true) · [botten](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/redigera-390-botten.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/redigera-820.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/redigera-1180.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/redigera-1440.png?raw=true) |
| Min tid, Översikt | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-oversikt-390.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-oversikt-820.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-oversikt-1180.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-oversikt-1440.png?raw=true) |
| Min tid, Saldon | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-saldon-390.png?raw=true) · [botten](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-saldon-390-botten.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-saldon-820.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-saldon-1180.png?raw=true) · [botten](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-saldon-1180-botten.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-saldon-1440.png?raw=true) |
| Min tid, Vila | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-vila-390.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-vila-820.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-vila-1180.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/mintid-vila-1440.png?raw=true) |
| Mitt avtal | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/avtal-390.png?raw=true) · [botten](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/avtal-390-botten.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/avtal-820.png?raw=true) · [botten](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/avtal-820-botten.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/avtal-1180.png?raw=true) · [botten](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/avtal-1180-botten.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/avtal-1440.png?raw=true) · [botten](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/avtal-1440-botten.png?raw=true) |
| Inställningar | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/installningar-390.png?raw=true) · [botten](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/installningar-390-botten.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/installningar-820.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/installningar-1180.png?raw=true) · [botten](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/installningar-1180-botten.png?raw=true) | [bild](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/installningar-1440.png?raw=true) · [botten](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/installningar-1440-botten.png?raw=true) |

Kontaktblad (alla bredder per vy): [Dag](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad/dag.png?raw=true) · [Kväll](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad/kvall.png?raw=true) · [Kvällsarket](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad/kvall-ark.png?raw=true) · [Redigera](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad/redigera.png?raw=true) · [Min tid Översikt](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad/mintid-oversikt.png?raw=true) · [Saldon](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad/mintid-saldon.png?raw=true) · [Vila](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad/mintid-vila.png?raw=true) · [Mitt avtal](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad/avtal.png?raw=true) · [Inställningar](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad/installningar.png?raw=true)

## 3. Mätvärden

Samma vy på alla bredder (Kvällsrapport; övriga vyer ligger inom ±30 px):

| | 390 | 820 | 1180 | 1440 |
|---|---|---|---|---|
| Textens spännvidd (vänsterkant → högerkant) | 342 px | 772 px | 1 132 px | 1 392 px |
| Bredaste kortet | 358 | 788 | 1 148 | 1 408 |
| Etikett → värde i en rad ("Objekt … Hössjömåla") | 326 | 756 | 1 116 | 1 376 |
| Sidan högre än skärmen, vyer med kort innehåll (Dag, Kväll, Arket, Redigera, Min tid Översikt/Vila) | **+56** | **+56** | **+56** (Översikt +60) | **+56** |
| Längsta löpande textrad i Mitt avtal (tecken per rad) | 45 | 67 | **134** | **134** |
| Bottennavet: avstånd mellan flikarnas mitt (räknat ur `space-around` med 64 px breda knappar; 282 mätt på 1440-bilden) | 72 | 158 | 230 | 282 |

Tryckytor under 44 px (utöver det globala toppfältets hemknapp, 36×36):

| Var | Mått | Gäller även telefon? |
|---|---|---|
| Min tid → Vila: segmenten 7 dagar / 30 dagar / Månad / År | 88×**33** (390), 350×**33** (1440) | ja |
| Min tid → Vila: "Se alla nätter →" | 96×**17** | ja |
| Redigera: "Åkte hem sjuk, VAB eller föräldraledig?" | 303×**22** (när den ryms på en rad, 820 och uppåt) | nej: på 390 bryts den i två rader och blir 44 px, se V4 |
| Inställningar: reglagen | 51×**31** | ja (iOS-standardmått, rimligt) |
| Toppfältets hemknapp (global) | 36×**36** | ja |

Dag, Kväll, Kvällsarket, Min tid Översikt, Saldon och Mitt avtal har inga andra tryckytor under 44 px.

## 4. Rangordnad lista

Tid: 15 min / 1 h / halvdag / dag+. Rad-nummer är i `components/arbetsrapport/Arbetsrapport.tsx` om inget annat anges.

### KRITISKT

**K1 · Ingen breddregel: allt sträcks på iPad och dator** · halvdag (uppskattat från skisserna, se avsnitt 5)
Vad blir fel: **utdraget**. Samma sak i alla sex vyer. Etikett och värde sitter 1 300 px isär, så ögat tappar raden (Mitt avtal, Kväll, Inställningar). Staplarna i Min tid blir över 100 px breda och flikkontrollen 1 400 px. Mitt avtals hjälptext blir **134 tecken per rad** (läsbart är ca 45–75). Fältet för hemadressen i Inställningar blir 1 366 px. Orsak: `shell` (rad 137) har `width: 100%` och ingen `maxWidth`; den används på elva ställen. Bredderna som finns i koden är spridda: Lön 448 (rad 5035), Lön-detaljer 640 (rad 4849), `maxWidth` 520 på nio ställen, 500 på två och 560 på ett. **Bilder:** kontaktbladen ovan.

### VÄRT DET

**V1 · Sidan är alltid minst 56 px för hög — på alla bredder, även telefon** · 15 min
Vad blir fel: **sidan scrollar utan anledning**, och det som ligger längst ned hamnar halvt under kanten. På **Redigera** är "Stämmer" och "Tillbaka" fästa nedtill i en `minHeight: 100vh`-kolumn: "Tillbaka" är **skuren** i alla fyra bredder (se Redigera-bladet). Orsak: rotens `minHeight: "100vh"` (rad 137) plus layoutens `paddingTop: LAYOUT.topbar` (`app/layout.tsx:59`). Mätt: sidans höjd minus skärmens höjd är minst 56 i alla 36 lägen och exakt 56 i 25 av dem (resten är vyer som scrollar av egen kraft: Saldon, Mitt avtal, Inställningar, och Översikt på 1180 med +60). Samma fynd som V12 i ledighetsgranskningen. **Telefonen blir bättre, inte sämre.**

**V2 · Bottennavet: fem flikar utspridda över hela bredden, och navet täcker det nedersta** · 30 min (1 h med K1)
Vad blir fel: på 1440 är det **282 px mellan flikarnas mitt** (`position: fixed; width: 100%; justify-content: space-around`, rad 254). På iPad liggande (1180×820) och dator (1440×900) **täcker navet nedersta raden i Inställningar** ("Push-notiser" delvis, "Logga ut" ligger under skärmen utan scroll): Inställningar är 257 px (1180) respektive 177 px (1440) högre än skärmen. Förslag: bakgrunden i full bredd (som ett verktygsfält), men flikarna inuti kolumnen (`KOLUMN.smal`).

**V3 · Tryckytor under 44 px (två av dem finns också på telefon)** · 1 h
Vila: segmenten `7 dagar / 30 dagar / Månad / År` (33 px) och "Se alla nätter →" (17 px, rad 4503) är fel på telefon också. Redigera: "Åkte hem sjuk, VAB eller föräldraledig?" (22 px på iPad och dator, rad 5839). Det globala toppfältets hemknapp (36 px, `components/TopBar.tsx`) är en global komponent och ligger utanför Arbetsrapport. Maskinen skakar; skillen kräver 44 px. Reglagen (51×31) är iOS-standard och rörs inte.

**V4 · Rubrikraden i Redigera på telefon** · 15 min (ingår i V3)
På 390 bryts "Åkte hem sjuk, VAB eller föräldraledig?" i två rader och **centreras** bredvid en vänsterställd datumrubrik (se `redigera-390.png`). Länken bör ligga på en egen rad under rubriken, vänsterställd, 44 px hög.

### NICE-TO-HAVE

**N1 · "4.8 dagar" med decimalpunkt** · 5 min
Min tid → Saldon, ATK: `{atkDagar} dagar` (rad 4126) skriver JavaScript-talet rakt av, "38h (4.8 dagar)". Svenska är "4,8". Kontrollera också andra tal som inte går via en formatterare.

**N2 · Toppfältet släpper igenom text** · 15 min
`background: rgba(13,13,15,0.92)` (`components/TopBar.tsx`): vid scroll syns texten svagt bakom titeln och versionstaggen (se `installningar-390-botten.png`). Global komponent, rör fler vyer än Arbetsrapport.

**N3 · Tom yta under korten på Dag/Kväll** · inget att göra just nu
På iPad stående (820×1180) är ca 70 % av skärmen tom under innehållet. Det är rimligt för en "en sak per skärm"-vy; med Kolumnen blir sidorna tomma i stället (se avsnitt 5), det är avvägningen och den är redan tagen för ledighet.

### Fungerar och rörs inte
- **Arken** (kvällens "Vad vill du ändra?") är redan centrerade, nedtill förankrade och ungefär 520 px breda på alla bredder och lyfts inte av navet. De matchar `KOLUMN.ark`.
- **Inga sticky-rubriker** finns i de sex vyerna: bara det fasta toppfältet (56 px) och det fasta bottennavet. Inga felplacerade sticky-element hittades.
- **Inget överflöd i sidled** (`scrollWidth` = skärmbredd i alla 36 lägen).
- **Mitt avtal** och **Min tid → Saldon** på telefon är rena, läsbara och lämnas orörda.

## 5. Förslaget: Kolumnen, samma som ledighet

Beslutet 2026-10-13 (ledighet först, "bred skärm — EN regel"):

- allt i vyn bor i **en centrerad kolumn** med maxbredd — flikrad, kort, listor — aldrig kant till kant;
- **`smal` (640)** för listor, kort och formulär; **`bred` (1120)** för rutnät och tidslinjer;
- **under 670 px händer ingenting** (full bredd, sidmarginal 16 — telefonen är orörd);
- **ark är 520**, centrerade och förankrade nedtill.

Det finns redan: `lib/design/tokens.ts` (`KOLUMN`) och `components/design/VyKolumn.tsx`; ledighet använder dem (`app/ledighet/page.tsx`).

**Så ser det ut i Arbetsrapport** (skisser nedan: CSS injicerad i den körande appen, ingenting i repot; bakgrund svart, kolumnen 640, navets flikar i kolumnen, toppfältet oförändrat). Varje blad visar 820, 1180 och 1440, först idag och sedan förslaget:

| Vy | Idag mot förslag |
|---|---|
| Dag (11:00) | [skiss](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad-skiss/dag.png?raw=true) |
| Kvällsrapport | [skiss](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad-skiss/kvall.png?raw=true) |
| Redigera | [skiss](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad-skiss/redigera.png?raw=true) |
| Min tid, Översikt | [skiss](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad-skiss/mintid-oversikt.png?raw=true) |
| Min tid, Saldon | [skiss](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad-skiss/mintid-saldon.png?raw=true) |
| Min tid, Vila | [skiss](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad-skiss/mintid-vila.png?raw=true) |
| Mitt avtal | [skiss](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad-skiss/avtal.png?raw=true) |
| Inställningar | [skiss](https://github.com/kompersmalaskog/skogsystem/blob/ce441d7dff9cc9b61857f1cdf70ce83deefa53c1/docs/arbetsrapport-granskning/bilder/blad-skiss/installningar.png?raw=true) |

Skisserna i full storlek (per bredd): `bilder/skiss/<vy>-<bredd>.png` i commit `ce441d7`.

**Konsekvenser för Arbetsrapport:**
- **Etikett → värde ≤ 640 px** (idag upp till 1 376). Mitt avtals hjälptext ~70 tecken per rad i stället för 134.
- **Sidoytor:** 92 px per sida på 820, 270 px på 1180, 400 px på 1440. Det är kostnaden, och den är samma som i ledighet.
- **Kalender** (månadsrutnät) hör hemma i `bred` (1120), inte `smal`. Den ingår inte här (inte i de sex vyerna) men måste få `bred` när `shell` ändras, annars krymper rutorna från ~200 px till ~90 px.
- **Lön-översikten** (448, rad 5035) → 640. **Lön-detaljer** (640) står kvar. **Ark** 500 (rad 6491, 6510) och 560 (rad 6554) → 520.
- **Bottennavet:** bakgrunden i full bredd, flikarna i kolumnen. Toppfältet är globalt och ändras inte.

**Varför inte "lista + detalj sida vid sida" på iPad liggande:** samma skäl som i ledighetsgranskningen. Dag, Kväll, Redigera och Min tid är *alternativ*, inte lista och detalj; en tvåpanelsvy kräver ny informationsarkitektur och kan aldrig bli samma regel som resten av appen. Kalender → Redigera (en dag i en lista, ett detaljblad) är det enda stället där det vore naturligt, och det är ett eget beslut senare.

## 6. Vad ett bygge omfattar (när du säger ok)

En PR mot `main`, i två steg som kan delas:

1. **Bredd (K1, V1, V2):** `shell` → kolumn (en rad, rad 137), navets padding (en plats, rad 254), ark → 520, Lön 448 → 640, `bred` för Kalender, rotens `minHeight` → `calc(100vh - LAYOUT.topbar)`. **Halvdag.**
2. **Tryckytor och text (V3, V4, N1, N2):** 1 h + 15 min + 5 min + 15 min.

Test enligt tidigare överenskommelse: renderingstest för det ändrade, `tsc` på ändrade filer mot baslinjen, skärmbilder före/efter vid 390/820/1180/1440 (**telefonen jämförs pixel för pixel mot idag**), och en kontroll att ingenting scrollar i sidled. Inga mutationskontroller (ren layout).

## 7. Beslut jag behöver

1. **Kolumnen för Arbetsrapport** (smal 640, Kalender bred 1120, ark 520) — ok, eller något annat?
2. **Bottennavet:** flikarna i kolumnen (mitt förslag), eller hela bredden som idag?
3. **En PR eller två** (bredd, sedan tryckytor)? Jag föreslår två: bredd först, eftersom det är det som syns.
4. **Toppfältets hemknapp (36 px) och genomskinlighet (N2):** global komponent som påverkar alla vyer. Ska den med i den här sviten eller egen PR?

Allt här är mätt mot en attrapp med påhittad data. Jag har inte sett någon riktig iPad.

---

## 8. Utfall: det som byggdes (beslut 2026-10-14)

**Beslut:** (1) Kolumnen, ja: 640 / Kalender 1120 / ark 520, samma som ledighet. (2) Bottennavet i kolumnen. (3) EN PR (en PR per audit): Kolumnen + 100vh/56 px-felet + bottennavet + tryckytor ≥ 44 px + Redigeras rubrikrad + NICE-punkterna, med den här rapporten. (4) Toppfältet (hemknapp 36 px, genomskinlighet): **inte nu**, egen PR i en senare app-granskning.

### Vad som ändrades

| Fynd | Åtgärd | Var |
|---|---|---|
| K1 | Varje vys rot är kolumnen: `kolumnRot()` (smal 640 + marginaler; Kalender `bred` 1120). Lön-översikten 448 → 640, Lön-detaljer 640 (egen innerbredd borta, roten är kolumnen). Ark 500/520/560 → `KOLUMN.ark`. Svart bakgrund utanför kolumnen medan vyn är monterad (`KOLUMN_CSS`). | `lib/design/tokens.ts` (`kolumnRot`, `ROT_MIN_HOJD`, `KOLUMN_CSS`), `Arbetsrapport.tsx` |
| V1 | Rotens `minHeight` är skärmen minus toppfältet (`ROT_MIN_HOJD`) i stället för `100vh`. | samma |
| V2 | Bottennavet: bakgrunden i full bredd, flikarna i kolumnen (`max(16px, calc((100% - 640px) / 2))`). | `BottomNavBar` |
| V3 | Tryckytor ≥ 44 px: Vilas segment (33 → 44), månadspilar (30 → 44×44), "Se alla nätter →", "Visa alla →", "Dölj detaljer" (×3); Saldons "Försök igen" (×2); "Hoppa över" (×2); objekt-/maskinväljarnas "Stäng" (×2) och objektväljarens sökfält (hela fältet, inte bara texten); Inställningars valrader (klassen `valj-rad`). Luften runt de förstorade länkraderna är krympt så korten inte växer. | `Arbetsrapport.tsx` |
| V4 | Redigeras "Åkte hem sjuk, VAB eller föräldraledig?" och "Byt mot ledig dag" på egen rad, vänsterställda, 44 px (förut i löptext, 22 px, bröts och centrerades på 390). | Redigera, rubrikraden |
| N1 | Decimalkomma: "38,4h (4,8 dagar)", "= 4,8 dagar", "Du valde ledig tid: 4,8 dagar", "Kort dygnsvila: 10,5h" (de tre sista fanns inte i granskningen; hittade jag när jag sökte alla ställen som skriver ett ettdecimalstal). | `svDecimal` |
| N2 | **Inte nu** (beslut 4). | – |
| N3 | Ingen åtgärd (avvägningen är tagen). | – |

Några av tryckytorna i V3 (Saldons "Försök igen", "Hoppa över", "Stäng", sökfältet, Vilas månadspilar och "Visa alla →") står i lägen som inte syns i grundvyerna; de hittades genom att läsa koden för de sex vyerna och mäta i fler lägen (Vila 30 dagar/Månad/År/Se alla, Min tid År, Extra arbete, Traktamente, objektväljaren).

### Telefonen: pixeljämförelse 390 px, före mot efter

Samma data, samma klocka (11:00 / 18:00), samma Chromium. Före = koden precis före ändringen, efter = ändrad kod. Jämförelsen är per pixel; en pixel räknas som avvikande om någon kanal skiljer mer än 24. Bilderna: [före | efter per vy](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/jamfor390/dag.png?raw=true) (länkarna i tabellen).

| Vy | Resultat | Förklaring |
|---|---|---|
| Dag | **identisk** (0 pixlar) | – |
| Kvällsrapport | **identisk** | – |
| Kvällsrapport, arket "Något fel?" | **identisk** | – |
| Redigera | **skiljer (avsiktligt)**, 207 462 pixlar | "Åkte hem …" på egen rad, vänsterställd (förut två rader, centrerad); "Stämmer" och "Tillbaka" ryms nu på skärmen (förut låg "Tillbaka" under kanten). [jämförelse](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/jamfor390/redigera.png?raw=true), [diff](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/diff390/redigera-390.png?raw=true) |
| Min tid, Översikt | toppen **identisk**; "botten"-bilden skiljer | sidan är 20 px kortare att scrolla (880 i stället för 900), så "längst ned" är ett annat scrollläge. Innehållet är oförändrat. |
| Min tid, Saldon | **30 pixlar** (5×9 bildpunkter, ett decimaltecken) | "4.8" → "4,8" (decimalkomma). [diff](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/diff390/mintid-saldon-390.png?raw=true) |
| Min tid, Vila | **skiljer (avsiktligt)**, 106 387 pixlar | segmenten 44 i stället för 33 px; raden "5 viloperioder … Se alla nätter →" ca 2 px högre; allt under flyttas ned ca 14 px. [jämförelse](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/jamfor390/mintid-vila.png?raw=true), [diff](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/diff390/mintid-vila-390.png?raw=true) |
| Mitt avtal | **identisk** (även "botten") | – |
| Inställningar | **identisk** (även "botten") | – |
| Kalender (ingen av de sex, extra kontroll) | **identisk** (även "botten") | – |

**Avvikelser, i klartext:** sex av nio lägen är pixel-identiska eller skiljer bara på avsedda ställen utan följdverkningar. Tre skiljer: Redigera och Vila (avsiktligt, tryckytor och rubrikrad), Saldon (ett tecken). Ingenting annat i någon vy på telefon rörde sig. Det jag **inte** kunde jämföra är Lön (se nedan) och de lägen som bara uppstår efter ett tryck (väljare och ark utöver "Något fel?").

### Efter: mätvärden (Kvällsrapport; övriga vyer inom ±30 px)

| | 390 | 820 | 1180 | 1440 |
|---|---|---|---|---|
| Textens spännvidd | 342 px | **624** | **624** | **624** |
| Bredaste kortet | 358 | **640** | **640** | **640** |
| Etikett → värde i en rad | 326 | **608** | **608** | **608** |
| Sidan högre än skärmen (Dag, Kväll, Arket, Redigera, Vila) | **0** | **0** | **0** (Vila +3) | **0** |
| Längsta löpande textrad i Mitt avtal (tecken per rad) | 45 | **67** | **67** | **67** |

(Före: 1 376 px etikett→värde på 1440, 134 tecken per rad, +56 px på alla bredder.) Inget flödar över i sidled i något av de 36 lägena. Tryckytor under 44 px: **0** i Dag, Kväll, Arket, Redigera, Min tid Översikt/Saldon/Vila och Mitt avtal på alla fyra bredder, utom undantagen nedan.

Bilder, efter (alla fyra bredder per vy): [Dag](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/blad/dag.png?raw=true) · [Kväll](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/blad/kvall.png?raw=true) · [Kvällsarket](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/blad/kvall-ark.png?raw=true) · [Redigera](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/blad/redigera.png?raw=true) · [Min tid Översikt](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/blad/mintid-oversikt.png?raw=true) · [Saldon](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/blad/mintid-saldon.png?raw=true) · [Vila](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/blad/mintid-vila.png?raw=true) · [Mitt avtal](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/blad/avtal.png?raw=true) · [Inställningar](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/blad/installningar.png?raw=true). Kalender (bred, 1120): [390](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/kalender/kalender-390.png?raw=true) · [820](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/kalender/kalender-820.png?raw=true) · [1180](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/kalender/kalender-1180.png?raw=true) · [1440](https://github.com/kompersmalaskog/skogsystem/blob/b21e69b0db53822b05725f8848889d15eca36f0b/docs/arbetsrapport-granskning/bilder-efter/kalender/kalender-1440.png?raw=true). Originalen per vy och bredd ligger i samma mapp (`bilder-efter/<vy>-<bredd>.png`, commit `b21e69b`).

### Vad som återstår och inte är gjort

- **Toppfältet** (hemknapp 36×36, genomskinlighet 0,92): egen PR (beslut 4).
- **Min tid → Översikt → År:** de tolv månadskolumnerna är 26×166 px på 390 (tolv kolumner på 358 px; 44 px bred går inte utan sidscroll). Lämnas.
- **Reglagen** i Inställningar (51×31) är iOS-standard och rörs inte.
- **Kalenderns dagrutor** mäts som 43,7 px breda på 390 (358/7): avrundning av 44, oförändrat (pixel-identiskt).
- **Lön** är inte visuellt kontrollerad efter ändringen (448 → 640): vyn kraschar med attrappens data före **och** efter ("Cannot read properties of undefined (reading 'reduce')": attrappens svar saknar fält som specifikationen kräver), så de identiska bilderna visar en felvy. Rotens bredd är bara bekräftad i renderingstestet (672 px). Kontrollera Lön i previewn.
- **Inställningars valrader** (klassen `valj-rad`) och **sökfältet** är bevisade av källvakterna i testet; väljaren öppnades inte i min mätning, så 44 px är inte uppmätt i webbläsaren där.
- **Sökfältet i objektväljaren** är nu helt på tokens: texten 17 px i stället för 15 (under 16 px zoomar iOS in vid fokus) och 2 px mer luft under fältet. Det ligger i ett ark och ingår inte i pixeljämförelsen.
- Formulärarken (Period, Ändra tider) och Starta-flödet är fortfarande ogranskade.
- Ingen riktig iPad är sedd.

### Test

`components/arbetsrapport/Arbetsrapport.kolumn.render.test.tsx` (17 tester: rötterna, Kalender bred, tryckytor, decimalkomma, källvakter för nav/ark/body) och `node scripts/mutationskontroll-arbetsrapport-kolumn.mjs` (**26 av 26 mutanter dödade**). Hela vitest: 3 866 gröna (tre filer kan inte laddas utan `.env.local`, som i alla PR:er). `tsc` (lokal binär): 469 fel = baslinjen 469, inga nya (en enda rad skiljer: ordningen i en unionstyp i en orelaterad fil). `design-lint --strikt`: inga nya literaler.

