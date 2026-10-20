# Skogsystem — Status

## Klart
- Timer-flöde för extra tid (logga tid)
- Frånvaro: Sjuk/VAB med direkt registrering
- Sammanfattningskort med extra tid-rader
- Morgon/Kväll-labels på extra tid
- Persisterad frånvarotyp i databas
- Anpassat sammanfattningskort per dagtyp
- Körning alltid synlig
- Bekräftad dag med re-bekräftelse
- Markägarrapport-algoritm verifierad mot
  Husjönäs 2026-05-06

## Markägarrapport — verifierade siffror
Husjönäs (objekt_id 11124938, slutavverkning):
- Stammar: 1 349
- Volym: 678 m³sub
- Virkesvärde: 433 163 kr
- Rotstammar: 235 (Bmav 207, Avkap 28)
- Värdeförlust: −26 382 kr
- Räddat värde: +2 597 kr
- Lyckade avkap: 23 av 28

Förväntade siffror i originalprompten
(375 461 / −16 640 / +2 240) var överslag,
inte DB-verifierade. Felsök inte mot dem.

## Markägarrapport — framtida tillägg

### Naturhänsyn på kartan
Lager med eternitytree, naturecorner, highstump
från planering_markeringar. Aktiveras när nya
jobb planeras i planeringsvyn INNAN avverkning.
Husjönäs saknar markeringar, andra slut-
avverkningsobjekt likadant.

Koordinattransformation: återanvänd från
app/planering/PlaneringVy.tsx — data->x och
data->y är planeringsvyns lokala koordinater,
inte lat/lng.

### GROT-högar
Ingen explicit symboltyp idag. Lägg till
`grothög` i planeringsvyn när det blir aktuellt,
eller härleda från `landing` (avlägg).

## Historik — produktionsrapporter 2011–2026 (bara admin)

Historiken är 7 592 produktionsrapporter (PDF, PRT, XPS) ur två Google Takeout-mbox (kompersmalaskog@ och kompersmalaskog.objekt@), inläst
2026-10 på grenen `historik-inventering-mejl`. Den innehåller bara fakta ur rapporterna (volym, G15, stammar, avbrott, bränsle, förare, stopp).
Index, normkurvor och jämförelser lagras INTE: de räknas i vyerna när de läses. **Sidan `/admin/historik` och all historikdata är bara för
roll = `admin`** (chef kommer in på `/admin` men inte hit). Skyddet ligger i databasen: RLS på alla `hist_`-tabeller och på bucketen
`historik` kräver `public.ar_admin()`. Sidans server-kontroll är bara omdirigering.

**Tabeller** (alla RLS, läs bara admin, skrivning bara service_role): `hist_maskin`, `hist_forare` (alias, t.ex. Jocke = Joacim Ringberg),
`hist_rapport` (sha256, format, typ, maskin, `storage_path`, `exkluderad` + orsak), `hist_objekt` (en rad per rapport; `raknas` = exakt en rapport
per objekt och maskin, `dubblett_av` pekar på den som räknas), `hist_skift` (skiftrader med G15, volym, lass), `hist_forare_objekt`, `hist_stopp`
(Komatsu-stopp med felkod), `hist_korrigering` (manuella beslut och regler som ändrar åtgärd: `hist_objekt.atgard` skrivs aldrig över).
**Bucket** `historik` (privat): `<år>/<sha256>.<pdf|prt|xps>`, 7 592 filer, 756 MB; öppnas med signerad länk (60 s).
**Vyer** (alla `security_invoker`, bara `raknas = true` och egna maskiner): `vy_hist_objekt_bas`, `vy_hist_normkurva` (oviktad + G15-viktad),
`vy_hist_objekt_index`, `vy_hist_index_ar`, `vy_hist_forare_maskin`, `vy_hist_tid_ar`, `vy_hist_stopp_topp`, `vy_hist_maskin_ar` (appens huvudvy,
med summarader) och `vy_hist_objekt_lista` (objekten bakom ett år med `storage_path`).

**Åtgärd** (gallring, slutavverkning, skada, special, okänd): ur objektnamn, mejlämne eller rapportens kategori; Komatsu 941/AptMan och Bear
får "maskinstandard" (slutavverkning) som obekräftad antagen åtgärd, Rottne gallring är bekräftad (98 %). Korrigeringar: vindfällor AB Karl Hedin,
Gävle 2026 = skada; tio specialjobb = special. Skotarnas åtgärd ärvs från skördarens objekt med samma namn/objektnr (exakt inom 60 dagar, fuzzy
namn ≥ 0,9 inom 180 dagar). Index finns bara för skördare i gallring och slutavverkning; m³/G15 jämförs aldrig mellan åtgärder.

**Sidan** (`app/admin/historik`, `components/historik/`, `lib/historik/`): lista (skördare med växel Gallring / Slutavverkning / Skada och special,
skotare med alla åtgärder), maskinsida (åtgärdsrader, diagram år för år, nyckeltal) och år med objekt och länk till originalrapporten. "+N antagna"
= objekt med obekräftad maskinstandard, som tas med först vid tryck. Färre än 5 objekt eller stopp i färre än 70 % av rapporterna står med text.
Saknad data är ord ("Avbrott saknas i rapportformatet"), aldrig 0. Renderad bara i testsele (mockad supabase), inte med riktig inloggning.

**Steg 13 (2026-10-12):** Ponsse Skift-parsern läser nu "Förbrukning" (liter, 786 av 786 förarblock; Giant 18,5–20,4 l/G15, King ny 16,7) och
Arbetstid. Skift-rapporterna har ingen avbrottsfördelning (Reparation/Service/Störning står bara i förklaringsrutan): TU för Giant/King ny är
**G15 / arbetstid** (`hist_objekt.arbetstid_h`, `tu_rapporterad`; 92–94 %) och märks "TU enligt Ponsse (G15 / arbetstid)", markeras aldrig som bäst.
Skotare kopplas till skördare i `hist_skotare_koppling` (metod a = samma objekt i Skogsystem, b = samma objektnr, c = namn ≥ 0,9 och 0–120 dagar;
592 länkar). Kopplingen används **aldrig för volym**, bara för skotarens åtgärd (`hist_korrigering`, orsak `regel: kopplad_till_skordare_<metod>`).
Wisent från 2024-09 har lass utan storlek: volymen är NULL i `vy_hist_objekt_bas` och visas "Volym saknas: lass utan storlek". Sju Elephant King gammal-objekt
(Gävle 2026) är skada med orsak "Vindfällor AB Karl Hedin, Gävle 2026". Rader skrivna med SQL finns i `scripts/historik/korrigering_steg13.csv`.
Jämförelsen: varje maskin med minst ett objekt i åtgärden är valbar; "bäst" bara på viktat index och TU; medelstam under m³/G15 och bränsle.

**Steg 14 (2026-10-12/13), dubbelräknade timmar:** Ponsse lastcertifikat (LC) och maskinspecifik summering (SUM) är ofta samma jobb. Summeringen räknas;
LC pekar på den via `dubblett_av` (202 rapporter slutar räknas: 188 R1 + 14 R2 månadscertifikat). Vyerna hämtar lass och volym från LC-tvillingen
(`vy_hist_objekt_bas.tvilling_*`); G15, bränsle, avbrott, livstid från SUM. Bränsle och avbrott låg dubbelt precis som G15. Wisent G15/timräknare efter
rättning: 2023 0,98, 2024 1,07, 2025 1,01, 2026 0,97. Kvar: ~14 LC 2024 (236 h) delar nummer med en SUM men har olika G15 (SUM är kumulativ per objekt
eller LC delvis) och räknas fortfarande; Wisent-volym efter 2024-09 döljs per datum men LC från 2026-01 har riktiga m³ (se nedan).
**R3 (lastcertifikat som delutskrift av summering) är analyserad och bestämd att INTE köras** (`hist_r3.py`, förslag i `hist_csv/hist_r3_forslag.csv`, sparade): den sänker årskvoterna
G15/räknare till 0,94–0,96 för 2023/2025/2026 och tar riktig tid. Wisent 2024 ligger på 1,05, samma nivå som Komatsu och Rottne. **Känt kvarvarande överskott:** Godsförvaltning
juni 2024 (två lastcertifikat 36,73 + 79,90 h mot summering 91,50 h, ca 40 h) kan rättas manuellt senare.
**Wisent-volym (migration `20261012123349_hist_wisent_flaggregel.sql`, KÖRD 2026-10-13, verifierad mot simuleringen; övriga maskiners vy-rader oförändrade):** volym döljs efter flagga (`laster_x_1m3`, `schablon_10m3`) i stället för datum; fyra 2025-objekt utan
flagga men < 3 m³/lass behandlas som `laster_x_1m3` via `hist_korrigering` (falt `volym_kvalitet`, orsak `regel: wisent_lass_x_1m3_utan_flagga`); Wisent med m³/lass utanför 6–18 märks
`osaker_lasstorlek` ("Osäker volym" i appen), behåller volymen i summan men räknas inte i m³/G15, medelstam, index eller bränsle per m³.
**Steg 15 (2026-10-13/14), objektnummer och volym från skördare till skotare — datan låst efter STOPP 1:**
- **Objektnummer (KÖRD):** `hist_objekt.objektnr_normaliserat` (6 siffror), `virkesordernr_normaliserat` (8 siffror), `objektnr_alla text[]` + GIN-index ur `hist_objektnr.py`
  (4 539 rader med nummer, 945 med flera; striktare än första förslaget 4 609/1 110 eftersom datum- och tidsfragment, som yymmdd, ddmmyy och hhmmss, utesluts — godkänt).
  Hash av sorterade `objektnr_alla` är lika lokalt och i databasen. `vy_hist_maskin_ar.g15_per_timraknare` (G15 / Ponsses timräknare) visas bara på maskinsidan.
- **Volym från skördare (`hist_korrigering`, falt `volym_harledd`, nytt_varde = m³):** skotaren får skördarens volym via delat objektnummer, bara där egen uppmätt volym saknas, med
  tidsfönster (skotaren klar före skördarens start, eller start > 180 dagar efter skördarens slut ⇒ bort), flera skotare på samma nummer fördelas efter lass (Elephant King utan lass: efter G15),
  G15 alltid ur skotarens egen rapport. (a) Skogsystem (`dim_objekt.vo_nummer` + `fakt_*`, läst) före (b) PDF-skördare; i praktiken gav (a) bara ett fynd (Anders Ingemarsson), eftersom
  Skogsystem bara har produktion från aug 2025 (Giant) och Wisents volym 2026 redan är uppmätt (stämmer mot Skogsystem inom ±2 %).
  Orsaker: `regel: volym_fran_skordare_pdf`, `regel: volym_fran_skordare_skogsystem`, `regel: gavle_volym_fran_giant` (visas "Från skördare").
  **Wisent:** kontroll 6–18 m³/lass per objekt; 66 objekt fyllda (24 år 2024, 42 år 2025; median 13,7 resp. 11,6 m³/lass), 219 kandidater stoppade (181 utan kopplad skördare,
  23 utan lass, 10 utanför gränsen, 4 redan uppmätta, 1 Skogsystem "kvar −21"; lista i `hist_csv/hist_volym_stoppade.csv`).
  **Elephant King (inget lass):** kontroll m³/G15 inom 0,5–2,0 × maskinens egen referens (median per åtgärd, Elephant King gammal 2022–2023: slutavverkning 25,1, okänd 22,3, skada 16,8, alla 24,2);
  17 objekt fyllda, 128 stoppade (`hist_volym_ek_harledd.csv`, `hist_volym_ek_stoppade.csv`).
  **Gävle 2026:** Elephant Kings skadeobjekt får Giants volym på samma objekt (namn, sedan period; Hushållningssällskapet 1 mot Giant 332, 2 mot Giant 887), EK:s G15 är egen. Sex Giant-objekt
  (Elisabeth Hanako Leander, Granne Peter, Kenneth Karlsson, Peter Eklund, Ingeröslund, Åkes Magnus Åkerberg) kördes av extern skotare, bekräftat, och ger ingen Elephant-volym.
  Migrationer `20261012131833_hist_volym_harledd.sql` och `20261012133150_hist_gavle_kalla.sql` (bara vyer; nya sista kolumner i `vy_hist_objekt_bas`, `vy_hist_maskin_ar`).
  Alla skördares rader i `vy_hist_maskin_ar` var oförändrade före/efter (radjämförelse mot kopia, raderad efter låsning); bara Wisent och Elephant King gammal ändrades.
- **App:** m³/G15 och viktat index per år: under 25 % av G15 med volym visas ingen siffra ("För lite data", t.ex. Elephant King gammal 2025, 4 %); 25–90 % "baserat på X % av timmarna"; över 90 % bara siffran.
  Samma regel i listan, diagrammet och jämförelsen, och en siffra under 25 % kan aldrig markeras "bäst". Härledd volym märks "Från skördare" i grå text (nyckeltal, jämförelse, objektlistan);
  osäker volym märks "Osäker". Lass/G15 för skotare är en egen rad i jämförelsen. G15/timräknare finns bara på maskinsidan.
- **Kända luckor** (visas som korta grå rader under maskinen i appen, aldrig som fel; text i `KANDA_LUCKOR` i `lib/historik/berakna.ts`):
  - Skotarvolym saknas i rapporterna från hösten 2024, när skotarna började rapportera i ett annat system. Volymen är härledd från skördare där det gick.
  - Elephant King gammal 2025–2026 och Elephant King ny saknar skotarvolym i rapporterna (annat system från hösten 2024). Bara enstaka objekt har kunnat få volym från skördare.
  - Wisent 2026: färre lass per G15 än tidigare år (slutavverkning 1,18 mot 1,52 år 2025). Volymen är bekräftad mot Skogsystem (±2 %), så det är ingen mätfel.
  - Godsförvaltning juni 2024 (Wisent): cirka 40 h G15 för mycket, inte rättat.
  - Wisent 2023: fem summeringar utan objektnummer (222 h G15) har ingen volym.
  - Komatsu 911.3 och 941 AptMan saknar objektnummer, så ingen skotarvolym kan hämtas från dem.
  - Elephant King gammal 2024: lass saknas för delar av året (lastcertifikat saknas i april, maj och juni–december; februari saknar rapporter helt), därför lass/G15 0,34 mot 1,0 år 2023 och G15/timräknare 0,81.
  - Gävle 2026: några Giant-objekt kördes av en extern skotare och räknas inte på Elephant King.
  - Komatsu 830.3 2018–2019: lass/G15 0,18–0,27, troligen saknade lastcertifikat.
