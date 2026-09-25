# Uppdrag: Fördelningsvyn — apteringsuppföljning (Kompersmåla Skog)

Bygg hpr-import och fördelningsvy i den befintliga Next.js/Supabase-appen.
Fyra kodfiler medföljer. Parser och beräkningar är FÄRDIGA och körverifierade
mot en verklig Ponsse Opti5G-fil — ändra inte deras logik. Ditt jobb är
integration (etapp 1) och UI enligt bildfacit (etapp 2).

---

## DESIGNKONTRAKT — gäller allt som byggs, även framtida vyer

**Tystnadsregeln:** OK är tyst. En trakt inom mål visar objektnamn, grått
procenttal och "Inom mål" — ingen färg, ingen mening, ingen knapp, aldrig.
Färg finns bara där fel finns.

**De fem språkreglerna:**
1. Mening först, siffra sen — alltid i arbetets språk (stockar, kubik,
   vältor, träd). Aldrig "avvikelse i procentenheter" som huvudbudskap.
2. En tanke per kort. Två frågor = två kort.
3. Rita det man kan ta på (vältor, stockändar, prickar) — inte diagram.
4. Tyst när det är bra.
5. Frågetestet: tvingar ett kort läsaren att fråga "vad betyder det?" är
   kortet underkänt, inte läsaren.

**Genererade meningar:** skrivs bara när mönstret är tydligt. Spretigt
mönster → ingen mening alls, hellre än en luddig.

**Enhetsregeln:** m³ är valutan i hela UI:t. Procentenheter (%-enheter) och
fördelningsgrad i procent förekommer, men aldrig som det enda/bärande.

---

## ETAPP 1 — Import

### Medföljande filer
| Fil | Status | Åtgärd |
|---|---|---|
| `hpr-parser.ts` | Färdig, verifierad | Lägg i `lib/hpr/`. Rör ej logik. |
| `fordelning.ts` | Färdig, verifierad | Lägg i `lib/hpr/`. Rör ej logik. |
| `schema.sql` | Färdig | Kör som Supabase-migration. |
| `route-example.ts` | Mall | Anpassa till projektets Supabase-klient/auth → `app/api/hpr-import/route.ts`. |

### Krav
- `runtime = "nodejs"` (filerna är ~35 MB, parsning ~5 s — inte edge).
- Storage-bucket `raw-files` (privat), rådatafilen sparas alltid.
- Dedupe: filhash för identiska filer; upsert av stockar på
  `(object_key, stem_key, log_key)` — hpr-filer är KUMULATIVA per objekt,
  nästa fil innehåller samma stockar igen.
- Validering: errors stoppar import och visas; warnings visas men importerar.
- Uppladdning: enkel drag-drop-sida under Uppföljning.

### Objektavslut
- Detektera `EndDate` i `ObjectDefinition` vid import → sätt objektet till
  `completed` automatiskt och skriv slutsnapshot (`is_final = true`).
- OBS: EndDate är ÄNNU EJ VERIFIERAT mot en verklig slutfil (pågående
  objekt saknar fältet). Bygg detektionen defensivt: saknas fältet i alla
  filer, logga och lämna objektet `active`. Ingen manuell avslutsknapp
  byggs i denna etapp.
- Kommer ny fil på ett `completed` objekt → öppna det igen (verkligheten
  trumfar statusflaggan).

### Acceptanstest etapp 1 — måste stämma EXAKT
Testfil: `Brokamåla_15_V-H_avd_20_-25_PONS20SDJAA270231_20260721072020.hpr`

- 6 666 stockar i `logs`, 11 produkter varav 9 klassade.
- Validering: 0 errors, exakt 1 warning: "10 manuellt kapade stockar
  utanför matrisen (överlängder m.m. — förväntat)".
- Exakt 2 produkter med `distribution_allowed = true` (Hästveda 195
  kv1_V3 och kv2_V3), båda `Volume of logs`, `max_deviation = 4`.
- `computeDistribution` kv1: total 87,7 % · 2 197 stockar · 538,6 m³;
  automatiska 87,2 % · 2 040 stockar; tvångskap 7,1 %.
- kv2: total 78 % · 22 stockar · 3,5 m³.
- `computeLengthPiles` kv1 (kapat/beställt m³):
  308: 11/16 · 368: 83/81 · 428: 102/100 · 488: 111/109 ·
  518: 86/84 · 548: 146/148.
- Färgade matrisrutor (exceeds OCH |m³| ≥ 3), kv1 total:
  195/548:−3 · 210/368:−9 · 210/428:−4 · 210/518:+7 · 210/548:+4 ·
  240/548:+6 · 266/368:+7 · 320/428:+5 · 320/518:−4 · 340/548:−7.
- `computeForcedCutGuide` kv1: klen → 428 (7 m³), grov → 548 (10 m³).
- Samma fil två gånger → `duplicate`, inga nya rader.

