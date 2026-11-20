# Träffytor i ledighetsvyn — uppmätta i webbläsaren (Chromium, 390 / 1024 / 1440 px)

Mätt med `getBoundingClientRect` på varje synlig `button`, `a[href]`, `input`, `textarea`, `select` och `[role=button]` i vyn (toppfältets globala knappar, som hör till `TopBar`, är undantagna), i varje läge nedan, vid varje bredd. Rådata: `matning-fore.json`, `matning-efter.json`.

**Läge som mäts:** Mig (Historik öppen), Mig som godkännare ("att godkänna" öppen), Schema, Schema som godkännare, Ansök-arket (typ och period valda), Stopp-arket, Stopp-detaljen (efter), inline-bekräftelserna Ta bort / Neka / Ta bort stopp (efter), läsfel för ansökningar / saldo / schema (efter).

## Sammanfattning

| | Före | Efter |
|---|---|---|
| Mätta element-tillfällen | 390 | 555 |
| Under 44 px (höjd eller bredd) | **147** | **0** |

## Alla element som var under 44 px före (minsta uppmätta storlek, B×H px)

| Element (som det stod) | Minsta före | Läge |
|---|---|---|
| button | 166×20 | schema-admin, ark-stopp |
| HISTORIK (3)› | 358×28 | mig, ark-ansok |
| Rensa | 61×32 | ark-ansok |
| ‹ | 34×34 | schema, schema-admin, ark-ansok, ark-stopp |
| › | 34×34 | schema, schema-admin, ark-ansok, ark-stopp |
| Ändra | 61×36 | mig, ark-ansok |
| Ta bort | 68×36 | mig, ark-ansok |
| + Ansök om ledighet | 161×38 | mig, mig-admin, ark-ansok |
| + Lägg till stopp | 132×38 | schema-admin, ark-stopp |
| Godkänn | 156×40 | mig-admin |
| Neka | 156×40 | mig-admin |
| Alla maskiner | 350×40 | ark-stopp |
| Giant | 63×40 | ark-stopp |
| Rottne 101 | 93×40 | ark-stopp |
| Rottne 428 | 98×40 | ark-stopp |
| Elephant King | 116×40 | ark-stopp |
| Wisent2015 | 103×40 | ark-stopp |
| Avbryt | 76×41 | ark-ansok, ark-stopp |
| Skicka ansökan | 154×41 | ark-ansok |
| Semesterstopp | 171×44 | ark-stopp |
| Produktionsbegränsning | 171×44 | ark-stopp |

Stoppblocken i Schema stod som `button` 166×20; de är nu `Maskinstopp …`-knappar med radens hela höjd (48) och minst 44 px bredd även för ett endagsstopp (bredden vaktas i test, eftersom stoppen i fixturen är fem dagar).

## Före → efter per element

### 390 px
| Element | Före (B×H px) | Efter (B×H px) |
|---|---|---|
| Ansök om ledighet | 161×38 | 358×48 |
| Ändra | 61×36 | 47×44 |
| Ta bort | 68×36 | 82×44 |
| Historik-raden | 358×28 | 358×44 |
| Godkänn | 156×40 | 171×44 |
| Neka | 156×40 | 139×44 |
| Schema ‹ (tidigare vecka) | 34×34 | 44×44 |
| Schema › (nästa vecka) | 34×34 | 44×44 |
| Lägg till stopp | 132×38 | 358×44 |
| Stoppblock (godkännare) | 166×20 | 166×48 |
| Kalender ‹ (månad) | 34×34 | 44×44 |
| Kalender › (månad) | 34×34 | 44×44 |
| Rensa (period) | 61×32 | 44×44 |
| Avbryt (ark) | 76×41 | 52×44 |
| Skicka ansökan | 154×41 | 358×48 |
| Alla maskiner | 350×40 | 358×44 |
| Maskinchip (Giant) | 63×40 | 55×44 |
| Orsak: Semesterstopp | 171×44 | 175×44 |

### 1024 px
| Element | Före (B×H px) | Efter (B×H px) |
|---|---|---|
| Ansök om ledighet | 161×38 | 640×48 |
| Ändra | 61×36 | 47×44 |
| Ta bort | 68×36 | 82×44 |
| Historik-raden | 448×28 | 640×44 |
| Godkänn | 201×40 | 312×44 |
| Neka | 201×40 | 280×44 |
| Schema ‹ (tidigare vecka) | 34×34 | 44×44 |
| Schema › (nästa vecka) | 34×34 | 44×44 |
| Lägg till stopp | 132×38 | 992×44 |
| Stoppblock (godkännare) | 166×20 | 206×48 |
| Kalender ‹ (månad) | 34×34 | 44×44 |
| Kalender › (månad) | 34×34 | 44×44 |
| Rensa (period) | 61×32 | 44×44 |
| Avbryt (ark) | 76×41 | 52×44 |
| Skicka ansökan | 154×41 | 488×48 |
| Alla maskiner | 440×40 | 488×44 |
| Maskinchip (Giant) | 63×40 | 55×44 |
| Orsak: Semesterstopp | 216×44 | 240×44 |

### 1440 px
| Element | Före (B×H px) | Efter (B×H px) |
|---|---|---|
| Ansök om ledighet | 161×38 | 640×48 |
| Ändra | 61×36 | 47×44 |
| Ta bort | 68×36 | 82×44 |
| Historik-raden | 448×28 | 640×44 |
| Godkänn | 201×40 | 312×44 |
| Neka | 201×40 | 280×44 |
| Schema ‹ (tidigare vecka) | 34×34 | 44×44 |
| Schema › (nästa vecka) | 34×34 | 44×44 |
| Lägg till stopp | 132×38 | 1120×44 |
| Stoppblock (godkännare) | 166×20 | 176×48 |
| Kalender ‹ (månad) | 34×34 | 44×44 |
| Kalender › (månad) | 34×34 | 44×44 |
| Rensa (period) | 61×32 | 44×44 |
| Avbryt (ark) | 76×41 | 52×44 |
| Skicka ansökan | 154×41 | 488×48 |
| Alla maskiner | 440×40 | 488×44 |
| Maskinchip (Giant) | 63×40 | 55×44 |
| Orsak: Semesterstopp | 216×44 | 240×44 |


Topbar-knappen (hem, 36×36) hör till den globala `TopBar` och är inte rörd här.