- **Återstår:** Wisent 2025 har volym på 47 % av G15 (39 objekt kvar utan volym); Elephant King gammal 2025/Elephant King ny har nästan ingen volym; R3 (se ovan) körs inte;
  Godsförvaltning-överskottet kan rättas manuellt; PR och merge till main väntar på Martins ja.

**Kända begränsningar:** Giant 2023/2025 och King ny saknar avbrottsfördelning i formatet (TU = G15 / arbetstid enligt Ponsse). Komatsu 911.3 och
941 AptMan saknar bränsle. Skotarnas åtgärd är okänd för cirka 850 av objekten. 435 MaxiXplorer-produktionsrapporter (volym utan tider) är
uppladdade men inte tolkade. Lastcertifikat för Wisent 2025 har volym = antal lass × 1 m³ (flaggat som osäker). Objektnamn har `?` där å/ä/ö inte
gick att läsa ur ritad text. Kopplingen skotare–skördare har stor spridning (metod c: mittenhälften −12 till +1 % mot skördarens volym), ris/GROT
kan inte räknas bort (sortiment finns inte i `hist_*`).

**Skript** (`scripts/historik/`, kör i ordning): `hist_underlag.py` → `hist_avbrott.py` → `hist_bygg.py` → `hist_raknas.py` → `hist_korrigering.py` →
`importera.py` (torrkörning är standard; `--utfor` kräver servicenyckel + `HIST_IMPORT_OK=ja`; vitlista: bara `hist_*` och bucketen `historik`).
`verifiera_migration.py` bevisar att hist-migrationerna bara rör `hist_*` / `vy_hist_*` och policyn på bucketen `historik`. Mbox och PDF ligger
aldrig i repot. Migrationerna `20261009155903` … `20261012133150` är körda i prod via MCP (filnamnen har prodens versionsnummer).

**Steg 16 (2026-10-13), prestanda och felmeddelanden — migration `20261013154921_hist_prestanda.sql`:** inloggade har `statement_timeout` 8 s och `vy_hist_objekt_lista` (32 s)
och `vy_hist_maskin_ar` (24 s) överskred den: sidan visade "canceling statement due to statement timeout". Orsaker: `hist_objekt.dubblett_av` saknade index (tvillinguppslagningen och
`antal_andra_utskrifter` gjorde Seq Scan per rad) och förartilldelningen i `vy_hist_objekt_index` (`row_number` + `rn = 1`) nested-loopades (14 miljoner bortfiltrerade rader). Åtgärd: partiellt index
`hist_objekt_dubblett_av_idx`, tvillingen och skiftens lass tas fram en gång som vanliga LEFT JOIN i `vy_hist_objekt_bas`, `DISTINCT ON (sha256)` i `vy_hist_objekt_index`, `ANALYZE` på fyra tabeller.
Alla nio `vy_hist_`-vyer går nu på under 0,5 s som inloggad admin (mätt med EXPLAIN ANALYZE under 8 s-gränsen). Raderna är desamma; **`vy_hist_normkurva` skiljer sig i sista decimalerna**
(regressionen summerar `double precision` i radordning, och en ny plan ger en annan ordning: b = 0,7364076124465956 → 0,7364076124464916), och därmed `forvantad_m3_per_g15`/`index` i `objekt_lista`/`objekt_index` från ca 12:e
decimalen. Avrundat till 8 decimaler är hasharna identiska; alla andra kolumner och `vy_hist_maskin_ar` är bit för bit lika. Felen i appen: 57014 säger "Det tog för lång tid att hämta historiken. Försök igen om en stund.",
behörighetstexten visas bara vid 42501 eller tomt svar (RLS), och databasens egen text visas aldrig (loggas i konsolen). `lib/historik/fel.ts`, vakt i `components/historik/Historik.render.test.tsx`.

**Steg 17 (2026-10-14), förklaringen av index:** en ⓘ-knapp (`components/historik/IndexInfo.tsx`, EN komponent) direkt efter ordet Index på startlistan, maskinsidan ("År för år · viktat index"), årslistan och i jämförelsen
(förklaringsraden och rubriken "Viktat index år för år"). Tryck öppnar bladet "Vad är index?" i appens vanliga bottenblad (`components/Sheet.tsx`, nu med valfri `dragNedStanger`: drag nedåt i greppet stänger; övriga sheets oförändrade).
Tabellen (medelstam 0,08/0,12/0,16 för gallring, 0,25/0,40/0,60 för slutavverkning) och exemplet (medelstam 0,12 resp. 0,40; "maskinen gjorde" = normalt × 1,1, avrundat) RÄKNAS ur `vy_hist_normkurva` (variant `g15-viktad`)
med samma uttryck som `vy_hist_objekt_index.forvantad_m3_per_g15`: `exp(a + b · ln(medelstam))` (`lib/historik/indexForklaring.ts`, hämtas när bladet öppnas). Inga normalvärden är hårdkodade; antalet objekt ("679 i gallring, 896 i slutavverkning")
kommer ur vyns `n` och åren ur `vy_hist_maskin_ar` (åren med objekt med index, urval 'namn'; visas bara om summan av `antal_med_index` är exakt kurvans `n`, annars står bara antalet): "Räknat från 896 egna slutavverkningar 2012–2026." Bladet visar den åtgärd man står i, och båda i jämförelsen.
Exemplet har bara hela tal och index räknas från de avrundade talen ("Medelstam 0,40 m³. Normalt 27 m³/G15. Maskinen gjorde 30 → index 111."). Skotare: EN mening, konstanten `SKOTARE_UTAN_INDEX` (`lib/historik/indexForklaring.ts`) i bladet, på startlistan och i
jämförelsen: "Skotare får inget index. Det som styr en skotare är skotningsavståndet, och det finns inte i rapporterna." (`hist_*` har ingen avståndskolumn.) Bladets övriga sheets är oförändrade: `dragNedStanger` är av som standard.

**Steg 18 (2026-10-14), samma förare på olika maskiner — migration `20261014084857_hist_forare_maskin_jamfor.sql`:** i jämförelsen (`/admin/historik/jamfor`) en segmentväljare "Maskiner | Samma förare".
Samma förare på olika maskiner är den rättvisaste jämförelsen vi har: den skiljer maskinens effekt från förarens. Ny vy `vy_hist_forare_maskin_jamfor` (security_invoker, en rad per förare × åtgärd × maskin; bara skördare i gallring och slutavverkning,
aldrig tekniska förare, bara objekt där föraren kört minst 80 % av G15, åtgärd ur namn/rapport, aldrig antagen maskinstandard); siffrorna räknas som i `vy_hist_maskin_ar`, men på förarens objekt. G15 är därför objektens G15, inte förarens exakta timmar.
Urvalet bor i appen (`lib/historik/sammaForare.ts`, `components/historik/SammaForare.tsx`): bara förare/åtgärder där minst två maskiner har minst 200 G15-timmar (i dag Martin gallring, Oskar gallring och Stefan slutavverkning); maskiner under 200 h
har ingen kolumn alls: de står i en hopfälld grå rad under tabellen ("3 maskiner med under 200 h visas inte") som öppnas till en enkel lista (maskin, år, G15 h) och stängs när man byter förare eller åtgärd;
kolumnerna står äldst till vänster med åren överst, utan radrubrikkolumn (radens namn står ovanför siffrorna) och utan sidscroll på 390 px; "bäst" bara på index och TU, och TU bara bland maskiner med samma källa ("enligt Ponsse" = G15 / arbetstid eller "ur avbrott")
och bara om minst två har den; grå rad "Alla maskiner kördes inte samma år. Förarens erfarenhet kan förklara en del av skillnaden." när NÅGOT par av de visade maskinerna saknar gemensamma år (delar de minst ett år räknas de som samtida). Inga namn är hårdkodade: externa förare (Magnus Gustafsson, Erik Garpenstedt) har ett objekt
var och faller på kravet om två maskiner; "Kalle" finns inte i `hist_forare`. Åtkomst: bara admin (RLS; icke-admin får tomt svar, som klienten visar som "Du saknar behörighet"; sidorna omdirigerar förare till `/admin`, `app/admin/historik/atkomst.test.tsx`).

**Steg 19 (2026-10-14), manuell åtgärdskorrigering: Svinhult var gallring.** Objektnamnet "Björn Martinsson Svinhult Au" gav åtgärden slutavverkning (`atgard_kalla = objektnamn`), men Martin bekräftade att det var gallring (medelstam 0,04–0,05 m³). Två rader i `hist_korrigering` (`falt = 'atgard'`, `nytt_varde = 'gallring'`, orsak "manuell: Martin 2026-10-14, Svinhult var gallring"): `a5693b72…` (Rottne H8E Logmax, 2026-03-12, 96,3 G15 h) och `58a3ece4…` (Rottne H8E 2026, 2026-04-02, 137,1 G15 h). `hist_objekt` är orört; vyn visar `atgard_kalla = 'korrigering'`. Gjort med SQL (ingen migrationsfil: det är data, inte schema). **Ångra:** `delete from hist_korrigering where falt = 'atgard' and orsak like 'manuell: Martin 2026-10-14%';`.
Hästhagen (Martin Sallnäs Au, Logmax 2025) var slutavverkning och ligger kvar. De tre Komatsu-objekten med medelstam under 0,10 (maskinstandard, 2–3 h) rörs inte.
Följden: normkurvan räknas om. Gallring n 679 → 681 (a 3,7590 → 3,7615, b 0,7364 → 0,7374), slutavverkning n 896 → 894 (a 4,0174 → 3,9905, b 0,7780 → 0,7394: de två objekten hade mycket liten medelstam och drog upp lutningen). Index flyttar sig därför på alla maskiner med slutavverkning, mest på rader med få timmar (Rottne H8B 11,8 h: −4,2; Komatsu 911.3 5,2 h: −3,0; på rader med minst 200 h högst 1,5, Komatsu 901XC 2021). Åtta maskiner har exakt samma data som förut (Elephant King ×2, Komatsu 830.3/840.4/860.4/875, Ponsse Wisent, Rottne H8D). Oskar i gallring: Logmax 103,1 → 103,0 (120 objekt, 4 649 h), H8E 2026 103,5 → 102,7 (12 objekt, 767 h); hans slutavverkning är nu bara Hästhagen (Logmax, 1 objekt, 144 h, index 73,5 → 64,7) och Oskar har inte längre två slutavverkningsmaskiner.

**Steg 20 (2026-10-14), anpassningsområde för slutavverkningens normkurva — migration `20261014100408_hist_normalomrade.sql` (körd i prod):** `vy_hist_normkurva` anpassar slutavverkning bara på objekt med medelstam 0,10–1,5 m³ (gallring: inget område, exakt som förut).
**Varför området finns:** kurvan är en G15-viktad regression av ln(m³/G15) på ln(medelstam), och ett objekt får inflytande när det har många timmar OCH ligger långt ut i medelstam. Hästhagen (Rottne H8E Logmax 2025, medelstam 0,075, 144 G15 h) var efter Svinhult-korrigeringen det enda slutavverkningsobjektet under 0,111 (de nio nästa lägsta, 0,111–0,190, har högst 25 G15 h vardera). Cook's distance **7,3** mot högst 0,04 för alla andra 893 objekt, hävstång 0,22, och utan det går b från 0,739 till 0,676 (leave-one-out, Δb −0,063; näst största objektet −0,0037). Gallringen är stabil (högst Δb 0,0045, Cook's D högst 0,09), så den får inget område. Före Svinhult-korrigeringen fanns tre sådana objekt och b var 0,778. Området är inte känsligt: nedre gräns 0,09–0,15 ger samma kurva (b 0,676–0,677); först vid 0,20 skärs riktigt data bort. Övre gränsen 1,5 gör i dag ingenting (största medelstam i kurvan 1,07) men är en rimlig ram. G15-viktad medelstamsfördelning slutavverkning p1/p5/p50/p95/p99: 0,150 / 0,263 / 0,490 / 0,755 / 0,928; gallring 0,030 / 0,037 / 0,063 / 0,116 / 0,192.
**Resultat i prod:** slutavverkning n 894 → 893, a 3,9905 → 3,9478, b 0,7394 → 0,6765 (r² 0,687 → 0,607); gallring a 3,7615, b 0,7374, n 681 exakt som förut. Gallringsrader bit för bit lika (md5 per maskin i `vy_hist_maskin_ar`, 14 maskiner; `vy_hist_objekt_index`, 8 maskiner; `vy_hist_forare_maskin_jamfor`, 12 rader; båda gallringskurvorna). Slutavverkning, rader med minst 200 G15 h: största förändring per maskin 2,4 (Komatsu 901XC 2021, 90,6 → 88,2), Ponsse Bear 1,7, Scorpion King gammal 1,3, King ny 1,2, Giant 2025 1,2, Komatsu 941 1,0, AptMan 0,9, Giant 2023 0,6; provkört först i en transaktion som rullades tillbaka, och de verkliga värdena stämde med simuleringen.
**Index räknas fortfarande för ALLA objekt**, mot den nya kurvan. Nya sista kolumnen `utanfor_normalomrade` i `vy_hist_objekt_index` och `vy_hist_objekt_lista` är true för slutavverkning med index och medelstam utanför 0,10–1,5; när steg 20 kördes fyra objekt (noll sedan steg 21): Hästhagen (index 64,7 → 57,3) och tre maskinstandard-objekt med 2–3 G15 h (Komatsu 941 "vindkraft Jon Sydved" 0,042, Komatsu 941 "Roland 08 Vägbreddning" 0,079, Komatsu 941 AptMan "Sven-Johan Bengtsson Väggata" 0,038). Ingen märkning i gallring. Objektlistan visar det som grå text under "index": "utanför normalområdet" (`Listrad` fick valfri `fotnot`).
**Index-bladet** (ⓘ) har under slutavverkningens tabell meningen "Objekt med medelstam under 0,10 m³ ingår inte i normalen, eftersom de är för få för att säga vad som är normalt." (inte för gallring). Antalet i "Räknat från 893 egna slutavverkningar 2012–2026" är fortfarande kurvans n ur vyn. Åren kontrolleras nu så här (`underlagAr`): summan av `antal_med_index` per år får vara större än n med `extra` objekt (de som har index men ligger utanför området) om första och sista året har fler än `extra` objekt vardera; annars inga år. Gränserna står i migrationen (två ställen) och i `NORMALOMRADE` i `lib/historik/indexForklaring.ts`; `lib/historik/normalomrade.test.ts` läser migrationen och larmar om de glider isär.

