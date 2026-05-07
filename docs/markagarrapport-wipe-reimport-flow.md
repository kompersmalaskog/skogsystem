# Wipe + reimport-flöde efter dedupe-fix

Dokumenterar processen för att rensa duplicerad data i `detalj_stock`/`detalj_stam` och reimportera HPR-filer per objekt med det patchade import-skriptet. Skissdokument — inte kod.

## Förutsättningar (i ordning)

1. **Migration A applicerad:** `20260506_dim_sortiment_pris.sql` — pris/dim-kolumner droppade från dim_sortiment, ny `dim_sortiment_pris`-tabell finns
2. **Importskript patchat:** `skogsmaskin_import_version_6.py` med Patch 1–4 (stock_key utan filnamn, stem_key/log_key separata, ProductMatrixItem-läsning, upsert på composite-nyckel)
3. **Migration B INTE applicerad än:** `20260507_detalj_stock_dedupe_keys.sql` körs EFTER wipe + reimport, annars failar UNIQUE-constraint på dubletter
4. **Behandlade-filer kvar på disk:** alla HPR-filer som tidigare importerats måste finnas tillgängliga i `Behandlade/{maskin_id}/HPR/` för reimport

## Verifierat om relaterade skript

- **`import_hpr.py`** (fristående parser): rör BARA `hpr_filer`/`hpr_stammar`, inte `detalj_stock`/`detalj_stam`/`dim_sortiment_pris`. Inte drabbad av dedupe-buggen. Lämnas orörd för MVP. Konsolideras med huvudparsern i separat refactor-task efter MVP.
- **`reimport_allt.py`** (körmotor): importerar `parse_hpr_file` + `save_hpr_to_supabase` från huvudskriptet → får alla patcher automatiskt. Wipe-listan saknar `detalj_stock` (måste utökas innan bredd-reimport). HELA-tabellrensning, inte per-objekt-filter.

## Steg 0 — STOPPA WATCHDOG INNAN ALLT

```
Stoppa auto_import_watch.py så inga nya filer kommer in mitt under wipe/reimport.
Verifiera att inga importer pågår (loggar tysta i 1-2 minuter).
```

## Per-objekt (Husjönäs MVP — rekommenderat startsätt)

```
för ett objekt_id (t.ex. Husjönäs '11124938'):

  STEG A — Wipe (per-objekt, snäv omfattning)
    1. SELECT objekt.id (uuid) WHERE vo_nummer = '11124938'
       → spara uuid
    2. SELECT distinct filnamn FROM hpr_filer WHERE objekt_id = uuid
       → spara filnamns-listan
    3. DELETE FROM detalj_stock WHERE objekt_id = '11124938'
    4. DELETE FROM detalj_stam  WHERE objekt_id = '11124938'
    5. DELETE FROM meta_importerade_filer WHERE filnamn IN (filnamns-listan)
    6. DELETE FROM hpr_filer  WHERE objekt_id = uuid
       (hpr_stammar kaskadar via ON DELETE CASCADE-FK)
    7. SKIP dim_sortiment_pris — den är delad mellan objekt på samma maskin.
       Patchade import-skriptet upsertar över befintliga rader.

  STEG B — Reimport (loopa från huvudskriptet)
    8. Lokalisera HPR-filerna i Behandlade-mappen som matchar objektets filnamn
    9. Sortera filnamn på timestamp ASC (äldsta först)
   10. För varje filnamn:
       a. Anropa parse_hpr_file(path) + save_hpr_to_supabase(data)
          (importera funktionerna direkt — som reimport_allt.py gör)
       b. Verifiera att inget fel rapporterats
   11. Logga totalt antal stammar + filer importerade

  STEG C — Verifiering
   12. SELECT count(*) FROM detalj_stam WHERE objekt_id = '11124938'
       → ska vara nära senaste HPR-filens stammar_count (för Husjönäs: 1349)
   13. SELECT count(*) FROM detalj_stock WHERE objekt_id = '11124938'
       → för slutavverkning: ~3-4× detalj_stam (en bottenstock + några stockar
       per stam). För gallring blir ratio annorlunda (inkl. kvistning av topp).
   14. SELECT count(distinct stam_key) FROM detalj_stock WHERE objekt_id = '11124938'
       → ska matcha antal detalj_stam-rader
   15. SELECT count(distinct sortiment_id) FROM dim_sortiment_pris > 0
       → bekräftar att ProductMatrix-läsningen funkat (annars är priser tomma)
   16. Spot-check att dim_sortiment_pris har priser för specifika sortiment
       använda i avverkningen
   17. Kör scripts/test-markagarrapport.ts mot objektet
       → om Husjönäs: jämför mot förväntat 1349/678/375461/235/-16640/+2240/23 av 28
```

