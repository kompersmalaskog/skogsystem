# HPR — Harvested Production

`.hpr`-filer beskriver allt som skördats — varje stam, varje stock, sortiment,
trädslag, GPS-position, kapdata. Genereras av skördare när skift avslutas eller
manuellt på begäran.

| Aspect | Värde |
|---|---|
| Stanford-meddelande | `HarvestedProduction` |
| Filändelse | `.hpr` (komprimerad: `.hprz`, ej parsad) |
| Producerad av | Skördare (Ponsse Scorpion Giant, Rottne H8E) |
| XSD (vår referens) | [`HarvestedProduction_V3p6.xsd`](https://www.skogforsk.se/contentassets/1a68cdce4af1462ead048b7a5ef1cc06/stanford2010_release_3.6.zip) (157 rader — definierar bara root, resten ärvs från `StanForD2010CommonDefinitions_V3p6.xsd`) |
| Faktiska filer i drift | v3.1 (Ponsse Opti4G 4.785) — Rottne också v3.x |
| Parser | [`parse_hpr_file()`](../../skogsmaskin_import_version_6.py) i skogsmaskin_import_version_6.py |
| DB-skrivning | [`save_hpr_to_supabase()`](../../skogsmaskin_import_version_6.py) + [`_save_hpr_tables()`](../../skogsmaskin_import_version_6.py) |
| Alternativ parser | [`import_hpr.py`](../../import_hpr.py) — fristående script som processar Behandlade-mappen, skriver bara till `hpr_filer` + `hpr_stammar` |

## Innehåll

- [Filstruktur — top-level](#filstruktur--top-level)
- [Maskin-data (`<Machine>`)](#maskin-data-machine)
- [Objekt (`<ObjectDefinition>`)](#objekt-objectdefinition)
- [Sortiment (`<ProductDefinition>`)](#sortiment-productdefinition)
- [Trädslag (`<SpeciesGroupDefinition>`)](#trädslag-speciesgroupdefinition)
- [★ Stammar (`<Stem>`) — huvuddata](#-stammar-stem--huvuddata)
  - [StemType — basklassen (gemensam för alla stam-varianter)](#stemtype--basklassen-gemensam-för-alla-stam-varianter)
  - [`<SingleTreeProcessedStem>` — fångas](#singletreeprocessedstem--fångas)
  - [`<MultiTreeProcessedStem>` — IGNORERAS HELT](#multitreeprocessedstem--ignoreras-helt)
  - [`<SingleTreeFelledStem>` / `<MultiTreeFelledStem>` — IGNORERAS](#singletreefelledstem--multitreefelledstem--ignoreras)
- [Stockar (`<Log>` under SingleTreeProcessedStem)](#stockar-log-under-singletreeprocessedstem)
- [GPS-spår (`<Tracking>` / `<TrackCoordinates>`)](#gps-spår-tracking--trackcoordinates)
- [DB-mappning — sammanfattning](#db-mappning--sammanfattning)
- [Kända luckor — sammanfattning](#kända-luckor--sammanfattning)
  - [Breaking changes vid eventuell v4-uppgradering](#breaking-changes-vid-eventuell-v4-uppgradering)
- [Kända datakvalitetsproblem](#kända-datakvalitetsproblem)
- [Verifierings-data](#verifierings-data)

## Filstruktur — top-level

```
<HarvestedProduction xmlns="urn:skogforsk:stanford2010" version="3.1" messageType="hpr">
  <HarvestedProductionHeader>
    <CreationDate>...</CreationDate>
    <ApplicationVersionCreated>Ponsse Opti4G 4.785</ApplicationVersionCreated>
    ...
  </HarvestedProductionHeader>
  <Machine>
    <BaseMachineManufacturerID>PONS20SDJAA270231</BaseMachineManufacturerID>
    <MachineBaseModel>Scorpion Giant 8W</MachineBaseModel>
    <SpeciesGroupDefinition>...</SpeciesGroupDefinition>     ← N stycken (trädslag)
    <ProductDefinition>...</ProductDefinition>               ← N stycken (sortiment)
    <DiameterSectionDefinition>...</DiameterSectionDefinition> ← N stycken (diameterklasser, sällan använt)
    <ObjectDefinition>...</ObjectDefinition>                 ← N stycken
    <OperatorDefinition>...</OperatorDefinition>             ← N stycken
    <Tracking>                                               ← 0..N (körspår-block)
      <TrackCoordinates>...</TrackCoordinates>               ← N stycken per Tracking
    </Tracking>
    <Stem>...</Stem>                                          ← N stycken (★ HUVUDDATA — varje stam)
    <UserDefinedData>...</UserDefinedData>                   ← 0..1
  </Machine>
  <Extension>...</Extension>                                 ← 0..1
</HarvestedProduction>
```

`messageType="hpr"` är ett krav-attribut på root med fixerat värde "hpr".

## Maskin-data (`<Machine>`)

| Element | Vår parser | Mappning |
|---|---|---|
| `<BaseMachineManufacturerID>` | ✅ | `dim_maskin.maskin_id` (text-PK). Normaliseras (Rottne får R-prefix) |
| `<MachineKey>` (UUID) | ⚪ | Fallback om BaseMachineManufacturerID saknas |
| `<MachineBaseManufacturer>` | ✅ | `dim_maskin.tillverkare` |
| `<MachineBaseModel>` | ✅ | `dim_maskin.modell` |
| Maskintyp | ✅ | Hårdkodat `'Harvester'` (HPR produceras bara av skördare) |
| `<MachineHeadManufacturer>` / `<MachineHeadModel>` | ❌ | **Lucka (Låg)** — vi sätter inte `aggregat`/`aggregat_tillverkare` från HPR (gör det från MOM istället, vilket är OK eftersom samma maskin har båda) |
| `<MachineApplicationVersion>` | ❌ | **Lucka (Låg)** — samma som MOM (kanariefågel för v4) |
| `<MachineOwner>` (BusinessName) | ❌ | **Lucka (Låg)** — vi fångar via MOM istället |

## Objekt (`<ObjectDefinition>`)

HPR fångar **mer objekt-info** än MOM eftersom skördarna lägger sin lokala
beställnings- och certifieringsinformation här.

| Element | Vår parser | Mappning |
|---|---|---|
| `<ObjectKey>` | ✅ | Del av `objekt_id` |
| `<ObjectUserID>` / `<ContractNumber>` | ✅ | `vo_nummer` (ContractNumber prioriteras, ObjectUserID som fallback) |
| `<ObjectName>` | ✅ | `dim_objekt.object_name` |
| `<LoggingForm>` (`LoggingFormCode` + `LoggingFormDescription`) | ✅ | `dim_objekt.avverkningsform` |
| `<ForestCertification>` | ✅ | `dim_objekt.certifiering` + UPDATE på `objekt.cert` via PATCH |
| `<ForestOwner>` (`LastName`) | ✅ | `dim_objekt.skogsagare` (vi tar bara LastName) |
| `<LoggingOrganisation>` (`ContactInformation/BusinessName`) | ✅ | `dim_objekt.bolag` (VIDA, Stora Enso etc.) |
| `<StartDate>` / `<EndDate>` | ✅ | `dim_objekt.start_date` / `end_date` |
| `<ForestOwner>` (FirstName, address, phone etc.) | ❌ | **Lucka (Låg)** — bara LastName fångas |
| `<SubObject>` | ❌ | **Lucka (Låg)** — del-objekt, sällan använt i nuvarande operation |

## Sortiment (`<ProductDefinition>`)

```xml
<ProductDefinition>
  <ProductKey>405</ProductKey>
  <ClassifiedProductDefinition>          <!-- ELLER UnclassifiedProductDefinition -->
    <ProductName>Tall Sågtimmer</ProductName>
    <ProductGroupName>Tall</ProductGroupName>
    <SpeciesGroupKey>37</SpeciesGroupKey>
    <Price>...</Price>
    <Color1>true</Color1>                 <!-- färgmärkning -->
    ...
  </ClassifiedProductDefinition>
</ProductDefinition>
```

| Element | Vår parser | Mappning |
|---|---|---|
| `<ProductKey>` | ✅ | Del av `sortiment_id` = `f"{maskin_id}_{prod_key}"` |
| `<ProductName>` | ✅ | `dim_sortiment.namn`. Letar i `<ClassifiedProductDefinition>` eller `<UnclassifiedProductDefinition>` om inte direkt på `<ProductDefinition>`. Om både `ProductGroupName` och `ProductName` finns konkateneras: `f"{group}: {name}"` |
| `<Price>` | ✅ | `dim_sortiment.pris_per_m3` |
| `<Color1>` (boolean) | ✅ | `dim_sortiment.fargmarkning` (true/false) |
| `<SpeciesGroupKey>` (referens till trädslag) | ⚪ | Vi använder Stem.SpeciesGroupKey istället, ProductDefinition.SpeciesGroupKey är redundant |
| `<DiameterClass>` / `<LengthClass>` | ❌ | **Lucka (Låg)** — diameter- och längdklasser per produkt (för bockning), inte fångade |
| `<ProductionMessageDestination>` | ❌ | **Lucka (Låg)** — destinationsinformation |

## Trädslag (`<SpeciesGroupDefinition>`)

| Element | Vår parser | Mappning |
|---|---|---|
| `<SpeciesGroupKey>` | ✅ | Del av `tradslag_id` = `f"{maskin_id}_{sp_key}"` |
| `<SpeciesGroupName>` | ✅ | `dim_tradslag.namn` ("Tall", "Gran", "Björk", "Övrigt löv") |
| `<DBHHeight>` | ❌ | **Lucka (Låg)** — höjd för DBH-mätning per trädslag (normalt 120cm i Sverige). Vi antar standard. |
| `<Grades>` | ❌ | **Lucka (Låg)** — kvalitetsgradering per trädslag |

## ★ Stammar (`<Stem>`) — huvuddata

Varje stam som skördats är ett `<Stem>`-element. En typisk fil från en
slutavverkningsdag har 200–500 stammar; en gallringsdag kan ha 500–2000.

### StemType — basklassen (gemensam för alla stam-varianter)

```
<Stem>
  <StemKey>118563</StemKey>                                <!-- unikt per maskin/objekt -->
  <ObjectKey>99</ObjectKey>
  <SubObjectKey>...</SubObjectKey>                          <!-- 0..1, sällan använt -->
  <SpeciesGroupKey>37</SpeciesGroupKey>                     <!-- ref till SpeciesGroupDefinition -->
  <OperatorKey>13</OperatorKey>
  <HarvestDate>2026-04-22T13:02:51+02:00</HarvestDate>
  <BioEnergyAdaption>...</BioEnergyAdaption>                <!-- 0..1, GROT-flagga -->
  <StemNumber>1</StemNumber>                                <!-- löpnummer i filen -->
  <ProcessingCategory>SingleTreeProcessing</ProcessingCategory>
  <StemCoordinates receiverPosition="..." coordinateReferenceSystem="WGS84">
    <Latitude latitudeCategory="North">60.6237097</Latitude>
    <Longitude longitudeCategory="East">16.6530115</Longitude>
    <Altitude>89.210</Altitude>
    <CoordinateDate>...</CoordinateDate>
  </StemCoordinates>
  <StemCode>...</StemCode>                                  <!-- 0..1 -->
  <StumpTreatment>true|false</StumpTreatment>               <!-- 0..1, stubbehandling mot rotröta -->
  <BoomPositioning>...</BoomPositioning>                    <!-- 0..1, krans-positionering -->
  <Extension>...</Extension>                                <!-- 0..1 -->

  ⌃ choice (en av fyra):
  ├ <SingleTreeProcessedStem>...</SingleTreeProcessedStem>      <!-- ✅ fångas -->
  ├ <MultiTreeProcessedStem>...</MultiTreeProcessedStem>        <!-- ❌ IGNORERAS -->
  ├ <SingleTreeFelledStem>...</SingleTreeFelledStem>           <!-- ❌ IGNORERAS -->
  └ <MultiTreeFelledStem>...</MultiTreeFelledStem>             <!-- ❌ IGNORERAS -->
</Stem>
```

| Element (basklass) | Vår parser | Mappning |
|---|---|---|
| `<StemKey>` | ✅ | `detalj_stam.stam_key`. Auto-generaras (`auto_N`) om saknas |
| `<ObjectKey>` | ✅ | Mappas via `obj_key_map` till `objekt_id` (vo_nummer eller `f"{maskin}_{obj}"`) |
| `<SpeciesGroupKey>` | ✅ | `tradslag_id` |
| `<OperatorKey>` | ❌ | **Lucka (Medium)** — operatör per stam ignoreras (stammar attribueras till maskin, inte till specifik operatör). Skulle möjliggöra "produktion per operatör per dag i HPR-noggrannhet" |
| `<HarvestDate>` | ✅ | `detalj_stam.tidpunkt` (Rottne) — Ponsse använder `<ProcessingDate>` inuti SingleTree istället |
| `<BioEnergyAdaption>` | ✅ | `hpr_stammar.bio_energy_adaption` (GROT-bioenergi) |
| `<StemNumber>` | ⚪ | Vi använder eget `hpr_stam_nummer`-räknare istället |
| `<ProcessingCategory>` | ⚪ | Implicit av vilken Stem-variant som finns |
| `<StemCoordinates>` (Latitude/Longitude/Altitude) | ✅ | `detalj_stam.latitude/longitude/altitude` |
| `<StemCoordinates>` (`@receiverPosition`, `@coordinateReferenceSystem`) | ❌ | **Lucka (Låg)** — vi antar WGS84 och basmaskin-position |
| `<StemCoordinates>` (`<CoordinateDate>`) | ❌ | **Lucka (Låg)** — när koordinaten togs (skiljer från HarvestDate vid sen processning) |
| `<StumpTreatment>` (boolean) | ✅ | `detalj_stam.stubbbehandling` |
| `<StemCode>` | ❌ | **Lucka (Låg)** — operatörens egen kategorisering |
| `<BoomPositioning>` | ❌ | **Lucka (Låg)** — krans-arbete-data |
| `<Extension>` | ⚪ | XML extension-mekanism, inte standardiserat |

### `<SingleTreeProcessedStem>` — fångas

Standard-fall för slutavverkning och de flesta gallringar. En stam = en post.

```xml
<SingleTreeProcessedStem>
  <DBH>377</DBH>                                  <!-- diameter brösthöjd, mm -->
  <ReferenceDiameter referenceDiameterHeight="111">376</ReferenceDiameter>
  <StemGrade>
    <GradeValue gradeStartPosition="0">1</GradeValue>   <!-- 1-4, kvalitet -->
  </StemGrade>
  <StemDiameters>...</StemDiameters>              <!-- diameterprofil längs stammen -->
  <Reversing>...</Reversing>                      <!-- 0..N, backning under bearbetning -->
  <Log>...</Log>                                  <!-- 1..N, en per stock -->
  <ProcessingDate>...</ProcessingDate>            <!-- Ponsse-specifik plats för datum -->
  <ManualFreeBuck>true|false</ManualFreeBuck>     <!-- manuell frikap -->
  <Coordinates>...</Coordinates>                  <!-- Ponsse: GPS här istället för Stem-nivå -->
</SingleTreeProcessedStem>
```

| Element | Vår parser | Mappning |
|---|---|---|
| `<DBH>` (mm) | ✅ | `detalj_stam.dbh_mm` |
| `<ReferenceDiameter>` + `@referenceDiameterHeight` | ❌ | **Lucka (Låg)** — referensdiameter på annan höjd än DBH |
| `<StemGrade>/<GradeValue>` | ✅ | `detalj_stam.stem_grade` (1-4) |
| `<GradeValue>` (`@gradeStartPosition`) | ❌ | **Lucka (Låg)** — om stammen byter kvalitet på olika höjder fångar vi bara första värdet |
| `<StemDiameters>` (DiameterValue, DiameterMeasuredStartHeight, DiameterMeasuredEndHeight) | ❌ | **Lucka (Medium)** — komplett diameterprofil längs stammen. Skulle möjliggöra avancerad form-analys + alternativ volymberäkning |
| `<Reversing>` | ❌ | **Lucka (Låg)** — backning indikerar bearbetningsproblem |
| `<ManualFreeBuck>` (boolean) | ✅ | `detalj_stam.manuell_frikap` |
| `<ProcessingDate>` (Ponsse) | ✅ | `detalj_stam.tidpunkt` (prioriteras före Stem.HarvestDate på Ponsse) |
| `<Coordinates>` (Ponsse, alternativ till Stem.StemCoordinates) | ✅ | Sökväg-fallback i parsern |

### `<MultiTreeProcessedStem>` — IGNORERAS HELT

```xml
<MultiTreeProcessedStem>
  <StemBunchKey>...</StemBunchKey>
  <DBH>...</DBH>
  <ReferenceDiameter>...</ReferenceDiameter>
  <StemGrade>...</StemGrade>
  <Log>...</Log>
</MultiTreeProcessedStem>
```

Parsern har:
```python
single_tree = find_element(stem, 'SingleTreeProcessedStem', ns)
if single_tree is None:
    continue   # ← MultiTree hoppas över, ingen rad skapas
```

**Konsekvens:** Stammar som processas i bunt (flerstamshantering — vanligt i
gallring av klena tall/gran) skapas inte i `detalj_stam` eller `hpr_stammar`.
Stockarna räknas inte heller. Detta är en **känd Lucka (Hög)** för gallring.

Notera att MOM-parsern hanterar MTH (`processtyp = 'MTH'`) korrekt på
`fakt_produktion`-nivå (volymtotaler), så maskinens TOTALA dagsproduktion
är riktig — men per-stam-detaljer i HPR försvinner.

### `<SingleTreeFelledStem>` / `<MultiTreeFelledStem>` — IGNORERAS

"Felled" = endast fälld (inte processad/avkapad). Används av särskilda
fällare-buntare-maskiner (FB) som lägger osågade stammar för efterprocessning
av en annan maskin. **Inte relevant för vår nuvarande maskinflotta** (alla våra
skördare processar direkt). Om vi får en sådan maskin i framtiden behövs
parser-stöd. **Lucka (Låg)** baserat på maskinflotta.

## Stockar (`<Log>` under SingleTreeProcessedStem)

```xml
<Log>
  <LogKey>1</LogKey>
  <ProductKey>405</ProductKey>                              <!-- ref till ProductDefinition -->
  <LogVolume logVolumeCategory="m3 (price)" logMeasurementCategory="Machine">0.5322</LogVolume>
  <LogVolume logVolumeCategory="m3sob" logMeasurementCategory="Machine">0.5894</LogVolume>
  <LogVolume logVolumeCategory="m3sub" logMeasurementCategory="Machine">0.5322</LogVolume>
  <CuttingCategory>
    <CuttingReason>Automatic</CuttingReason>                <!-- Automatic | Manual | EndOfStem -->
  </CuttingCategory>
  <DiameterSectionProduction>...</DiameterSectionProduction> <!-- 0..N -->
  <TopSawing>true|false</TopSawing>
  <FindButtEndFunction>true|false</FindButtEndFunction>
  <LogMeasurement logMeasurementCategory="Machine">
    <LogLength>...</LogLength>                              <!-- cm -->
    <LogDiameter logDiameterCategory="Top ob">336</LogDiameter>
    <LogDiameter logDiameterCategory="Top ub">319</LogDiameter>
    <LogDiameter logDiameterCategory="Mid ob">362</LogDiameter>
    <LogDiameter logDiameterCategory="Mid ub">...</LogDiameter>
    <LogDiameter logDiameterCategory="Butt ob">...</LogDiameter>
    <LogDiameter logDiameterCategory="Butt ub">...</LogDiameter>
  </LogMeasurement>
  <Extension>...</Extension>
</Log>
```

| Element | Vår parser | Mappning |
|---|---|---|
| `<LogKey>` | ✅ | Del av `stock_key` = `f"{stem_key}_{log_key}_{filnamn}"` |
| `<ProductKey>` | ✅ | `detalj_stock.sortiment_id` |
| `<LogVolume>` med `@logVolumeCategory` | ✅ | Tre kategorier: `m3sob` → `volym_m3sob`, `m3sub` → `volym_m3sub`, `m3 (price)` → fallback för m3sub om saknas |
| `<LogVolume>` med `@logMeasurementCategory` | ⚪ | "Machine" antas — vi särskiljer inte Machine vs Manual mätning |
| `<CuttingCategory>/<CuttingReason>` | ✅ | `detalj_stock.kaporsak` ("Automatic", "Manual", "EndOfStem") |
| `<LogMeasurement>/<LogLength>` (cm) | ✅ | `detalj_stock.langd_cm` |
| `<LogMeasurement>/<LogDiameter>` med `@logDiameterCategory` | ✅ (delvis) | Bara "Top ob" → `toppdia_ob_mm`, "Top ub" → `toppdia_ub_mm`. **Mid** och **Butt**-värden ignoreras — Lucka (Låg) |
| `<DiameterSectionProduction>` | ❌ | **Lucka (Medium)** — diameterklass-fördelning per stock (för matrisrapporter). Skulle möjliggöra automatisk klass-fördelnings-rapport utan att räkna stockar manuellt |
| `<TopSawing>` (boolean) | ❌ | **Lucka (Låg)** — om toppsågning utfördes |
| `<FindButtEndFunction>` (boolean) | ❌ | **Lucka (Låg)** — om butt-end-funktion användes |
| `<Extension>` | ⚪ | XML extension-mekanism |

Aggregering: Per stock summeras `(datum, maskin, objekt, sortiment)` →
`fakt_sortiment` med stockar-räkning, total volym (sob+sub), medel-längd,
medel-toppdia. Per stam summeras antal stockar + total volym → `hpr_stammar`.

## GPS-spår (`<Tracking>` / `<TrackCoordinates>`)

```xml
<Tracking>
  <TrackingKey>...</TrackingKey>
  <TrackCoordinates>
    <Latitude>...</Latitude>
    <Longitude>...</Longitude>
    <Altitude>...</Altitude>
    <CoordinateDate>...</CoordinateDate>
    <ObjectKey>...</ObjectKey>
  </TrackCoordinates>
  <TrackCoordinates>...</TrackCoordinates>           <!-- N punkter per Tracking -->
</Tracking>
```

| Element | Vår parser | Mappning |
|---|---|---|
| `<TrackCoordinates>` (Lat/Lng/Alt/Date/ObjectKey) | ✅ | `detalj_gps_spar` med UNIQUE på `(tracking_key, filnamn)` |
| `<Tracking>` övriga attribut | ⚪ | Bara TrackCoordinates fångas; Tracking-blockets metadata ignoreras |

## DB-mappning — sammanfattning

| Tabell | Källa i HPR |
|---|---|
| `dim_maskin` | `<Machine>` (mindre fält än MOM — bara id/tillverkare/modell/typ) |
| `dim_objekt` | `<ObjectDefinition>` (rik info — vo_nummer, skogsägare, bolag, avverkningsform, certifiering, datum) |
| `dim_sortiment` | `<ProductDefinition>` (namn, pris_per_m3, fargmarkning) |
| `dim_tradslag` | `<SpeciesGroupDefinition>` |
| `detalj_stam` | `<Stem>` + `<SingleTreeProcessedStem>` per stam (en rad per stam) |
| `detalj_stock` | `<Log>` per stam (1..N rader per stam) |
| `detalj_gps_spar` | `<TrackCoordinates>` per Tracking-block |
| `fakt_sortiment` | Aggregerat per `(datum, maskin, objekt, sortiment)` från Logs |
| `hpr_filer` | En rad per HPR-fil (filnamn, stammar_count, has_coordinates, fil_datum, objekt_id) |
| `hpr_stammar` | Per-stam aggregat (stam_nummer, tradslag, dbh, lat, lng, antal_stockar, total_volym, bio_energy_adaption, sortiment) |
| `objekt` (UPDATE) | `<ForestCertification>` PATCH:as på befintlig objekt-rad |

## Kända luckor — sammanfattning

| # | Lucka | Allvarlighetsgrad |
|---|---|---|
| 1 | `<MultiTreeProcessedStem>` — alla stammar i flerstamshantering hoppas över ([rad 1115](../../skogsmaskin_import_version_6.py): `if single_tree is None: continue`). Stamdetaljer i `detalj_stam`/`hpr_stammar` saknas för MTH-skördade stammar. Volymtotaler i `fakt_sortiment`/`fakt_produktion` är dock korrekta från MOM-sidan. **Verifierat 2026-05-06:** 0 MTP-events i 6 inspekterade filer (1 Anders Moliis + 5 Jeppshoka) över totalt 6 627 stammar — alla `SingleTreeProcessing`. Inte verifierad mängd MTH-data i Rottne-gallringsfiler ännu | **Medium** |
| 2 | `<DiameterSectionProduction>` — diameterklass-fördelning per stock. Skulle ersätta manuell klass-rapportering | **Medium** |
| 3 | `<StemDiameters>` — komplett diameterprofil längs stammen. Möjliggör form-analys och alternativ volymberäkning | **Medium** |
| 4 | `<OperatorKey>` per stam ignoreras — kan inte attribuera stammar till specifik operatör (bara till maskin) | **Medium** |
| 5 | `<LogDiameter>` Mid + Butt-värden ignoreras (bara Top ob/ub fångas) | **Låg** |
| 6 | `<SingleTreeFelledStem>` / `<MultiTreeFelledStem>` — felled-only stammar (FB-maskiner). Inte relevant för nuvarande flotta | **Låg** |
| 7 | `<TopSawing>` / `<FindButtEndFunction>` per stock — bearbetnings-flaggor | **Låg** |
| 8 | `<Reversing>` — indikerar bearbetningsproblem | **Låg** |
| 9 | `<StemCode>` / `<BoomPositioning>` — operatör-kategorisering + krans-data | **Låg** |
| 10 | `<ReferenceDiameter>` + `@referenceDiameterHeight` — referensdiameter på annan höjd än DBH | **Låg** |
| 11 | `<GradeValue>` `@gradeStartPosition` — om stam byter kvalitet på olika höjder fångar vi bara första värdet | **Låg** |
| 12 | `<DBHHeight>` per trädslag, `<Grades>`, `<DiameterClass>`, `<LengthClass>` på ProductDefinition — kvalitets- och klass-definitioner | **Låg** |
| 13 | `<MachineApplicationVersion>` (samma kanariefågel-resonemang som MOM) | **Låg** |
| 14 | `<MachineHeadManufacturer>`/`<MachineHeadModel>` ignoreras i HPR (vi får dem från MOM istället, vilket är OK för samma maskin) | **Låg** |
| 15 | `<ForestOwner>` — bara LastName, övrig kontaktinfo ignoreras | **Låg** |
| 16 | `<SubObject>` — del-objekt-stöd saknas | **Låg** |
| 17 | `<StemCoordinates>` `@receiverPosition`, `@coordinateReferenceSystem`, `<CoordinateDate>` — antas WGS84/basmaskin/HarvestDate | **Låg** |

### Breaking changes vid eventuell v4-uppgradering

HPR-strukturen har varit stabilare än MOM mellan v3 och v4 — Stem/Log-grenarna
har inte fått nya `*Code`-suffix eller liknande omdöpningar i v4. De viktigaste
v4-ändringarna gäller:

| v3.x | v4.x | Påverkan |
|---|---|---|
| `<DiameterSectionProduction>` (struktur) | Tillägg av `*Name`-attribut för enum-värden | Vi missar fritextnamnen, men vi parsar inte sektionen alls — neutralt |
| Inga | Nya optional `<Extension>`-platser tillagda | Neutralt — vi ignorerar Extension |

**Slutsats:** Inga breaking changes som påverkar vår parser direkt vid v4-uppgradering.

## Kända datakvalitetsproblem

Detta är en **historisk bugg i hpr_filer-sammanfattningstabellen** — datat i
`detalj_stam` och `hpr_stammar` är intakt och korrekt. Bara metadata-tabellen
`hpr_filer` är fel-fylld.

**Allvarlighet:** Medium. 100 % omfattning på `maskin_id`-kolumnen, men inget
data-förlust — bara felaktig metadata i sammanfattningstabellen.

### Omfattning (verifierat via MCP 2026-05-06)

| Mätetal | Värde |
|---|---|
| Totalt antal `hpr_filer`-rader | 538 |
| Saknar `maskin_id` (NULL) | **538 (100 %)** |
| Har `stammar_count = 0` | 248 |
| Saknar `objekt_id` (NULL) | 370 |
| `detalj_stam`-rader för Scorpion 26 mars – 1 april | 2 436 (intakt) |
| `hpr_stammar`-rader länkade till "tomma" Jeppshoka-fil-rad | 160 (intakt) |

### Orsak

Två kodvägar skriver till `hpr_filer` och båda har buggar — den ena är värre:

**1. `import_hpr.py` (fristående script):**
- [rad 372-374](../../import_hpr.py): `fil_row` skickar bara `filnamn` — saknar både `maskin_id` och `stammar_count`. Default i DB → `stammar_count=0`.
- [rad 391](../../import_hpr.py): kommentar `"maskin_id FK pekar på maskiner-tabellen som är tom — lämna null"` är **föråldrad**. Maskiner-tabellen har idag 6 maskiner.
- `delete_existing_for_objekt` ([rad 334-363](../../import_hpr.py)) raderar gamla rader för objektet och skapar nya — kan ersätta huvudparserns korrekta rader om de finns.

**2. Huvudparserns `_save_hpr_tables` (skogsmaskin_import_version_6.py):**
- `fil_row` saknar `maskin_id` (samma bug).
- Sätter dock `stammar_count = len(stammar)` korrekt.

Sannolikt har `import_hpr.py` körts mot Behandlade-mappen (april 2026) och
ersatt eller skapat 538 `hpr_filer`-rader utan maskin_id och med
stammar_count=0 för 248 av dem.

### Konsekvens

| Påverkan | Status |
|---|---|
| Stamdata förlorad | ❌ Nej — `detalj_stam` och `hpr_stammar` är intakta |
| Produktionsstatistik fel | ❌ Nej — räknas från `detalj_stam` / `fakt_sortiment`, inte från `hpr_filer` |
| Sammanfattnings-vyer som joinar mot `hpr_filer.stammar_count` | ✅ Visar 0 för 248 filer |
| Sammanfattnings-vyer som joinar mot `hpr_filer.maskin_id` | ✅ Visar NULL för alla 538 filer |
| Filtrering "alla HPR-filer för maskin X" | ✅ Returnerar 0 träffar idag |

**Sammanfattning:** Konsistensbugg, **inte** produktionskritisk. Vyer som
beräknar nyckeltal från `detalj_stam`/`fakt_sortiment` är opåverkade.

### Reparbart via SQL (för maskin_id + stammar_count)

```sql
-- Innan UPDATE: kör denna för att se om någon hpr_filer-rad har dubbletter
-- med samma filnamn (om import_hpr.py skapade NY rad medan huvudparserns
-- gamla finns kvar):
--
--   SELECT filnamn, COUNT(*), array_agg(id::text) AS ids
--   FROM hpr_filer
--   GROUP BY filnamn HAVING COUNT(*) > 1;
--
-- Om träffar: utred manuellt innan UPDATE körs.

UPDATE hpr_filer hf
SET 
  maskin_id = m.maskin_id,
  stammar_count = COALESCE(s.cnt, 0)
FROM meta_importerade_filer m
LEFT JOIN (
  SELECT hpr_fil_id, COUNT(*) AS cnt
  FROM hpr_stammar 
  GROUP BY hpr_fil_id
) s ON s.hpr_fil_id = hf.id
WHERE hf.filnamn = m.filnamn
  AND m.filtyp = 'HPR'
  AND m.status = 'OK'
  AND (hf.maskin_id IS NULL OR hf.stammar_count = 0);
```

### INTE reparbart utan affärsbeslut (objekt_id)

`objekt_id`-NULL för 370 filer beror på att deras `vo_nummer` (t.ex.
`11146159` för Jeppshoka 1:14) saknas i `objekt`-tabellen. Inte parser-fix —
kräver att Martin/operatör skapar saknade objekt-rader manuellt eller bekräftar
att de inte ska finnas.

### Uppföljning (separat PR)

Två kod-fixar krävs för att förhindra återupprepning:

| Fil | Rad | Ändring |
|---|---|---|
| `import_hpr.py` | 372-374 | Lägg till `'maskin_id': parsed['maskin_id']` och `'stammar_count': len(parsed['stammar'])` i `fil_row` |
| `skogsmaskin_import_version_6.py` | i `_save_hpr_tables` `fil_row` | Lägg till `'maskin_id': maskin_id` |

## Verifierings-data

Inspektion 2026-05-06 av `Anders Moliis_PONS20SDJAA270231_20260423155742.hpr`
(Ponsse Scorpion Giant skördare, slutavverkning Anders Moliis, 22-23 april 2026):

- 3 372 808 bytes (3.2 MB)
- 408 `<Stem>`-element, alla `SingleTreeProcessedStem` (slutavverkning → 0 MTH)
- 1 837 `<Log>`-element (snitt 4.5 stockar/stam)
- 12 `<ProductDefinition>` (12 sortiment)
- 4 `<SpeciesGroupDefinition>` (4 trädslag)
- 1 `<OperatorDefinition>`, 1 `<ObjectDefinition>`
- 0 `<UserDefinedData>`

Förväntat utfall vid import:
- 408 rader i `detalj_stam`
- 1 837 rader i `detalj_stock`
- 12 rader i `dim_sortiment` (eller upsert om finns)
- 4 rader i `dim_tradslag`
- ~12-48 rader i `fakt_sortiment` (per datum × sortiment)
- 1 rad i `hpr_filer` med `stammar_count=408`
- 408 rader i `hpr_stammar`

Slutavverkningsfiler från denna maskin har historiskt 100 % SingleTreeProcessing.
Lucka #1 (MTH ignoreras) påverkar främst gallringsfiler från Rottne H8E
(`R64101`/`R64428`) — vi har inte mätt exakt magnitud.
