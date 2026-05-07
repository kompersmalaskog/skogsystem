# HQC — Harvesting Quality Control

`.hqc`-filer dokumenterar **kalibreringskontroller** av skördarens
mät-system. Operatören mäter manuellt en eller flera stockar (med klave)
parallellt med skördarens egen mätning, och differensen visar om maskinen
behöver kalibreras. Filen innehåller också en historik av faktiska
kalibreringsjusteringar som operatören gjort.

| Aspect | Värde |
|---|---|
| Stanford-meddelande | `HarvestingQualityControl` |
| Filändelse | `.hqc` |
| Producerad av | Skördare (vid kontrollmätning eller efter kalibrering) |
| XSD (vår referens) | [`HarvestingQualityControl_V3p6.xsd`](https://www.skogforsk.se/contentassets/1a68cdce4af1462ead048b7a5ef1cc06/stanford2010_release_3.6.zip) (613 rader) |
| Faktiska filer i drift | v3.1 (Ponsse Opti4G 4.785) |
| Parser | [`parse_hqc_file()`](../../skogsmaskin_import_version_6.py) i skogsmaskin_import_version_6.py |
| DB-skrivning | [`save_hqc_to_supabase()`](../../skogsmaskin_import_version_6.py) |

## Innehåll

- [Filstruktur — top-level](#filstruktur--top-level)
- [Maskin-data (`<Machine>`)](#maskin-data-machine)
- [Header (`<HarvestingQualityControlHeader>`)](#header-harvestingqualitycontrolheader)
- [Trädslag (`<SpeciesGroupDefinition>`)](#trädslag-speciesgroupdefinition)
- [★ Kontrollvärden (`<ControlValues>`) — huvuddata](#-kontrollvärden-controlvalues--huvuddata)
  - [Sortiment + Objekt + ControlStemSettings (definitioner)](#sortiment--objekt--controlstemsettings-definitioner)
  - [Kontrollstammar (`<Stem>`)](#kontrollstammar-stem)
  - [Kontrollstockar (`<Log>` med `<LogMeasurement>` Machine + Operator)](#kontrollstockar-log-med-logmeasurement-machine--operator)
- [Kalibreringshistorik (`<CalibrationValues>`)](#kalibreringshistorik-calibrationvalues)
- [Status-beräkning](#status-beräkning)
- [DB-mappning — sammanfattning](#db-mappning--sammanfattning)
- [Kända luckor — sammanfattning](#kända-luckor--sammanfattning)
  - [Breaking changes vid eventuell v4-uppgradering](#breaking-changes-vid-eventuell-v4-uppgradering)
- [Verifierings-data](#verifierings-data)

## Filstruktur — top-level

```
<HarvestingQualityControl xmlns="urn:skogforsk:stanford2010" version="3.1">
  <HarvestingQualityControlHeader>
    <CreationDate>...</CreationDate>
    <ApplicationVersionCreated>Ponsse Opti4G 4.785</ApplicationVersionCreated>
    ...
  </HarvestingQualityControlHeader>
  <Machine>
    <BaseMachineManufacturerID>PONS20SDJAA270231</BaseMachineManufacturerID>
    <SpeciesGroupDefinition>...</SpeciesGroupDefinition>     ← N stycken
    <ControlValues>                                          ← 1..N (★ HUVUDDATA)
      <ProductDefinition>...</ProductDefinition>             ← N stycken
      <ObjectDefinition>...</ObjectDefinition>               ← N stycken
      <ControlStemSettings>...</ControlStemSettings>         ← N stycken (urvals-regler)
      <SawCutWidth>...</SawCutWidth>                         ← 0..1
      <Stem>...</Stem>                                       ← N stycken (kontrollstammar)
    </ControlValues>
    <CalibrationValues>                                      ← 0..1 (kalibreringshistorik)
      <LengthCalibration>...</LengthCalibration>             ← N stycken
      <DiameterCalibration>...</DiameterCalibration>         ← N stycken
    </CalibrationValues>
  </Machine>
</HarvestingQualityControl>
```

## Maskin-data (`<Machine>`)

| Element | Vår parser | Mappning |
|---|---|---|
| `<BaseMachineManufacturerID>` | ✅ | `data['maskin']['maskin_id']`. Normaliseras (Rottne får R-prefix) |
| `<MachineKey>` (UUID) | ⚪ | Fallback om BaseMachineManufacturerID saknas |
| Maskintyp | ✅ | Hårdkodat `'Harvester'` (HQC produceras bara av skördare) |
| `<MachineBaseManufacturer>` / `<MachineBaseModel>` | ❌ | **Lucka (Låg)** — vi sätter inte tillverkare/modell från HQC (förutsätter MOM/HPR har gjort det) |

**Notera:** [`save_hqc_to_supabase()`](../../skogsmaskin_import_version_6.py) skriver
INTE till `dim_maskin`. Kalibreringsdata-raderna refererar `maskin_id` som måste
finnas redan från MOM/HPR-import. Om HQC kommer först (osannolikt scenario)
saknas FK-mål och raderna kan avvisas av databas. **Lucka (Låg)** — bevittnas
inte i praktiken.

## Header (`<HarvestingQualityControlHeader>`)

| Element | Vår parser | Mappning |
|---|---|---|
| `<CreationDate>` | ✅ | `creation_date` används som `kontroll_datum` på alla rader |
| `<ApplicationVersionCreated>` | ❌ | **Lucka (Låg)** — Opti4G/ROC-version |
| `<ModificationDate>`, `<ApplicationVersionModified>`, `<CountryCode>` | ⚪ | Metadata, ingen verksamhetsanvändning |

## Trädslag (`<SpeciesGroupDefinition>`)

| Element | Vår parser | Mappning |
|---|---|---|
| `<SpeciesGroupName>` (första) | ✅ (delvis) | Använder ENDAST första SpeciesGroupDefinition.SpeciesGroupName som `kalibrering.tradslag`. **Lucka (Medium)** — om kontrollen omfattar flera trädslag fångas bara första namnet |
| `<SpeciesGroupKey>` | ⚪ | Vi mappar inte stammar till specifikt trädslag i HQC-parsern |
| Övriga fält | ⚪ | Definierat i HPR/MOM, redundant här |

## ★ Kontrollvärden (`<ControlValues>`) — huvuddata

```
<ControlValues>
  <ProductDefinition>...</ProductDefinition>             ← sortiment som kontrolleras
  <ObjectDefinition>...</ObjectDefinition>               ← objekt med ContractNumber
  <ControlStemSettings>...</ControlStemSettings>         ← regler för stam-urval
  <SawCutWidth>...</SawCutWidth>                         ← sågsnittsbredd
  <Stem>...</Stem>                                       ← kontrollstammar
</ControlValues>
```

### Sortiment + Objekt + ControlStemSettings (definitioner)

| Element | Vår parser | Mappning |
|---|---|---|
| `<ProductDefinition>` | ❌ | **Lucka (Låg)** — sortiment definieras separat i HPR-import; HQC-info ignoreras |
| `<ObjectDefinition>` | ✅ (delvis) | Bygger `obj_key_map_hqc` av `ObjectKey → make_objekt_id(ContractNumber, maskin_id, obj_key)`. Faller tillbaka till `<Machine>`-nivå-ObjectDefinition om saknas. **Subtilt beteende:** om ControlValues-nivå saknar ObjectDefinition används Machine-nivå istället. Kan ge oväntade objekt-mappningar om de skiljer sig. Inte verifierat i drift |
| `<ControlStemSettings>` (regler för slumpmässig stam-utväljning) | ❌ | **Lucka (Låg)** — vilket urvals-system används (RandomNthStem etc) |
| `<SawCutWidth>` | ❌ | **Lucka (Låg)** — sågsnittsbredd (mm) — påverkar volymberäkning marginellt |

### Kontrollstammar (`<Stem>`)

```
<Stem>
  <StemKey>118970</StemKey>
  <ObjectKey>99</ObjectKey>
  <SubObjectKey>99</SubObjectKey>
  <SpeciesGroupKey>40</SpeciesGroupKey>
  <OperatorKey>13</OperatorKey>
  <HarvestDate>2026-04-23T17:48:06+02:00</HarvestDate>
  <StemNumber>408</StemNumber>
  <ProcessingCategory>SingleTreeProcessing</ProcessingCategory>
  <StemCoordinates receiverPosition="..." coordinateReferenceSystem="WGS84">
    <Latitude>...</Latitude>
    <Longitude>...</Longitude>
    <Altitude>...</Altitude>
    <CoordinateDate>...</CoordinateDate>
  </StemCoordinates>
  <ControlMeasurementDefinition logMeasurementCategory="Operator">
    <Measurer>
      <FirstName>Joacim</FirstName>
    </Measurer>
    <CaliperApplication>SKALMAN7.24</CaliperApplication>
    <CaliperID>53378</CaliperID>
  </ControlMeasurementDefinition>
  <ControlStemInfo>
    <RandomControlStemRejectedReason>Not rejected</RandomControlStemRejectedReason>
    <RandomControlStemMeasurementMode>Both diameters and lengths registered</RandomControlStemMeasurementMode>
    <RandomControlStemSelection>Manually by operator selected stem</RandomControlStemSelection>
  </ControlStemInfo>
  <SingleTreeProcessedStem>...</SingleTreeProcessedStem>
</Stem>
```

| Element | Vår parser | Mappning |
|---|---|---|
| `<StemKey>` | ❌ | **Lucka (Låg)** — kontrollstammen länkas inte till `detalj_stam.stam_key` (kunde användas för att hitta motsvarande HPR-stam) |
| `<ObjectKey>` | ✅ | Mappas via `obj_key_map_hqc` till `objekt_id` |
| `<SpeciesGroupKey>` | ⚪ | Hämtas men används inte i parsern (bara loggas) |
| `<OperatorKey>` | ❌ | **Lucka (Låg)** — operatör som skördade stammen (inte mätaren) |
| `<HarvestDate>` | ❌ | **Lucka (Låg)** — när stammen skördades (vi använder header.CreationDate som kontroll-datum istället) |
| `<StemNumber>` | ⚪ | Vi använder eget `antal_stammar`-räknare istället |
| `<StemCoordinates>` (Lat/Lng/Alt/CoordinateDate) | ✅ (delvis) | Latitude + Longitude → `detalj_kontroll_stock.latitude/longitude`. Altitude och CoordinateDate ignoreras |
| `<ControlMeasurementDefinition>` (`Measurer`, `CaliperApplication`, `CaliperID`) | ❌ | **Lucka (Låg)** — VEM gjorde manuell kontrollmätning med klave (kan skilja sig från maskin-operatören) + vilken klave-app som användes (SKALMAN7.24, KOLPER etc) + vilket klave-ID |
| `<ControlStemInfo>/<RandomControlStemRejectedReason>` | ❌ | **Lucka (Medium)** — varför stammen avvisades om den gjorde det. "Not rejected" / "Difficult species" / "Time constraint" etc |
| `<ControlStemInfo>/<RandomControlStemMeasurementMode>` | ❌ | **Lucka (Låg)** — "Both diameters and lengths registered" / "Lengths only" / "Diameters only" |
| `<ControlStemInfo>/<RandomControlStemSelection>` | ❌ | **Lucka (Låg)** — "Random by control system" / "Manually by operator selected stem" — väsentligt för statistisk validitet |
| `<SingleTreeProcessedStem>/<DBH>` | ❌ | **Lucka (Låg)** — DBH för kontrollstammen (ignoreras — vi behåller bara stockmätningarna) |
| `<SingleTreeProcessedStem>/<ReferenceDiameter>` | ❌ | **Lucka (Låg)** — referensdiameter |
| `<SingleTreeProcessedStem>/<StemGrade>` | ❌ | **Lucka (Låg)** — kvalitet på kontrollstammen |
| `<SingleTreeProcessedStem>/<StemDiameters>` (komplett diameterprofil) | ❌ | **Lucka (Medium)** — samma sak som HPR-luckan #3 |

### Kontrollstockar (`<Log>` med `<LogMeasurement>` Machine + Operator)

```xml
<Log>
  <LogKey>1</LogKey>
  <LogMeasurement logMeasurementCategory="Machine">
    <LogLength>411</LogLength>                    <!-- maskinens mätning -->
    <LogDiameter>250</LogDiameter>
    <MeasurementDate>...</MeasurementDate>
    <ControlLogDiameter>...</ControlLogDiameter>  <!-- 0..N -->
  </LogMeasurement>
  <LogMeasurement logMeasurementCategory="Operator">
    <LogLength>409</LogLength>                    <!-- operatörens manuella mätning -->
    <LogDiameter>248</LogDiameter>
    ...
  </LogMeasurement>
  <LogVolume logVolumeCategory="m3sub">0.0203</LogVolume>   <!-- maskin -->
  <LogVolume logVolumeCategory="m3sub">0.0200</LogVolume>   <!-- operator (andra raden) -->
  <CalibrationUseLog>...</CalibrationUseLog>      <!-- 0..1 -->
  <LogLengthClass>...</LogLengthClass>            <!-- 0..1 -->
  <LogDiameterClass>...</LogDiameterClass>        <!-- 0..1 -->
</Log>
```

Per stock loopas `<LogMeasurement>` igenom och `logMeasurementCategory`-attributet
avgör om värdena hör till maskinen eller operatören. Avvikelse = maskin − operator.

| Element | Vår parser | Mappning |
|---|---|---|
| `<LogKey>` | ✅ | `detalj_kontroll_stock.stock_nummer` |
| `<LogMeasurement>` med `@logMeasurementCategory="Machine"` | ✅ | `maskin_langd_cm`, `maskin_toppdia_mm` |
| `<LogMeasurement>` med `@logMeasurementCategory="Operator"` | ✅ | `operator_langd_cm`, `operator_toppdia_mm` |
| `<LogMeasurement>/<LogLength>` | ✅ | längd i cm |
| `<LogMeasurement>/<LogDiameter>` (första) | ✅ | toppdiameter i mm. **Lucka (Låg):** bara första LogDiameter läses — i praktiken bara en per LogMeasurement men `maxOccurs="unbounded"` |
| `<LogMeasurement>/<MeasurementDate>` | ❌ | **Lucka (Låg)** — när mätningen utfördes (kan skilja mot stamskörd vid sen kontroll) |
| `<LogMeasurement>/<ControlLogDiameter>` (kontrollmätning vid annat höjdläge) | ❌ | **Lucka (Medium)** — i exempelfilen finns 20 ControlLogDiameter mot 24 LogDiameter — komplett ignorerade. Skulle möjliggöra noggrannare kalibreringsstatistik |
| `<LogVolume>` (Machine = första, Operator = andra) | ✅ | `maskin_volym_sub`, `operator_volym_sub`. **Notera:** parser tar `'sub' in cat OR 'price' in cat` — kan ge fel värde om filen har både m3sub och m3 (price) i annan ordning |
| `<CalibrationUseLog>` (boolean) | ❌ | **Lucka (Medium)** — markerar om stocken använts för kalibrering. Skulle möjliggöra "kalibrering utförd vs föreslagen"-rapporter |
| `<LogLengthClass>` / `<LogDiameterClass>` | ❌ | **Lucka (Låg)** — klasstillhörighet per stock |

### Beräknade avvikelser (lagras per kontrollstock)

| Fält | Beräkning |
|---|---|
| `langd_avvikelse_cm` | maskin_langd_cm − operator_langd_cm |
| `dia_avvikelse_mm` | maskin_toppdia_mm − operator_toppdia_mm |
| `volym_avvikelse` | maskin_volym_sub − operator_volym_sub (avrundat till 4 decimaler) |

## Kalibreringshistorik (`<CalibrationValues>`)

Faktiska kalibreringsjusteringar som operatören gjort baserat på avvikelserna.
Två varianter:

```xml
<CalibrationValues>
  <LengthCalibration>
    <SpeciesGroupUserID>SE1_Tall</SpeciesGroupUserID>
    <CalibrationDate>2026-04-23T16:00:00+02:00</CalibrationDate>
    <LengthCalibrationReason>Routine check</LengthCalibrationReason>
    <LengthCalibrationDescription>Korrigering efter slang-byte</LengthCalibrationDescription>
    <LengthCalibrationAdjustment lengthCalibrationPosition="500">2</LengthCalibrationAdjustment>
  </LengthCalibration>
  <DiameterCalibration>
    <SpeciesGroupUserID>SE1_Tall</SpeciesGroupUserID>
    <CalibrationDate>...</CalibrationDate>
    <DiameterCalibrationReason>...</DiameterCalibrationReason>
    <DiameterCalibrationAdjustment diameterCalibrationPosition="200">3</DiameterCalibrationAdjustment>
  </DiameterCalibration>
</CalibrationValues>
```

| Element | Vår parser | Mappning |
|---|---|---|
| `<LengthCalibration>/<SpeciesGroupUserID>` | ✅ | `tradslag` (strippar `SE1_`-prefix) |
| `<LengthCalibration>/<CalibrationDate>` | ✅ | `datum` |
| `<LengthCalibration>/<LengthCalibrationReason>` | ✅ | `orsak` |
| `<LengthCalibration>/<LengthCalibrationDescription>` | ✅ | `beskrivning` |
| `<LengthCalibration>/<LengthCalibrationAdjustment>` (mm) | ✅ | `langd_justering_mm` |
| `<LengthCalibration>/<LengthCalibrationAdjustment>` `@lengthCalibrationPosition` | ✅ | `position_cm` |
| Samma för `<DiameterCalibration>` (med `dia_justering_mm`-fält + `DiameterCalibrationDescription` saknas i vår parser → `beskrivning=None`) | ✅ (delvis) | **Lucka (Låg):** DiameterCalibrationDescription läses inte — bara orsak och justering |

## Status-beräkning

Per fil beräknas en sammanfattningsstatus från medelavvikelserna. Logiken
i parsern är tre sekventiella villkor:

```python
status = 'OK'
if abs(langd_snitt) > 2 or abs(dia_snitt) > 4: status = 'VARNING'
if abs(langd_snitt) > 4 or abs(dia_snitt) > 6: status = 'FEL'
```

Resulterande slutstatus:

| Tillstånd | Slutstatus |
|---|---|
| Båda inom ramar: \|snitt-längd\| ≤ 2 cm OCH \|snitt-diameter\| ≤ 4 mm | `OK` |
| Något värde i mellan-zon men ingen i fel-zon (t.ex. längd > 2 men ≤ 4 cm, eller dia > 4 men ≤ 6 mm) | `VARNING` |
| Något värde i fel-zon: \|snitt-längd\| > 4 cm ELLER \|snitt-diameter\| > 6 mm | `FEL` |

Värdet sparas i `fakt_kalibrering.status`. Tröskelvärdena (2/4/4/6) är hårdkodade
i parsern ([rad 1507-1510](../../skogsmaskin_import_version_6.py)) — inte konfigurerbara.

**Lucka (Låg):** Tröskelvärdena bör ligga i en konfig-tabell istället för
parser-koden. Om branschens tolerans ändras måste parser-koden ändras.

## DB-mappning — sammanfattning

| Tabell | Källa i HQC |
|---|---|
| `fakt_kalibrering` | En rad per HQC-fil med snitt-/min-/max-avvikelser, antal kontrollstammar/-stockar, status |
| `fakt_kalibrering_historik` | En rad per `<LengthCalibration>` eller `<DiameterCalibration>` (faktiska justeringar) |
| `detalj_kontroll_stock` | En rad per kontrollstock med både maskin- och operator-mätning + avvikelser + GPS |
| `dim_maskin` | **Inte uppdaterad från HQC** — förutsätter att MOM/HPR redan skrivit |

## Kända luckor — sammanfattning

| # | Lucka | Allvarlighetsgrad |
|---|---|---|
| 1 | `<ControlStemInfo>/<RandomControlStemRejectedReason>` — varför kontrollstam avvisades. Statistisk validitet av urvalet | **Medium** |
| 2 | `<ControlLogDiameter>` — kontroll-mätning vid annat höjdläge än vanlig LogDiameter. 20 mot 24 i exempelfil = ~85 % datatäckning. Skulle ge noggrannare kalibreringsstatistik | **Medium** |
| 3 | `<CalibrationUseLog>` — markerar om stocken använts för kalibrering. "Föreslagna vs utförda kalibreringar"-rapport saknas | **Medium** |
| 4 | `<SingleTreeProcessedStem>/<StemDiameters>` — komplett diameterprofil längs kontrollstammen. Samma som HPR-lucka #3 | **Medium** |
| 5 | Bara FÖRSTA `<SpeciesGroupName>` används som `tradslag` — om kontrollen omfattar flera trädslag fångas bara första | **Medium** |
| 6 | `<LogVolume>`-mappning är skör: `'sub' in cat OR 'price' in cat`-villkoret kan plocka fel värde om filen har både `m3sub` och `m3 (price)`. Subtil bug som inte syns förrän någon räknar — datakvalitetsrisk för kalibreringsstatistik | **Medium** |
| 7 | `<ControlMeasurementDefinition>` — `Measurer.FirstName`, `CaliperApplication`, `CaliperID` ignoreras. Vem gjorde manuell kontrollmätning + vilken klave-app + vilket klave-ID | **Låg** |
| 8 | `dim_maskin` skrivs inte från HQC — förutsätter MOM/HPR har gjort det. Risk om HQC kommer först (FK-fel)¹ | **Låg** |
| 9 | `<ControlStemInfo>/<RandomControlStemMeasurementMode>` + `<RandomControlStemSelection>` ignoreras | **Låg** |
| 10 | `<ControlStemSettings>` på ControlValues-nivå (urvalsregler) ignoreras | **Låg** |
| 11 | `<SawCutWidth>` (mm) ignoreras — påverkar volymberäkning marginellt | **Låg** |
| 12 | `<MeasurementDate>` per LogMeasurement ignoreras — vi använder header.CreationDate som kontroll-datum | **Låg** |
| 13 | `<DiameterCalibrationDescription>` ignoreras (parser sätter `beskrivning=None` för diameter-rader, fångar bara LengthCalibrationDescription) | **Låg** |
| 14 | `<HarvestDate>` per Stem ignoreras — vi använder header.CreationDate | **Låg** |
| 15 | `<StemKey>` på kontrollstammen ignoreras — kunde länka till `detalj_stam.stam_key` för att hitta original-HPR-data | **Låg** |
| 16 | `<MachineApplicationVersion>` ignoreras (samma kanariefågel-resonemang som MOM) | **Låg** |
| 17 | `<MachineBaseManufacturer>` / `<MachineBaseModel>` ignoreras (förlitar oss på MOM/HPR) | **Låg** |
| 18 | Status-trösklar hårdkodade i parsern (2/4/4/6) — borde vara konfig-tabell | **Låg** |
| 19 | `<ProductDefinition>` på ControlValues-nivå ignoreras (sortimentsdefinitionen) — förutsätter HPR har gjort det | **Låg** |
| 20 | `<LogLengthClass>` / `<LogDiameterClass>` per stock ignoreras | **Låg** |

¹ Lucka #8 är teoretisk — HQC-import kommer alltid efter MOM/HPR i normal sekvens, så FK-fel bevittnas inte i drift.

### Breaking changes vid eventuell v4-uppgradering

HQC har varit relativt stabil mellan v3 och v4. Inga större strukturella
omdöpningar identifierade. Risk-områden är samma som för MOM/HPR:

| v3.x | v4.x | Påverkan |
|---|---|---|
| Inga `*Name`-attribut på enum-koder | Möjliga `*Name`-attribut tillkommer | Neutralt — vi parsar inte enum-värdens fritext-namn |
| Inga | Nya optional `<Extension>`-platser tillagda | Neutralt — vi ignorerar Extension |

**Slutsats:** Inga breaking changes som påverkar vår parser direkt vid v4-uppgradering.

## Verifierings-data

Inspektion 2026-05-07 av `Anders Moliis_PONS20SDJAA270231_20260423155742.hqc`
(Ponsse Scorpion Giant skördare, kontroll 23 april 2026):

- 92 161 bytes (~90 KB — typisk HQC-storlek)
- 1 `<ControlValues>`
- 5 `<ControlStemSettings>` (5 urvals-regler för stammar)
- 1 `<Stem>` (1 kontrollstam)
- 1 `<SingleTreeProcessedStem>`
- 1 `<ControlStemInfo>` (med Joacim som mätare, SKALMAN7.24-klave)
- 4 `<Log>` (4 stockar mätta)
- 44 `<LogDiameter>` (vanliga diametrar)
- 20 `<ControlLogDiameter>` (kontroll-diametrar — ignorerade)
- 8 `<LogLength>`
- 1 `<CalibrationValues>` med 1 `<LengthCalibration>`
- 0 `<DiameterCalibration>`
- 3 `<ProductDefinition>`, 1 `<ObjectDefinition>`, 1 `<SpeciesGroupDefinition>`

Förväntat utfall vid import:
- 1 rad i `fakt_kalibrering` (status beräknad från 4 stockars avvikelser)
- 1 rad i `fakt_kalibrering_historik` (LengthCalibration)
- 4 rader i `detalj_kontroll_stock` (en per stock med Machine vs Operator-mätning)

Filerna är generellt små (<100 KB) jämfört med HPR (3-15 MB) eftersom
HQC bara innehåller en eller några kontrollstammar per fil, inte hela
produktionsdagen.