## Bredd-reimport (efter Husjönäs verifierat)

Förslag:
1. Husjönäs först (slutavverkning, MVP-test, ~1349 stammar)
2. Hössjömåla (gallring, störst dataset — bra stresstest av dedupe-fixen)
3. Övriga objekt (Sante Dahl, Bastaremåla, Kompersmåla VF)

För bredd-reimport: utöka `reimport_allt.py`:
- Lägg `detalj_stock` i `tables_to_clear`-listan
- Optional: rensa `dim_sortiment_pris` per maskin innan reimport (eller låt upsert ta hand om det — säkrare)
- Stoppa watchdog under hela körningen

## Kritiska beslut innan körning

- **Migration B-tajming:** kör efter att Husjönäs är verifierat (steg C punkt 17). Om constraint failar pga kvarvarande dubletter — diagnos krävs innan bredd-reimport.
- **`dim_sortiment_pris` — gemensam vs per-maskin wipe:** prismatrisen är delad mellan objekt på samma maskin. Per-objekt-wipe ska INTE radera dim_sortiment_pris. Säkrast: rör inte den i steg A:7 — patchade import-skriptet upsertar över befintliga rader.
- **`meta_importerade_filer` — per-objekt vs hela:** rensa endast filnamn för det objekt som reimporteras (steg A:5). Hela tabellen wipe är aggressivt och tar bort import-historiken för MOM/FPR från andra maskiner.

## Faktanivå-verifiering på Husjönäs

Förväntat efter reimport (slutavverkning, en HPR-fil):

| Mätetal | Förväntat |
|---------|-----------|
| stammar | 1 349 |
| volym (m³sub) | 678 |
| virkesvärde (kr) | 375 461 |
| rotstammar | 235 |
| värdeförlust (kr) | −16 640 |
| räddat värde (kr) | +2 240 |
| lyckade avkap | 23 av 28 |

>1 % avvikelse = bug i algoritm eller data.

## Saker som INTE ingår i detta flöde

- HPR-omflytt mellan mappar utöver det minimala för reimport — låt struktur vara
- MOM/HQC/FPR — påverkas inte av denna ändring (stocks/stammar bara via HPR)
- fakt_produktion / fakt_tid — beräknas från MOM, inte HPR
- gps_spar — har egen dedupe-nyckel (tracking_key, filnamn) och påverkas inte
- `import_hpr.py` — separat fristående parser, ingen patch i MVP

## Implementation — föreslagen ordning

1. **Skriv `scripts/wipe-and-reimport-objekt.py`** — per-objekt-script som tar `<objekt_id>` som arg och kör STEG A–C ovan. Stänger ej watchdog (manuellt steg 0).
2. **Kör mot Husjönäs:** `py scripts/wipe-and-reimport-objekt.py 11124938`
3. **Verifiera mot 1349/678/375461 etc.**
4. **Algoritm-edits i `lib/markagarrapport/pris.ts`** — `getPrisForStock(sortimentId, langdCm, diaMm)` mot `dim_sortiment_pris`, plus uppdatera `massaRefPerMaskin` och `aggregate.ts` att läsa priser via lookup
5. **Re-verifiera mot förväntade siffror** — om OK, applicera Migration B
6. **Bredd-reimport** av övriga objekt vid lugnare tillfälle