Avviker något: bygget är fel, inte facit. Justera ALDRIG trösklar eller
klasslogik för att "få det att stämma" — rapportera avvikelsen.

### Kända fällor (lösta i parsern — bevara)
- `LengthClassMAX`/`DiameterClassMAX` är INKLUSIVA (maskinen kapar på
  exakt maxvärdet).
- Prisdiametern styrs av produktens `diameterClassCategory` +
  `DiameterUnderBark` (här Top, på bark → `LogDiameter[Top ob]`).
  Hårdkoda aldrig kategorin.
- Volym = `LogVolume[m3 (price)]`.
- Fördelningsmål är radnormerade: varje diameterrads mål summerar till
  100 % av RADENS volym.
- `product_key` är unik inom objektet, inte globalt.

---

## ETAPP 2 — Vyn (tre lägen)

Bildfacit finns som skärmar i chatten ("slutversion_hela_fordelningsvyn"
+ "detaljmatris_i_kubikmeter" + korten "vem_valde_kapet_7_av_100" och
"548_valtan_fran_andarna"-stilen). Bygg i React enligt appens befintliga
stil, Apple-känsla: mjuka kort, 12 px radier, återhållna färger.

### Läge 1 — objektkort, inom mål
Objektnamn · "Inom mål · X m³" · procenttal i GRÅTT. Ingen färg, mening
eller knapp. Villkor: fördelningsgrad ≥ tröskel och inga färgbara rutor.

### Läge 2 — objektkort, avvikelse
Samma kort. Talet i varningsfärg + EN genererad mening i skogsspråk
(t.ex. "Det saknas grova långa stockar — grovt timmer kapas för kort")
+ "Visa mer". Under pågående drift: inga larmfärger utöver talet,
optimeraren själv-kompenserar. Vid avslutat objekt får kortet döma fullt.

### Läge 3 — detaljvyn (ordningen är låst)
1. **Vältorna:** "Träffar vi längderna?" — en rad per längdklass ur
   `computeLengthPiles`: stapel = kapat m³, streck = beställt m³, text
   "X m³ (best. Y)". Gråa staplar — färg hör inte hemma här.
   Under: twistmeningen när radavvikelser finns trots träffade vältor:
   "Men i långvältorna ligger fel virke: för många klena, för få grova.
   Vältan ser rätt ut från sidan — sågverket ser den från ändarna."
2. **Ansvarskortet:** 100 prickar i rutnät (20×5), N gula = manuella kap,
   resten grå. Mening: "Av 100 timmerstockar kapade du N själv — när
   trädet hade fel. Resten fördelade maskinen, som träffade X % på egen
   hand." (X = grade_automatic.)
3. **Guiden "Vid fel på trädet":** två meningar ur `computeForcedCutGuide`
   (klen → längd, grov → längd) + "Riktning, inte regel — kvaliteten
   bestämmer alltid". Mockuptexternas längder var illustrativa — UI:t
   visar ALLTID funktionens värden.
4. **Detaljmatrisen — HOPFÄLLD bakom "Visa detaljmatris":**
   Rader grupperade Klent (< 310 mm) / Grovt (≥ 310 mm). Cellvärde =
   `deviationM3` avrundat, med tecken. Färgregel: `exceeds` (prislistans
   ±4-band) OCH `|deviationM3| ≥ 3`. Allt annat tomt. Legend: två
   poster (saknas / för mycket). Förklaringsrad: "−9 betyder: här saknas
   9 m³. Tomt = på beställningen."

### Placering: startsidan
Apteringen får INGET permanent kort på startsidan. Den följer samma
mönster som befintliga Datahälsa-bannern: en banner visas ENDAST när
minst ett aktivt objekt är i läge 2 (avvikelse), med läge 2-meningen
som text ("Aptering: det saknas grova långa stockar →"), och trycket
öppnar läge 3 för det objektet. Inom mål → ingenting på startsidan;
hela vyn nås som vanligt via Uppföljning-ikonen. Fler objekt med
avvikelse → en banner: "Aptering: 2 objekt att titta på →" som öppnar
Uppföljning.

### Snapshot & historik
Varje import skriver `distribution_snapshots`; avslut skriver
`is_final = true`. Visa trend på kortet när ≥ 2 snapshots finns
("↑ från 84,1").

---

## Utanför scope
Automatisk filhämtning från maskinen, beställda volymer per sortiment
(kräver traktdirektiv-data — `ContractNumber` finns redan i parsern som
framtida koppling), flera användarroller, realtidsfunktioner av alla slag.

## Återrapportering
1. Acceptanstestets fullständiga utskrift mot testfilen.
2. Skärmdumpar av läge 1, 2 och 3 (matris hopfälld + utfälld).
3. Alla avvikelser från kraven och alla ändringar i route-mallen.
Inget i parser/beräkning ändras utan att det flaggas.
