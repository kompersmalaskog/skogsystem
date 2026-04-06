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
- G15h = (processing_sek + terrain_sek) / 3600
- m³/G15h = SUM(volym_m3sub) / SUM(g15_h) — viktat snitt, aldrig snitt av snitt
- L/m³ = SUM(bransle_liter) / SUM(volym_m3sub) — viktat snitt
- Medelstam per objekt = SUM(volym_m3sub) / SUM(stammar)

### Medelstamsklasser
- Gallringsskördare (R64101): 0.00-0.03, 0.03-0.05, 0.05-0.07, 0.07-0.09, 0.09-0.12, 0.12+
- Slutavverkning (PONS20SDJAA270231): 0.0-0.1, 0.1-0.2, 0.2-0.3, 0.3-0.4, 0.4-0.5, 0.5-0.7, 0.7+

### HPR-filer är kumulativa
Varje ny HPR-fil innehåller alla tidigare stammar plus nya. Vid visning/summering: använd BARA filen med högst stammar_count per objekt, aldrig alla filer.

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
| `/` | Hem | Dashboard med funktionskort till alla vyer |
| `/login` | Login | E-post/lösenord via Supabase Auth |
| `/uppfoljning` | Uppföljning | Jobbuppföljning med KPI:er, maskindrift, operatörsstatistik, bränsle, sortimentsfördelning |
| `/maskinvy` | Maskinvy | Maskinöversikt med flikar för Skördare, Skotare och jämförelse |
| `/maskinvy2` | Skördare Analytics | Detaljerad produktionsanalys per vecka/månad/kvartal/år |
| `/maskinvy-ny` | Maskinvy Ny | Ny maskinvy med daglig produktion, KPI:er, tidsfördelning |
| `/arbetsrapport` | Arbetsrapport | Generering av arbetsrapporter |
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
`fakt_produktion`, `fakt_tid`, `fakt_lass`, `fakt_lass_sortiment`, `dim_maskin`, `dim_operator`, `dim_tradslag`, `dim_sortiment`, `dim_objekt`, `gps_tracks`, `planering_markeringar`

### Maskinvy / Maskinvy2 / Maskinvy-ny
`fakt_tid`, `fakt_produktion`, `dim_maskin`, `dim_operator`, `maskin_logg`

### Planering
`planering_markeringar`, `dim_objekt`, `kartbilder`, `tma_assessments`, `hpr_filer`, `hpr_stammar`, `skotning_uttag`, `warning_acknowledgments`, `warning_settings`

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
`utbildningar`, `utbildningsbevis`

### Förbättringsförslag
`feedback`, `audio` (storage bucket)

---

## Tabellöversikt

### Dimensionstabeller
- `dim_maskin` — maskin_id (text), tillverkare, modell, maskin_typ
- `dim_operator` — operator_id, operator_namn, maskin_id
- `dim_objekt` — objekt_id, object_name, vo_nummer
- `dim_tradslag` — tradslag_id, species_key, namn, maskin_id
- `dim_sortiment` — sortiment_id, product_key, namn, maskin_id, pris_per_m3

### Faktatabeller
- `fakt_produktion` — datum, maskin_id, operator_id, objekt_id, tradslag_id, stammar, volym_m3sub, volym_m3sob
- `fakt_tid` — datum, maskin_id, operator_id, processing_sek, terrain_sek, other_work_sek, disturbance_sek, maintenance_sek, avbrott_sek, tomgang_sek, kort_stopp_sek, rast_sek, engine_time_sek, bransle_liter
- `fakt_sortiment` — datum, maskin_id, objekt_id, sortiment_id, stockar, volym_m3sob, volym_m3sub
- `fakt_skift` — maskin_id, operator_id, login_time, logout_time
- `fakt_avbrott` — driftstopp och störningar
- `fakt_lass` — lastdata (volym, avstånd)
- `fakt_lass_sortiment` — sortiment per last
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
- `objekt` — objekt med planeringsstatus
- `maskiner` — maskinregister
- `maskin_service` — serviceloggar
- `maskin_logg` — maskinaktivitetslogg
- `maskin_ko` — maskinko/ordning
- `ledighet_ansokningar` — ledighetsansökan
- `utbildningar` / `utbildningsbevis` — utbildning och certifikat
- `planering_markeringar` — kartmarkeringar för planering
- `kartbilder` — kartbilder
- `tma_assessments` — terrängframkomlighet
- `skotning_uttag` — skotningsuttag
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
- `reimport_fakt_tid.py` — Bygger om fakt_tid med entry-level dedup
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
- Statushantering (planerad/pågående/avslutad)

---

## Repo
- GitHub: kompersmalaskog/skogsystem
- Vercel bygger automatiskt vid push till main
- Rätt repo: C:\Kompersmåla Skog\Kompersmåla Skog\Appen\skogsystem-claude
- OneDrive-mapp: C:\Users\lindq\Kompersmåla Skog\Maskindata - Dokument\MOM-filer
- Filtyper: MOM, HPR, HQC, FPR — aldrig PRL
