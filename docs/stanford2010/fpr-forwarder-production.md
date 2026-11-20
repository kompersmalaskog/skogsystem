# FPR — Forwarded Production

`.fpr`-filer beskriver allt som skotaren har **lastat och lossat** under sina
körningar — varje lass, vilka sortiment, vilka destinationer (avläggsplatser),
volymer per sortiment, körsträcka, tider för lastning/lossning. Genereras av
skotare när skift avslutas eller manuellt.

| Aspect | Värde |
|---|---|
| Stanford-meddelande | `ForwardedProduction` |
| Filändelse | `.fpr` (komprimerad: `.fprz`, ej parsad) |
| Producerad av | Skotare (Ponsse Wisent, Ponsse Elephant King) |
| XSD (vår referens) | [`ForwardedProduction_V3p6.xsd`](https://www.skogforsk.se/contentassets/1a68cdce4af1462ead048b7a5ef1cc06/stanford2010_release_3.6.zip) (614 rader) |
| Faktiska filer i drift | v3.1 (Ponsse Opti4G 4.785) |
| Parser | [`parse_fpr_file()`](../../skogsmaskin_import_version_6.py) i skogsmaskin_import_version_6.py |
| DB-skrivning | [`save_fpr_to_supabase()`](../../skogsmaskin_import_version_6.py) |

## Innehåll

- [Filstruktur — top-level](#filstruktur--top-level)
- [Maskin-data (`<Machine>`)](#maskin-data-machine)
- [Operatörer (`<OperatorDefinition>`)](#operatörer-operatordefinition)
- [Objekt (`<ObjectDefinition>`)](#objekt-objectdefinition)
- [Sortiment (`<ProductDefinition>`)](#sortiment-productdefinition)
- [Avlägg (`<LocationDefinition>`)](#avlägg-locationdefinition)
- [Leveransdefinitioner (`<DeliveryDefinition>`)](#leveransdefinitioner-deliverydefinition)
- [Destinationer (`<DeliveryDestination>` / `<DestinationDefinition>`)](#destinationer-deliverydestination--destinationdefinition)
- [★ Lass (`<Load>` + `<PartialLoad>`) — huvuddata](#-lass-load--partialload--huvuddata)
- [Skotnings-status (`<ForwardingStatus>`)](#skotnings-status-forwardingstatus)
- [DB-mappning — sammanfattning](#db-mappning--sammanfattning)
- [Kända luckor — sammanfattning](#kända-luckor--sammanfattning)
  - [Breaking changes vid eventuell v4-uppgradering](#breaking-changes-vid-eventuell-v4-uppgradering)
- [Verifierings-data](#verifierings-data)

## Filstruktur — top-level

```
<ForwardedProduction xmlns="urn:skogforsk:stanford2010" version="3.1" messageType="fpr">
  <ForwardedProductionHeader>...</ForwardedProductionHeader>
  <Machine>
    <BaseMachineManufacturerID>A030353</BaseMachineManufacturerID>
    <MachineBaseModel>Wisent 2015</MachineBaseModel>
    <SpeciesGroupDefinition>...</SpeciesGroupDefinition>     ← N stycken
    <ProductDefinition>...</ProductDefinition>               ← N stycken
    <ObjectDefinition>...</ObjectDefinition>                 ← N stycken
    <LocationDefinition>...</LocationDefinition>             ← N stycken (avlägg)
    <DeliveryDefinition>...</DeliveryDefinition>             ← N stycken (DeliveryKey + DeliveryDestination)
    <OperatorDefinition>...</OperatorDefinition>             ← N stycken
    <Load>                                                   ← N stycken (★ HUVUDDATA — varje lass)
      <PartialLoad>...</PartialLoad>                         ← 1..N per lass (en per sortiment i lasset)
    </Load>
    <ForwardingStatus>...</ForwardingStatus>                 ← 0..N
    <ScaleDefinition>...</ScaleDefinition>                   ← 0..N (våg-info)
    <UserDefinedData>...</UserDefinedData>                   ← 0..1
  </Machine>
</ForwardedProduction>
```

## Maskin-data (`<Machine>`)

| Element | Vår parser | Mappning |
|---|---|---|
| `<BaseMachineManufacturerID>` | ✅ | `dim_maskin.maskin_id` (text-PK). Tre fallbacks: `BaseMachineManufacturerID` → `MachineOwnerID` → `MachineKey`. Normaliseras (Rottne får R-prefix) |
| `<MachineBaseManufacturer>` | ✅ | `dim_maskin.tillverkare` |
| `<MachineBaseModel>` | ✅ | `dim_maskin.modell` |
| Maskintyp | ✅ | Hårdkodat `'Forwarder'` (FPR produceras bara av skotare) |
| `<MachineHeadManufacturer>` / `<MachineHeadModel>` | ❌ | **Lucka (Låg)** — vi sätter inte aggregat från FPR |
| `<MachineApplicationVersion>` | ❌ | **Lucka (Låg)** — kanariefågel för v4 (samma som MOM/HPR) |
| `<MachineOwner>` | ❌ | **Lucka (Låg)** — vi förlitar oss på MOM |

## Operatörer (`<OperatorDefinition>`)

| Element | Vår parser | Mappning |
|---|---|---|
| `<OperatorKey>` | ✅ | Del av `operator_id` |
| `<ContactInformation>/<FirstName>+<LastName>` | ✅ | `dim_operator.operator_namn`. Skip:as om värdet ser ut som UUID. Default `f"Operatör {op_key}"` om saknas |
| `<OperatorUserID>` | ❌ | **Lucka (Låg)** — vi parsar inte (fångas via MOM) |

## Objekt (`<ObjectDefinition>`)

FPR har **rik** objekt-info (mer än både MOM och HPR) eftersom skotaren har
eget grepp om var den hämtat och vart den lämnat. Inkluderar Ponsse-specifik
Extension för CuttingMethod (avverkningsmetod).

```xml
<ObjectDefinition>
  <ObjectKey>...</ObjectKey>
  <ObjectUserID>...</ObjectUserID>
  <ContractNumber>11146159</ContractNumber>
  <ObjectName>240126-125001</ObjectName>             <!-- Ponsse: tidsstämpel (vi ignorerar) -->
  <ForestOwner>
    <FirstName>Anders</FirstName>                     <!-- → saljare -->
    <LastName>Moliis</LastName>                       <!-- → skogsagare -->
  </ForestOwner>
  <LoggingOrganisation>
    <ContactInformation>
      <BusinessName>VIDA</BusinessName>               <!-- → bolag -->
    </ContactInformation>
  </LoggingOrganisation>
  <Coordinates>...</Coordinates>                      <!-- 0..1 -->
  <LoggingForm>
    <LoggingFormCode>10</LoggingFormCode>
    <LoggingFormDescription>Slutavverkning</LoggingFormDescription>
  </LoggingForm>
  <ForestCertification>FSC</ForestCertification>
  <RealEstateIDObject>...</RealEstateIDObject>        <!-- fastighetsnummer -->
  <StartDate>...</StartDate>
  <EndDate>...</EndDate>
  <Extension>
    <Ponsse:Ponsse xmlns:Ponsse="http://www.ponsse.com">
      <Ponsse:CuttingMethod>...</Ponsse:CuttingMethod>
    </Ponsse:Ponsse>
  </Extension>
</ObjectDefinition>
```

| Element | Vår parser | Mappning |
|---|---|---|
| `<ObjectKey>` | ✅ | Del av `objekt_id` |
| `<ObjectUserID>` / `<ContractNumber>` | ✅ | `vo_nummer` (ContractNumber prioriteras) |
| `<ObjectUserID>` separat | ✅ | `dim_objekt.objektnr` |
| `<ObjectName>` | ⚪ (ignoreras) | **Subtilt:** Ponsse lägger tidsstämpel här (t.ex. `"240126-125001"`) — inte ett riktigt namn. Vi använder filnamnet (utan datum-suffix) som primär källa för `object_name`. Fallback till `<ObjectName>` om filnamnet ger tom sträng OCH värdet inte är rena siffror |
| `<ForestOwner>/<LastName>` | ✅ | `dim_objekt.skogsagare` (fallback `BusinessName`) |
| `<ForestOwner>/<FirstName>` | ✅ | `dim_objekt.saljare` |
| `<LoggingOrganisation>/<ContactInformation>/<BusinessName>` | ✅ | `dim_objekt.bolag` (fallback `LastName`) |
| `<Coordinates>` (på ObjectDefinition) | ✅ | `dim_objekt.latitude/longitude`. Fallback till `LocationDefinition.LocationCoordinates` om Coordinates saknas |
| `<LoggingForm>/<LoggingFormDescription>` | ✅ | `dim_objekt.avverkningsform` |
| `<LoggingForm>/<LoggingFormCode>` | ⚪ (läses men sparas ej) | Värdet hämtas i `avverkningsform_kod` men används inte vidare i parsern |
| `<ForestCertification>` | ✅ | `dim_objekt.certifiering` |
| `<RealEstateIDObject>` | ✅ | `dim_objekt.fastighetsnummer` |
| `<StartDate>` / `<EndDate>` | ✅ | `dim_objekt.start_date` / `end_date` |
| `<Extension>/Ponsse:CuttingMethod>` (Ponsse-specifik) | ✅ (delvis) | `dim_objekt.cutting_method`. **Lucka (Låg):** Hårdkodat namespace `http://www.ponsse.com` — Rottne-skotare (om vi får sådana) har annan extension-struktur som ignoreras |

## Sortiment (`<ProductDefinition>`)

```xml
<ProductDefinition>
  <ProductKey>120</ProductKey>
  <ClassifiedProductDefinition>
    <ProductName>Tall Sågtimmer</ProductName>
    ...
  </ClassifiedProductDefinition>
</ProductDefinition>
```

| Element | Vår parser | Mappning |
|---|---|---|
| `<ProductKey>` | ✅ | Del av `sortiment_id` |
| `<ClassifiedProductDefinition>/<ProductName>` | ✅ | `dim_sortiment.namn`. Fallback till `<ProductDefinition>/<ProductName>` direkt om Classified saknas |
| `<UnclassifiedProductDefinition>` | ❌ | **Lucka (Låg)** — vi söker bara i ClassifiedProductDefinition; oklassificerade sortiment hoppas över |
| `<Price>` / `<Color1>` / `<SpeciesGroupKey>` | ❌ | **Lucka (Låg)** — fångas via HPR där samma sortiment definieras |

## Avlägg (`<LocationDefinition>`)

Avläggsplatser där skotaren lägger sortimentet vid vägkant inför vidaretransport.

```xml
<LocationDefinition>
  <LocationKey>253</LocationKey>
  <ObjectKey>99</ObjectKey>
  <LocationName>Avlägg 1</LocationName>
  <LocationCoordinates>
    <Latitude>...</Latitude>
    <Longitude>...</Longitude>
  </LocationCoordinates>
</LocationDefinition>
```

| Element | Vår parser | Mappning |
|---|---|---|
| `<LocationKey>` | ✅ | `dim_destination.destination_id` |
| `<ObjectKey>` | ✅ | Bygger `location_obj_map[loc_key] = obj_key` för PartialLoad-uppslag |
| `<LocationName>` | ✅ | `dim_destination.namn` |
| `<LocationCoordinates>/<Latitude>+<Longitude>` | ✅ | `dim_destination.latitude/longitude`. Fallback till direkt `<Latitude>` / `<Longitude>` på LocationDefinition om sub-elementet saknas |
| `<Altitude>` / `<CoordinateDate>` | ❌ | **Lucka (Låg)** — bara lat/lon fångas |

**Notera:** Två separata Avlägg-koncept blandas i `dim_destination`-tabellen:
LocationDefinition (vägkants-avlägg vid objektet) OCH DeliveryDestination (slutdestination
hos sågverk/massabruk). Båda får rader i samma tabell med olika `destination_id`.

## Leveransdefinitioner (`<DeliveryDefinition>`)

Binder en logisk leverans (DeliveryKey) till ett sortiment (ProductKey) och
en slutdestination.

```xml
<DeliveryDefinition>
  <DeliveryKey>120</DeliveryKey>
  <ProductKey>405</ProductKey>
  <DeliveryDestination>
    <DestinationKey>...</DestinationKey>
    <DestinationName>Vida Brokind</DestinationName>
    <DestinationUserID>...</DestinationUserID>
  </DeliveryDestination>
</DeliveryDefinition>
```

| Element | Vår parser | Mappning |
|---|---|---|
| `<DeliveryKey>` | ✅ | Bygger `delivery_product_map[del_key] = prod_key` för PartialLoad-uppslag |
| `<ProductKey>` | ✅ | Mål för delivery_product_map |
| `<DeliveryDestination>` | ✅ | Hanteras nedan (separat sektion) |
| Övriga DeliveryDefinition-fält (DeliveryNumber, Capacity etc.) | ❌ | **Lucka (Låg)** — leveransorder-detaljer ignoreras |

## Destinationer (`<DeliveryDestination>` / `<DestinationDefinition>`)

| Element | Vår parser | Mappning |
|---|---|---|
| `<DeliveryDestination>/<DestinationKey>` | ✅ | `dim_destination.destination_id` = `f"{maskin_id}_{dest_key}"` |
| `<DeliveryDestination>/<DestinationName>` | ✅ | `dim_destination.namn` ("Vida Brokind", "Stora Enso Skutskär" etc) |
| `<DeliveryDestination>/<DestinationUserID>` | ✅ | `dim_destination.mottagningsnummer` |
| `<DestinationDefinition>` (äldre format, fallback) | ✅ | Samma fält. Hoppas över om DeliveryDestination redan registrerat key |

## ★ Lass (`<Load>` + `<PartialLoad>`) — huvuddata

Varje `<Load>` är ETT lass (en lossning vid ett avlägg eller hos kund). Inom
varje lass finns 1..N `<PartialLoad>` — en per sortiment i lasset.

```xml
<Load>
  <LoadKey>4873</LoadKey>
  <OperatorKey>4</OperatorKey>
  <LoadNumber>1</LoadNumber>
  <DistanceFromLastUnloading>1222</DistanceFromLastUnloading>   <!-- m -->
  <UnloadingTime>2026-04-30T17:28:54+02:00</UnloadingTime>
  <PartialLoad>
    <PartialLoadKey>5870</PartialLoadKey>
    <DeliveryKey>120</DeliveryKey>                               <!-- → ProductKey via map -->
    <LocationKey>253</LocationKey>                               <!-- → ObjectKey via map -->
    <LoadVolume loadVolumeCategory="Volume, m3sob">2.5</LoadVolume>
    <LoadVolume loadVolumeCategory="Volume, m3sub">2.5</LoadVolume>
    <LoadVolume loadVolumeCategory="Solid volume of bundles...">2.5</LoadVolume>
    <LoadGreenMass>...</LoadGreenMass>                          <!-- 0..1, för bioenergi -->
    <LoadingCoordinates>...</LoadingCoordinates>                <!-- 0..1, var lass laddades -->
    <ScaleKey>...</ScaleKey>                                    <!-- 0..1, om vägdes -->
    <SubObjectKey>...</SubObjectKey>                            <!-- 0..1 -->
    <LoadNumberOfItems>...</LoadNumberOfItems>                  <!-- 0..1 -->
  </PartialLoad>
  ⌃ flera PartialLoad om lasset består av olika sortiment
</Load>
```

### Load-nivå (per lass)

| Element | Vår parser | Mappning |
|---|---|---|
| `<LoadKey>` | ⚪ | Vi använder `LoadNumber` istället |
| `<OperatorKey>` | ✅ | `fakt_lass.operator_id` |
| `<LoadNumber>` | ✅ | `fakt_lass.lass_nummer` |
| `<DistanceFromLastUnloading>` (m) | ✅ | `fakt_lass.korstracka_m` |
| `<UnloadingTime>` | ✅ | `fakt_lass.lossnings_tid` + `datum` (prioriteras före LoadingTime) |
| `<LoadingTime>` | ✅ | `fakt_lass.lastnings_tid`. **Notera:** Stanford v3.6 LoadType har INTE LoadingTime som element — vi söker ändå (no-op om saknas). Kan vara Ponsse-extension eller v4-tillägg |
| `<Extension>` (på Load) | ❌ | **Lucka (Låg)** — vi läser bara Extension på ObjectDefinition (Ponsse CuttingMethod) |

### PartialLoad-nivå (per sortiment i lasset)

| Element | Vår parser | Mappning |
|---|---|---|
| `<PartialLoadKey>` | ❌ | **Lucka (Låg)** — internt referensnummer, ej använd |
| `<DeliveryKey>` | ✅ | Söks i `delivery_product_map` för att hitta `ProductKey` |
| `<LocationKey>` | ✅ | Söks i `location_obj_map` för att hitta `ObjectKey` (sätts på första PartialLoad med träff) |
| `<ProductKey>` (direkt) | ✅ | Används om finns, annars via DeliveryKey-mapping |
| `<LoadVolume>` (multipla, varje med `loadVolumeCategory`-attribut) | ✅ (med fallback) | Två tolkningstrategier: (1) **Om kategori-attribut finns:** `m3sob` → `volym_m3sob`, `m3sub` → `volym_m3sub`; (2) **Om ingen kategori:** anta `index 0 = sob`, `index 1 = sub`. Riktiga FPR-filer har 3 LoadVolumes ("Volume, m3sob", "Volume, m3sub", "Solid volume of bundles...") — den tredje (`Solid volume`) ignoreras |
| `<LoadGreenMass>` (kg) | ❌ | **Lucka (Medium)** — grön vikt för bioenergi-leveranser. Värdefullt för GROT-rapporter |
| `<LoadingCoordinates>` (Lat/Lng) | ❌ | **Lucka (Medium)** — exakt position där lasset togs upp i terrängen. Skulle möjliggöra "skotnings-spår på karta" |
| `<ScaleKey>` (referens till ScaleDefinition) | ❌ | **Lucka (Låg)** — om lasset vägdes på maskinens våg |
| `<SubObjectKey>` | ❌ | **Lucka (Låg)** — del-objekt-stöd saknas |
| `<LoadNumberOfItems>` | ❌ | **Lucka (Låg)** — antal styck (för stockar mätt i antal istället för volym) |
| `<DestinationKey>` (på PartialLoad — sällsynt) | ✅ | Fallback om `DeliveryKey` saknas, för destination-uppslag |

### Aggregeringar i `fakt_lass`

| Fält | Beräkning |
|---|---|
| `volym_m3sob` | Summa över PartialLoads.volym_m3sob |
| `volym_m3sub` | Summa över PartialLoads.volym_m3sub |
| `destination_id` | `f"{maskin_id}_{dest_key}"` från sista PartialLoad med dest_key |
| `destination_namn` | Slås upp i `dest_names`-map (DestinationName från DeliveryDestination/DestinationDefinition) |
| `objekt_id` | Slås upp via första LocationKey i PartialLoads → location_obj_map. Fallback: första LocationDefinition.ObjectKey i hela filen |

### Sortiment per lass — sparas separat i `fakt_lass_sortiment`

En rad per (lass, sortiment) med `volym_m3sob` + `volym_m3sub` + sortiment_namn.
Lass utan `objekt_id` filtreras bort vid skrivning ([rad 2648-2649](../../skogsmaskin_import_version_6.py)) —
**möjlig lucka:** lass där object/location-mapping misslyckas tappas helt.

## Skotnings-status (`<ForwardingStatus>`)

Total skotnings-tid per (objekt, sortiment) — ett block per sortiment som
skotaren jobbat med.

```xml
<ForwardingStatus>
  <LocationKey>...</LocationKey>
  <DeliveryKey>...</DeliveryKey>
  <ForwardStartDate>...</ForwardStartDate>
  <ForwardEndDate>...</ForwardEndDate>
</ForwardingStatus>
```

| Element | Vår parser | Mappning |
|---|---|---|
| `<LocationKey>` → `<ObjectKey>` (via map) | ✅ | `fakt_skotning_status.objekt_id` |
| `<DeliveryKey>` → `<ProductKey>` (via map) | ✅ | `fakt_skotning_status.sortiment_id` + `sortiment_namn` |
| `<ForwardStartDate>` | ✅ | `fakt_skotning_status.start_tid` |
| `<ForwardEndDate>` | ✅ (om finns) | `fakt_skotning_status.slut_tid` (NULL om pågående) |

Status-rader skip:as om `objekt_id` inte kan hittas eller `start_tid` saknas.

## DB-mappning — sammanfattning

| Tabell | Källa i FPR |
|---|---|
| `dim_maskin` | `<Machine>` (id/tillverkare/modell, hårdkodat `'Forwarder'`) |
| `dim_operator` | `<OperatorDefinition>` |
| `dim_objekt` | `<ObjectDefinition>` (rik info — saljare, skogsagare, bolag, fastighetsnummer, koordinater, avverkningsform, certifiering, cutting_method, datum) |
| `dim_destination` | `<LocationDefinition>` (avlägg) + `<DeliveryDestination>` (slutdestination) — båda i samma tabell |
| `dim_sortiment` | `<ProductDefinition>` (bara ClassifiedProductDefinition, bara namn — pris/färgmärkning från HPR) |
| `fakt_lass` | `<Load>` aggregerat med PartialLoad-summor |
| `fakt_lass_sortiment` | En rad per (lass, sortiment) |
| `fakt_skotning_status` | `<ForwardingStatus>` per (objekt, sortiment) |

## Kända luckor — sammanfattning

| # | Lucka | Allvarlighetsgrad |
|---|---|---|
| 1 | `<LoadGreenMass>` per PartialLoad — grön vikt för bioenergi/GROT-leveranser ignoreras | **Medium** |
| 2 | `<LoadingCoordinates>` per PartialLoad — var lasset laddades i terrängen. Skulle möjliggöra skotnings-spår på karta | **Medium** |
| 3 | LoadVolume-tolkningens fallback (om ingen kategori-attribut: index 0 = sob, index 1 = sub) är skör — kan ge fel värde om filen har andra ordning eller saknar kategorier | **Medium** |
| 4 | **Lass utan `objekt_id` filtreras bort vid skrivning (TYST data-förlust)** ([rad 2648-2649](../../skogsmaskin_import_version_6.py)). Lass där location/object-mapping misslyckas tappas TYST utan varning eller felmeddelande. Detta är skotnings-data som faktiskt hänt — om N lass tappas per fil får skotnings-statistik systematiskt fel. Kräver: (a) räkna förekomst i historiska Behandlade-filer, (b) lägga till varning vid import om objekt_id saknas, (c) ev. fallback-logik | **Hög** |
| 5 | Den tredje `<LoadVolume>` "Solid volume of bundles..." ignoreras — relevant för bunt-leveranser av GROT | **Medium** |
| 6 | `dim_destination` blandar två koncept i samma tabell: `LocationDefinition` (vägkants-avlägg vid objektet) och `DeliveryDestination` (slutdestination hos sågverk/massabruk). Ingen typ-kolumn skiljer dem åt → rapporter som "alla sågverk" eller "körsträcka avlägg → sågverk" går inte att göra utan att inspektera namn/koordinater. Förslag på fix: lägg till `destination_typ` ENUM (`'avlagg' | 'slutdest'`) eller dela i två tabeller | **Medium** |
| 7 | `<UnclassifiedProductDefinition>` ignoreras — oklassificerade sortiment hoppas över i namn-uppslaget | **Låg** |
| 8 | `<ScaleDefinition>` på Machine-nivå + `<ScaleKey>` på PartialLoad ignoreras — våg-data om lasset vägdes på maskinens våg | **Låg** |
| 9 | `<LoadNumberOfItems>` per PartialLoad — antal styck (för sortiment mätt i antal istället för volym) | **Låg** |
| 10 | `<SubObjectKey>` per PartialLoad — del-objekt-stöd saknas | **Låg** |
| 11 | Ponsse-extension `CuttingMethod` är hårdkodad till namespace `http://www.ponsse.com`. Rottne-skotare i flottan idag = 0. Om sådan tillkommer behöver Extension-parsning utökas med Rottnes namespace — flaggas som tillkommande arbete, inte akut | **Låg** |
| 12 | `<Extension>` på Load-nivå ignoreras (vi läser bara på ObjectDefinition) | **Låg** |
| 13 | `<DeliveryDefinition>` övriga fält (DeliveryNumber, Capacity, etc.) ignoreras — bara DeliveryKey + ProductKey + DeliveryDestination fångas | **Låg** |
| 14 | `<LocationDefinition>` Altitude + CoordinateDate ignoreras — bara lat/lon fångas | **Låg** |
| 15 | ObjectName-fallback-logik är subtil: "om filnamnet ger tom sträng OCH värdet inte är rena siffror, använd `<ObjectName>`". Om filnamnet skulle vara tomt (osannolikt scenario) och `<ObjectName>` innehåller bindestreck (`240126-125001`-stil) skulle Ponsse-tidsstämpeln hamna som `object_name`. Inte verifierat i drift | **Låg** |
| 16 | `<LoggingFormCode>` läses men sparas inte — bara `LoggingFormDescription` används | **Låg** |
| 17 | `<MachineApplicationVersion>` ignoreras (kanariefågel för v4) | **Låg** |
| 18 | `<UserDefinedData>` ignoreras (tillverkarspecifik) | **Låg** |
| 19 | `<MachineHeadManufacturer>` / `<MachineHeadModel>` ignoreras (skotare har inget aggregat — irrelevant) | **Låg** |

### Designval & subtila beteenden

Detta är inte luckor utan medvetna designbeslut värt att känna till:

- **`object_name` härleds från filnamn istället för `<ObjectName>`** eftersom
  Ponsse återanvänder `<ObjectName>`-fältet för tidsstämplar (t.ex.
  `"240126-125001"` istället för "Anders Moliis"). Konsekvens: manuell
  omdöpning av filnamn före import ändrar `object_name` i DB. Om någon
  döper om en FPR-fil för att rätta stavfel, syns det direkt i DB efter
  omimport.

### Breaking changes vid eventuell v4-uppgradering

FPR har varit relativt stabil mellan v3 och v4. Inga större strukturella
omdöpningar identifierade. LoadVolume-attribut kan tillkomma:

| v3.x | v4.x | Påverkan |
|---|---|---|
| `loadVolumeCategory="Volume, m3sob"` (textbaserad enum) | Möjliga nya kategorier eller attribut tillkommer | Vår "kategori-baserad om finns, index-baserad annars"-logik fortsätter fungera så länge m3sob/m3sub finns med i kategori-strängen |
| Inga `*Name`-attribut på enum-koder | Möjliga `*Name`-attribut tillkommer | Neutralt — vi parsar inte enum-värdens fritext-namn |
| Inga | Nya optional `<Extension>`-platser tillagda | Neutralt — vi ignorerar Extension |

**Slutsats:** Inga breaking changes som påverkar vår parser direkt vid v4-uppgradering.

## Verifierings-data

Inspektion 2026-05-07 av `Anders_Moliis-300426-162932_20260504_154441.fpr`
(Ponsse Elephant King AF skotare, Anders Moliis, 30 april 2026):

- 12 969 bytes (~13 KB — typisk FPR-storlek)
- 12 `<Load>` (12 lass)
- 12 `<PartialLoad>` (1 per Load — alla lass består av ett enda sortiment)
- 36 `<LoadVolume>` (3 per PartialLoad: m3sob, m3sub, "Solid volume of bundles")
- 12 `<UnloadingTime>` (alla lass har lossnings-tid)
- 1 `<ProductDefinition>`, 1 `<ObjectDefinition>`, 1 `<LocationDefinition>`,
  1 `<DeliveryDefinition>`, 1 `<DeliveryDestination>`, 1 `<OperatorDefinition>`
- 1 `<ForwardingStatus>` (en sortiment-status)
- 0 `<LoadGreenMass>`, 0 `<LoadingCoordinates>`, 0 `<LoadingTime>`,
  0 `<UserDefinedData>`, 0 `<ScaleDefinition>`

Förväntat utfall vid import:
- 1 rad i `dim_maskin` (eller upsert)
- 1 rad i `dim_operator`
- 1 rad i `dim_objekt`
- 2 rader i `dim_destination` (LocationDefinition + DeliveryDestination)
- 1 rad i `dim_sortiment`
- 12 rader i `fakt_lass` (en per Load)
- 12 rader i `fakt_lass_sortiment` (en per Load×Sortiment-kombination)
- 1 rad i `fakt_skotning_status`

FPR-filer är generellt små (5-30 KB) jämfört med HPR (3-15 MB) eftersom
de bara innehåller per-lass-aggregat, inte per-stam/per-stock-detaljer.
Filerna är **kumulativa** — varje ny FPR från samma objekt innehåller alla
tidigare lass plus nya.
