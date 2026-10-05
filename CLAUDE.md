# Regler för skogsystem

## VIKTIGT — LÄS DETTA FÖRST

Claude (chatten) får INTE ändra kod, databas eller filer utan att först fråga användaren och få godkännande. Claude ska alltid föreslå och fråga — aldrig agera på eget initiativ.

---

## Databas — KRITISKA REGLER

### fakt_produktion och fakt_tid får ALDRIG joinas direkt
fakt_produktion har många rader per dag (en per trädslag/sortiment/operator).
fakt_tid har en eller få rader per dag (en per operator).
En direkt JOIN multiplicerar tidsdatan och ger helt fel siffror.

ALLTID göra så här:
1. Hämta fakt_produktion separat — summera per datum eller operator_id
2. Hämta fakt_tid separat — summera per datum eller operator_id
3. Merga i JavaScript med Map<datum, data>

### Beräkningar
- G15h = (processing_sek + terrain_sek + other_work_sek) / 3600 — validerat mot 5 tillverkarrapporter (Ponsse "Effektiv tid" + Rottne "G(t)", båda inkl. övrigt arbete). Summera ALLTID via `lib/g15.ts` `g15Sek()`. other_work sker ofta med motorn av → G15 kan legitimt överstiga engine_time; fysik-invariant = P+T ≤ engine_time, ej G15 ≤ engine_time
- m³/G15h = SUM(volym_m3sub) / SUM(g15_h) — viktat snitt, aldrig snitt av snitt
- L/m³ = SUM(bransle_liter) / SUM(volym_m3sub) — viktat snitt
- Medelstam per objekt = SUM(volym_m3sub) / SUM(stammar)
- **Ärlig data eller ingen data.** Ett beräknat tal får aldrig lagras eller visas som om det vore en mätning. Saknas mätningen skrivs noll eller null och dagen märks synligt i datahälsan ("Motortid utan arbetstid"). Fallbacken "processing = 88 % av motortiden" (2026-04 till 2026-10) hittade på 15 h arbete på 68 flyttdagar innan den togs bort — motorn gick på trailern, maskinen arbetade inte.

### Medelstamsklasser
- Gallringsskördare (R64101): 0.00-0.03, 0.03-0.05, 0.05-0.07, 0.07-0.09, 0.09-0.12, 0.12+
- Slutavverkning (PONS20SDJAA270231): 0.0-0.1, 0.1-0.2, 0.2-0.3, 0.3-0.4, 0.4-0.5, 0.5-0.7, 0.7+

### HPR-filer är kumulativa
Varje ny HPR-fil innehåller alla tidigare stammar plus nya. Två dedupe-strategier finns, beroende på nivå:

- **`hpr_filer` / `hpr_stammar` (filnivå)** — vid visning/summering: använd BARA filen med högst `stammar_count` per objekt, aldrig alla filer.
- **`detalj_stock` (radnivå)** — UNIQUE-constraint på `(maskin_id, stem_key, log_key)` (migration `20260507_detalj_stock_dedupe_keys.sql`) gör att importen UPSERT:ar — samma logiska stock från olika kumulativa filer skrivs över istället för att duplicera.

### arbetsdag — TRE sorters dagar
En rad i `arbetsdag` är en av tre saker, och en vy som läser raden måste klara alla tre:

| Sort | Kännetecken | Var tiden bor |
|------|-------------|---------------|
| **Maskindag** | `start_tid`/`slut_tid`/`maskin_id` satta (MOM-synk eller Starta arbetspass) | `arbetad_min` på raden; objekt i `arbetsdag_objekt` |
| **Perioddag** | raden är ett SKAL: `start_tid`, `slut_tid`, `maskin_id` alla NULL, ändå `bekraftad` | perioderna i `extra_tid` (klockslag, objekt, aktivitet, debiterbar); raden finns för att lönens 60-minutersregel ska se dagen |
| **Frånvarodag** | ingen rad alls (sjuk/VAB/semester ligger i `ledighet_ansokningar`); gamla backfill-rader utan tid kan finnas | `lib/franvaro` |