**Steg 21 (2026-10-14), infrastrukturobjekten flyttas till special (manuell korrigering):** de fyra objekt som steg 20 märkte "utanför normalområdet" var inte vanlig slutavverkning (Martin bekräftade): Martin Sallnäs Au Hästhagen (Rottne H8E Logmax 2025, 144,2 G15 h) var avverkning till solcellspark, "vindkraft Jon Sydved" (Komatsu 941 2021, 2,4 h) vindkraft, "Roland 08 Vägbreddning" (Komatsu 941 2021, 2,2 h) vägbreddning och "Sven-Johan Bengtsson Väggata" (Komatsu 941 AptMan 2016, 3,2 h) väg. Fyra rader i `hist_korrigering` (`falt = 'atgard'`, `nytt_varde = 'special'`, orsak "manuell: Martin 2026-10-14, infrastruktur (solcellspark/vindkraft/väg)"; `hist_objekt` orört, vyn visar `atgard_kalla = 'korrigering'`). Gjort med SQL, ingen migration. **Ångra:** `delete from hist_korrigering where falt = 'atgard' and orsak = 'manuell: Martin 2026-10-14, infrastruktur (solcellspark/vindkraft/väg)';`.
**Förväntat och verifierat:** slutavverkningskurvan helt oförändrad (n 893, a 3,947795, b 0,676473; alla fyra kurvrader identiska på alla decimaler: Hästhagen var redan utanför området och de tre andra är maskinstandard med 2–3 h, som aldrig ingick i kurvan); gallring oförändrad. Hash per maskin och åtgärd i `vy_hist_maskin_ar` före och efter: 82 av 88 kombinationer bit för bit lika (alla gallringsgrupper och alla maskiner utom tre); de som skiljer är Komatsu 941 (slutavverkning och "(ingen)" ändras, ny grupp special), Komatsu 941 AptMan (samma) och Rottne H8E Logmax (slutavverkning försvinner, special tillkommer, "(ingen)" ändras). Slutavverkningens `viktat_index` på de åtta kontrollerade raderna med minst 200 h oförändrat (88,2, 104,6, 90,1 …). Special har inget index (ingen kurva), så de fyra får inget index och ingen flagga: `utanfor_normalomrade` är noll i `vy_hist_objekt_index` och `vy_hist_objekt_lista`. Oskar har ingen slutavverkning kvar (jämförelsen 27 → 26 rader).
**Normalområdet 0,10–1,5 ligger kvar som skyddsnät** för slutavverkning: nästa objekt med liten medelstam och många timmar drar inte kurvan, och märks "utanför normalområdet" tills det är klassat.

## KARTANS ORIGO I EGENKONTROLLEN OCH PROVYTOR UTAN LOTTNING (2026-10-19)

**Felet:** egenkontrollen läste planeringens markeringar (x/y relativt ett origo) bara om objektet hade `kartbild_bounds`. Planeringen räknar origot med `objektStartKamera`: kartbildens mitt på zoom 15, annars objektets lat/lng på zoom 16. Alla 23 objekt som kom in via Vidas envz-leverans (6 aug och framåt) saknar bounds, så de blev blinda i rundan — trots att planeringen ritar dem rätt. Nio av tjugo öppna rundor låg i det läget, och de tre gallringarna bland dem fick inga provytor.

**Nu (PR `egenkontroll-origo-som-planeringen`, ingen migration):** egenkontrollen tar `objektStartKamera` (en regel, `lib/egenkontrollOrigo.ts`) och kontrollerar markeringarna mot Vidas traktgräns (`objekt_geometri`, `L_TRAKTDEL`) när origot är lat/lng. Stämmer det inte ritas inget och vyn säger varför. `kartbild_bounds` skrivs ALDRIG för att lösa det — sätts bounds byter planeringen origo från zoom 16 till zoom 15 och varje befintlig markering flyttas dubbelt så långt från mitten (Betet gallring: gränsen 308×528 m på zoom 16 mot Vidas 305×523, men 616×1056 m på zoom 15 — uppmätt i riktig MapLibre). Vakt: `lib/egenkontrollOrigo.vakter.test.ts`.

### Utfall per objekt (kvittot körs mot prodens markeringar, fixtur `lib/__fixtures__/origo_kvitto_prod_2026-10-19.json`)
| Objekt | Kontroll | Resultat |
|---|---|---|
| Betet gallring 2026 | gränsmarkeringarna 308×528 m mot Vida 305×523, mitt 0/1 m | ritas (stark) |
| Hallaslätt AU 2026 | 162×300 mot 162×299, mitt 1/0 m | ritas (stark) |
| Räveboda gallring 2026 | 59×413 mot 55×414 | ritas (stark) |
| Hålabäck gallring 2026 | 923×807 mot 960×805, mitt −19/1 m | ritas (stark) |
| Östra-Höka 1:7 A-C -25 | inga gränsmarkeringar; alla punkter i Vidas ruta | ritas (**svag**) |
| Hålabäck au 2025 | inga gränsmarkeringar; punkterna i Vidas ruta + marginal | ritas (**svag**) |
| Bjällerhult au + ga | samlat 157×238 mot Vida 61×93 stämmer inte, men första gränsen är 61×93 med Vidas mitt | ritas (stark, via enskild gräns) |
| Brokamåla 1:5 V | zip utan geometrirad: inget att kontrollera mot | **ritas inte** |
| Krokshult AU 2026 | inga markeringar alls | inget att rita |

**Svag kontroll = begränsning.** Utan gränsmarkeringar syns ett förskjutet origo men inte ett rent skalfel (dubbelt så stora avstånd ligger fortfarande i Vidas ruta + marginal). Det står i koden och i ett test. Östra-Höka (10 punkter) och Hålabäck au (2) har den kontrollen.

**Bjällerhult (Martin bekräftade 2026-10-19 i planeringsvyn att de nio markeringarna ligger rätt i skogen):** den FÖRSTA gränsen (au) har exakt Vidas mått: 46,4 px / 70,5 px på zoom 16 = 61 × 93 m. Den ANDRA gränsen (ga, gallringsdelen, 111×238 m) ligger utanför Vidas `L_TRAKTDEL` (0,42 ha, bara avverkningen). Kvittot kräver därför att alla gränser **tillsammans (samlat) ELLER minst en enskild gräns** stämmer mot Vidas ruta i storlek och mitt. Båda sätten behövs: Hålabäck gallring (402×379 + 301×229 enskilt, 923×807 samlat) och Hallaslätt AU (149×182 + 39×35 enskilt, 161×300 samlat) stämmer bara samlat; Bjällerhult stämmer bara enskilt. Martins första förslag, "minst en" ensamt, hade gjort Hålabäck och Hallaslätt blinda — upptäckt genom att köra regeln mot fixturen innan den byggdes. Förklaringen står i huvudet på `lib/egenkontrollOrigo.ts` så att ingen förenklar regeln till det ena. Provytor på ett kombinerat objekt (Bjällerhult) lottas inom BÅDA gränsernas ytor, även den del som är slutavverkning; objektet har ingen öppen gallringsrunda utan provytor, så det rör ingen idag.

**Brokamåla:** zip från 2026-07-01 utan kartbild och utan bounds; importen svalde felet tyst. Importen skriver nu en rad i `import_varningar` när zipens bild saknas eller inte laddas upp (`lib/trakt/kartbildVarning.ts`). Vilken orsak det var i juli går inte att avgöra ur databasen. Brokamåla har ingen geometrirad (zip) och ritas därför inte; ett kvitto mot `objekt.areal` (gränsmarkeringarna 5,36 ha mot 5,2 ha på zoom 16) vore möjligt men är inte byggt.

**Rörs inte (annat spår):** `/matning` (`lib/matning/punkter.ts`) har kvar den gamla bounds-only-regeln och är lika blind för envz-objekt. `app/oversikt/SkordarKarta.tsx` har en egen kopia av regeln. Planeringsvyn är orörd.

### Provytor: tre av fyra öppna gallringsrundor har noll — INTE omlottade av den här PR:en
Provytorna lottas en gång av avsikt (det finns ingen funktion som lottar om). PR:en ändrar bara att NYA rundor på envz-objekt får dem, om kvittot går igenom. De tre befintliga rundorna är orörda:

| Objekt | Runda (egenkontroll.id) | Startad | Besvarade | Areal → antal ytor | HPR-stammar | Kvitto |
|---|---|---|---|---|---|---|
| Betet gallring 2026 | `0f0d8985-a360-4cc3-a902-f07260e62a2e` | 2026-10-19 | 1 av 10 | 9,48 → 3 | 8 671 | stark, klarar |
| Hålabäck gallring 2026 | `70669805-d9b2-4413-a4f3-fa880f235fae` | 2026-09-18 | 0 av 10 | 9,17 → 3 | 2 690 | stark, klarar |
| Räveboda gallring 2026 | `731a62d8-ba9c-486f-9267-a69a8363bd28` | 2026-10-17 | 0 av 12 | **saknas** → inga | 1 365 | stark, klarar |

(Hössjömåla Gallring 25 har 7 provytor — den har bounds.)

**Vad som krävs för att de ska få provytor:**
1. Den här PR:en i produktion (origot + kvittot).
2. **Räveboda: `objekt.areal` är null** (importens TD-parser fick ingen areal). `antalProvytor(null)` ger inga ytor, så arealen måste sättas först (Vidas traktdels ruta är 55 × 414 m, högst 2,3 ha — men ett värde ska ur Vida, inte gissas).
3. Ett **engångsskript** som anropar `skapaProvytor(klient, egenkontrollId, objektId, 'gallring', objekt)` (exporterad för testet) för respektive runda. Det finns inte och byggs inte förrän du bestämt. Lottningen är slumpad och filtrerar mot HPR-stammarna (≤ 10 m från närmaste avverkade stam).
4. Följd att väga in: en runda som får provytor kan inte avslutas förrän ytorna är mätta (`avslutaStatus` räknar dem). Betet gallring startades i dag; Hålabäck gallring i september.

**Ångra** (efter en körning, per runda): `delete from egenkontroll_provyta where egenkontroll_id = '<runda>';` — ytorna har inga beroenden än så länge de är omätta; mätta ytor och deras foton är en egen sak (`egenkontroll_foto.provyta_id`).

## Kända buggar
- Kalenderdagar inte klickbara (regression)
- Bottomnav ändrad: "Min tid" borta,
  "Löneunderlag" istället — verifiera

