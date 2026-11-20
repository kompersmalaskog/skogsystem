# MOM — Operational Monitoring

`.mom`-filer beskriver maskinens drift: arbetstider, avbrott, bränsle,
GPS-spår, operatörsskift. Genereras av både skördare och skotare.

| Aspect | Värde |
|---|---|
| Stanford-meddelande | `OperationalMonitoring` |
| Filändelse | `.mom` (komprimerad: `.momz`, ej parsad) |
| Producerad av | Skördare + skotare (Ponsse Opti4G, Rottne ROC4) |
| XSD (vår referens) | [`OperationalMonitoring_V3p6.xsd`](https://www.skogforsk.se/contentassets/1a68cdce4af1462ead048b7a5ef1cc06/stanford2010_release_3.6.zip) |
| Faktiska filer i drift | v3.1 (Ponsse Opti4G 4.785) |
| Parser | [`parse_mom_file()`](../../skogsmaskin_import_version_6.py) i skogsmaskin_import_version_6.py |
| DB-skrivning | [`save_mom_to_supabase()`](../../skogsmaskin_import_version_6.py) |

## Innehåll

- [Filstruktur — top-level](#filstruktur--top-level)
- [Maskin-data (`<Machine>`)](#maskin-data-machine)
- [Operatörer (`<OperatorDefinition>`)](#operatörer-operatordefinition)
- [Objekt (`<ObjectDefinition>`)](#objekt-objectdefinition)
- [★ IndividualMachineWorkTime — huvuddata](#-individualmachineworktime--huvuddata)
  - [Tidskategorier (`<IndividualMachineRunTimeCategory>`)](#tidskategorier-individualmachineruntimecategory)
  - [Avbrott (`<IndividualMachineDownTime>`) — fyra grenar](#avbrott-individualmachinedowntime--fyra-grenar)
    - [`<Maintenance>`](#maintenance-)
    - [`<Disturbance>`](#disturbance-)
    - [`<Repair>`](#repair--delvis--se-luckor)
    - [`<OtherMachineDownTimeCategory>`](#othermachinedowntimecategory-)
    - [`<SpareParts>`](#spareparts--på-repair-events-0n)
    - [`<Coordinates>`](#coordinates---lucka-låg)
  - [Rast (`<IndividualUnutilizedTimeCategoryCode>`)](#rast-individualunutilizedtimecategorycode)
- [Skördardata (`<HarvesterData>` under `<OtherMachineData>`)](#skördardata-harvesterdata-under-othermachinedata)
- [Korta avbrott (`<IndividualShortDownTime>`)](#korta-avbrott-individualshortdowntime)
- [Skift (`<OperatorShiftDefinition>`)](#skift-operatorshiftdefinition)
- [OperatorWorkTime / OperatorLoginTime](#operatorworktime--operatorlogintime)
- [Maskin-totaler (livstid)](#maskin-totaler-livstid)
- [Övriga top-level element](#övriga-top-level-element)
- [DB-mappning — sammanfattning](#db-mappning--sammanfattning)
- [Kända luckor — sammanfattning](#kända-luckor--sammanfattning)
  - [Breaking changes vid eventuell v4-uppgradering](#breaking-changes-vid-eventuell-v4-uppgradering)
- [Verifierings-data](#verifierings-data)

## Filstruktur — top-level

```
<OperationalMonitoring xmlns="urn:skogforsk:stanford2010" version="3.1">
  <OperationalMonitoringHeader>
    <CreationDate>...</CreationDate>
    <ApplicationVersionCreated>Ponsse Opti4G 4.785</ApplicationVersionCreated>
    ...
  </OperationalMonitoringHeader>
  <Machine machineCategory="Forwarder">
    <MachineKey>...</MachineKey>
    <BaseMachineManufacturerID>A030353</BaseMachineManufacturerID>
    <MachineBaseModel>Wisent 2015</MachineBaseModel>
    <MachineOwner>...</MachineOwner>
    <OperatorDefinition>...</OperatorDefinition>           ← N stycken
    <ObjectDefinition>...</ObjectDefinition>               ← N stycken
    <SpeciesGroupDefinition>...</SpeciesGroupDefinition>   ← N stycken (skördare)
    <CodeListDefinition>...</CodeListDefinition>           ← N stycken
    <IndividualMachineWorkTime>...</IndividualMachineWorkTime>  ← N stycken (★ HUVUDDATA)
    <IndividualShortDownTime>...</IndividualShortDownTime>      ← N stycken
    <OperatorLoginTime>...</OperatorLoginTime>             ← N stycken
    <OperatorShiftDefinition>...</OperatorShiftDefinition> ← N stycken
    <OperatorWorkTime>...</OperatorWorkTime>               ← N stycken
    <ReportInterval>...</ReportInterval>
    <MonitoringSettings>...</MonitoringSettings>
    <MachineEngineTime>...</MachineEngineTime>             ← total över maskinens livstid
    <MachineDrivenDistance>...</MachineDrivenDistance>
    <MachineFuelConsumption>...</MachineFuelConsumption>
  </Machine>
</OperationalMonitoring>
```

## Maskin-data (`<Machine>`)

| Element | Vår parser | Mappning |
|---|---|---|
| `@machineCategory` (attribut: "Harvester" / "Forwarder") | ✅ | `dim_maskin.maskin_typ` |
| `<BaseMachineManufacturerID>` | ✅ | `dim_maskin.maskin_id` (text-PK), `chassi`. Normaliseras (Rottne får R-prefix) |
| `<MachineKey>` (UUID) | ⚪ | Vi använder BaseMachineManufacturerID istället för UUID — beslut för att matcha vad operatörer/serviceavtal refererar till |
| `<MachineBaseManufacturer>` | ✅ | `dim_maskin.tillverkare` |
| `<MachineBaseModel>` + `@baseModelYear` | ✅ | `dim_maskin.modell` + `modell_ar` |
| `<MachineHeadManufacturer>` | ✅ | `dim_maskin.aggregat_tillverkare` |
| `<MachineHeadModel>` + `@headModelYear` | ✅ | `dim_maskin.aggregat` + `aggregat_ar` |
| `<MachineOwner><BusinessName>` | ✅ | `dim_maskin.agare` |
| `<MachineApplicationVersion>` | ❌ | **Lucka (Låg)** — Ponsse Opti4G-version (t.ex. "4.785"). Värdefullt för att veta vilken parser-variant som producerade filen |
| `<MachineUserID>` / `<MachineOwnerID>` | ⚪ | Manufacturer-interna refs, ingen verksamhetsanvändning |
| `<LoggingContractor>` | ⚪ | Vanligtvis identisk med MachineOwner |

## Operatörer (`<OperatorDefinition>`)

| Element | Vår parser | Mappning |
|---|---|---|
| `<OperatorKey>` | ✅ | `dim_operator.operator_id` = `f"{maskin_id}_{op_key}"` |
| `<OperatorUserID>` | ✅ | `dim_operator.operator_key` |
| `<ContactInformation><FirstName>+<LastName>` | ✅ | `dim_operator.operator_namn` (skip:as om värdet ser ut som UUID — Rottne-quirk) |
| `<ContactInformation><Email>` | ❌ | **Lucka (Låg)** — kunde användas för notifikationer |
| `<ContactInformation><BusinessName>` | ⚪ | Redundant med `MachineOwner.BusinessName` |

## Objekt (`<ObjectDefinition>`)

| Element | Vår parser | Mappning |
|---|---|---|
| `<ObjectKey>` | ✅ | Del av `objekt_id` |
| `<ObjectUserID>` (med agency-attribut) | ✅ | Söks som vo_nummer om numeriskt — annars `f"{maskin_id}_{obj_key}"` |
| `<ObjectName>` | ✅ | `dim_objekt.object_name` |
| `<ContractNumber>` | ✅ | `dim_objekt.kontraktsnummer` |
| `<ForestCertification>` | ✅ | `dim_objekt.fsc_certifierad` |
| `<StartDate>` / `<ObjectModificationDate>` | ❌ | **Lucka (Låg)** — kunde användas för objektsstatus |
| `<LoggingOrganisation>` | ❌ | **Lucka (Låg)** — vem som beställt avverkningen (VIDA, Stora Enso etc.) |

## ★ IndividualMachineWorkTime — huvuddata

Varje block representerar ett tidsintervall (Stanford filtrerar bort < 15 sek).
Strukturen avgör om det är produktiv tid, avbrott eller rast.

```
<IndividualMachineWorkTime>
  <OperatorKey>1</OperatorKey>
  <ObjectKey>159</ObjectKey>
  <MonitoringStartTime>2026-05-05T16:44:08+02:00</MonitoringStartTime>
  <MonitoringTimeLength>1238</MonitoringTimeLength>
  <OtherMachineData>
    <EngineTime>...</EngineTime>
    <DrivenDistance>...</DrivenDistance>
    <FuelConsumption>...</FuelConsumption>
    <HarvesterData>...</HarvesterData>   ← skördardata, 0..N
  </OtherMachineData>
  ⌃ choice (en av tre):
  ├ <IndividualMachineRunTimeCategory>Processing</IndividualMachineRunTimeCategory>
  ├ <IndividualMachineDownTime>...</IndividualMachineDownTime>
  └ <IndividualUnutilizedTimeCategoryCode>Break</IndividualUnutilizedTimeCategoryCode>
</IndividualMachineWorkTime>
```

### Tidskategorier (`<IndividualMachineRunTimeCategory>`)

| Värde | Vår parser | Mappning |
|---|---|---|
| `Processing` | ✅ | `fakt_tid.processing_sek += duration` |
| `Terrain travel` | ✅ | `fakt_tid.terrain_sek += duration` + bränsle/distans |
| `Other work` (med `otherWorkCategory`-attribut) | ✅ | `fakt_tid.other_work_sek += duration` |

`otherWorkCategory`-attribut i v3.6 enum: `Road travel`, `Preparing strip roads`,
`Towing other machine`, `Roadside loading of truck`, `Unspecified`. Vi fångar
bara `other_work_sek`-summan — inte vilken underkategori. **Lucka (Låg).**

### Avbrott (`<IndividualMachineDownTime>`) — fyra grenar

```
<IndividualMachineDownTime>
  ⌃ choice (en av fyra):
  ├ <Maintenance>...</Maintenance>
  ├ <Disturbance>...</Disturbance>
  ├ <Repair>...</Repair>
  └ <OtherMachineDownTimeCategory>...</OtherMachineDownTimeCategory>

  <SpareParts>...</SpareParts>          ← 0..N (på Repair vanligast)
  <Coordinates>...</Coordinates>        ← 0..1 (v3.4+)
</IndividualMachineDownTime>
```

#### `<Maintenance>` ✅

```xml
<Maintenance>
  <MaintenanceStandardCode>Service</MaintenanceStandardCode>   <!-- enum från CodeList -->
</Maintenance>
```

| Mappning | Värde |
|---|---|
| `entry['maintenance_sek']` | += duration → `fakt_tid.maintenance_sek` |
| `data['avbrott']` rad | `typ='Underhåll'`, `kategori_kod=MaintenanceStandardCode` |

#### `<Disturbance>` ✅

```xml
<Disturbance>
  <DisturbanceStandardCode>Operator break</DisturbanceStandardCode>   <!-- enum -->
</Disturbance>
```

| Mappning | Värde |
|---|---|
| `entry['disturbance_sek']` | += duration → `fakt_tid.disturbance_sek` |
| `data['avbrott']` rad | `typ='Störning'`, `kategori_kod=DisturbanceStandardCode` |

#### `<Repair>` ✅ (delvis — se luckor)

```xml
<Repair>
  ⌃ choice (en av fyra orsakskategorier):
  ├ <CarrierRepairReason>...</CarrierRepairReason>
  ├ <LoaderLinkageRepairReason>...</LoaderLinkageRepairReason>
  ├ <HarvestingHeadRepairReason>...</HarvestingHeadRepairReason>   <!-- v3 -->
  ├ <AttachmentRepairReason>...</AttachmentRepairReason>           <!-- v4 (omdöpt) -->
  └ <OtherRepairReason>text</OtherRepairReason>
  <RepairManufacturerCode>...</RepairManufacturerCode>             <!-- 0..1 -->
</Repair>
```

Underorsakerna (Electrical, Hydraulics, Mechanical, Air) är gemensamma men varierar
per orsakskategori:

| Orsakskategori | v3.6 underorsaker |
|---|---|
| `CarrierRepairReason` | Electrical, Hydraulics, Mechanical, **Air** |
| `LoaderLinkageRepairReason` | Electrical, Hydraulics, Mechanical |
| `HarvestingHeadRepairReason` (v3) / `AttachmentRepairReason` (v4) | Electrical, Hydraulics, Mechanical |

I v3.6 är underorsaks-elementen ren textinnehåll (t.ex. `<Hydraulics>Hose (pipe)</Hydraulics>`).
**I v4 är de istället `<HydraulicsCode>` med attribut `hydraulicsName` — breaking change.**

| Mappning | Värde |
|---|---|
| `entry['avbrott_sek']` | += duration → `fakt_tid.avbrott_sek` (regel A — bevaras) |
| `mom_event_id` | `uuid5(NS, "stanford_id\|monitoring_start")` — deterministisk |
| `delsystem` | Orsakskategori-tag minus `RepairReason`-suffix → `"LoaderLinkage"` etc |
| `underorsak` | Underorsaks-tag (`"Hydraulics"`, `"Electrical"`, `"Mechanical"`, `"Air"`) |
| `detalj` | Textinnehåll i underorsaks-elementet (`"Hose (pipe)"`) |
| `data['avbrott']` rad | `typ='Reparation'`, `kategori_kod=REPAIR_<DELSYSTEM>_<UNDERORSAK>` |
| `data['maskin_service']` rad | `kalla='mom'`, samma `mom_event_id` |

Mappning från delsystem + underorsak till `maskin_service.kategori`-CHECK-enum.
Tabellen visar verkliga Stanford-delsystem och kategoriseringen idag (med kända
buggar) jämfört med vad mappningen ska vara efter att Lucka 1 är fixad:

| delsystem (Stanford-element) | underorsak | → kategori IDAG (med bugg) | → kategori KORREKT (efter Lucka 1-fix) |
|---|---|---|---|
| `Carrier` | Electrical | ovrigt | elektrisk |
| `Carrier` | Hydraulics | ovrigt | hydraulik |
| `Carrier` | Mechanical | ovrigt | motor |
| `Carrier` | Air | ovrigt | ovrigt (saknas i CHECK-enum) |
| `LoaderLinkage` | Hydraulics | hydraulik ✅ | hydraulik |
| `LoaderLinkage` | Electrical | kran | elektrisk |
| `LoaderLinkage` | Mechanical | kran ✅ | kran |
| `HarvestingHead` (v3) / `Attachment` (v4) | Electrical | ovrigt | elektrisk |
| `HarvestingHead` (v3) / `Attachment` (v4) | Hydraulics | ovrigt | hydraulik |
| `HarvestingHead` (v3) / `Attachment` (v4) | Mechanical | ovrigt | aggregat |
| `Other` (OtherRepairReason) | (saknas — simpleContent) | ovrigt ✅ | ovrigt |

Idag-kolumnen visar utfallet av den faktiska mappnings-koden (`_map_repair_to_kategori`)
som har felaktiga antaganden om vilka delsystem som finns. För Carrier och
HarvestingHead/Attachment hamnar allt i 'ovrigt' eftersom kodens if-grenar för
`Engine`, `Electrical`, `Assortment` etc inte träffar någon verklig Stanford-tag.

Notera att även den korrekta mappningen tappar information för `Carrier+Air`
eftersom CHECK-enum:en på `maskin_service.kategori` inte har en luft-kategori.
Strukturerad data (`delsystem`, `underorsak`) bevaras alltid i båda tabellerna —
luckan gäller bara hur enum-fältet `kategori` summarriserar.

#### `<OtherMachineDownTimeCategory>` ✅

```xml
<OtherMachineDownTimeCategory>
  <OtherMachineDownTimeStandardCode>Unproductive terrain work</OtherMachineDownTimeStandardCode>
  <OtherMachineDownTimeManufacturerCode>                                  <!-- 0..1 -->
    <Code>42</Code>
    <CodeDescription>Väntan på lastbil från Mörrum</CodeDescription>
  </OtherMachineDownTimeManufacturerCode>
</OtherMachineDownTimeCategory>
```

v3.6 enum för StandardCode: `Waiting for repair`, `Trailer transportation`,
`Unproductive terrain work`, `Waiting for other machine production`, `Other`,
`Default` (controller-genererad — operatören har inte registrerat).

| Mappning | Värde |
|---|---|
| `entry['avbrott_sek']` | += duration → `fakt_tid.avbrott_sek` (regel A — bevaras) |
| `data['avbrott']` rad | `typ='Övrigt'`, `kategori_kod=OtherMachineDownTimeStandardCode` |
| `detalj` | `OtherMachineDownTimeManufacturerCode.CodeDescription` om finns |
| Manufacturer Code (heltal) | ❌ skipp:as — manufacturer-specifik utan use case |
| `data['maskin_service']` rad | **ingen** — Övrigt är operativt avbrott, ej service |

#### `<SpareParts>` ✅ (på Repair-events, 0..N)

```xml
<SpareParts>
  <SparePartIdentity>Slang</SparePartIdentity>          <!-- krävs -->
  <SparePartDescription>Rotator höger inre</SparePartDescription>   <!-- 0..1 -->
  <SparePartsNoOfItems>1</SparePartsNoOfItems>          <!-- krävs -->
</SpareParts>
```

Flera SpareParts-block per Repair-event hanteras genom konkatenering med `"; "`
för namn/beskrivning, summering för antal.

| Mappning | Värde |
|---|---|
| `reservdel_namn` | `"; "`-konkatenerad lista av SparePartIdentity |
| `reservdel_beskrivning` | `"; "`-konkatenerad lista av SparePartDescription |
| `reservdel_antal` | Summa av SparePartsNoOfItems |

#### `<Coordinates>` ❌ — **Lucka (Låg)**

GPS-position för avbrottet (lagts till i v3.4). Vi missar Latitude/Longitude/
Altitude/CoordinateDate. Skulle möjliggöra "visa reparationer på karta" eller
"filtrera reparationer per geografiskt område".

### Rast (`<IndividualUnutilizedTimeCategoryCode>`)

| Värde | Vår parser | Mappning |
|---|---|---|
| (alla värden, t.ex. `Break`) | ✅ | `fakt_tid.rast_sek += duration`. Vi särskiljer inte mellan rast-underkategorier |

I v4 finns även `<IndividualUnutilizedTimeCategory>` (med versal C) som har
attribut `individualUnutilizedTimeCategoryName`. Vi parsar inte detta.

## Skördardata (`<HarvesterData>` under `<OtherMachineData>`)

För skördare läggs producerad volym + stammar per trädslag direkt på WorkTime-blocket.

| Element | Vår parser | Mappning |
|---|---|---|
| `<SpeciesGroupKey>` | ✅ | Del av `tradslag_id` |
| `<NumberOfHarvestedStems>` | ✅ | `fakt_produktion.stammar` |
| `<ProcessingCategory>` (`Single`/`MultiTreeHandling`) | ✅ | `fakt_produktion.processtyp` (`Single` / `MTH`) |
| `<TotalVolumeOfHarvestedLogs>` med `harvestedLogsVolumeCategory`-attribut | ✅ | `volym_m3sob` (sob) eller `volym_m3sub` (sub). MTH "estimated" tas med, Single "estimated" hoppas över |

**Anledning till MTH/Single-skillnad:** Vid `Single`-handling kapas och mäts varje stam
individuellt — verklig volym registreras per stock med givare. "Estimated" är då
en redundant uppskattning som lättgöra skulle dubbelräkna data, så den ignoreras.
Vid `MultiTreeHandling` (MTH — flerstamshantering där flera klena stammar kapas
som ett bunt) går det inte att mäta individuella stammar — endast en uppskattning
per bunt finns tillgänglig. Den måste tas med, annars saknas all volym för MTH-rader.
Verifierat i `parse_mom_file()` mot `processtyp == 'Single'`-villkoret.

## Korta avbrott (`<IndividualShortDownTime>`)

Egna block på toppnivå (utanför WorkTime). Stanford filtrerar typiskt < 15 sek.

| Element | Vår parser | Mappning |
|---|---|---|
| `<MonitoringStartTime>` + `<MonitoringTimeLength>` | ✅ | `fakt_tid.kort_stopp_sek += duration` |

## Skift (`<OperatorShiftDefinition>`)

```xml
<OperatorShiftDefinition>
  <ShifKey>1537</ShifKey>
  <OperatorKey>1</OperatorKey>
  <ObjectKey>159</ObjectKey>
  <ShiftCategory>Evening</ShiftCategory>     <!-- "Day" / "Evening" / "Night" -->
  <ShiftStartTime>...</ShiftStartTime>
  <ShiftEndTime>...</ShiftEndTime>
</OperatorShiftDefinition>
```

| Element | Vår parser | Mappning |
|---|---|---|
| Alla fält | ✅ | `fakt_skift` med UNIQUE på `(maskin_id, inloggning_tid, filnamn)` |

För maskiner utan OperatorShiftDefinition (t.ex. Rottne i vissa konfigurationer)
genererar parsern **syntetiska skift** baserat på min/max MonitoringStartTime
per (operator, datum). Se [`parse_mom_file()`](../../skogsmaskin_import_version_6.py) (sök efter "syntetiska skift").

## OperatorWorkTime / OperatorLoginTime

| Element | Vår parser | Notering |
|---|---|---|
| `<OperatorWorkTime>` med `OperatorWorkTimeCategory`-attribut | ⚪ | Vi använder skift-data + WorkTime-aggregering istället |
| `<OperatorLoginTime>` | ⚪ | Vi använder skift-data istället |

## Maskin-totaler (livstid)

| Element | Vår parser | Mappning |
|---|---|---|
| `<MachineEngineTime>` (minuter) | ✅ | `fakt_maskin_statistik.total_engine_time_sek` (×60) |
| `<MachineFuelConsumption>` (liter) | ✅ | `fakt_maskin_statistik.total_bransle_liter` (rimlighet < 100 000) |
| `<MachineDrivenDistance>` (meter) | ✅ | `fakt_maskin_statistik.total_korstracka_m` |

## Övriga top-level element

| Element | Vår parser | Notering |
|---|---|---|
| `<ReportInterval>` (start/end + filter) | ⚪ | Metadata, ingen DB-användning |
| `<MonitoringSettings>` (filter-tider) | ⚪ | Metadata, kan flaggas i framtid om data ser konstig ut |
| `<UserDefinedData>` (v2.1+) | ⚪ | Tillverkarspecifik fritext-area, okänd struktur per leverantör |
| `<IndividualEngineTime>` | ❌ | **Lucka (Låg)** — per-engine-tid om maskinen har flera motorer |

## DB-mappning — sammanfattning

| Tabell | Källa i MOM |
|---|---|
| `dim_maskin` | `<Machine>` + `<MachineOwner>` |
| `dim_operator` | `<OperatorDefinition>` |
| `dim_objekt` | `<ObjectDefinition>` |
| `dim_tradslag` | `<SpeciesGroupDefinition>` (skördare) |
| `fakt_tid` | `<IndividualMachineWorkTime>` aggregerat per (datum, maskin, objekt, operator) |
| `fakt_produktion` | `<HarvesterData>` per WorkTime |
| `fakt_skift` | `<OperatorShiftDefinition>` (eller syntetisk) |
| `fakt_avbrott` | Maintenance/Disturbance/Repair/OtherMachineDownTimeCategory |
| `maskin_service` | Repair-events (med Stanford-id → maskiner.id-uppslag) |
| `fakt_maskin_statistik` | `<MachineEngineTime>` + `<MachineFuelConsumption>` + `<MachineDrivenDistance>` |
| `detalj_gps_spar` | (Inga GPS-spår i MOM — kommer från andra filtyper) |

## Kända luckor — sammanfattning

| # | Lucka | Allvarlighetsgrad |
|---|---|---|
| 1 | `_map_repair_to_kategori` har 5 fiktiva delsystem (Engine/Electrical/Assortment/Sawing/etc) som inte finns i Stanford. Carrier + HarvestingHead saknas i mappningen → 'ovrigt' istället för specifik kategori | **Medium** |
| 2 | `<Coordinates>` på avbrott (v3.4+) — GPS-position ignoreras | **Låg** |
| 3 | `<RepairManufacturerCode>` — tillverkarspecifik kod ignoreras | **Låg** |
| 4 | `<OtherRepairReason>` — textinnehållet ignoreras (parser letar sub-element, men det är `simpleContent`) | **Låg** |
| 5 | `<MachineApplicationVersion>` (Ponsse Opti4G-version) ignoreras. Faktiskt nytta: tidig kanariefågel för v4-uppgraderingar — om en MOM-fil dyker upp med ny major-version vet vi att schemat sannolikt har ändrats och parsern behöver omtest. Inte värdefullt som data i sig | **Låg** |
| 6 | `<otherWorkCategory>`-attribut på "Other work" — vi särskiljer inte underkategorier (Road travel, Roadside loading av truck etc.) | **Låg** |
| 7 | `<ContactInformation><Email>` ignoreras (kunde användas för notifikationer) | **Låg** |
| 8 | `<LoggingOrganisation>` (beställare) ignoreras | **Låg** |
| 9 | `<IndividualEngineTime>` — per-engine-tid (för maskiner med flera motorer) ignoreras | **Låg** |
| 10 | Maintenance/Disturbance-koder visas oöversatt i UI (engelska enum-värden från Stanford, t.ex. `"Operator break"`, `"Service"`). Samma typ av fix som REPAIR-koderna behöver för human-readable visning — strukturerad data är korrekt fångad, bara presentationslagret behöver mappnings-tabell svenska↔engelska | **Medium** |

### Breaking changes vid eventuell v4-uppgradering

Om Ponsse/Rottne uppgraderar maskinprogramvaran från v3.x till v4 slutar
parsern korrekt hantera Repair-events:

| v3.x | v4.x | Påverkan |
|---|---|---|
| `<Hydraulics>text</Hydraulics>` | `<HydraulicsCode value attr="..."/>` | Underorsaks-tagnamnet ändras → vår mappning hittar inte rätt kategori |
| `<HarvestingHeadRepairReason>` | `<AttachmentRepairReason>` | Delsystem-namnet ändras |
| Inga attribut på StandardCodes | Lägger till `*Name`-attribut för fritext | Vi missar fritextnamnen, behåller bara enum-värdet |

Övriga grenar (Maintenance, Disturbance, OtherMachineDownTimeCategory) påverkas
mindre — bara nya `*Name`-attribut tillkommer som vi kunde fånga som tillägg.

## Verifierings-data

Senaste fullständiga verifiering: 2026-05-06 mot
`Björn_Martinsson_Svinhult_A-230326-154953.mom` (Wisent skotare A030353,
9 dagar mars-april):

- 11 IndividualMachineDownTime-block totalt
- 1 Maintenance, 1 Disturbance, 2 Repair, 7 OtherMachineDownTimeCategory
- Total downtime: 6h 44min
- Repair-events fick 2 deterministiska `mom_event_id` (matchade i båda tabellerna)
- 7 Övrigt-events landade som nya rader i `fakt_avbrott` (4h 17min)
