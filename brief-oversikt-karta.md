# Brief till Claude Code — Förarvyn (översikten)

Appen byggs nu, ingen produktion ännu. Schemat är kontrollerat direkt i Supabase
(projekt `mxydghzfacbenbgpodex`) — siffror och fältnamn nedan är verifierade mot
databasen, inte gissade.

## Arkitektur: två roller, två vyer
Idag ligger allt i samma vy (Karta / Maskiner / GROT). Vi delar det:
- **Förarvyn (denna brief)** = ombyggd översikt. Föraren *läser bara* sin rutt.
- **Planerarvyn (separat, byggs senare)** = management: ordning, lägga till/ta
  bort, flytta mellan maskiner, GROT-uppföljning, filter över alla objekt.

Vyn anpassas efter inloggning: **förare** ser bara sin egen maskins rutt,
**admin/planerare** ser alla objekt med filter (= planerarvyns karta, behåll
dagens funnel-filter där). Samma visuella språk i båda, men olika upplevelse —
gör det INTE till en enda karta med en roll-flagga som sväller.

## Datakällor (verifierat i Supabase)
- `objekt` (30 rader, **RLS AV — se Säkerhet**): id (uuid), status, typ,
  namn, markagare, markagare_tel, markagare_epost, volym_planerad/skordad/skotad,
  lat/lng, grot, grot_status/volym/anteckning/deadline, ordning,
  assigned_skordare_user_id, assigned_skotare_user_id, *_timestamp för
  pagaende/klar/avslutad.
- `maskin_ko` (3 rader): maskin_id (text), objekt_id (uuid), ordning (int) — köns
  ordning per maskin.
- `anvandare` (6 rader): id (uuid), roll (text), maskin_id (uuid), namn, telefon.
- `dim_objekt` (108): grot_anpassad (bool), skordning_avslutad, kontakt_*.
- `planering_markeringar` (77): objekt_id (uuid), typ (symbol/linje/zon/pil),
  data (jsonb) — semantiken ligger i data (`type`/`zoneType`/`lineType`/`arrowType`).

## Designtokens (låst — från planeringsvyn)
UI-chrome (kort, knappar, text, accenter) följer denna iOS-palett:
- Accent/länkar/info-värden (t.ex. "Navigera"): iOS-blå `#0a84ff`
- Positivt/klart: grön `#30d158` · Fel/fara: röd `#ff453a` · Varning: orange `#ff9f0a`
- Primärtext (rubriker/namn): `#fff` · Sekundärtext: `#8e8e93`
  · Svagaste text: `rgba(255,255,255,0.3)`
- Ytor/bakgrund: `rgba(255,255,255,0.06)` · Border/linje: `rgba(255,255,255,0.08)`
- Typsnitt: 12 / 13 / 15 / 17 / 20 px; vikter 400 / 500 / 600 / 700
- Radier: 8 / 12 / 16; pills: 50
(Appen är mörk — bygg utifrån det.)

Regel: **färg betyder status eller kartfeature, aldrig dekoration.** UI-chrome
följer iOS-paletten ovan. Allt som bär egen mening behåller sitt system och tvingas
INTE mot iOS:
- MCF-skalan (brandrisk 1–6): `#007AFF / #34C759 / #FFD60A / #FF9F0A / #FF453A / #AF52DE` — myndighetsstandard, rör aldrig.
- Kartlegend (vägar, zoner, vatten, marktyper) + statusfärger (skotning, vägklass, GPS): egna, särskiljbara system.

## Beslut 1 — Struktur: hel karta med flytande kort
Bygg VIDARE på den befintliga helskärmskartan i `OversiktKarta` — gör inte om den.
- Kartan fyller vyn. Ta bort bottenflikarna Maskiner/Karta/GROT (→ planerarvyn).
- **Flytande kort längst ner** (Apple Maps-stil): "Nu" störst, dragbart uppåt för
  hela listan ("Härnäst" i köordning). Källa: `maskin_ko` sorterad på `ordning`.
- Rutten ritas på kartan i köordning (maskin → nu → nästa …).
- Behåll: objektnamn vid inzoomning; tryck på markör → kort info (Beslut 3).
- **Read-only.** Föraren ändrar aldrig ordning.
- OBS: ordning finns på TVÅ ställen — `maskin_ko.ordning` och `objekt.ordning`.
  Bekräfta vilken som är sanning för kön (troligen `maskin_ko`) och använd bara den.

## Beslut 2 — Markörspråk
Två former: objekt = cirkel, maskin = rundad fyrkant med kugghjul.
Färg = status. **Verklig statusuppsättning:** `oplanerad`, `planerad`,
`pagaende`, `avslutat`. (Kodens `skordning/skotning/klar/importerad` finns inte i
`objekt.status` — behandla som utgående.)
- oplanerad → ofylld kontur · planerad → sval/blå · pagaende → aktiv-accent ·
  avslutat → nedtonad + bock.
Rörelse: endast aktiva objektet pulserar. GROT → hörn-märke (ej egen form).
Köordning → siffer-badge. Skriv om `buildMarkerEl` till `(form, status, badges[])`.