## Nästa
- **Egenkontroll, öppna punkter efter A4-rapporten (#830, 2026-10-19):**
  1. `PdfForhandsvisning` ligger i `app/helikopter/_components/` men används nu också av egenkontrollens `RapportDela` (generell, tar en `skapa`-funktion). Flytten till `components/` görs av **helikopterns ägare**, inte av egenkontrollspåret (en vy ägs av ett spår). Tills dess importeras den därifrån.
  2. ~~Låstrigger på `egenkontroll`~~ **KLAR 2026-10-19** (Martin körde migrationen via MCP, provad i transaktion med rollback; filen `20261019140826_egenkontroll_las_nar_klar.sql` är byte-identisk med `schema_migrations`, md5 `b2bea962…`, 1 099 byte). De tre gamla rundorna (Åbogen, Järnemåla, Spåramåla) avslutades i efterhand samma dag. Ångra för triggern: `drop trigger` hänger i Supabase-MCP:n (60 s) — ta bort den i ett eget anrop utanför MCP:n, eller använd escapen `app.egenkontroll_tillat_andring` per transaktion.
  3. **Unikt index på `egenkontroll_punkt (egenkontroll_id, punkt_typ) WHERE kalla = 'fast'`** (öppen punkt, ej byggd, 2026-10-19): idag skyddar bara det partiella indexet på `(egenkontroll_id, ordning)` mot dubbletter av en fast punkt (två enheter som lägger till samma saknade punkt samtidigt räknar samma `max+1`, så en av dem får 23505). Ett eget index på slugen vore ett skydd som inte hänger på ordningstalet. Noll dubbletter idag (kontrollerat). Migration som Martin kör — inte nu.
- **Rundvyns ram (PR 4, 2026-10-19):** brickor i en docka, ark med tre lägen (sänkt = gå, dock = svara, hel = rundan; **regeln: ett läge får finnas bara om dess jobb går att säga med ett ord — ett fjärde som inte går att beskriva byggs inte**), kartan som hela vyn (se CLAUDE.md "Rundvyns ram"). PR 4 levererades med två lägen (dock och hel) och CLAUDE.md sa "två" medan denna rad sa "tre"; 4b gör det tre, och regeln står nu på båda ställena. Öppna punkter: (1) Den döda koden är borttagen (7b, se nedan): `UtforandeSerie.tsx`, `lib/egenkontrollSerie.ts` och flödesfunktionerna med sina tester. (2) `PunktKort`/`SvarsKnapp` är borta; planpunkternas "Foto · Not" öppnar samma foto-formulär som utförandet. (3) Centrera-knappen (delad med planeringen) ligger vid skärmkanten på bred skärm medan resten ligger i arkets kolumn. (4) Inte provat på riktig iPhone/PWA. (5) **PR 7 delas upp (Martin 2026-10-19) i fyra PR:ar, en sorts arbete var:** 7a tokenskuld (resten av `page.tsx`: `MatningsKort`, avslutsdialogen m.fl.), 7b död kod (klar, egen PR), 7c Centrera-knappen (delad med planeringen; egen `right`-prop och rätt plats i arkets kolumn på bred skärm — rör en delad komponent, så den ägs av sin egen PR), 7d kartlagen + ritlagret. ("Bättre så" och lägena Kontroll·Utfall·Bättre så hör INTE till PR 7 — det är en funktion, inte skuld: se PR 8 nedan.) Inget av det byggs före ett nytt besked. (6) **CHECK `status_och_besvarad_hanger_ihop` på `egenkontroll_punkt`** (migration `20261019155208`, körd 2026-10-19; ångra-kommando: `alter table egenkontroll_punkt drop constraint status_och_besvarad_hanger_ihop;` — kör det via `apply_migration`).
- **Hel-läget listar inte punkterna (Martin 2026-10-19, rättning i #837).** Utförandepunkterna bor i dockan och planpunkterna på kartan; hel har namn och åtgärd, plats för vägbeskrivningen (PR 5), förutsättningar, kommentar, mätningar, observationer och avslut. Undantag: planpunkter utan plats på kartan (se CLAUDE.md, Rundvyns ram). Hel följer sitt innehåll (min dock + 200 px, max skärmen minus huvudet). Raden för en avslutad runda har en maxhöjd (`RAD_MAX_DVH`, 30 % av skärmen) och scrollar sitt innehåll inom sig: mätt 390 × 760 med 2 295 tecken och tre foton blir dockan 506 px (rullområdet 228 px av 786), och sista fotot nås genom scroll.
- **PR 4b — sänkt läge, fast rad, innehåll i raden (Martin 2026-10-19; mergad som #846).** (1) **Sänkt** = bara greppet (40 px på 390 × 760, kartan 656 px); tryck på greppet/huvudets namn går vidare ett läge varje gång (sänkt → dock → hel → sänkt), drag fungerar åt båda hållen och flyttar minst ett läge över tröskeln; inget byter läge av sig självt utom att en symbol på kartan lyfter sänkt → dock (hel ligger nu kvar vid ett symboltryck — förut sänktes den till dock). (2) **Mätt FÖRE bygget i Chromium:** vid första markeringen hoppade brickorna +61 px och radens knappar 61 px (layout direkt, `transform` animerad efter); andra trycket rörde ingenting. Åtgärd: knappraden har fast plats och är avstängd utan markering, transformen räknas om i samma bildruta som layouten och animationen körs bara vid lägesbyte/släppt drag. **Efter: 0 px för alla brickor och radens knappar** (första trycket, andra trycket, punkt med långt innehåll). Dockvakten smalnades till SAMMA bricka / SAMMA radknapp (en annan bricka går igenom direkt) + en spärr mot tryck på en bricka som håller på att sparas. (3) **Raden är en komponent för pågående runda, låst runda och inget markerat**: typ, kommentar och foton syns ovanför knapparna också medan rundan pågår; på en låst runda är knapparna avstängda (AVSTEG 7/7 vändes: förut inga knappar). (4) **Kartan har minst 300 px i dock på 390 × 760** (mellan huvud och arkets överkant; 365 px med tom rad, 308–312 px med innehåll): innehållsfältet växer med innehållet upp till `--rad-max` (57 px på 390 × 760) och scrollar därefter — `RAD_MAX_DVH` (30 %) är bara ett tak. Brickorna är redan 44 px (lagligt golv); 60 px skulle ge dock ~395 px. **Beslut Martin 2026-10-20: "300 px karta" är kartan MELLAN huvudet och arket — `KARTA_MIN_PX` står kvar på 300.** Den är den användbara kartan, och ett 121 px-fält löser inte en lång anteckning bättre än 57 px. Blir ett besvär med ett långt svar i fältet löses det genom att läsa i hel, inte genom att ta pixlar från kartan. Inte verifierat på riktig iPhone/PWA (finger, handske, safe-area).
- **STÄNGD 2026-10-20 — origo-testet var inget ordningsberoende utan en tidsrace (`app/egenkontroll/[objektId]/page.origo.render.test.tsx`).** Testet "Betet gallring …" föll vid ensam körning (3 av 3) men inte i mappen/sviten. **Orsak:** filen var den enda av sidtesterna som inte mockade `kompletteraRunda`; testrundorna har bara planpunkter, så sidan kompletterar dem vid öppningen och anropet gick mot den RIKTIGA Supabase-klienten (`kravSession` → `await import('./supabase')` → "Du är inte inloggad längre"). Första anropet i en kall process tog 62–77 ms (modulladdningen), alla senare 0–2 ms, och testet väntade bara ETT `setTimeout(0)` (`stilla()`) efter att Vida svarat — den första testen kollade kartan innan sidan hunnit klart. Bevis: ett extra `stilla()` gav 2 av 3 gröna; med en annan sidtestfil bredvid blev filen grön 3 av 3 i alla fyra kombinationerna. **Åtgärd:** (1) `kompletteraRunda` mockas som i de andra sidtesterna, (2) FIXEN: testerna väntar på ett VILLKOR (`vantaTills`: kartan finns, startknappen finns, sidan har frågat efter Vida) med en förklarande timeout i stället för ett fast antal tick — utan mocken ensam vinner villkorsväntan 6 av 6, med båda 10 av 10 ensamma. Mutationsbatteriet `mut_origo.py` kördes om efteråt, se PR-texten.
- **STÄNGD 2026-10-20 (#850 + vakten) — testfiler som nådde den RIKTIGA Supabase-klienten.** Sonden över hela sviten (393 filer) hittade fyra sidtester som gick förbi sin mock (`page.origo` via `kompletteraRunda`, `page.kommentar`/`observation`/`ryggrad` via `hamtaVidaGrans`, `hamtaStammoln`, `hamtaHyttspar`): utan session svarar klienten "inte inloggad", appkoden fångar felet och tar läsfelsvägen, testet blir grönt men prövar en annan väg än den det påstår (och en kall modulladdning gjorde origo-testet till en tidsrace, #849). De tre filerna mockas nu (#850) och blev gröna direkt — de berodde aldrig på datan (felsvar i mockarna ger också grönt). **Vakten (`vitest.setup.ts` → `lib/testStod/supabaseVakt.ts`, test `lib/testStod/supabaseVakt.test.ts`):** `@/lib/supabase` byts i VARJE testfil mot en klient som aldrig skapas på riktigt; varje användning (`from`, `rpc`, `auth` …) registreras och kastar, och en `afterEach` fäller testet om något registrerats — också när appkoden fångat felet — med egenskapen och var i koden. En testfils egen `vi.mock('@/lib/supabase', …)` går före (53 filer har en). Bevis: de tre filerna FÖRE #850 mot vakten = 40 av 40 röda med pekare till `hamtaVidaGrans`/`hamtaStammoln`; hela sviten 6 785 gröna med vakten på; en underkörning med samma setup prövar att ett test som fångar felet ändå faller; mutationskontroll 10 av 10 (`python`-skriptet ligger i PR-texten). **Följd:** de 14 filer som bara laddade modulen skapar inte längre en klient, så de behöver inga Supabase-variabler (CI-jobbets platshållare behövs ändå för prod-testerna och routerna som skapar en egen klient). Vill ett test medvetet nå en klient mockar det den själv. **ÖPPEN PUNKT kvar:** direkta `createClient`/`createBrowserClient`-anrop i testfiler och i kod som testet laddar (`lib/notis.flush.test.ts` skapar medvetet en klient mot prod och hoppas över i CI via `lib/testProdEnv.ts`; routrar som skapar en egen klient mockas av sina tester) täcks inte av vakten — sonden såg inget oavsiktligt fall, men en stängning kräver en opt-in för de medvetna prod-testerna och är en egen ändring.
- **Egenkontrollen, ordningen härifrån (Martin 2026-10-19):** (1) Martin testar #837 på telefonen i previewn och mergar själv. (2) **7b död kod** först — `lib/egenkontrollSerie.ts` och de flöden sidan inte längre använder; liten PR, egen branch (byggd 2026-10-19 på `egenkontroll-dod-kod`; `avslutaStatus` bor nu i `lib/egenkontrollAvsluta.ts`). **Dubbeltrycksskyddet fanns bara i den döda serien (`TUMSKYDD_MS`) och dockan hade inget eget — den fick `DOCK_SKYDD_MS` (350 ms) i samma PR (#841).** Sedan **PR 4b** (byggd 2026-10-19 på `egenkontroll-4b-lagen`: sänkt läge, fast rad som visar innehållet, vakten smalnad till samma tryckyta, arket animerar bara vid lägesbyte — se nästa punkt). (3) **Utred det ordningsberoende origo-testet (se nästa punkt) — FÖRE PR 5.** (3b) **PR 5** (stickprovet + vägbeskrivning), utreds först när 7b är mergad. (4) **PR 6** (Vidas elva betygsrubriker). (5) **PR 8** sist, när Martin gått en runda i den nya ramen. 7a (tokenskuld), 7c (Centrera) och 7d (kartlagen + ritlagret) har ingen plats i ordningen än. Inget byggs före Martins besked att föregående är mergad.
- **PR 5 — månadens stickprov + vägbeskrivning (UTREDD 2026-10-20, beslut Martin; migrationerna `20261020120000_egenkontroll_stickprov_1_tabell.sql` … `_4_publik.sql` föreslagna, ännu ej körda).** Klusterurval: ETT ankare slumpas bland FÖREGÅENDE månads avslutade objekt (gallring/slutavverkning), grannar = de närmaste inom 15 km fågelväg, högst två. **Närheten slår antalet:** `min(3, det som ligger samlat)`, aldrig "fyll upp till tre"; en tunn månad (juli: 2 objekt) drar det som finns. Ankare utan koordinat dras ensamt (förklaring `ankare_utan_plats`; det finns inget att räkna närhet på — avviker från första skissen "ta de närmaste ändå"). Dragningen låses (trigger, ingen skrivväg i appen), sparar `fro` + frusen kandidatlista så ankaret kan räknas om (`md5(fro)` första 60 bitar mod antal kandidater, id-sorterade) — så urvalet går att visa för Vida. Dras vid första läsning i en ny månad (appen ELLER `/api/notis/flush`, Vercel-cron var 5:e min) — ingen pg_cron. **Första dragning november 2026** (konstant `c_forsta` i del 4). Arealen viktar inte; den visas på raden. Typgrupper = `objekt.typ` (`dim_objekt.atgard` bär inte datan: 9 av 31 avslutade får en åtgärd via #812-uppslaget och alla sex gallringar är "Första gallring"). **GROT och energiklippning står utanför dragningen tills det finns avslutade objekt av typen OCH en utförandekatalog för den** (`ObjektTyp` är bara gallring | slutavverkning, `utforandeKatalog` har inget för dem; idag finns inget avslutat GROT-objekt, bara ett pågående). Historikraderna ("Oktober: 2 av 3 gjorda") byggs INTE förrän det finns en bakad månad. Lokalt test: `supabase/tests/egenkontroll_stickprov_lokal/`.
- **PR 8 — "Bättre så" och lägena Kontroll · Utfall · Bättre så (EJ BYGGD; riktningen beslutad av Martin 2026-10-19, inte en spec).** En funktion, inte skuld, och därför inte en del av PR 7. Idén: besiktaren ritar en skiss över hur något skulle ha gjorts bättre (t.ex. hur basvägen borde dragits) och rundan får tre lägen — Kontroll (dagens), Utfall och Bättre så. Frågan "vad läser ritningen?" är besvarad:
  - **Inte Vida.** Skisser går inte till Vida och hör inte hemma i rapporten som bilaga. En "så här skulle vi gjort" till en kund är ett skriftligt medgivande, och då ritas det försiktigare. Verktyget är internt.
  - **Markeringen sparas på objektet** (`planering_markeringar`, egen kategori) — men objektet är inte mottagaren. En gallring återkommer efter 8–12 år och en slutavverkning aldrig, så som återkoppling till nästa planering av SAMMA objekt läser den ingen.
  - **Mottagaren är planeringen av NÄSTA objekt.** Lärdomen handlar om marktypen, inte om objektet. Mekanismen: när en ny planering öppnas visar appen själv "N Bättre så-skisser från närliggande objekt med samma åtgärd". **Pushad, inte hämtad** — ett bibliotek man ska söka i öppnas aldrig.
  - **Närhet och åtgärd finns redan i det PR 5 bygger för stickprovet.** Återanvänd det; bygg ingen ny matchning.
  - **Läsaren är planeraren.** Inte föraren i körvyn, inte Vida.
  - Detta är riktningen, inte en spec. Den läses när Martin gått en runda i den nya ramen. Bygg inget av det före dess, och inte före PR 5 (matchningen den återanvänder finns först då).
- **Ryggraden (PR 3, 2026-10-19):** `kompletteraRunda` fyller på pågående rundor med utförandepunkter katalogen kräver, vid öppning. Ulfsnäs fylls på (2 nya), övriga pågående rundor likaså när de öppnas; de tre gamla avslutades i efterhand av Martin (rörs aldrig). Det unika indexet på (runda, `punkt_typ`) står som punkt 3 ovan.
- 26 /api-rutter saknar egen auth (bara middleware skyddar dem). Egen säkerhets-PR med kravInloggad() — inte nu. Rutter (grov sökning, verifiera per rutt): app-state, forarkarta, handelse, kalibrering/{bedomning,diagnos,kalender,kontroll,objekt,tradslag}, kontroll/[id], korbarhet-tiles, parse-pdf, resurs, resurs/[id], roadcheck, routing, sgu-proxy, slu-geotiff, smhi-nederb, tract-analysis, wms-proxy. Öppna med avsikt (ska INTE få kravInloggad): auth/callback, fortnox/auth, fortnox/callback, version, mom-import (IMPORT_SECRET — verifiera)
- Fixa kalenderklick
- Timer-banner testad med fliknavigation
- Sjuk/VAB hela flödet verifierat
- Push-notiser vid obekräftad dag
- Vila-fliken (11h dygnsvila, 250h övertidstak)
- Löneunderlag → Fortnox
- ObjektValjare / objekt_geometri (efter fix-objektvaljare-effekt-loop, 2026-10-06): (2) hämta traktgeometrin EN gång — `planering/page.tsx` (maskindator-start, kandidaterP) och `ObjektValjare.tsx` läser båda hela `objekt_geometri` ofiltrerat; cacha i en modul eller skicka ner som prop. (3) listan behöver bara traktgränsen — hämta `geometri` först när den ritas, eller lägg en smal vy/kolumn (raden är hela envz-FeatureCollection). (5) sök efter samma mönster: `useEffect` med objekt/array/funktion i dep-listan där föräldern skapar värdet vid varje rendering, särskilt på sidor som ritas om i takt med GPS/timers. Intervallspärr (max en hämtning per 60 s) medvetet INTE gjord.

## Avtalsvärden (gs_avtal)
- OB, övertid, helglön — ej implementerat
- Två rader i gs_avtal — rätt val behöver
  verifieras

## Fortnox-integration
- OAuth klart, tokens i Supabase
- Semester: 500→5 fix pushat, ej verifierat
- ATK: kronbelopp OK, timmar kräver timlön

## Schema-skuld
- fakt_avbrott saknas i supabase/migrations/.
  Skapad utanför Git. Backfilla som egen
  migration när vi har tid att verifiera
  kompletta schemat live (kolumner, defaults,
  identity-mekanism, index, constraints).
  Risk: dev-reset eller frisk dev-branch
  tappar tabellen tyst. Inte akut.

## TODO efter MOM-reparationsutbyggnad
- UI: Uppföljningsvyns avbrott-lista visar
  tekniska kategori_kod (REPAIR_LOADERLINKAGE_
  HYDRAULICS) istället för human-readable.
  Behöver samma renderings-logik som
  maskin_service-historiken.
- Refactor: TS-felet på
  app/maskin-service/[id]/page.tsx:41
  (formatTyp redundant ?? ''). Trivial fix
  när någon ändå rör filen.

## Pågående arbete
- Stanford2010-dokumentation KLAR — alla
  fyra filtyper pushade på main (commit
  02a63df + 16f38fd). hpr_filer-reparation
  körd 2026-05-07 via MCP — 544 rader
  fix:ade till 0 utan maskin_id, 245 av
  248 stammar_count uppdaterade. Datat var
  intakt hela tiden i detalj_stam +
  hpr_stammar — bara summary-tabellen var
  fel.

## Redigeringsvy — parkerat (2026-05-07)

Steg 1-5 av designöversynen klara på /redigering
(prisscenario, designkonsistens, 56px-knappar,
gruppering av egenskaper, UX-förbättringar).
Följande togs explicit ur scope och behöver göras
separat:

- Auth-gate på /redigering. Vyn ändrar dim_objekt
  (inkl. nya prisscenario_id). Bör vara chef/admin-
  only, server-page.tsx-wrapper enligt mönstret i
  app/ekonomi/page.tsx.
- Migrera ovrigt_info JSON till riktiga kolumner:
  extern_skotning, extern_foretag, extern_pris_typ,
  extern_pris, extern_antal. Schema-läckage som
  bör brytas ut för att kunna queryjas och räknas
  in av ekonomi-vyer.
- Stavfel "stubbbehandling" → "stubbehandling".
  Kräver migration på dim_objekt-kolumn.
- ~~Lyfta ut EditSheet-komponent~~ KLAR i PR #203
  (2026-07-17): en delad ObjektEditor äger sheet/
  spara/dirty-logik för båda listvyerna; sheeten
  omstrukturerad (obligatoriskt först, undersidor,
  dirty-Spara med ändringsräknare).
- TypeScript-typer på app/redigering/page.tsx.
  Filen är .tsx men skriven som JS, inga typer
  på Objekt/Scenario/state.
- Städa DEMO-arrayer. DEMO_OBJEKT är död kod,
  DEMO_BOLAG/DEMO_INKOPARE används som initial
  state men borde komma från databas.
- Inställnings-CRUD för fler scenarier i
  /ekonomi/installningar. Tills den finns visas
  ingen "Skapa nytt"-länk i PrisscenarioPicker.
- Hardcoded SUPABASE_URL/SUPABASE_KEY på rad 34-35
  i app/redigering/page.tsx. Bör bytas till
  import { supabase } from '@/lib/supabase' (för
  konsekvens + RLS-policies som baseras på
  auth.uid()).

INTE konsolidera: dim_objekt.timpeng (uppföljnings-
statistik) och objekt_ekonomi.rakna_som_timpeng
(ekonomi-beräkning) är medvetet skilda saker
enligt Martin.

## Redigeringsvy — Steg H/I/J/K (2026-05-08)

EndDate-koppling klar:
- H: Info-rad i Avslut-sektionen visar
  dim_objekt.end_date från StanForD-filen
- I: Snabbfix-knapp sätter skordning_avslutad
  (Harvester) eller skotning_avslutad
  (Forwarder) till YYYY-MM-DD från end_date
- J: Varning "Maskinen rapporterar X avslutad —
  ej markerad" när end_date finns men fältet är
  tomt
- K: 14-dagars-heuristik som plan B —
  "Skördning/skotning verkar klar (startade för
  N dagar sedan)" när end_date saknas och
  start_date >= 14 dagar tillbaka

Parkerat:
- Dedup per vo_nummer i listvyn. Idag visas
  fysiska objekt med två maskiner som två kort
  med samma object_name (en harvester-rad,
  en forwarder-rad). Filtret "Bara fel" och
  varningsräknaren räknar dim_objekt-rader,
  inte unika vo_nummer. Konsekvens: samma
  fysiska objekt kan synas dubbelt i räknaren.
  Att dedupa kräver beslut om hur kort ska
  rendera när två maskiner har olika data
  (t.ex. olika huvudtyp), och om varningar
  ska aggregeras eller delas. Egen omgång.

- Steg K-tröskeln (14 dagar) är pragmatisk men
  trubbig — den triggar på långa pågående
  gallringar. Bättre signal vore "tid sedan
  senaste fakt_produktion/fakt_lass-rad", men
  det kräver extra query per objekt. Senare.

## UPSERT-koreografi-fix (2026-05-09)

Steg 2 verifierad på Korpalycke 14 april PONS20SDJAA270231:
stammar 414 → 577 (PDF-facit) och m³sub 163.595 → 233.956
(PDF 233.957). UPSERT-koreografi-strategin (rensa →
flytta tillbaka MOM-filer i alfabetisk ordning →
omimportera) bevisad fungera för Bugg A.

Sidofynd som inte är blockerande:

- G15h-allokering: 4.6 min totaldiff per skift mellan
  PDF och fakt_tid. Inte blockerande. Möjlig orsak:
  fallback-objekt 20250731 (~16 min) som inte mappas
  mot vo_nummer plus 4 min Stanford2010-formel-diff.

## KRITISKT — buggar i fakt_produktion / fakt_sortiment (2026-05-09 → 2026-05-10)

### Bugg A — UPSERT-koreografi (FIXAD)
- Symptom: senaste MOM-fil förlorar mot tidigare i UPSERT
- Fix: kör om alla MOM-filer i sorterad ordning
- 3 dagar fixade, +316 m³ återhämtat:
  - Korpalycke 14/4 (Steg 2): 414→577 stammar
  - Kättorp 17/3 (Steg 3): +95 stammar / +79.5 m³
  - Jeppshoka 31/3 (Steg 3): +205 stammar / +165.8 m³

### Bugg B — HPR-datum-allokering (FIX I AFFÄRSUPPFÖLJNING)
- Symptom: fakt_sortiment har sessions-slut-datum för
  multi-dag-sessioner, inte stam-kapningens faktiska
  datum.
- Rotorsak: Ponsse Scorpion Giant 8W skriver INTE
  ProcessingDate per stam i HPR. Vår parser faller
  tillbaka på filnamnet — alla stammar i en
  multi-dag-kumulativ HPR får sessions-slut-datum.
- Bevis 19 januari 2026 obj 11109556: HPR säger
  919 m³ för 19/1, MOM säger 305 m³ för 19/1 +
  287 m³ för 15/1 + 326 m³ för 16/1 (totalt 918 m³).
  MOM:s per-arbetsdag-fördelning är korrekt.
- Frontend-impact (kartlagd 2026-05-10):
  ENDAST app/affarsuppfoljning/page.tsx läser
  fakt_sortiment.volym_m3sub med datum-filter och
  per-period-aggregering. Övriga vyer (uppfoljning,
  ekonomi, markägare, maskinvy m.fl.) använder
  fakt_produktion (MOM, korrekt) eller fakt_sortiment
  utan datum (totaler per objekt, korrekt).
- Liten fix tillämpad: ta bort datum-filter på
  fakt_sortiment-läsningen i affärsuppfoljning,
  så sortiment-fördelning baseras på trakt-totalen
  (vilket är korrekt — fördelning är en egenskap av
  objektet, inte en period-statistik). Per-period-
  volymerna kommer fortfarande från fakt_produktion.

### Bugg C — skuggobjekt (KVAR — separat utredning)
- Symptom: objekt med datum-baserade ID (20250731,
  20260105 etc) finns i fakt_sortiment men inte
  fakt_produktion
- Konkret 19 jan 2026: objekt 20250731 har
  115.399 m³sub i fakt_sortiment, 0 i fakt_produktion
- Påverkar: G15h-allokering, produktivitetsstatistik
- Inte fix:at — separat utredning, inte akut

### Bugg D — fakt_tid multi-dag UPSERT-överskrivning (FIXAD 2026-05-10 e.m.)
- Symptom: fakt_tid underrapporterar G15h för dagar
  där MOM-sessioner spänner över dygn. Per-datum-
  omimport via Steg 3 ger cyklisk regression: 13/4-fix
  → 14/4 regressar, 14/4-fix → 13/4 regressar.
- Rotorsak: kumulativa MOM-filer innehåller carryover-
  data från föregående dygn. Vid per-datum-import
  importeras inte alla relaterade filer i samma pass
  → `_GLOBAL_TID_ENTRIES` får bara delmängd → UPSERT
  på fakt_tid (4-kols unique-key) skriver över annan
  dags rader med partial-värden.
- Lösning: nytt scratch-script `_steg3b_multi_datum.py`
  som identifierar UNION av MOM-filer för alla berörda
  datum (via fakt_produktion + fakt_skift + fakt_tid),
  rensar alla berörda dagar samtidigt, importerar alla
  filer i ETT pass.
- Resultat (PONS20SDJAA270231 13-15 april 2026):
  - Korpalycke 13/4: 3.74h → 6.64h (PDF 6.63h ✅)
  - Korpalycke 14/4: 6.29h ≈ PDF 6.27h ✅
  - Krokshult 14/4:  2.17h ≈ PDF 2.17h ✅
  - Krokshult 15/4:  3.10h → 6.60h (PDF 6.58h ✅)
  - Total återhämtning: +7h G15
  - Bonusfix Bugg A: +74 stammar / +38 m³ på 15/4
    Krokshult (samma multi-dag-pass)
- Inga ändringar i skogsmaskin_import_version_6.py.
  Alla skydd höll: backup intakt, arbetsdag bekraftad
  =true 48 → 48, fakt_sortiment oförändrat alla 3 dagar.

### REGEL FRAMÅT (uppdaterad 2026-05-10 e.m.)
- Per-dag-volymer/stammar/tid → fakt_produktion (MOM)
- Per-objekt-totaler → fakt_sortiment (HPR)
- Markägar-rapport → hpr_filer/hpr_stammar (totaler)
- Lön/ackord → fakt_produktion per period
- Datum-filter på fakt_sortiment är felaktig användning
- **Multi-dag MOM-sessioner** kräver
  `_steg3b_multi_datum.py` (alla berörda datum
  samtidigt), inte `_steg3_batch.py` (per datum).
  Per-datum-batch fungerar bara för 1-dags-sessioner.

### KVAR
- **Bugg C** (skuggobjekt) — separat utredning
- **Andra Bugg D-fall** — multi-dag-sessioner i andra
  perioder. `_steg3b_multi_datum.py` fungerar för dem
  också, men varje period kräver manuell körning med
  rätt --datum-lista.
- **Strukturell fix av import-script** — sikt-projekt.
  T.ex. ändra _GLOBAL_TID_ENTRIES till MAX-merge eller
  införa monitoring_start i fakt_tid:s unique-key.
- **Watchdog + statussida** — sikt-projekt.

### Pausat läge — vad finns kvar i worktreen
- _steg1_backup.sql (kört, backup-tabeller existerar)
- _steg2_test_14april.py (kört, fix:ade Korpalycke 14/4)
- _steg3_batch.py (kört på 17/3 + 31/3, fungerar för
  1-dags-sessioner)
- _steg3b_multi_datum.py (kört på 13-15/4, fungerar
  för multi-dag-sessioner)
- _steg3_constraints.md (anteckningar)
- backup_*_20260509-tabeller i Supabase intakta
- auto_import_watch.bat behöver återstartas manuellt

## HPR-import buggar (kvarstår)
Kommer skapa trasiga rader vid varje ny
HPR-import tills patchad:

- import_hpr.py rad 372-374: fil_row
  saknar 'maskin_id' och 'stammar_count'
  — lägg till 'maskin_id':
  parsed['maskin_id'] och
  'stammar_count': len(parsed['stammar'])
- import_hpr.py rad 391: föråldrad
  kommentar om "tom maskiner-tabell" —
  ta bort
- skogsmaskin_import_version_6.py
  _save_hpr_tables: fil_row saknar
  'maskin_id' — lägg till 'maskin_id':
  maskin_id (variabeln finns redan
  deklarerad)

Repair-strategier för redan-skapade
rader finns i docs/stanford2010/
hpr-harvester-production.md.

## Körvy 2D — beslut och fallgropar

### 1. 3D bor i Cesium, inte i Körvy 2D

Försökte bygga 3D-extrusion (pelare, stake-nålar,
outline-ringar) för markörer i Körvy 2D men kom
fram till att det inte fungerar visuellt. På 100m+
avstånd från kameran blir pelare suddiga prickar
oavsett radius. Apple Maps använder 2D-symboler +
text på det avståndet, inte 3D.

Beslut: Körvy 2D = platta symboler + tre färger
(severity) + text-labels under faror inom 100m.
3D bor i Cesium-vyn (/korvy) där kameran är nära
och 3D faktiskt passar.

### 2. Pulse/nearby icon-size-boost var trasigt sedan dag 1

Pre-existing case-expression med zoom-input som
är ogiltig per MapLibre style spec, men try/catch
svalde felet tyst. Upptäcktes när vi flippade
pitch-alignment runtime — MapLibre 5 re-validerar
hela layout vid setLayoutProperty och kraschade.
Fixat i bd25b1d med case INUTI varje
interpolate-stop, multiplikationsmodell.

### 3. MapLibre 5 re-validerar hela layout vid setLayoutProperty

Att flippa en enskild layout-property triggar
re-validering av hela layerns layout-objekt. Tysta
pre-existing buggar i andra properties blir
blockerande. Inför MapLibre-uppgradering: öppna
konsolen i Körvy 2D och kolla efter
validation-errors innan du säger "funkar".

### 4. Tre färger som severity-baserad palett

markerIconDefs har konsoliderats från ~8 färger
till tre:
- danger (#ff453a):  powerline, manualfelling,
                     warning, steep
- protect (#30d158): eternitytree, naturecorner,
                     culturemonument
- info (mörk grå #1c1c1e med vit ikon): alla
                     övriga 13 typer

Distinktion mellan info-typer ligger i SVG-formerna.
Om "havsa av grå" blir ett problem i fält —
differentiera SVG-formerna eller acceptera
permanent text-labels för info-typer i
planeringsvyn.

### 5. Två parallella position-stacks

Larm-pipelinen (System A: getActiveWarnings)
använder effectiveUserPos = simulatedPos ??
gpsPosition. Körvy-pipelinen (System B: korvyPos,
korvyNextItems, korvyAcuteWarning) använde tidigare
currentPosition direkt — utan SIM-stöd. Det gjorde
att SIM kunde trigga larm men inte text-labels eller
nästa-kö i Körvy.

Fixat i 8c77ef4 via ny useMemo korvyEffectivePos
(simulatedPos ?? currentPosition, normaliserad till
{lat, lon}). Använd den variabeln för all
avstånds-beräkning till markörer i Körvy. Kamera/
GPS-prick/maskin-source ska däremot följa riktig
GPS — inte SIM.

Property-konvention att vara medveten om:
- currentPosition: { lat, lon }
- simulatedPos:    { lat, lng }
Inkonsekvensen finns kvar — normalisera vid varje
gränsövergång.

## Cesium 3D — kartval och risker

### Vald baskarta-strategi: två topo-alternativ

Cesium 3D Körvy har två topografiska baskartor
för olika syften:

- "Topo" (default) = OpenTopoMap (XYZ tiles
  från tile.opentopomap.org). Rik kartstil med
  gula vägar, höjdkurvor, trädsymboler. Matchar
  planeringsvyns "Terräng"-bas. Bästa läget för
  "läsa landskapet".

- "Topo nedtonad" = Lantmäteriet topowebbkartan_
  nedtonad (WMS från minkarta.lantmateriet.se).
  Gråskala, designed av Lantmäteriet specifikt
  som bakgrund för annat innehåll. Bästa läget
  för "fokus på markörer" — röda/gröna pelare
  får maximal kontrast mot grå.

Plus Satellite (Lantmäteriet ortofoto) och
Cockpit (hillshade) som specialalternativ.

### Risk 1: OpenTopoMap-licens

OpenTopoMap är CC-BY-SA + tile usage policy.
Sammanfattning:
- Måttlig privat/icke-kommersiell användning OK
- Storskalig kommersiell användning kräver kontakt
  med dem eller egen hosting
- Attribution alltid krävd (visas i Cesium credit)

Skogsystem just nu (1 företag, 4 operatörer)
ligger inom "måttlig privat". Om appen säljs till
andra forestry-bolag eller får många samtidiga
användare behöver migrationsväg planeras:
egen OpenTopoMap-hosting (free, kräver server-
setup) eller Mapbox/MapTiler (kommersiell licens).

Lantmäteriet topowebbkartan_nedtonad har INGEN
sådan licensrisk — Lantmäteriets öppna data är
fri för kommersiell användning.

### Risk 2: OpenTopoMap maxzoom 17

OpenTopoMap har inga tiles djupare än zoom 17.
Vid Cesium pitch 78° och kameran nära marken kan
tiles bli suddiga. Lantmäteriet topowebbkartan_
nedtonad har högre zoom-kapacitet — användaren
kan välja den vid behov om OpenTopoMap pixlar.

## Gallringsvyn — steg 1 (2026-08-22)

/gallring (lista) + /gallring/[vo] (trakt) byggd på
uttagsdata som redan finns importerad. Ingen ny
import.

Gallring identifieras på dim_objekt.huvudtyp via
lib/objekt/typ.ts. Fältet fanns redan — 37 objekt
har huvudtyp Gallring, 25 av dem har uttag.

Källorna hålls isär (lib/gallring.ts):
- m³fub, stammar, datum, maskin, förare, trädslag
  → fakt_produktion (MOM)
- sortiment → fakt_sortiment (per objekt, aldrig
  med datumfilter)
- diameter (Dgv, histogram) → detalj_stam.dbh_mm

fakt_produktion är sanningen om ANTALET stammar.
detalj_stam har LUCKOR. Diametermåtten redovisar
därför öppet hur många stammar de bygger på.
Kompermåla Ga, Lars Norberg Dunshultt och
Midingstorp gallring 2025 saknar stamrader helt och
visar "Dgv saknas".

Maskin och förare läses ur produktionen, inte ur
dim_objekt.maskin_id — det fältet pekar ut skotaren
A030353 på Svinhult, Hössjömåla och Bastaremåla.

Verifierat mot Hålabäck gallring 2026 (VO 11219961,
R64428, Oskar Nilsson, 21 aug 2026) genom att köra
vyns egna funktioner mot databasen: 254 stammar,
DBH medel 157,5 / median 155 / min 69 / max 276 mm,
Tall 139, Gran 63, Björk 34, Övrigt löv 18 —
samtliga exakt enligt facit. Uttag 32,685 m³fub,
identiskt i fakt_produktion, fakt_sortiment och
detalj_stock.

### Dgv-formeln — FASTSTÄLLD 2026-08-22
Dgv = Sum(d^3)/Sum(d^2), grundytevägd medeldiameter
(varje träd vägs med sin egen grundyta). Det är INTE
sqrt(Sum(d^2)/n) — den formeln är Dg, grundyte-
medeldiametern, där alla träd väger lika.

Hålabäck, 254 stammar: Dgv 178,09 mm mot Dg 162,73
mm mot aritmetiskt medel 157,52 mm. Skillnaden är
inte avrundning utan tre olika mått.

Frågan har ställts en gång och besvarats. Ändra inte
formeln som en "rättning" — det kräver beslut, och
etiketten i vyn måste följa med.

### Medvetet uteslutet — lägg inte till
Stickvägsandel, gallringskvot och skattat
kvarvarande bestånd. Alla tre bygger på att
stickvägsträden representerar beståndet före
gallring. Verifierat på Hålabäck att det inte
håller för beståndsgående drivning. Areal skattas
aldrig ur rutnät eller körspår — utan uppmätt areal
visas inget per-hektar-tal (bara 4 av 25 trakter
har areal i objekt.areal; dim_objekt.areal_ha står
på 0 för samtliga).

### BLOCKERARE FÖR STEG 2 — luckor i detalj_stam
Sjöaryd: stam_key löper 489741-490139 = 399 platser,
men bara 379 rader finns. 20 nycklar mitt i en
löpande serie saknas. Samma mönster på nästan alla
gallringstrakter (fakt_produktion 399 stammar mot
detalj_stam 379, genomgående 2-10 % färre).

Detta är INTE ett urval och får inte behandlas som
ett. Hål i en löpande nyckelserie är exakt samma
mönster som MOM-importbuggarna A och D ovan —
sannolikt tappad data vid import. Orsaken är
outredd.

Varför det blockerar steg 2: trädpositionerna i
steg 2 kommer ur detalj_stam. Varje saknad stam blir
ett falskt hål i kartan — ett område ser ogallrat ut
fast det är gallrat. Till skillnad från steg 1, där
luckan bara gör Dgv marginellt osäker och skrivs ut
i klartext, blir samma lucka i steg 2 en kartbild
som ljuger. Utred luckorna INNAN steg 2 byggs.

Startpunkt för utredningen: jämför stam_key-serien i
HPR/MOM-källfilen mot detalj_stam för Sjöaryd
(objekt_id 85893, R64101, 24 jan 2026) och se om de
20 nycklarna finns i filen. Gör de det ligger felet
i importen; gör de det inte ligger det i maskinens
export.

### TODO — aggregera diametrarna i databasen
Dgv och histogrammet läser idag ~91 000 rader ur
detalj_stam (3,3 MB, ~2,6 s på fast nät). Det är
inte acceptabelt i hytt på mobilt nät. Listan laddas
därför i två steg som en nödlösning, inte som en
design.

Rätt lösning: aggregera per objekt_id i databasen —
count(*), sum(dbh_mm^2), sum(dbh_mm^3) räcker för
Dgv (sum(d^3)/sum(d^2)), plus en klassindelning för
histogrammet. Då blir listan ett anrop i stället för
91, och tvåstegsladdningen kan tas bort helt.

Martin fixar MCP-auktoriseringen. Ingenting skapas i
databasen innan dess.

### EGEN GREN (ej nu) — migrera inline-trädslagspaletter
lib/tradslag.ts är nu EN palett för trädslag (gran
grön, tall orange, björk vit, övrigt löv grå) plus
namnregeln som slår ihop OVR_LOV och OVR LOV.
Gallringsvyn pekar dit. Fem andra ställen gör det
INTE och har egna färger inline:

1. app/admin/markagarrapport/[objekt_id]/page.tsx
   rad 305-307 - gran #34c759, tall #ff9500, bjork
   #d4c5a0. VIKTIGAST: markagarrapporten gar ut till
   KUND. En rapport dar bjorken har en farg och
   appen en annan ser slarvig ut utat, och det ar
   den enda av de fem som nagon utanfor foretaget
   ser. Ta den forst.
2. app/maskinvy/IdagNy.tsx rad 50-52 - bjork #ffd60a
3. app/maskinvy/VolymDeepView.tsx rad 29-31 - dito
4. app/oversikt/OversiktKarta.tsx rad 232 - gran
   #66BB6A, tall #FFA726, bjork #FFF176, plus ek/
   bok/contorta
5. app/affarsuppfoljning/page.tsx rad 381 och 410 -
   rgba-varianter, bjork BLA och ovr lov orange

Samma tradslag har alltsa fyra olika farger i appen
idag. Da slutar fargen vara en genvag for ogat och
blir en gissning.

Att tanka pa vid migreringen: kartlagren (punkt 4
och planeringsvyns HPR-hogar) ritar mot LJUS
bakgrund i vissa baskartor. Vit bjork behover da
konturen ur TradslagStil.kontur - fyllningen ensam
racker inte. Det ar darfor stilen bar bade fyll och
kontur i stallet for en enkel farg.

### Öppna punkter
- Specialavv Uggleboda (Dgv 368 mm) och Kompersmåla
  Lövhuggning mm (Dgv 322 mm) är körda med
  slutavverkningsskördaren PONS20SDJAA270231 men
  har huvudtyp Gallring. Beslut 2026-08-22: vyn ska
  spegla dim_objekt.huvudtyp utan undantag. Är typen
  fel rättas den i objektdetaljerna, inte i vyn.

### Okulärbesiktigad 2026-08-22
Inloggad på dev-servern, 375x812 (mobil). Listan och
Hålabäck-vyn visar rätt siffror mot facit, konsolen
är ren. Fyra fel hittades och rättades i samma
omgång:
- TopBar visade "Gallring/11219961" som sidtitel —
  saknade post i pageNames + prefixregel.
- Detaljvyn ritade en egen header under den fasta
  TopBar:en = dubbel chrome. Borttagen; bakåtlänken
  "Alla gallringar" ligger i innehållet i stället
  och finns i alla tillstånd, även fel och tomt.
- Punkt i stället för komma i medelstam (0.129) och
  areal (9.17). Egen fmtDecimal med sv-SE.
- "Tall 0 %" och "0,0 m3fub" på värden som finns men
  avrundas till noll. Skrivs nu "<1 %" och "<0,1" —
  en post som existerar får aldrig renderas som
  frånvarande.

## MULTITREE-FIXEN 2026-08-23 — PILOT KORD

Parsern laser nu MultiTreeProcessedStem. Fyra stallen
andrade, HQC medvetet kvar. Migration
20260823_detalj_stam_bunt_nyckel.sql kord.

PILOT: Johan Svensson Brandeborg (objekt_id 9955),
atta av atta mot forutsagelsen.

  detalj_stam        488 -> 641   (facit MOM 641)
  stam_bunt_nyckel     -  -> 153  i 74 buntar
  NULL                 -  -> 488
  Dgv              121,9 -> 116,0 mm
  medeldiameter    104,5 ->  97,0 mm
  min/max          57/277 -> 49/277
  fakt_sortiment  23,187 -> 25,583 (facit MOM 25,583)

Halabaeck orord: 254 stammar, 0 buntnycklar,
Dgv 178,1, 32,685 m3. Regressionsvakten haller.

GROT: hpr_stammar 641 rader, stam_nummer 1-641 utan
luckor, 0 bio_energy_adaption — kallfilen har 0.
backfill-grot behovde INTE koras om. Omimporten
raderar hpr_filer + hpr_stammar for objektet forst,
och GROT lases inline per stam i stallet for att
slas upp via stam_nummer, sa omnumrering kan inte
flytta en tagg.

### VARNING — fakt_sortiment saknar nedgraderingsskydd
hpr_filer HAR ett skydd. Kors en mindre delfil for
ett objekt som redan har en storre snapshot loggar
importen "hoppar — 278 stammar < befintlig komplett
snapshot (488), ingen nedgradering" och lamnar
hpr_filer i fred.

fakt_sortiment har INGET sadant skydd. Den byggs om
fran detalj_stock vid varje sparning
(rebuild_fakt_sortiment), och en delfil tar den
tillfalligt ned. Under piloten:

  23 jan-filen kord:  15 -> 9 rader,  23,2 -> 12,0 m3
  24 jan-filen kord:   9 -> 16 rader, 12,0 -> 25,583

Slutlaget blev ratt, men bara for att bada filerna
kordes. Hade omimporten avbrutits mellan dem — fel,
natverk, ctrl-c — hade objektet legat kvar pa
12,0 m3 UTAN varning. Ingenting i loggen sager att
laget ar halvfardigt.

REGEL: kor ALLA HPR-filer for ett objekt i ETT pass,
eller storsta filen sist. Och verifiera efterat mot
fakt_produktion innan nasta trakt paborjas —
scripts/omimport-multitree.py gor bada delarna och
STOPPAR vid avvikelse.

### BJORN MARTINSSON — OVERIFIERAD, INTE KLAR
Objekt 11109652 kordes 2026-08-23 som forsta trakt i
breddningen. Skriptet STOPPADE pa den. Trakt 2-5
kordes aldrig och ar ororda.

  fore   19210 stammar / 906,182 m3
  efter  21786 stammar / 936,736 m3   <- nuvarande lage
  facit  22023 stammar / 950,354 m3   (MOM)

Laget ar BATTRE an fore (+2576 stammar, 2576
buntnycklar) men INTE verifierat. Tro inte att den
ar klar.

Bristen ligger HELT pa R64101: 8850 mot MOM 9087.
R64428 ar exakt ratt (12936 = MOM). Samtliga 1862
HPR-filer pa disk ar genomsokta — de 31 som bar
objektet innehaller tillsammans exakt 8850 unika
R64101-stammar. De 237 FINNS INTE I NAGON FIL.
Importen skrev allt som fanns. Det ar en
kalldataslucka, samma familj som Anna Karin Swerup
och 4000-taket, inte nagot en omimport lagar.

Tva fel som bara syns i skala dok ocksa upp:

1. hpr_stammar tappade 500 rader. 19 ggr
   400 PGRST102 "All object keys must match".
   _save_hpr_tables bygger rader med VILLKORLIGA
   nycklar (if s.get('dbh_mm') is not None: ...), sa
   en batch som blandar rader med och utan valfria
   falt avvisas av PostgREST. Vid pilotens 641 rader
   rymdes allt i tva likformiga batchar; vid 12936
   gjorde det inte det. Traffar markagarrapporten.
   EGEN GREN, ska fixas FORE breddningen.

2. detalj_stock fick en 500 statement timeout pa en
   batch.

detalj_stam skrevs felfritt.

### KVAR — breddning ej gjord
21 gallringstrakter och 56 slutavverkningstrakter
bar fortfarande ofullstandig HPR-data. Omimport-
skriptet ar skrivet men inte kort i skarpt lage.

## IMPORTUTREDNING 2026-08-23 — RAPPORT

Utredning, ingen kodandring. Fyra SEPARATA fel.
Tre orsaker faststallda, ett delvis.

### Hypotesen om brytdatum — FALSIFIERAD
Avvikelserna ar INTE historiska. De uppstar med
nuvarande kod, varje dag.

  Rossmala Ga    importerad 2026-08-05   -0,49 %
  Raveboda       importerad 2026-08-20   -1,84 %
  Halabaeck      importerad 2026-08-21    0,00 %

Raveboda importerades DAGEN FORE Halabaeck, med
samma kod, och avviker. Det finns inget brytdatum
och en omimport hjalper inte — den skulle reproducera
felet. Billigaste utfallet ar bortfall.

### FEL 1 — MultiTreeProcessedStem hoppas over (AKTIVT)
ORSAK FASTSTALLD. Detta ar huvudfyndet och forklarar
bade Sjoaryds 20 saknade stammar och hela den
systematiska HPR-lagre-an-MOM-avvikelsen.

Bevis, Sjoaryd (objekt 85893, R64101, 24 jan 2026),
fil "Oskar Nilsson Sjoaryd 2026-01-24.hpr":
- Filen innehaller 399 StemKey, UNIKA, UTAN luckor.
- Samtliga 20 nycklar som saknas i detalj_stam FINNS
  i filen. Felet ligger alltsa i IMPORTEN, inte i
  maskinens export.
- Varje tappad stam bar <MultiTreeProcessedStem>.
  Varje behallen bar <SingleTreeProcessedStem>.
- De tappade kommer i par och tripletter med samma
  DBH (67/67, 86/86, 61/61/61 mm) — flertradshantering
  av klena stammar, precis vad gallring gor.

Koden, fyra stallen:
  skogsmaskin_import_version_6.py:1335  (HPR)
  skogsmaskin_import_version_6.py:1669  (HQC)
  import_hpr.py:263
  scripts/backfill-grot.py:106
  scripts/tag-hpr-format.py:136
Alla gor: single = find_element(stem,
'SingleTreeProcessedStem'); if single is None: continue
MultiTreeProcessedStem hanteras INGENSTANS i kodbasen.

Korrelationen ar entydig — andel flertradsstammar mot
volymavvikelse:

  Halabaeck        0,0 % multi    0,00 % avvikelse
  Rossmala         2,8 %         -0,49 %
  Sjoaryd          5,0 %         -0,76 %
  Raveboda         7,2 %         -1,84 %
  Johan Svensson  23,9 %         -9,36 %
  Steglehylte     24,5 %         -5,85 %

detalj_stam-antalet ar EXAKT lika med antalet
SingleTreeProcessedStem i filen pa alla kontrollerade
trakter. Halabaeck stammer pa 0,00 % av ett enda skal:
det ar den enda trakten utan flertradshantering.

Volymavvikelsen ar mindre an stamavvikelsen darfor att
flertradsstammar ar klena.

ATGARD: parsern maste lasa MultiTreeProcessedStem.
Notera att elementet bar FLERA trad per Stem —
volym och stamantal maste summeras, inte kopieras.

### BEVISKEDJA — kalla till databas, Sjoaryd
Bada kallfilerna ar overens om 399. Talet blir 379
forst i importen.

  Led                          Antal   Volym m3sub
  -------------------------------------------------
  MOM NumberOfHarvestedStems     399        25,530
  HPR unika StemKey              399        25,5315
    varav SingleTreeProcessed    379        25,3379
    varav MultiTreeProcessed      20         0,1936
  -------------------------------------------------
  fakt_produktion (MOM)          399        25,530   OK
  fakt_sortiment (HPR)            --        25,334   -20 stammar
  detalj_stam                    379          --     -20 stammar

Filens SUMMA 25,5315 mot MOM 25,5300 = +0,0015.
Filens ENTRAD 25,3379 mot fakt_sortiment 25,3340.
Bada stammer inom avrundning. Det finns alltsa inget
ytterligare bortfall — flertradsstammarna ar HELA
forklaringen for Sjoaryd.

Bara en HPR och en MOM finns for Sjoaryd i hela
Behandlade. Inga dubbletter.

### VAD MultiTreeProcessedStem BAR — svar fore kodning
Undersokt i skarp fil, inte bara i schemat.

STRUKTUR: varje trad i bunten far en EGEN <Stem> med
egen StemKey, egna StemCoordinates, egen HarvestDate,
eget SpeciesGroupKey, egen BoomPositioning
(BoomAngle + BoomExtension) och egen <Log>.
De delar <StemBunchKey>.

  <Stem><StemKey>489995</StemKey>
    <ProcessingCategory>MultiTreeProcessing</...>
    <StemCoordinates>...</StemCoordinates>
    <BoomPositioning boomPositioningCategory="Felling">
    <MultiTreeProcessedStem>
      <StemBunchKey>5</StemBunchKey>
      <DBH>61</DBH>
      <ReferenceDiameter referenceDiameterHeight="20">
      <Log>...</Log>

VOLYM ar PER TRAD, inte delad. Bunt 5 har tre stammar
a 0,009735 m3sub. Att summera rakt av ger filens
total 25,5315 = MOM:s 25,5300. Ingen dubbelrakning.

DBH ar DELAD inom bunten. Alla tre i bunt 5 har
DBH 61; paren har 67/67 och 86/86. Diametern ar matt
EN gang for bunten, inte per trad.

SLUTSATS FOR LAGRING: de kan lagras som separata
rader i detalj_stam. Ingen ny struktur behovs. Men
dbh_mm ar da inte en individuell matning — tre rader
med 61 mm ar EN matning, inte tre. Dgv och
diameterhistogrammet skulle vikta bunten tre ganger.
Behover en kolumn for StemBunchKey, eller en flagga,
sa statistiken kan skilja dem at. Kolumn = migration
= egen gren, fraga forst.

### VARNING — m3subEstimated ar den tysta fallan
Detta ar den miss som SER UT SOM EN LYCKAD FIX.

Entrad skriver  logVolumeCategory="m3sub"
Flertrad skriver logVolumeCategory="m3subEstimated"

En parser som slutar hoppa over MultiTreeProcessedStem
men fortsatter leta enbart "m3sub" far RATT STAMANTAL
och NOLL VOLYM for flertradsstammarna.

Verifierar man da bara stamantalet ser fixen ut att
fungera: detalj_stam gar fran 488 till 641 pa Johan
Svensson. Men fakt_sortiment star kvar pa 23,187 i
stallet for att na 25,583, och avvikelsen mot MOM
kvarstar oforandrad.

Verifiera darfor ALLTID bada talen, stamantal OCH
volym, mot MOM. I filen finns 705 "m3sub" och 20
"m3subEstimated" pa Sjoaryd — samma 20 som ar
flertradsstammarna.

### KALIBRERINGSVYN — vagen finns i koden, inte i datan
Kontrollerat pa begaran, eftersom kalibreringen ar
kvalitetsregelverk mot Vida och delad DBH som
individuella matningar skulle forvanga std.

LAGET IDAG: ofarligt. Samtliga 629 HQC-filer for
R64101, R64428 och PONS20SDJAA270231 ar genomsokta —
1039 kontrollstammar, NOLL MultiTreeProcessedStem.
Kontrollmatning kraver att en enskild stam klavas, sa
buntade stammar dyker inte upp som kontrollstammar.
detalj_kontroll_stock och fakt_kalibrering ar alltsa
opaverkade av fel 1.

MEN VAGEN FINNS I KODEN. HQC-parsern har samma skip:
  skogsmaskin_import_version_6.py:1669
    single_tree = find_element(stem,
        'SingleTreeProcessedStem', ns)
    if single_tree is None: continue

Tar fix-grenen bort skippet MEKANISKT pa alla fem
stallen oppnas en vag for buntdelad DBH in i
detalj_kontroll_stock -> fakt_kalibrering -> kravet
mot Vida. Tre rader med samma DBH skulle da rakans
som tre oberoende matningar och krympa
standardavvikelsen artificiellt — precis den sortens
fel som far en kalibrering att se battre ut an den ar.

ATGARD I FIX-GRENEN: HQC-stallet ska INTE behandlas
som de fyra andra. Antingen star skippet kvar med en
kommentar om varfor det ar avsiktligt just dar, eller
sa laggs en explicit sparr. Beslutet ska vara
medvetet och skrivet, inte en foljd av att nagon
sokte och ersatte.

### BORTFALLET VAR KANT OCH DOKUMENTERAT
docs/stanford2010/hpr-harvester-production.md rad 220
beskriver redan MultiTreeProcessedStem som "IGNORERAS
HELT" och kallar det "en kand Lucka (Hog) for
gallring". Dokumentet noterar ocksa korrekt att
MOM-parsern hanterar MTH pa fakt_produktion-niva.

Det var alltsa inget okant fel — det var en kand
lucka vars konsekvens ingen hade matt. Uppdatera
dokumentet nar parsern ar lagad.

### HALABAECK DUGER INTE SOM FACIT FRAMAT
Halabaeck har 0 % flertradshantering och ar darfor
den ENDA trakt dar den trasiga och den lagade
parsern ger samma svar. Att verifiera en parserfix
mot Halabaeck bevisar ingenting.

Anvand i stallet, facit fore fix:

  Johan Svensson Brandeborg (objekt_id 9955)
    MOM          641 stammar   25,583 m3sub
    detalj_stam  488 stammar   (-153, 23,9 % flertrad)
    fakt_sortiment            23,187 m3sub

  Steglehylte gallring 2025 (objekt_id 11086334)
    MOM        10393 stammar  486,863 m3sub
    detalj_stam 8578 stammar   (-1815, 24,5 % flertrad)
    fakt_sortiment           458,392 m3sub

Efter fix ska detalj_stam matcha MOM:s stamantal och
fakt_sortiment matcha MOM:s volym, bada inom
avrundning. Kontrollera ocksa att Halabaeck fortfarande
ger 254 / 32,7 — den far inte forandras.

### ORDNING PA ATGARDERNA — TRE FEL, TRE GRENAR
Fel 1 (MultiTree) ar EN gren. Ta inte fel 2
(Kompersmala-dubbelrakningen) eller fel 4
(4000-stammarstaket) i samma session. De har olika
orsaker, olika risk och olika verifiering, och en
gemensam gren gor det omojligt att se vilken andring
som flyttade vilket tal.

### FEL 2 — Kompersmala Lovhuggning +81,5 % (AKTIVT)
ORSAK FASTSTALLD: dubbelraknade kumulativa filer i
fakt_sortiment.

20 av 22 sortiment har exakt 2 rader pa 2 olika datum.
detalj_stam for samma objekt har bara 1 fil.

Asymmetrin ar poangen: detalj_stam och detalj_stock
har UNIQUE-nycklar och UPSERT:ar, sa kumulativa filer
skriver over varandra korrekt. fakt_sortiment saknar
motsvarande dedupe och har datum i nyckeln. Eftersom
Ponsse inte skriver ProcessingDate per stam (Bugg B
ovan) far varje kumulativ fil sitt eget sessions-
slutdatum — och da ADDERAS de i stallet for att
skriva over.

+81,5 % och inte +100 % darfor att den forsta filen
var en delmangd av den andra.

ATGARD: dedupe i fakt_sortiment enligt samma princip
som detalj_stock, eller ta bort datum ur nyckeln for
per-objekt-totaler.

### FEL 3 — tre trakter utan fakt_sortiment (INTE IMPORTFEL)
Midingstorp, Kompermala Ga och Lars Norberg Dunshultt
har NOLL HPR-filer under Behandlade. Kompermala har
14 MOM-filer men ingen HPR.

Det finns alltsa inget att importera. Ingen bugg —
men det betyder att sortimentsfordelning och all
stamdata saknas for de tre, och att kvitto eller
markagarrapport inte kan utfardas for dem.

ATGARD: ta reda pa varfor maskinen inte producerade
HPR for de tre. Ingen kodatgard.

### FEL 4 — slutavverkningens stora avvikelser (EJ KLAR)
ORSAK EJ FASTSTALLD. Annan mekanism an fel 1.

  Anna Karin Swerup  MOM 4984  detalj_stam 4076  -18,2 %
  Lonsbygd AU 2025   MOM 1079  detalj_stam  893  -17,2 %

Anna Karin Swerups senaste HPR har 0 % flertrads-
stammar, sa fel 1 forklarar det inte. Filerna ar
DELADE: ...20260525174917.hpr och ...174917_1.hpr.
Det pekar mot 4000-stammarstaket (se project-minnet
om Scorpion) och att bara en del importerats — men
det ar inte verifierat.

ATGARD: egen utredning. Rakna StemKey per delfil och
jamfor mot detalj_stam for objektet.

### OMFATTNING — inte bara gallring
                exakt lika   utan fakt_sortiment
  gallring        1 av 22          3 av 25
  slutavverkning  2 av 58          7 av 65
  grot            0 av 1           0 av 1

56 av 58 slutavverkningstrakter avviker pa volym.
14 av 58 avviker pa stamantal. Detta ar ett app-brett
problem, inte ett gallringsproblem.

### EXTRA KONTROLL — trakt_data.areal
Premissen stammer inte. INGEN vy laser
trakt_data.areal. Planeringsvyn hamtar hela
trakt_data-objektet for restriktioner men laser
arealen ur objekt.areal, precis som alla andra.
Gallringsvyn laser objekt.areal (lib/gallring.ts).

28 stammar/ha pa Halabaeck ar alltsa INTE en bugg.
Det ar sant: 254 stammar pa 9,17 ha, for att bara en
dag av trakten ar kord. Talet beskriver en pagaende
trakt, inte en fardig.

### OPALITLIG DATA TILLS ATGARD
Allt HPR-harlett ar underskattat med andelen
flertradshantering — 0 till 9 % pa volym, upp till
25 % pa stamantal:
  detalj_stam, detalj_stock, fakt_sortiment,
  hpr_stammar, hpr_filer.stammar_count

fakt_produktion (MOM) ar KORREKT och opaverkad. Allt
som raknas darifran — volym, stammar, medelstam,
gallringsvyns huvudtal — star kvar.

Dgv och diameterhistogram i gallringsvyn ar berak-
nade pa de enkeltradade stammarna. De klenaste
saknas systematiskt, sa Dgv ar for HOGT. Halabaeck ar
opaverkad (0 % multi).

### KONSEKVENS FOR DET SOM VANTAR
Tradpositioner i gallringsvyn steg 2, kartan pa
kvittot och punktvalet i matappen bygger alla pa
detalj_stam. Med fel 1 okorrigerat blir varje
flertradshanterad grupp ett hal i kartan — och i
gallring ar det just de klena partierna som saknas.
Kartan skulle visa gles gallring dar det gallrats
hardast.

Kranvinkeldata samlas dagligen. Varje dag med
flertradshantering samlar ofullstandig data, och det
gar inte att rekonstruera i efterhand utan
omimport ur HPR-filerna.
## Gallringskvitto — steg 1 (2026-08-22)

/gallring/[vo]/kvitto — dokumentet markägaren
far efter utford gallring. A4, @media print,
ingen PDF-generator och inget nytt beroende.
Anvandaren skriver ut till PDF fran webblasaren.

Sidan ar LJUS medan resten av appen ar mork.
Den ska pa vitt papper, och renderas den mork pa
skarmen vet ingen vad de far forran det ligger i
facket.

### Grinden
Knappen i objektvyn och sjalva dokumentet ar
bada gejtade pa dim_objekt.skordning_avslutad.

objekt.avslutad_timestamp vore det naturliga
valet men ar satt pa NOLL av 34 gallringstrakter
(faktisk_slut likasa) — en grind pa det faltet
hade gomt funktionen helt. skordning_avslutad ar
maskinens eget slutdatum ur StanForD och finns
pa 26 av 37.

Dokumentet skriver ut att det avser avslutad
SKORDNING. Skotningen kan paga, och en markagare
som ser virke kvar vid vag ska forsta varfor.

Halabaeck har inget avslutsdatum — den startade
21 aug och ar inte klar. Verifieringsobjektet far
alltsa ingen knapp, och kvittosidan visar
sparrtexten i stallet for dokument. Det ar ratt
beteende: 254 stammar pa 9,17 ha ar 28 st/ha och
0,58 m2/ha uttag, alltsa en dags gallring pa en
trakt som inte ar fardig.

### KRITISKT — MOM och HPR sager olika om samma trakt
Kvittots huvudtal far ALDRIG vara summan av
sortimenten. Sortimenten kommer ur fakt_sortiment
(HPR), traktens uttag ur fakt_produktion (MOM).
De ar identiska pa 1 av 25 gallringstrakter.

  Halabaeck        32,7 mot 32,7   0,00 %
  Rossmala        651,1 mot 647,9  -0,49 %
  Steglehylte     486,9 mot 458,4  -5,85 %
  Johan Svensson   25,6 mot  23,2  -9,36 %
  Kompersmala L.  541,8 mot 983,6 +81,53 %  <-- !
  Midingstorp     309,3   fakt_sortiment SAKNAS
  Kompermala Ga   384,1   fakt_sortiment SAKNAS
  Lars Norberg     90,7   fakt_sortiment SAKNAS

Forsta bygget lat huvudtalet vara
sortimentssumman for att kolumnen skulle addera.
Det hade tryckt 0,0 m3fub pa Midingstorps kvitto
— en trakt som avverkat 309 m3. Nu ar huvudtalet
fakt_produktion (samma tal som gallringsvyn) och
dokumentet skriver ut i klartext nar sortimenten
inte tacker uttaget.

HPR ligger systematiskt lagre, vilket luktar
kumulativ-fil-dedupe (jfr CLAUDE.md: anvand bara
filen med hogst stammar_count per objekt).
Kompersmala Lovhuggning ligger 81 % for HOGT och
ser ut som dubbelraknade kumulativa filer. Bada
ar OUTREDDA och egen uppgift.

### KVAR — grundyteblocket
Plan fore / uttag / kvar gar inte att bygga.
Planens ingangsvarde finns inte lagrat:
objekt.trakt_data bar bara areal/volym/beraknad,
och lib/skoglig-berakning.ts raknar visserligen
grundyta m2/ha ur SLU:s laserdata (band 2) men
resultatet lever bara i React-state i
planeringsvyn.

Beslut 2026-08-22: ny kolumn
objekt.grundyta_fore_m2ha, fylls MANUELLT ur
stamplingslangd eller traktdirektiv. SLU-vardet
duger inte — det ar fran skanningsdatum, bar
tillvaxt sedan dess och ar inte markagarens eget
tal. Kvittots poang ar att utga fran siffran i
hans plan som han redan accepterat.

Migration + block gors i EGEN GREN. Inget skapat
i databasen i den har sessionen.

### FALLA — trakt_data.areal ar en platshallare
objekt.trakt_data.areal ar 2 for SAMTLIGA 51
objekt. Riktig areal ligger i objekt.areal
(Halabaeck 9,17 ha, Rossmala 23,2 ha). Laser man
fel falt blir varje per-hektar-tal fel med en
faktor fyra till femton.

### Saknas i schemat
"Avdelning" finns inte som begrepp nagonstans i
kodbasen — utelamnat ur kvittot. vo_nummer och
kontraktsnummer bar SAMMA varde pa Halabaeck
(11219961), sa kontraktsraden trycks bara nar den
skiljer sig fran VO. traktnr ar 886311.

### Verifierat
Dataskiktet mot facit (Halabaeck): 254 stammar,
Dgv 178 mm, 32,7 m3fub, stamandel Tall 55 / Gran
25 / Bjork 13 / Ovrigt lov 7 % — samtliga exakt.
Volymandelen 61/24/10/5 skiljer sig som den ska,
och basen star utskriven i bada dokumenten.

Renderat inloggat pa Rossmala Ga 2026: hela
dokumentet, ratt farger (gran gron, bjork VIT med
kontur, ovrigt lov gra, tall orange), tackningsrad
nar sortimenten inte gar ihop, ren konsol.

INTE okulargranskad: sjalva A4-layouten och
utskriftsresultatet. Browser-panelen komponerade
inte (innerWidth 0), sa matten gick inte att lasa.
Behover ett oga pa print preview.

## PAGINERINGSBUGGEN 2026-08-24

.range()-paginering med en sorteringsnyckel som inte
ar unik ger DUBBLETTER och SAKNADE rader samtidigt.
Radantalet blir ratt, innehallet fel — darfor syns
det inte som ett uppenbart fel.

Upptackt i gallringsvyn: Bjorn Martinsson visades som
21 817 stammar / 941,3 m3 mot MOM:s 22 023 / 950,4.
Matning av vyns egen hamtning:

  1044 rader hamtade · 1028 unika id
  16 DUBBLETTER som maskerade 16 SAKNADE rader

lib/gallring.ts sorterade fakt_produktion pa
(objekt_id, datum). 62 rader delar samma datum, och
objektet passerar sidgransen vid 1000. Vid gransen
returneras vissa rader tva ganger medan andra hoppas
over. Det slog till forst nar flertradsstammarna kom
in och gallringsdatat passerade 1000 rader.

### INVENTERING — hela appen
67 .range()-anrop i 31 filer. Efter avdrag for
engangsanrop och de som redan har unik nyckel:

  41 direkta .from(tabell)     FIXADE
   4 RPC-paginering            KVAR, kraver beslut
  10 generiska hjalpare        KVAR, kraver beslut

Fixen: tabellens unika nyckel laggs SIST i
sorteringen, sa befintlig ordning behalls och bara
oavgjorda lagen bryts. dim_*-tabellerna saknar id men
har egna unika nycklar (objekt_id, operator_id,
maskin_id, sortiment_id).

Varst drabbad var markagarrapporten:
lib/markagarrapport/aggregate.ts paginerade
hpr_stammar, detalj_stock OCH detalj_stam HELT UTAN
.order(). Utan ORDER BY ger Postgres ingen
ordningsgaranti alls. Det ar kunddokumentet.

### KVAR — kraver beslut per anropare
RPC-paginering (4): .rpc(...).range(...) kan inte fa
en tiebreaker utifran pa samma satt. Sorteringen
maste in i SQL-funktionen eller anropet gores om.
  lib/maskinvy/skotarvolym.ts:49
  app/maskinvy/IdagNy.tsx:167
  app/maskinvy/OversiktShared.tsx:264 och :280

Generiska hjalpare (10): tar en fardig query eller
ett tabellnamn som parameter, sa nyckeln maste komma
fran anroparen. fetchAllRows i lib/ekonomi/period.ts
ar den mest anvanda.
  lib/ekonomi/period.ts:55, lib/hpr/objekt-data.ts:12
  och :38, app/datahalsa/useDatahalsa.ts:144,
  app/maskinvy/OversiktShared.tsx:260 och :261,
  app/oversikt/page.tsx:55,
  app/redigering/hooks/useFildata.ts:174,
  app/redigering/hooks/useMatchning.ts:74,
  app/uppfoljning/hooks/useUppfoljningList.ts:42

### VERIFIERAT
Bjorn Martinsson i gallringsvyn: 21 817 -> 22 023
stammar och 941,3 -> 950,4 m3fub, exakt MOM:s facit.
Listans huvudtal 6 638,0 -> 6 647,1.

tsc: 551 fel bade fore och efter, radagnostisk
jamforelse ger NOLL nya. (Forsta korningen svarade
"0 fel" — worktreen saknade node_modules och npx
korde en stub, inte tsc. Se minnet om det.)

Bygget gront. Samtliga 41 andrade queries testade
direkt mot databasen. Fetch-falla genom hela flodet
hem -> gallring: noll misslyckade anrop.

## HPR_STAMMAR-BUGGEN 2026-08-24 — FIXAD

_save_hpr_tables byggde raderna med VILLKORLIGA
nycklar: dbh, lat, lng, antal_stockar och total_volym
lades bara till nar de fanns. En batch som blandade
stammar med och utan de falten avvisades av PostgREST
med 400 PGRST102 "All object keys must match", och
HELA batchen foll — 500 rader per traff.

Syntes inte forran skala. Vid pilotens 641 stammar
rymdes allt i tva likformiga batchar. Vid Bjorn
Martinssons 12 936 slog det till 19 ganger:
hpr_stammar fick 21 286 rader mot 21 786 forvantade.

FIX: nyckeln skrivs alltid, saknat varde blir NULL.
Vardesemantiken ar oforandrad — falsy lat/lng/
antal_stockar (inklusive 0) blev tidigare utelamnade
och blir nu NULL, vilket ar samma sak for lasaren.

VERIFIERAT mot filen som fallde importen (Bjorn
Martinsson, 11 402 stammar, 23 batchar):
  gammal kod: 1 av 23 batchar blandade nycklar
  ny kod:     0 av 23
  varden som skiljer: 0

### KVAR — hpr_stammar for Bjorn Martinsson ar ofullstandig
De 500 tappade raderna kom aldrig in. Objektet har
21 286 rader dar det ska ha 21 786. En omkorning av
HPR-sparningen for objektet behovs, men ar INTE gjord.

## MARKAGARRAPPORTEN — SPARBARHET FORE #466

lib/markagarrapport/aggregate.ts paginerade
hpr_stammar, detalj_stock OCH detalj_stam HELT UTAN
.order() fram till #466 (mergad 2026-08-24).

Utan ORDER BY ger Postgres INGEN ordningsgaranti.
Konsekvensen ar inte bara "fel ordning" — sidorna kan
overlappa och hoppa fritt, sa en rapport kan ha
innehallit GODTYCKLIGA rader: samma stam raknad tva
ganger, andra stammar helt utelamnade. Volym,
stamantal, sortimentsfordelning och virkesvarde kan
alla vara fel, at bada hallen.

Objekt storre an 1000 rader i nagon av de tre
tabellerna ar berorda — det ar de flesta. Halabaeck
har 704 stockar och klarade sig; Husjonas har 1 349
stammar och gjorde det inte.

ATGARD: om nagon markagarrapport har GATT UT till en
markagare bor den kunna spåras och rakans om mot
nuvarande kod. Det ar ett kunddokument med
virkesvarde i kronor. Vi vet inte idag vilka rapporter
som genererats eller skickats — det finns ingen logg
over utfardade rapporter. Bor utredas.

Facit att stamma av mot finns hogre upp i filen:
Husjonas (objekt_id 11124938) = 1 349 stammar,
678 m3sub, 433 163 kr.

## SAKNAS — LOGG OVER UTFARDADE MARKAGARRAPPORTER

Det finns ingen registrering av vilka markagarrapporter
som genererats eller skickats. Vyn
/admin/markagarrapport/[objekt_id] renderar pa
begaran och lamnar inga spar.

Det blev akut i och med pagineringsbuggen (#466):
aggregate.ts paginerade tre tabeller UTAN .order(), sa
rapporter fore 2026-08-24 kan ha innehallit godtyckliga
rader — inte bara fel ordning. Fragan "vilka rapporter
har gatt ut, och till vem" gar inte att besvara idag.
Utan logg kan vi varken sparbara eller ratta.

### Enklaste losningen — EN rad per generering
Ny tabell markagarrapport_logg, en rad varje gang en
rapport oppnas eller exporteras:

  id                uuid
  objekt_id         text        vilket objekt
  utfardad          timestamptz nar
  utfardad_av       uuid        medarbetare.id
  mottagare         text        markagarens namn, fritext
  -- talen SOM RAPPORTEN VISADE, frusna:
  stammar           int
  volym_m3sub       numeric
  virkesvarde_kr    numeric
  vardeforlust_kr   numeric
  -- sparbarhet bakat:
  kodversion        text        BUILD_SHA
  underlag_filnamn  text[]      hpr-filerna rapporten byggde pa

Poangen ar de FRUSNA talen. Att veta att en rapport
utfardades racker inte — man maste kunna se VAD den
sa, for att kunna jamfora mot en omrakning och avgora
om markagaren fick fel siffror. Kodversionen gor att
man kan skilja rapporter genererade fore #466 fran
efter.

Skrivningen bor ske nar rapporten faktiskt lamnar
huset (export/utskrift), inte vid varje sidladdning —
annars fylls loggen av egna kontroller. Enklast:
knappen som genererar PDF:en skriver raden.

INTE BYGGD. Beskrivningen finns har for att beslutet
ska kunna tas utan att utreda om igen.

Uppdatera denna fil vid varje commit.


## Datakorrigeringar i prod (direkt SQL, godkända av Martin)

### 2026-10-19 — Kroksjömåla-dubbletter (objekt_id `11155842`)
Rester från när appen byggdes upp. Raderat direkt i prod med Martins godkännande, i en sats: 12 `fakt_lass` (153 m³sob, alla exakta kopior av lass under annat objekt_id: samma maskin, datum, lass_nummer, lossningstid, volym och fil), 40 `fakt_lass_sortiment` (alla med exakt tvilling under det riktiga objektet `11251460`), 10 `fakt_skotning_status` och 1 `dim_objekt`. Efteråt: noll rader kvar under `11155842`, `11251460` oförändrat (25 lass). **Ångra:** `docs/data-korrigeringar/2026-10-19_kroksjomala_11155842_angra.sql` (INSERT-satser med radernas exakta innehåll, en transaktion).
