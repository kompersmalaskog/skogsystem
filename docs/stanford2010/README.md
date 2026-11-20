# Stanford2010 — Schemareferens och parser-mappning

Dokumentation av hur skogsystem-importen tolkar Stanford2010-XML från
skogsmaskinerna (Ponsse, Rottne) och vilka element/fält som landar var
i Supabase.

## Bakgrund

Stanford2010 är Skogforsks XML-baserade dataformat för skogsmaskiner —
maskinen producerar filer som beskriver produktion, tider, kalibrering
och avbrott. Standarden underhålls av Skogforsk och har versionerade
XSD-scheman.

**Källa:** [Skogforsk — StanForD 2010](https://www.skogforsk.se/english/projects/stanford/stanford-2010/)

## Versioner

| Version | Status | Notering |
|---|---|---|
| v3.1 | I drift | Ponsse Opti4G 4.785 producerar dessa filer idag |
| v3.6 | Närmast vår data | Senaste i v3-familjen — används som referens i denna doc |
| v4.1 | Senaste | **Breaking change** — strukturella ändringar i Repair-grenen m.m. (se per-fil-doc) |

Vår parser ([skogsmaskin_import_version_6.py](../../skogsmaskin_import_version_6.py)) är
skriven för v3.x. Om Ponsse/Rottne uppgraderar till v4 behöver flera ställen i parsern
skrivas om — varje fildokumentation flaggar vilka element som ändras.

## Filtyper

Stanford2010 definierar 15 standardiserade filändelser för olika meddelandetyper.
Vi hanterar fyra av dem idag — övriga finns i specen men har ingen parser-stöd.

### Hanteras idag

| Filändelse | Meddelande | Producerad av | Dokumentation |
|---|---|---|---|
| **`.mom`** | Operational Monitoring (drift, tider, avbrott) | Skördare + skotare | [mom-operational-monitoring.md](mom-operational-monitoring.md) |
| **`.hpr`** | Harvested Production (stammar, stockar) | Skördare | _placeholder — ej skriven än_ |
| **`.hqc`** | Harvesting Quality Control (kalibrering) | Skördare | _placeholder — ej skriven än_ |
| **`.fpr`** | Forwarded Production (lass, sortiment) | Skotare | _placeholder — ej skriven än_ |

### Finns i Stanford men ej implementerat

| Filändelse | Meddelande | Användning |
|---|---|---|
| `.pin` | Product Instruction | Bockning/sortiment-instruktioner till maskin |
| `.oin` | Object Instruction | Objekt-instruktion till maskin |
| `.spi` | Species Group Instruction | Trädslags-definitioner |
| `.ogi` | Object Geographical Instruction | Geografisk objekt-instruktion |
| `.foi` | Forwarding Object Instruction | Skotnings-objekt-instruktion |
| `.fdi` | Forwarding Delivery Instruction | Skotnings-leveransinstruktion |
| `.thp` | Total Harvested Production | Aggregerad produktionsdata |
| `.fqc` | Forwarding Quality Control | Skotnings-kvalitetskontroll |
| `.ogr` | Object Geographical Report | Geografisk objektrapport |
| `.udi` | User Defined Data Instruction | Användardefinierad data |
| `.env` | XML Envelope | Wrapper med flera filer i samma message |

I XSD-paketet finns även scheman utan dokumenterade filändelser i
naming-konventionen: `DesignInstruction`, `FelledBunchedProduction`,
`FellingBunchingObjectInstruction`, `FellingBunchingQualityControl`,
`HarvestedDeltaProduction`, `SkiddedProduction`, `SkiddingObjectInstruction`,
`StanForD2010EnvelopeAcknowledgement`, `StemVolumeTableInstruction`,
`YardedProduction`, `YardingObjectInstruction`. Dessa är primärt relevanta för
specialiserade maskintyper (skidare, gallring i bunt, vägtransport till väg)
som vi inte har i flottan.

Komprimerade filer får `z`-suffix (`.hprz`, `.momz` osv) — vår parser hanterar
inte komprimerade filer idag, de packas upp manuellt vid behov.

## Importflöde

1. Filer landar i operatörens lokala OneDrive-synk-mapp:
   `<HOME>\Kompersmåla Skog\Maskindata - Dokument\MOM-filer\Inkommande\`
   (sökvägen är **användar-specifik** — Martin har `C:\Users\lindq\...`,
   andra operatörer får annan basväg. Hårdkodad i parserns `INKOMMANDE`-konstant
   (sök `INKOMMANDE = ` i [skogsmaskin_import_version_6.py](../../skogsmaskin_import_version_6.py)).
   När fler maskiner/användare tillkommer kommer detta behöva göras
   konfigurerbart.)
2. Filer detekteras av Observer-tråden i `skogsmaskin_import_version_6.py`
   (startas via `python skogsmaskin_import_version_6.py` och svar `j` på
   övervakningsprompten). Alternativt manuell körning där `n` på prompten gör
   att bara Inkommande-mappen processas en gång.
3. Filtyp (filändelse) avgör parser: `parse_mom_file()` / `parse_hpr_file()` /
   `parse_hqc_file()` / `parse_fpr_file()`.
4. Strukturerade rader skickas till Supabase via PostgREST (`upsert_data()`).
5. Filen flyttas till `Behandlade/{maskin_id}/{filtyp}/`.
6. `meta_importerade_filer` registrerar status (OK / FEL + felmeddelande).

MOM- och FPR-filer är **kumulativa** — varje ny fil innehåller all tidigare
data plus nya entries. De kan omimporteras om filens mtime är nyare än
`importerad_tid` (60 s marginal). HPR-filer är också kumulativa men
dedupliceras per `(hpr_fil_id, stam_nummer)`.

## Symboler i denna dokumentation

| Symbol | Betyder |
|---|---|
| ✅ | Parsern fångar elementet |
| ❌ | Finns i specen men parsern hoppar över |
| ⚪ | Finns i specen, vi har medvetet beslutat att inte fånga |

Allvarlighetsgrad på luckor:

| Nivå | Konsekvens |
|---|---|
| **Hög** | Data försvinner / verksamhetspåverkan |
| **Medium** | Data fångas men hamnar i fel kategori / oprecist |
| **Låg** | Nice-to-have, inget akut behov |

## Källfiler — XSD-paket

Senaste och äldre versioner laddas direkt från Skogforsk
(inget mejl/registrering behövs):

- v4.1 (senaste): [stanford2010_release_4.1.zip](https://www.skogforsk.se/contentassets/1a68cdce4af1462ead048b7a5ef1cc06/stanford2010_release_4.1.zip)
- v4.0: [stanford2010_release_4.0.zip](https://www.skogforsk.se/contentassets/1a68cdce4af1462ead048b7a5ef1cc06/stanford2010_release_4.0.zip)
- v3.6 (närmast vår v3.1): [stanford2010_release_3.6.zip](https://www.skogforsk.se/contentassets/1a68cdce4af1462ead048b7a5ef1cc06/stanford2010_release_3.6.zip)

Varje paket innehåller XSD per filtyp + `StanForD2010CommonDefinitions` + `CodeList`.

Skogforsks introduktionsdokument med komplett filändelse-tabell:
[Stanford 2010 Introduction (PDF)](https://www.skogforsk.se/contentassets/1a68cdce4af1462ead048b7a5ef1cc06/stanford-2010-introduction-150826.pdf)
(sida 7 — "Naming conventions").

## Relaterad kod

| Fil | Syfte |
|---|---|
| [skogsmaskin_import_version_6.py](../../skogsmaskin_import_version_6.py) | Huvud-parser för alla filtyper |
| [auto_import_watch.py](../../auto_import_watch.py) | (Legacy) Bakgrunds-watchdog som triggar import via subprocess. Används inte aktivt — Observer-tråden i `skogsmaskin_import_version_6.py` med `--auto`-flagga är nuvarande mekanismen. |
| [import_hpr.py](../../import_hpr.py) | Fristående HPR-import från Behandlade-mappen |
| [reimport_allt.py](../../reimport_allt.py) | Rensa fakta-tabeller + omimportera allt |
| [validate_data.py](../../validate_data.py) | Hitta dagar med produktion utan tidsdata + omimportera |
