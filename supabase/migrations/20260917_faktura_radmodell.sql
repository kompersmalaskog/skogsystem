-- Fakturaunderlagets radmodell — tre tabeller: faktura_vo, faktura_underlag,
-- faktura_rad. Martin kör i Supabase SQL editor. Idempotent.
--
-- ─────────────────────────────────────────────────────────────────────────
-- PRINCIPEN: VARJE PRIS HAR EXAKT EN ÄGARE, OCH ÄGAREN ÄR DEN SOM HAR
-- UNDERLAGET. Martin ska se HELA fakturan innan han skickar — antal, à-pris,
-- radsumma — men appen får aldrig LAGRA ett pris den inte äger. VISA JA,
-- LAGRA NEJ. Det var acord_flyttkostnads fel (borttagen i #423): en egen
-- kopia på 3 000 kr som inte visste om Fortnox ändrades.
--
-- ⚠️ fortnox_invoice_rows.price ÄR INTE EN PRISLISTA. 572 rader historiska
-- fakturapriser som SER UT som en. De säger vad som fakturerades DÅ, inte vad
-- som gäller NU. Läser någon à-pris därifrån har acord_flyttkostnad
-- återuppstått utan att en tabell skapades. Tabellens enda legitima
-- användning är att visa vad som faktiskt skickades på en redan skickad
-- faktura — då är den Fortnox egen post, inte appens kopia.
-- Samma varning står i lib/lonesystem/fortnox.ts-huvudet (#430).
--
-- RADSUMMA OCH TOTALSUMMA LAGRAS ALDRIG. De räknas vid visning, av samma
-- kodväg som sändningen använder (#433-mönstret: granskningen läser dry_run,
-- sändningen itererar exakt samma resultat — två uträkningar kan glida isär).
-- ─────────────────────────────────────────────────────────────────────────
--
-- NAMNEN: prefixet är faktura_*, INTE fakturaunderlag_*. Det finns redan en
-- fakturaunderlag_flytt (#559) och den är INGEN förälder till de här — den är
-- en KÄLLA. En flytt som är fakturerbar och inte struken blir en faktura_rad
-- med kalla='flytt' och kalla_id = fakturaunderlag_flytt.id. Hade den nya
-- huvudtabellen hetat fakturaunderlag hade var och en läst flytt-tabellen som
-- dess barn, vilket den inte är.

-- ── 0. Domäner: EN taxonomi per begrepp, aldrig två CHECK-listor att hålla i
--       synk (läxan från aktivitet_typ_t i 20260814_arbetsdag_segment).

do $$ begin
  create domain prisagare_t as text
    check (value in ('fortnox','app','leverantor'));
exception when duplicate_object then null; end $$;

comment on domain prisagare_t is
  'fortnox = à-pris HÄMTAS live ur artikelregistret, lagras aldrig (art 3/5/6). '
  'app = à-pris RÄKNAS ur acord_*/maskin_timpris (art 1/2/7/11/12). '
  'leverantor = à-pris SKRIVS IN per tillfälle ur leverantörsfakturan (art 9) — '
  'enda typen som lagrar belopp, och det är rätt eftersom det inte finns någon '
  'annanstans. Ingen kopia av en sats, en uppgift om en enskild händelse.';

do $$ begin
  create domain faktura_kalla_t as text
    check (value in ('ackord_skordning','ackord_skotning','slutredovisning',
                     'timpeng_skordare','timpeng_skotare','flytt','traillerflytt',
                     'kront','manuell_fallning','planering','kontraktsnr','manuell'));
exception when duplicate_object then null; end $$;

-- ── 1. faktura_vo — trakten som FÖRLOPP.
--    Nycklad på VO_NUMMER, inte objekt_id: fem VO har två objekt_id (samma
--    trakt sedd från skördaren respektive skotaren, t.ex. P-1012 = 85845 +
--    A030353_149). Läggs andelen på dim_objekt kan de två raderna säga emot
--    varandra. Noll objekt saknar vo_nummer, så nyckeln är fullständig.

create table if not exists faktura_vo (
  foretag_id         text not null default 'kompersmala',
  vo_nummer          text not null,

  -- À conto: golv(volym × andel / 10) × 10. Andelen varierar (80/90).
  a_conto_andel      numeric not null default 90
                     check (a_conto_andel > 0 and a_conto_andel <= 100),

  -- Inmätt volym från kunden. Slutredovisning = inmätt MINUS redan fakturerat,
  -- aldrig "10 % av skördarens volym". Negativ differens = kreditering.
  -- VARIFRÅN siffran kommer är ÖPPET (avräkning som PDF, portal, fil, manuellt)
  -- — tills det är besvarat är detta ett fält, inte en integration.
  inmatt_volym_m3fub numeric,
  inmatt_kalla       text,
  inmatt_datum       date,

  kommentar          text,
  uppdaterad_tid     timestamptz not null default now(),

  primary key (foretag_id, vo_nummer)
);

comment on table faktura_vo is
  'Per trakt (VO): à conto-andel och inmätt volym. Förloppets läge — ej '
  'fakturerat → à conto skickat → väntar på inmätning → slutredovisat — '
  'HÄRLEDS ur faktura_underlag + inmatt_volym_m3fub och lagras aldrig som '
  'egen kolumn. En siffra, en plats.';

-- ── 2. faktura_underlag — ETT faktureringstillfälle för en trakt.
--    Månaden är ett FILTER, inte en indelning: en trakt kan ha à conto i
--    augusti och slutredovisning i november, och båda hör till samma förlopp.

create table if not exists faktura_underlag (
  id              uuid primary key default gen_random_uuid(),
  foretag_id      text not null default 'kompersmala',
  vo_nummer       text not null,
  typ             text not null check (typ in ('a_conto','slutredovisning')),
  status          text not null default 'utkast'
                  check (status in ('utkast','skickat','makulerat')),
  avser_fran      date,
  avser_till      date,

  -- Fortnox-fakturan underlaget blev. REFERENS, ALDRIG ETT BELOPP. Vad som
  -- faktiskt skickades läses tillbaka ur fortnox_invoice_rows via detta
  -- nummer — appen blir aldrig källa till ett pris, inte ens historiskt.
  -- ⚠️ matched_objekt_id/manual_objekt_id är TOMMA på alla 572 befintliga
  -- rader, så de 95 HISTORISKA fakturorna går inte att koppla till objekt.
  -- Bara underlag skapade härefter kan läsa tillbaka sitt eget belopp.
  document_number integer,
  skickad_tid     timestamptz,

  skapad_tid      timestamptz not null default now(),
  skapad_av       uuid references medarbetare(id) on delete set null,
  kommentar       text,

  constraint underlag_skickat_kraver_tid
    check ((status = 'skickat') = (skickad_tid is not null)),
  -- Ett dokumentnummer utan skickat underlag vore ett belopp utan faktura.
  constraint underlag_doknr_bara_skickat
    check (document_number is null or status = 'skickat'),
  -- Redundant i sig (id är PK) men KRÄVS som mål för faktura_rads sammansatta
  -- FK. Den gör det omöjligt för en rad att bära ett annat företag än sitt
  -- underlag. Idag har alla rader samma värde och det spelar ingen roll —
  -- kolumnen finns för dagen då det inte är så, och då är det för sent att
  -- upptäcka att de kunnat glida isär.
  constraint underlag_id_foretag_unik unique (id, foretag_id),
  foreign key (foretag_id, vo_nummer) references faktura_vo (foretag_id, vo_nummer)
);

create index if not exists ix_faktura_underlag_vo
  on faktura_underlag (foretag_id, vo_nummer, typ, status);

-- ── 3. faktura_rad — en fakturarad.

create table if not exists faktura_rad (
  id           uuid primary key default gen_random_uuid(),
  foretag_id   text not null default 'kompersmala',
  underlag_id  uuid not null,
  radnr        integer not null,

  artikelnr    text,           -- Fortnox artikelnummer. NULL = rad utan artikel.
  benamning    text not null,
  -- NUMERIC, inte integer: en halv flytt är 0,5 st à 1 500. Priset är
  -- konstant, det är MÄNGDEN som varierar — historikens "750 × 1" var
  -- egentligen "1 500 × 0,5", bokfört för hand.
  antal        numeric,
  enhet        text check (enhet in ('h','km','kr','m3fub','st')),

  prisagare    prisagare_t not null,
  a_pris       numeric,

  -- Härledningen är en LISTA av delar, inte en sträng:
  --   [{"etikett":"Medel 0,8","belopp":null},{"etikett":"Krönt","belopp":1.5}, …]
  -- Vida får den som EGNA NOLLRADER i dokumentet (faktura 2026142 rad 7–11),
  -- så exporten skriver en textrad per del medan granskningsvyn fogar ihop
  -- dem med "·". En hopslagen sträng hade måst splittas isär vid export, och
  -- då är formatet ett kontrakt utan att någon bestämt det.
  -- Räknas fram vid visning ur acord_* — lagras här bara för den skickade
  -- radens spårbarhet, aldrig som prisunderlag.
  harledning   jsonb,

  kalla        faktura_kalla_t not null,
  kalla_id     uuid,           -- t.ex. fakturaunderlag_flytt.id (#559)

  -- 'fel' BLOCKERAR sändning av HELA underlaget. 'vantar_leverantorsfaktura'
  -- gör det INTE — den raden flyttas till nästa faktureringstillfälle.
  -- Ett objekts fakturering ska inte stoppas av en underleverantör som inte
  -- skickat sin faktura. Två olika saker som aldrig får se likadana ut.
  status       text not null default 'klar'
               check (status in ('klar','vantar_leverantorsfaktura','fel')),
  -- Tre ÅTSKILDA felstillstånd — de leder till olika åtgärder, och ett
  -- gemensamt "kunde inte hämtas" gör de två sista osynliga.
  fel_kod      text check (fel_kod in ('fortnox_svarade_inte','artikel_saknas','pris_saknas')),

  kommentar    text,
  skapad_tid   timestamptz not null default now(),

  -- KÄRNREGELN: exakt EN radtyp lagrar belopp.
  -- Utan likhetstecknet (bara "NOT NULL förbjudet för fortnox") lämnas 'app'
  -- fri, och någon sparar det uträknade ackordspriset "för bekvämlighets
  -- skull" → acord_flyttkostnad återskapad inuti radmodellen.
  constraint rad_pris_agare
    check ((prisagare = 'leverantor') = (a_pris is not null)),
  constraint rad_fel_kod
    check ((status = 'fel') = (fel_kod is not null)),
  constraint rad_radnr_unik unique (underlag_id, radnr),
  -- Sammansatt FK, inte bara underlag_id: raden kan aldrig bära ett annat
  -- foretag_id än sitt underlag. Kolumnen ligger kvar på raden (i stället för
  -- att ärvas via join) för att en framtida företagsscopad RLS-policy ska
  -- kunna jämföra en kolumn direkt — en korrelerad exists-subfråga mot
  -- föräldern per rad är både långsammare och kopplar ihop två policyer.
  constraint rad_underlag_fk
    foreign key (underlag_id, foretag_id)
    references faktura_underlag (id, foretag_id) on delete cascade
);

create index if not exists ix_faktura_rad_underlag on faktura_rad (underlag_id, radnr);
create index if not exists ix_faktura_rad_kalla    on faktura_rad (kalla, kalla_id);

comment on column faktura_rad.a_pris is
  'Ifyllt ENDAST för prisagare=leverantor (vidarefakturerad kostnad, t.ex. '
  'manuell fällning art 9 — priset varierar per underleverantör). '
  'EXKL MOMS: leverantörsfakturan är inkl och Martin drar ingående moms. '
  'Skrivs bruttot in blir raden 25 % för hög och ser rätt ut — kravet måste '
  'stå i ETIKETTEN på fältet, inte i ett antagande. Inget påslag görs, och '
  'avstämningen betalt/fakturerat jämför RADSUMMA aldrig à-pris (leverantören '
  'kan fakturera klumpbelopp eller per dag medan raden till Vida är 5 h à 490).';

comment on column faktura_rad.artikelnr is
  'Verifierat i Fortnox (räkenskapsår 2026): 1 Skördning ackord m3fub · '
  '2 Skotning ackord m3fub · 3 Traillerflytt h 1350 · 5 Flytt av maskin st 1500 · '
  '6 Krönt 1,50 · 7 Slutredovisning ackord m3fub · 8 Kontraktsnr (ingen enhet, '
  'pris 0) · 9 Manuell fällning h (tomt pris) · 10 Planering h (tomt pris) · '
  '11 Skördning timpeng h · 12 Skotning timpeng h. '
  'TIMPENGSARTIKLARNA HAR TOMT PRIS — en artikel per TJÄNST, inte per maskin. '
  'Priset kommer från maskin_timpris och maskinen identifieras av '
  'KOSTNADSSTÄLLET. Ett maskinbyte kräver därför inga nya artiklar. '
  'OBS: 0 kr är ett GILTIGT svar (art 8 är 1 st à 0) — "0 kr" och "pris kunde '
  'inte hämtas" får aldrig se likadana ut i vyn.';

-- ── 4. RLS: ekonomidata → admin-only, exakt samma mönster som
--       fakturaunderlag_flytt (#559) och ekonomitabellerna. Ingen ny modell.
--       foretag_id är FÖRBEREDELSE, inte ett skydd — alla rader har samma
--       värde, så en policy som filtrerar på den vore oprövad ställning.
--       Policyn kommer den dag det finns två värden att skilja åt.

alter table faktura_vo        enable row level security;
alter table faktura_underlag  enable row level security;
alter table faktura_rad       enable row level security;

drop policy if exists faktura_vo_admin on faktura_vo;
create policy faktura_vo_admin on faktura_vo
  for all to authenticated using (ar_admin()) with check (ar_admin());

drop policy if exists faktura_underlag_admin on faktura_underlag;
create policy faktura_underlag_admin on faktura_underlag
  for all to authenticated using (ar_admin()) with check (ar_admin());

drop policy if exists faktura_rad_admin on faktura_rad;
create policy faktura_rad_admin on faktura_rad
  for all to authenticated using (ar_admin()) with check (ar_admin());