Perioddagen (Joacims planering, restid, manuellt arbete — PR #592, 2026-09-26) är den nya. Regeln: **klockslag på en perioddags rad = dubbelräkning** (`arbetad_min` + `extra_tid`), spärrad av `passKrockarMedPerioder` i `lib/dagsegment.ts`. Visa en perioddag med `perioderPerObjekt` (objekt och tid ur perioderna), räkna vilotid med `medPerioddagSpann` (`lib/vilobrott.ts`). Antagandet "raden har klockslag och maskin" gav tio tomma vyer på en gång (2026-09-28) — läs perioderna när raden är tom, säg aldrig "ingen data".

---

## Maskiner med data
| maskin_id | Modell | Typ | Användning |
|-----------|--------|-----|------------|
| PONS20SDJAA270231 | Ponsse Scorpion Giant 8W | Harvester | Slutavverkning |
| R64101 | Rottne H8E | Harvester | Gallring |
| R64428 | Rottne H8E | Harvester | Gallring |
| A030353 | Ponsse Wisent 2015 | Forwarder | — |
| A110148 | Ponsse Elephant King AF | Forwarder | — |

---

## Vyer (app/)

| Rutt | Namn | Beskrivning |
|------|------|-------------|
| `/` | Hem | Dashboard med funktionskort till alla vyer. **Startvakten** (`components/AppStartVakt.tsx`, beslut i `lib/appStart.ts`) avgör först: enhet med vald maskin (`enhet_maskin_id`) → `/planering` i maskinläge; serial-GPS (eller sparad GPS-port) men ingen maskin → helskärmsfrågan "Vilken maskin är det här?" (`components/maskin/VilkenMaskinSkarm.tsx`, bara aktiva maskiner ur `dim_maskin`); annars menyn. Gäller `/` alltid och `/oversikt` bara vid app-START (PWA:ns `start_url`). `/?meny=1` = "Till appen" (startvakten lämnar sessionen ifred). **I maskinläge går hem-knappen i planeringsvyn till objektlistan, aldrig till menyn.** Enheten minns förarens senast valda objekt (`lib/senasteObjekt.ts`, `enhet_senaste_objekt_v1`) och startar där tills ett annat väljs, objektet avslutas eller riktig GPS står i ett annat objekt (då bekräftelsekortet). **Roll = `dim_maskin.maskin_typ` (Harvester→skördare, Forwarder→skotare) via `rollForMaskin` — aldrig ur tilldelningsfältet, aldrig en reserv.** |
| `/login` | Login | E-post/lösenord via Supabase Auth |
| `/uppfoljning` | Uppföljning | Jobbuppföljning med KPI:er, maskindrift, operatörsstatistik, bränsle, sortimentsfördelning |
| `/maskinvy` | Maskinvy | Utan parameter: den GAMLA vyn (`maskinvy.tsx` + `skotare.tsx`), nås från bottennavigationen. **`/maskinvy?ny=1` är den levande vyn** (hemskärmens kort "Maskinvy 2"): Skördare/Skotare/Jämförelse med Översikt/Idag/Produktion/Avbrott/Kapacitet, TU i nyckeltalen (`lib/g15.ts`, `docs/tu.md`). `/maskinvy2` och `/maskinvy-ny` var döda, olänkade sidor från mars 2026 — borttagna 2026-09-30. Att göra `?ny=1` till standard väntar på att Martin frågat förarna om någon använder den gamla. |
| `/maskinflytt` | Maskinflytt | Förarflöde: maskinlistan är startsidan med senast kända plats ifylld (`senastePlats.ts` — senaste av avslutad flytt / fakt_tid-objekt; spärrar: koordinat > 15 mil från verksamheten = osäker, objekt > 30 dagar = osäker, båda dämpade men klickbara). Starta körning → Hämtat → Vart ska den → Lämnat → dagssammanfattning; Maps öppnas ur förarens tryck (länk, ej popup). Dagmodell oförändrad: flyttdag (hem→n flyttar→hem) äger tillkörning/hemresa, flytt äger flytt_km (fakturerbar ≥ 3 mil) + mellankörning. Verkstad som destination → flytt_typ=service automatiskt. Skriver flyttdag + maskin_flytt + maskin_position |
| `/maskinflytt/sammanstallning` | Flyttlogg | Två nivåer: Dagar (rundans verkliga körsträcka — PRIMÄRT `matare_km` (märkt "mätare"), fallback `total_km` (märkt "rutt") på gamla rundor; båda syns i expanderad ben-vy som jämförelse; hemresan är MÄTT på nya rundor sedan #380, bara gamla märks "(beräknad)") och Flyttar (fakturerbara sträckor, typ/kund-filter, per-typ-summering) — period V/M/K/Å, CSV per flik; avbrutna/pågående räknas ej |
| `/maskinflytt/platser` | Flyttplatser | Hantera flyttplats-snabbval (verkstad/uppställning/gård/kund) — lägg till, redigera, inaktivera |
| `/arbetsrapport` | Arbetsrapport | Generering av arbetsrapporter |
| `/planera` | Planera | Tid på en trakt, trakten först: Pågår-kort · sök · senaste · aktiva trakter per åtgärdstyp; välj trakt → tiden stor (± kvart) → 2 tim → Spara, eller **Starta nu** (stor grön knapp, ett tryck startar: period utan slut, start = klockan nu, tillbaka till Pågår-kortet utan mellansteg; **Avsluta** bekräftar ALLT förvalt (aktivitet, faktureras, kommentar) och har **Klipp upp dagen**; dagen går att klippa i delar (färgstapel; varje del går att ändra: tider, trakt, aktivitet/rast) även i efterhand från veckolistan — Martins verkliga fall: glömde byta/avsluta. **Rasten är EN modell: lucka mellan perioder, aldrig förifylld, aldrig en siffra på en rad; dag > 5 tim utan rast → Spara frågar "Hade du rast?"**. Starta nu/Avsluta = exakt minut (kvartar bara i förifyllning/längdknappar/±-steg); glömd period får aldrig slut = nu (snabbval "Slutade 16:00?"); dag med pågående period kan inte bekräftas; ändring av en bekräftad dag bryter bekräftelsen). Idag kan aldrig sluta efter nu. Skapar bara `extra_tid`-perioder (samma regler som arbetsrapportens periodformulär, `lib/planera/spara.ts`); dagen bekräftas i Dag/Kalender. Förslag-lista (Samma som i går; bil/plats senare) sparas aldrig förrän föraren tryckt. `docs/planera.md` |
| `/bestallningar` | Beställningar | Orderspårning med progressringar och månadsstatistik |
| `/forbattringsforslag` | Förbättringsförslag | Feedbacksystem med ljudinspelning och textinmatning |
| `/helikopter` | Helikopter | Helikopterlogistik och objektöversikt |
| `/helikopter-v2` | Helikopter v2 | Uppdaterad helikopterplanering med diagram |
| `/kalibrering` | Kalibrering | Maskinkalibrering — daglig, historik, rapporter |
| `/karta` | Karta | Interaktiv karta med avverkningsobjekt |
| `/ledighet` | Ledighet | Ledighetshantering (semester, ATK, maskinstopp) med kalender |
| `/maskin-service` | Maskinservice | Servicelogg per maskin med hjuldiagram |
| `/objekt` | Objekt | Objekthantering med månadsplanering |
| `/oversikt` | Översikt | Dashboard med maskinstatus, karta, GROT-efterlevnad |
| `/planering` | Planering | Huvudvy — traktplanering med karta, markeringar, väder, väganalys, TMA |
| `/planner` | Planner | Förenklat planeringsverktyg med canvas-markeringar |
| `/redigering` | Redigering | Objektredigering med extern skotning |
| `/starta-jobb` | Starta jobb | Jobbstart för operatörer med sökning och tilldelning |
| `/utbildning` | Utbildning | Utbildnings- och certifieringsspårning per medarbetare |

---

## Komponenter (components/)

| Fil | Syfte |
|-----|-------|
| `TopBar.tsx` | Fast header (56px) med sidtitel och hemknapp |
| `BottomNav.tsx` | Fast bottennavigation — 4 flikar (Hem, Översikt, Planering, Objekt) + "Mer"-meny |
| `MapLibreMap.tsx` | MapLibre GL-karta med 3D-terräng (AWS 30m, uppgraderar till lokal Lantmäteriet 1m) |
| `arbetsrapport/Arbetsrapport.tsx` | Arbetsrapportgenerering |
| `ui/*.tsx` | Shadcn/ui-komponenter (badge, button, card, input, textarea) |

---

## Supabase-tabeller per vy

### Uppföljning
`fakt_produktion`, `fakt_tid`, `fakt_lass`, `fakt_lass_sortiment`, `dim_maskin`, `dim_operator`, `dim_tradslag`, `dim_sortiment`, `dim_objekt`, `planering_markeringar`

### Maskinvy / Maskinvy2 / Maskinvy-ny
`fakt_tid`, `fakt_produktion`, `dim_maskin`, `dim_operator`, `maskin_logg`

### Planering
`planering_markeringar`, `dim_objekt`, `kartbilder`, `tma_assessments`, `hpr_filer`, `hpr_stammar`, `skotning_uttag`

**Varningsavstånd ligger INTE i databasen.** Ett varningsavstånd per kategori (hur nära en markering körvyns proximitetskort växer) sparas PER ENHET i `localStorage` under nyckeln `varningar_v1` (`lib/varningsInstallningar.ts`, bara `warnDist`) — inte per objekt, inte per användare i DB. Strängar som den äldre versionen sparade (med avståndsdämpning, "Visa alla symboler", på/av per kategori) läses fortfarande; bara `warnDist` används. Tabellerna `warning_settings` och `warning_acknowledgments` har aldrig funnits i prod (PostgREST 404 `PGRST205`, verifierat 2026-10-05; tidigare stod de här som om de fanns). Körvyns kvittens (proximitets-notisen) är den riktiga tabellen `korvy_kvittens`. Reservvärdet för en kategori utan inställning är 30 m. **Det gamla körläget (`drivingMode`, avståndsdämpning, pip/vibrationskortet, geofence-frågan och körspårningen) är borttaget ur planeringsvyn (2026-10-05) — körvyn är det enda körläget.** Den separata `/planner`-sidan har sin egen, orörda kopia.

### Kalibrering
`fakt_kalibrering`, `fakt_kalibrering_historik`, `detalj_kontroll_stock`

### Maskin-service
`maskiner`, `maskin_service`, `fakt_skift`

### Objekt
`objekt`

### Översikt
`dim_maskin`, `maskin_ko`, `objekt`, `dim_objekt`, `fakt_produktion`, `fakt_lass`

### Ledighet
`ledighet_ansokningar`

### Utbildning
`utbildning_typ`, `utbildning_krav`, `utbildning_bevis`, vyn `utbildning_status`, `medarbetare`. PDF-bevis lagras i storage-bucketen `utbildningsbevis` (privat).

### Förbättringsförslag
`feedback`, `audio` (storage bucket)

---

## Tabellöversikt

### Dimensionstabeller
- `dim_maskin` — maskin_id (text), tillverkare, modell, maskin_typ
- `dim_operator` — operator_id, operator_namn, maskin_id
- `dim_objekt` — objekt_id, object_name, vo_nummer
- `dim_tradslag` — tradslag_id, species_key, namn, maskin_id
- `dim_sortiment` — sortiment_id, product_key, namn, maskin_id
- `dim_sortiment_pris` — sortiment_id (FK), langd_min_cm, dia_min_mm, pris_per_m3. PK (sortiment_id, langd_min_cm, dia_min_mm). StanForD lower-threshold: slå upp pris genom att hitta största (langd_min_cm, dia_min_mm) som inte överskrider stockens (langd_cm, toppdia).

### Faktatabeller
- `fakt_produktion` — datum, maskin_id, operator_id, objekt_id, tradslag_id, stammar, volym_m3sub, volym_m3sob
- `fakt_tid` — datum, maskin_id, operator_id, processing_sek, terrain_sek, other_work_sek, disturbance_sek, maintenance_sek, avbrott_sek, tomgang_sek, kort_stopp_sek, rast_sek, engine_time_sek, bransle_liter
- `fakt_sortiment` — datum, maskin_id, objekt_id, sortiment_id, stockar, volym_m3sob, volym_m3sub
- `fakt_skift` — maskin_id, operator_id, login_time, logout_time
- `fakt_avbrott` — driftstopp och störningar
- `fakt_lass` — lastdata (volym, avstånd)
- `fakt_lass_sortiment` — sortiment per last
- `fakt_skotning_status` — status per (objekt, sortiment) för skotning (start_tid, slut_tid)
- `fakt_kalibrering` — kalibreringsresultat
- `fakt_kalibrering_historik` — kalibreringshistorik
- `fakt_maskin_statistik` — total motor/bränsle/distans per fil

### Detaljtabeller
- `detalj_stam` — enskilda stammar (stam_key, maskin_id, dbh_mm, lat, lng, tidpunkt)
- `detalj_stock` — enskilda stockar (stock_key, längd_cm, toppdia, volym_m3sub)
- `detalj_gps_spar` — GPS-spårningspunkter
- `detalj_kontroll_stock` — kontrollstockar för kalibrering

### HPR-tabeller
- `hpr_filer` — HPR-filmetadata (filnamn UNIQUE, objekt_id, stammar_count, has_coordinates)
- `hpr_stammar` — stamdata (hpr_fil_id, stam_nummer, trädslag, dbh, lat, lng, antal_stockar, total_volym, bio_energy_adaption, sortiment). UNIQUE(hpr_fil_id, stam_nummer)

### Operativa tabeller
- `objekt` — objekt med planeringsstatus. **Status ÄR CHECK-constrained** (`objekt_status_check`): bara `planerad`, `pagaende`, `skotning`, `avslutat` går att spara. `oplanerad` och de äldre värdena `klar` går INTE att skriva, trots att den här raden tidigare påstod motsatsen — verifierat mot prod 2026-09-29. **Kolumnen defaultar dessutom till `planerad`**, alltså "klar att köra": en rad som skapas utan att sätta `status` dyker upp i förarkön som nästa jobb. Sätt den ALLTID explicit vid insert. `planerad` sätts annars av planeringsvyns "Klar — skicka till förare"-knapp + `klar_skickad_timestamp`. Översiktsvyn läser fortfarande de äldre värdena `skordning`/`skotning`/`klar` som kan finnas i gammal data. Tilldelningsfält: `assigned_skordare_user_id`, `assigned_skotare_user_id` (FK → medarbetare.id, ON DELETE SET NULL). Livscykel-timestamps: `klar_skickad_timestamp`, `pagaende_startad_timestamp`, `avslutad_timestamp`.
- `maskiner` — bär BARA service-loggens nyckel (`maskin_service.maskin_id` = `maskiner.id`) och `aktiv` för service-listan. **Maskinnamn och maskintyp läses ALLTID ur `dim_maskin`** (`visningsnamn`, `maskin_typ`) via `lib/maskinNamn.ts` (`maskinVisningsnamn`, `maskinSlag`) — aldrig `maskiner.namn`/`typ`. 2026-10-02 sattes namn i `maskiner` och ingen vy ändrades.
- `maskin_service` — serviceloggar
- `maskin_logg` — maskinaktivitetslogg
- `maskin_ko` — maskinko/ordning
- `ledighet_ansokningar` — ledighetsansökan
- `utbildning_typ` — utbildningskatalog (namn, kravtyp `lag`/`certifiering`/`bestallare`, `giltighet_manader` (null=ingen utgång), `galler_alla`, `aktiv`)
- `utbildning_krav` — vilka utbildningar som gäller vilka medarbetare (PK: `utbildning_typ_id` + `medarbetare_id`); används när `galler_alla=false`
- `utbildning_bevis` — genomförda utbildningar per medarbetare (`genomford_datum`, `giltig_till_manuell` sätts bara vid avvikelse, `pdf_url` = storage-sökväg, mjuk radering via `aktiv=false` + `borttagen`)
- `utbildning_status` (VY) — en rad per medarbetare×utbildning med färdig `status` (`giltig`/`gar_ut_snart`/`utgangen`/`saknas`) och `giltig_till`. Läs status HÄRIFRÅN — beräkna aldrig utgång/status i frontend. De gamla tabellerna `utbildningar`/`utbildningsbevis` finns INTE (deras migrationer kördes aldrig)
- Storage-bucket `utbildningsbevis` — privata PDF-bevis (max 10 MB, skrivning kräver admin); visa via `createSignedUrl`, aldrig `getPublicUrl`
- `planering_markeringar` — kartmarkeringar för planering
- `kartbilder` — kartbilder
- `tma_assessments` — terrängframkomlighet
- `skotning_uttag` — skotningsuttag
- `gps_tracks` — tillfälliga rader för manuell GPS-ritning av linjer i `/planering` (raderas när linjen sparats; separat från importerade `detalj_gps_spar`). De 25 historiska `korspår`-raderna är kvar men skrivs/läses inte längre (körspårningen är borttagen; körvyns spår är `hyttspar`).
- `meta_importerade_filer` — spårar vilka filer som redan importerats

---

## Import — Hur det fungerar

### Huvudskript: skogsmaskin_import_version_6.py
Övervakar `Inkommande`-mappen via watchdog. När en fil dyker upp:
1. Detekterar filtyp (.mom/.hpr/.hqc/.fpr)
2. Parsar XML (Stanford2010-format)
3. Upsert till Supabase-tabeller
4. Markerar filen i `meta_importerade_filer`
5. Flyttar filen till `Behandlade/{maskin_id}/{filtyp}/`

### MOM-import (Machine Operational Monitoring)
**Källa:** Både skördare och skotare genererar MOM-filer.
**Flöde:** Fil -> `parse_mom_file()` -> sparar till:
- `dim_maskin`, `dim_operator`, `dim_objekt`, `dim_tradslag`
- `fakt_tid` (aggregerad per dag — arbetstid, bränsle, motorgång)
- `fakt_produktion` (per trädslag/sortiment/operator)
- `fakt_skift` (operatörsskift)
- `fakt_avbrott` (störningar/underhåll)
- `detalj_stam`, `detalj_gps_spar`

**Timexporterna visar ett pågående skeende i olika skepnad i olika filer** (docs/import-exportversioner.md). Importen låter EN version gälla per identitet: tid — delat segment (`avgor_tid_vinnare`, #630); avbrott — senaste exportversion vinner per (maskin, datum, klockslag) (`avbrott_vinnare_ur_fil`/`avbrott_att_radera`; "Default"/"Other" är Ponsses/Rottnes platshållare för ett stopp som pågår, inte en vald orsak). En nyckel får aldrig innehålla ett värde som ändras mellan versionerna.

### HPR-import (Harvested Production Report)
**Källa:** Bara skördare genererar HPR-filer.
**Flöde:** Fil -> `parse_hpr_file()` -> sparar till:
- `dim_maskin`, `dim_objekt`, `dim_sortiment`, `dim_tradslag`
- `fakt_sortiment` (volym per sortiment summerat)
- `detalj_stam` (enskild stam med DBH, koordinater, stamklass)
- `detalj_stock` (enskild stock med längd, diameter, volym)
- `hpr_filer` (upsert på filnamn)
- `hpr_stammar` (insert on conflict do nothing på hpr_fil_id + stam_nummer)
- `detalj_gps_spar`

### HQC-import (Harvesting Quality Control)
Kalibreringsdata -> `fakt_kalibrering`, `fakt_kalibrering_historik`, `detalj_kontroll_stock`

### FPR-import (Forwarder Production Report)
Skotardata -> `fakt_lass`, `fakt_lass_sortiment`, `fakt_skotning_status`

### Övriga skript
- `import_hpr.py` — Fristående HPR-import från Behandlade-mappen (skriver bara till hpr_filer/hpr_stammar)
- `auto_import_watch.py` — Watchdog som startar import automatiskt + notifierar Vercel
- `reimport_allt.py` — Rensar alla fakta/detaljtabeller och importerar om allt
- `reimport_fakt_tid_TRASIGT_KOR_INTE.py.gammal` — NEUTRALISERAT 2026-05-23. Filen hade två allvarliga buggar: raderade hela fakt_tid utan filter, och dedup saknade operator_id (slog ihop förares rader). Kör INTE. Använd ett scoped reimport-script istället.
- `validate_data.py` — Hittar dagar med produktion men utan tidsdata och importerar om
- `scripts/tag-hpr-format.py` — Taggar HPR-filer med Stanford-version och metadata
- `scripts/link-hpr-data.py` — Länkar HPR-data till rätt objekt/maskin
- `scripts/backfill-grot.py` — Retroaktiv GROT-taggning av hpr_stammar

---

## Planeringsvyn (app/planering/page.tsx)

Huvudvy för traktplanering (~11 000 rader). Innehåller:

### Kartfunktioner
- MapLibre GL-karta med 3D-terräng
- Objektpolygoner från dim_objekt
- HPR-stammar visas som högpunkter (färgkodade per trädslag)
- GROT-stammar (bio_energy_adaption) visas i eget lager
- GPS-spår från maskiner
- Kartbilder (uppladdade PDF/bilder georefererade på kartan)

### Markeringar
- Rita punkter, linjer, polygoner
- Kategorier: Generell, Risk, Naturvård, Kulturmiljö, Körning, Avlägg, Basvägnät, Kantzoner
- Sparas i `planering_markeringar` per objekt

### Analyser
- Väganalys (avstånd, bärighet)
- TMA-bedömning (terrängframkomlighet)
- Väderprognos
- Sortimentsfördelning (stapeldiagram med kvar-beräkning från skotning_uttag)

### Objekthantering
- Välj objekt från lista eller karta
- Visa objektinfo (skogsägare, vo_nummer, avverkningsform, certifiering)
- Statushantering (planerad/pågående/avslutat)

---

## Verifiering — fallgropar som ger falskt godkant

### tsc i en ny worktree ljuger
`npx tsc --noEmit` i en worktree UTAN `node_modules` kor inte TypeScript. Den
plockar en stub som skriver

    This is not the tsc command you are looking for

och avslutar med 0. Ett `grep -c "error TS"` ger da **0 fel** — vilket ser ut
som ett godkant resultat men betyder att kontrollen aldrig kordes.

Det drabbar VARJE ny worktree, eftersom `node_modules` inte foljer med.

Gor sa har:

1. `npm install` i worktreen forst.
2. Kor den LOKALA binaren: `./node_modules/.bin/tsc --noEmit -p tsconfig.json`
3. Jamfor mot en BASLINJE. Repot har ~550 pre-existerande fel, sa ett antal
   sager ingenting i sig. Kor samma kommando i en worktree pa `origin/main`
   och diffa radagnostiskt:

       sed -E 's/\([0-9]+,[0-9]+\)//' fel.txt | grep "error TS" | sort

   Jamfor mangderna. Bara det som finns i grenen men inte i baslinjen ar ditt.

Samma princip galler all verifiering: **ett verktyg som svarar "inga fel" utan
att ha kort ar samma sak som ett verktyg som ljuger.** Kontrollera att det
faktiskt kordes innan du litar pa nollan. Se ocksa STATUS.md om
pagineringsbuggen, dar ett testverktyg gav 8 falsklarm av samma familj.

### Rendera innan leverans — hooks och nya lägen
`tsc`, design-lint och tester fångar INTE hook-ordning. 2026-10-02 kraschade hela arbetsrapporten (React #310) eftersom en `useEffect` lagts efter `if(!medarbetare) return` — allt var grönt, sidan gick inte att öppna. Regel: **hooks ligger ALLTID före tidiga returer** i en komponent, och en ändring som lägger till hooks eller ett nytt läge (`steg`) i en stor vy ska köras genom en rendering innan PR:en rapporteras klar.

- `components/arbetsrapport/Arbetsrapport.render.test.tsx` monterar hela Arbetsrapport (jsdom, kedjebar supabase-fake, ingen inloggning) genom övergången ingen medarbetare → inläst och faller på "Rendered more/fewer hooks". Verifierat rött på den kraschande versionen, grönt på rättningen. Kör: `npx vitest run components/arbetsrapport/Arbetsrapport.render.test.tsx`.
- Ny vy med egna lägen: kopiera mönstret (en monterings-test per läge) eller gör en tillfällig testsida med påhittad data. Skriv aldrig "inte renderat" i en PR-text som levererad kontroll — antingen renderades den eller så står det som en öppen risk överst.

## Repo
- GitHub: kompersmalaskog/skogsystem
- Vercel: push till `main` bygger PREVIEW, produktion uppdateras bara när `production`-branchen förs fram (se Deploy-flöde). Production-branch = `production`.
- Rätt repo: C:\Kompersmåla Skog\Kompersmåla Skog\Appen\skogsystem-claude
- OneDrive-mapp: C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer
- Filtyper: MOM, HPR, HQC, FPR — aldrig PRL

## Deploy-flöde

**Produktion är gated (sedan 2026-09-29).** `main` är integrationsbranch — varje merge bygger PREVIEW, inte produktion. Förarna får en ändring först när Martin för fram `production`-branchen. Poängen: skilja *merga* (integrera, granska preview) från *släppa* (förarna får det), så ändringar kan samlas och släppas när Martin bestämmer — helst när förarna inte sitter mitt i (kväll/helg).

**Default: feature-branch + PR till `main`.** Claude commitar på en egen branch och pushar. Martin granskar Vercel-preview, mergear PR:en till `main` själv. Standardflöde för alla planerade ändringar — UI, refactors, features, bugfixar. Detta når INTE förarna förrän `production` förs fram.

**Släppa till produktion** (Martin gör det):
```bash
node scripts/vad-slapps.mjs        # visa vad som släpps + ev. migrationer FÖRST
git checkout production && git merge --ff-only main && git push
```
Rollback: Vercel dashboard → Instant Rollback till förra prod-bygget.

**Migrationer — den enda riktiga risken med gaten** (kod och schema kan glida isär utan att någon ser det):
1. **Varje PR som kräver en migration ska säga det uttryckligen i beskrivningen, med filnamnet** (t.ex. `supabase/migrations/20260908_...sql`).
2. **Migrationer körs FÖRE production förs fram, aldrig efter.** De är additiva (`ADD COLUMN IF NOT EXISTS`), så tidigt är alltid säkert — kör dem så snart PR:en mergats till main.
3. **Innan production förs fram: lista migrationerna som tillkommit i main sedan förra releasen** så Martin kan bekräfta att de är körda. `node scripts/vad-slapps.mjs` gör det (commits + migrationer i `origin/production..origin/main`); rått: `git diff --name-only origin/production..origin/main -- supabase/migrations/`.

**Hot-fix-undantag: fixa på `main`, för fram `production` direkt.** När prod är trasig och förare inte kan jobba — gaten får inte stå i vägen. Primärvägen är samma som en release men gjord med en gång: committa fixen till `main` (direkt eller via snabb-PR), kör sedan `git checkout production && git merge --ff-only main && git push`. Då förblir `production` en ren fast-forward av `main`. Bara om `main` av någon anledning är oanvändbar: committa till `production`, och **merga sedan tillbaka `production` → `main`** så de inte glider isär (annars slutar `--ff-only` fungera vid nästa release). En hot-fix som bara ligger i `main` men inte förts fram hjälper ingen förare. "Hot-fix" = "förarna kan inte använda appen just nu"; allt annat väntar på nästa release.

**Branch-namn ska beskriva vad som ändras.** Exempel: `arbetsrapport-dag-stadrunda`, `fix-hpr-import-dedup`, `add-helikopter-v2`. Inte de auto-genererade `claude/optimistic-elion-904505`-namnen från worktree-systemet — om worktreen ger ett sådant, byt branch-namn innan första push.

## Arbetsregler — LÄS

**En vy, en session.** Innan arbete påbörjas i en vy: kolla `git worktree list` och öppna PR:ar (`gh pr list`). Pågår redan arbete i samma vy från en annan branch — stanna och fråga Martin i stället för att bygga parallellt. Två sessioner i samma fil ger merge-konflikter, dubbelarbete och PR:ar som specas mot ett läge som redan hunnit ändras.

**En vy ägs av ett spår.** Med flera parallella chattar som bygger i samma app får en vy bara byggas ut av det spår som äger den. Behöver ett annat spår något i vyn (ett fält, ett kort, en ingång) går det via ägaren — beskriv behovet, låt ägarspåret avgöra var och hur — aldrig förbi. Incident 2026-09-24: helikopter-spåret behövde lass per dag för JD810E och löste det med ett lasskort i arbetsrapportens dagsvy "eftersom föraren är där varje dag". Rimligt i stunden, fel plats i längden: arbetsrapporten handlar om TID (timmar, km, frånvaro, lön), lass är PRODUKTION. Kortet togs bort 2026-09-26 och ingången byggs om i planeringsvyn av det spåret. Testet: skulle vyns ägare ha lagt det här? Om svaret är nej hör det inte hit, oavsett hur bekvämt det är att föraren råkar stå där.

**EN tung körning åt gången — aldrig typkontroll, tester eller bygge i flera worktrees samtidigt.** `tsc`, `vitest` och `next build` tar var sitt par hundra MB till över en GB. Körs de parallellt (flera worktrees, eller en körning medan en annan pågår i bakgrunden) går minnet mot taket — 94 % 2026-10-04, då hela datorn blev seg och testerna fick timeouts som inte var fel i koden. Gör så här: starta en tung process, **vänta tills den är klar**, starta nästa. Avsluta dev-servrar, testprocesser och headless-webbläsare när de är klara (`Get-CimInstance Win32_Process` och filtrera på `vitest|tsc|--headless|next`); rör aldrig importens watchdog eller MCP-servrarna. **Under arbete:** kör bara tester och `tsc` för filer som ändrats (`vitest run <sökväg>`). **Hela sviten och en full tsc-jämförelse mot main körs EN gång, precis före push.** En ny worktree behöver `npm ci` (tungt) — ta bort worktreen när PR:en är mergad.

**Aldrig bar `git stash` i detta repo — använd WIP-commit.** Stash-stacken är delad per *repository*, inte per worktree, och flera sessioner arbetar parallellt i samma repo (~45 worktrees). En `git stash pop` kan plocka en ANNAN sessions stash. Behöver du gömma undan ändringar temporärt: gör en **WIP-commit** på den egna branchen i stället (`git commit -m "wip"`, ångra sedan med `git reset HEAD~1`). Ska du mäta tsc-baseline mot main: gör det i en **egen worktree på origin/main**, aldrig genom att stasha bort ditt arbete. Incident 2026-07-22: `stash push` + `stash pop` runt en tsc-körning i en worktree drog in en annan sessions ocommittade arbete (tilldelad skotare + uppföljning) i fel commit — den andra sessionens arbete försvann ur dess checkout och fick räddas som stash `de613e6d` + patch-fil. Måste stash ändå användas: `git stash push -u -m "<unik-tagg>"`, fånga SHA direkt via `git stash list --format='%H %gs'`, återställ med `git stash apply <sha>` — aldrig `pop`.

**Verifiera på INNEHÅLL, inte på utskrift** (gäller alla sessioner). Ett patch-script som skriver "OK", en `.select()` som räknar rader, en preview som ser rätt ut — inget av det bevisar att värdet faktiskt landade. Efter varje skrivning: läs tillbaka det FAKTISKA innehållet (grep filen, läs kolumnvärdet, jämför mot avsikten) innan du går vidare eller committar. Samma princip som appen själv bygger på: radräkning bevisar att en rad rördes, inte att ändringen finns i den.

**Squash-merge tappar commits — verifiera LEVERANS, inte merge-status.** Fyra gånger på en vecka har en commit fallit bort i en squash-merge (#254 ×2, #268): en följd-commit pushad till en PR som redan hunnit mergas bygger preview men når aldrig main. Två regler, utan undantag:

1. **Pusha ALDRIG till en PR utan att först kolla att den fortfarande är öppen** — `gh pr view <nr> --json state`. Är den `MERGED`: öppna en NY PR för commiten. Pusha aldrig till den stängda grenen — det bygger en preview som ser rätt ut men aldrig landar i main.
2. **Efter varje merge Martin gör: verifiera på INNEHÅLL att ändringen finns i `origin/main`** — `git fetch` + grep efter en unik markör ur diffen (`git show origin/main:<fil> | grep <markör>`), aldrig på PR-status. "Merged" betyder inte "levererad": squashen kan ha tagit bara en delmängd av commitsen (#268 tog 1 av 2 — den data-drivna korta-stopp-fixen tappades och fick återlandas i #274).

**En manuell km-rättning måste sätta `km_kalla='forare'`, annars är den inte skyddad.** Gäller SQL i prod lika mycket som appen. `arbetsdag.km_kalla` är sedan 2026-09-09 det ENDA skyddet mot att nattjobbet och beräkna-vid-öppning fyller en km-nolla (vakten på `redigerad` är borttagen — `redigerad` betyder att tiderna rättats, inte km). Dalarna-dagarna nollades via SQL i augusti 2026 innan fältet fanns: 30 av 106 hade fyllts på nytt (1 244 km/dag, 3 730 mil i löneunderlaget) innan det upptäcktes. Vakten skyddar bara det som faktiskt är märkt. `npx tsx scripts/km-nattjobb-torrkorning.ts` visar vad nattjobbet skulle skriva utan att röra något.

## Framtida förbättringar (bygg inte nu)

### HPR-automatik som komplement till "Starta körning"-knappen
När förare trycker "Starta körning" sätts `status='pagaende'` + `pagaende_startad_timestamp`. Men om föraren glömt trycka knappen och börjar producera direkt, sitter objektet kvar som `'planerad'` trots att produktion pågår.

**Förslag:** när en HPR-fil med `objekt_id` kommer in via import-flödet (`scripts/skogsmaskin_import_version_6.py` eller `import_hpr.py`) för ett objekt med `status='planerad'` → sätt automatiskt `status='pagaende'` + `pagaende_startad_timestamp = NOW()`. Skyddsnät om föraren glömt trycka knappen.

**Inte byggt nu** eftersom objekten inte är skarpt upplagda under utveckling — risken att auto-statusbyte triggas på testdata är högre än värdet just nu. Bygg när HPR-objekt-kopplingen är skarp i produktion.

### Avslut-automatik som komplement till "Avsluta objekt"-knappen
När förare/admin trycker "Avsluta objekt" sätts `status='avslutat'` + `avslutad_timestamp`. Men ett objekt kan vara klart utan att någon har tryckt — skotaren har precis lastat sista lasset, eller produktionen är slut.

**Förslag:** när FPR-filer (skotardata) flödar skarpt och `objekt_id`-kopplingen fungerar, kan objekt avslutas automatiskt när skotad volym når planerad volym (eller liknande signal — t.ex. inga nya HPR-stammar på X dagar för ett `'pagaende'`-objekt). Skyddsnät mot att objekt sitter kvar som `'pagaende'` på obestämd tid.

**Inte byggt nu** eftersom datan inte finns:
- `fakt_lass` (FPR-tabellen) är tom (0 rader vid STEG 7-bygget)
- Bara 25 av 802 HPR-filer har `objekt_id`-koppling
- Inga objekt har planerad eller skotad volym satt

Bygg när FPR-import flödar skarpt OCH HPR-objekt-kopplingen är tillräckligt komplett för att tröskeln blir tillförlitlig.