Statusfärgerna (oplanerad/planerad/pagaende/avslutat) tillhör appens egna
status-system — använd det befintliga (i `ST`), tvinga dem INTE mot iOS-paletten.
Förbättringen ligger i *hur* de visas: fyll hela markören med statusfärgen + form,
inte en svag ring. Verifiera att `pagaende` och `avslutat` är tydligt olika (grön
betyder "klart" i chrome-paletten, så låt inte pågående läsas som avslutat).

## Beslut 3 — Kort info-kort (`ObjCard`)
Glance: namn + typ + areal; status-pill; **Skördat/Skotat** (`volym_skordad` /
`volym_skotad`, progress = skotad/skordad); maskin + köplats; varning (Beslut 6);
markägare (`markagare`) med **Ring** (`tel:` på `markagare_tel`) + **Sms**
(Meddelanden, mall "Vi är på gång till {namn}"); knapp **Navigera hit**.
Bakom "Visa mer": trädslag, restriktioner i detalj, logistik (barighet, terrang),
anteckningar (`anteckningar` / `info_anteckningar`).

## Beslut 4 — Rutten uppdateras live
Planeraren kan kasta om `maskin_ko` när som helst → förarvyn måste visa ny ordning
utan omladdning. Idag laddas allt en gång vid mount. Lös med Supabase realtime på
`maskin_ko` (och `objekt.status`).

## Beslut 5 — Status-fix (objekt försvinner)
Bekräftat: 3 objekt har status `avslutat`, som saknas i kodens `ST` och i
`visIds` → de tappas tyst. **Princip: ett objekt i `objekt` blir aldrig osynligt
utan ett uttryckligt filter.**
- Gör `oplanerad` och `avslutat` förstklassiga i `ST` och `visIds`.
- Okänd status → rendera med tydlig fallback (kontur), filtrera aldrig bort tyst.

## Beslut 6 — Faror & hänsyn (från planering_markeringar)
Strukturerat, ingen fritext. Klassa `data`-subtypen per markering:
- **Fara (röd `#ff453a`):** `powerline`, `warning` — och inget annat (beslutat).
- **Hänsyn (gul `#ff9f0a`):** eternitytree, naturecorner, protected, fornlamning,
  culture, culturemonument, highstump.
- **Neutralt (ingen varning):** wet, ditch, windfall, landing, corduroy,
  manualfelling, road/mainRoad/sideRoad*, boundary, fellingdirection, drivedirection.
Kortet/markören visar allvarligast först (röd > gul); flera → "+N till".
Not: `warning` är planerarens egen manuella faroflagga — ett farligt dike eller
blött parti flaggas av planeraren som `warning`, inte automatiskt av systemet.

## Roller & inloggning (login → maskin)
Kopplingen finns men korsar två id-format:
`anvandare.maskin_id` (uuid) → `maskiner.id` (uuid) → `maskiner.maskin_id` (text)
→ `maskin_ko.maskin_id` (text). Förarvyn filtrerar kön till inloggad maskin.
- `anvandare.roll` avgör förare vs admin/planerare.
- `objekt.assigned_skordare_user_id`/`assigned_skotare_user_id` (uuid) finns också
  — bekräfta om kön (`maskin_ko`) eller dessa är sanningen för "vems jobb".

## Säkerhet — MÅSTE åtgärdas
`objekt`, `medarbetare` och `fakt_tid_test` har Row Level Security **avstängt** —
fullt läs/skrivbara för alla med anon-nyckeln, inkl. markägares telefon och
personalens löner/adresser. Rollbaserad åtkomst (förare vs admin) går inte att
skydda förrän detta är löst. Slå INTE bara på RLS (låser ute allt) — lägg till
policies. Föreslå policies och stäm av:
```
ALTER TABLE public.objekt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medarbetare ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fakt_tid_test ENABLE ROW LEVEL SECURITY;
-- + SELECT/UPDATE-policies per roll (förare ser egen maskin, admin ser allt).
```

## Får INTE göras
- Joina inte `fakt_produktion` och `fakt_lass` — summera var för sig per objekt.
- Gör inte om kartan; bygg vidare på den.
- Inga nya färg-hex — använd Designtokens ovan; tvinga inte status/karta/MCF mot iOS.

## Samordning — undvik merge-konflikter
Ett parallellt spår jobbar med **planeringsvyn** och rör också `page.tsx`. Två
agenter i samma fil samtidigt = merge-konflikter (har redan hänt idag). Rör inte
`page.tsx` samtidigt — jobba i olika filer eller turas om.

## Klart när
- Förarvyn visar bara inloggad maskins rutt (Nu + Härnäst), read-only.
- Inget objekt i `objekt` osynligt utan aktivt filter (de 3 `avslutat` syns/hanteras).
- Max två markörformer; endast aktiva markören animeras; faror färgade rätt.
- `ObjCard` visar glance-settet; Ring/Sms fungerar.
- Omkastad kö hos planeraren syns hos föraren utan omladdning.
- RLS-frågan adresserad (policies föreslagna).
