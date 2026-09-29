-- STEG 5: granskningen. Fyra additiva ändringar i en fil.
-- Martin kör i Supabase SQL editor. Idempotent.
--
-- ─────────────────────────────────────────────────────────────────────────
-- NÄR DEN HÄR FÅR KÖRAS — GRINDAD PRODUKTION (#602)
--
-- Databasen har ingen gren. En migration syns direkt för ALLA, oavsett
-- vilken kodversion förarna kör, medan `production` förs fram först när
-- allt kontrollerats. Mellanrummet mellan databas och kod blir därför
-- LÄNGRE med grinden, inte kortare.
--
--   TILLÄGG — nya tabeller, nya nullbara kolumner, utökade CHECK-listor —
--   körs när PR:en är mergad. Tidigt är alltid säkert: en äldre klient som
--   inte känner till 'granskat' eller 'uppskjuten' slutar inte fungera av
--   att värdena blir tillåtna.
--
--   BORTTAGNINGAR och SKARPARE CONSTRAINTS väntar tills koden är ute till
--   ALLA förare. Samma resonemang som när acord_flyttkostnad droppades:
--   kod först, migration sedan.
--
-- ALLT I DEN HÄR FILEN ÄR TILLÄGG. Två nya tabeller och två utökade
-- CHECK-listor. Inget fält blir smalare, inget värde slutar vara tillåtet.
-- ─────────────────────────────────────────────────────────────────────────


-- ═══ 1. faktura_underlag: tillståndet 'granskat' ═════════════════════════
--
-- utkast → granskat → skickat. Det är granskningen som hindrar att samma
-- volym faktureras två gånger: utan ett tillstånd mellan "räknat fram" och
-- "iväg" finns ingen tidpunkt då någon tagit ansvar för talen.
--
-- granskad_tid paras i CHECK precis som skickad_tid redan är. Ett tillstånd
-- utan tidpunkt är ett påstående ingen kan kontrollera.

alter table faktura_underlag drop constraint if exists faktura_underlag_status_check;
alter table faktura_underlag add constraint faktura_underlag_status_check
  check (status in ('utkast', 'granskat', 'skickat', 'makulerat'));

alter table faktura_underlag
  add column if not exists granskad_tid timestamptz,
  add column if not exists granskad_av  uuid;

comment on column faktura_underlag.granskad_tid is
  'När underlaget granskades. Krävs för status granskat och skickat — ett '
  'skickat underlag har per definition passerat granskningen. Förbjuden på '
  'utkast: ett utkast är inte granskat, och en tidpunkt där hade sagt '
  'motsatsen.';

-- Krävs för granskat OCH skickat. Ett skickat underlag som aldrig granskats
-- vore ett hål i hela kedjan.
do $$ begin
  alter table faktura_underlag add constraint underlag_granskat_kraver_tid
    check (granskad_tid is not null or status not in ('granskat', 'skickat'));
exception when duplicate_object then null; end $$;

-- Och förbjuden på utkast.
do $$ begin
  alter table faktura_underlag add constraint underlag_utkast_ej_granskat
    check (status <> 'utkast' or granskad_tid is null);
exception when duplicate_object then null; end $$;

-- makulerat lämnas fritt med flit: ett underlag kan makuleras både före och
-- efter granskning, och att tvinga fram ett svar hade gjort tillståndet
-- otillgängligt i det ena fallet.


-- ═══ 2. faktura_manuell_rad ══════════════════════════════════════════════
--
-- Manuella rader är INGEN undantagsfunktion: 54 stycken på 39 av 116
-- fakturor, 164 398 kr. Fällning ensam står för 24. Var tredje faktura har
-- en, så den byggs som en vanlig väg.
--
-- Raderna bor PER VO och överlever att underlaget räknas om. Det är hela
-- poängen med modell A: fakturaraderna byggs alltid på nytt ur källan, så
-- allt som en människa lagt till måste ligga bredvid källan — aldrig i
-- faktura_rad, som skrivs om vid varje omräkning.

create table if not exists faktura_manuell_rad (
  id           uuid primary key default gen_random_uuid(),
  foretag_id   text not null default 'kompersmala',
  vo_nummer    text not null,

  ordning      integer not null default 0,
  benamning    text not null,
  antal        numeric,
  enhet        text check (enhet in ('h', 'km', 'kr', 'm3fub', 'st')),

  -- Manuella rader bär SITT EGET belopp. De är per definition sådant appen
  -- inte kan räkna fram: fällning som lejts in, GROT-skotning, papp, en
  -- bedömning. prisagare följer faktura_rad: 'leverantor' när beloppet
  -- kommer från någon annans faktura, 'app' när Martin satt det själv.
  prisagare    prisagare_t not null default 'leverantor',
  a_pris       numeric,

  kalla        faktura_kalla_t not null default 'manuell',
  kommentar    text,

  skapad_tid   timestamptz not null default now(),
  skapad_av    uuid,

  -- Samma kärnregel som faktura_rad: bara leverantörsrader får bära belopp.
  -- Utan den kan ett uträknat pris smyga in här i stället, och då är
  -- acord_flyttkostnad återuppfunnen en tabell bort.
  constraint manuell_pris_agare check (a_pris is null or prisagare = 'leverantor'),
  constraint manuell_benamning_ej_tom check (length(btrim(benamning)) > 0)
);

-- INGEN FK mot faktura_vo. Manuella rader skrivs under GRANSKNINGEN, innan
-- något underlag sparats — en FK hade krävt att faktura_vo fanns först och
-- gjort inmatningen beroende av en rad ingen bett om. Ett vo-nummer utan
-- motsvarighet ska YTAS i granskningen, inte blockera skrivningen. Samma
-- val som dim_objekt.bolag.
create index if not exists ix_faktura_manuell_rad_vo
  on faktura_manuell_rad (foretag_id, vo_nummer, ordning);

comment on table faktura_manuell_rad is
  'Rader Martin lägger till för hand: fällning, GROT-skotning, papp, egna '
  'bedömningar. 54 sådana på 39 av 116 historiska fakturor — en vanlig väg, '
  'inte ett undantag. Ligger PER VO och överlever att fakturaraderna räknas '
  'om ur källan. Ingen FK mot faktura_vo: raderna skrivs under granskningen, '
  'innan något underlag sparats.';


-- ═══ 3. faktura_rad_val ══════════════════════════════════════════════════
--
-- Mänskliga val på en GENERERAD rad: en ändrad benämning, en rad som
-- skjutits upp, en kommentar. Raderna byggs om vid varje visning, så valen
-- måste ligga bredvid — inte i faktura_rad.

create table if not exists faktura_rad_val (
  foretag_id   text not null default 'kompersmala',
  vo_nummer    text not null,

  -- NYCKELN, OCH FÖRUTSÄTTNINGEN DEN VILAR PÅ:
  --
  --   (vo_nummer, kalla, kalla_id) pekar ut exakt en genererad rad, SÅ LÄNGE
  --   ackordraderna är EN PER ROLL och flyttraderna bär sitt flytt-id.
  --
  -- Ackordraderna har kalla_id NULL (de hör till hela VO:t, inte till en
  -- källrad) och skiljs åt av kalla: 'ackord_skordning' mot
  -- 'ackord_skotning'. Flyttraderna delar kalla men har var sitt kalla_id.
  --
  -- ⚠️ BRYTS DEN FÖRUTSÄTTNINGEN SPRICKER KOPPLINGEN TYST. Blir ackordet en
  -- rad per MASKIN i stället för per roll — två skotare på samma trakt —
  -- pekar nyckeln på två rader och valet hamnar på fel. Ändras det måste
  -- nyckeln ändras i samma andetag.
  kalla        faktura_kalla_t not null,
  -- Tom sträng, inte NULL: en primärnyckel tål inte NULL, och '' säger
  -- uttryckligen "raden hör till VO:t, inte till en enskild källrad".
  kalla_id     text not null default '',

  /** Överskriven radtext. NULL = använd den genererade. */
  benamning    text,
  /**
   * UPPSKJUTEN ÄR INTE SAMMA SAK SOM ATT VÄNTA PÅ EN LEVERANTÖR.
   * Uppskjuten är ett VAL: raden tas inte med nu utan flyttas till
   * slutredovisningen. Den blockerar därför INTE underlaget.
   * vantar_leverantorsfaktura är ett TILLSTÅND som ingen valt.
   */
  uppskjuten   boolean not null default false,
  kommentar    text,

  andrad_tid   timestamptz not null default now(),
  andrad_av    uuid,

  primary key (foretag_id, vo_nummer, kalla, kalla_id)
);

comment on table faktura_rad_val is
  'Mänskliga val på en genererad fakturarad: ändrad benämning, uppskjuten, '
  'kommentar. Fakturaraderna räknas alltid om ur källan (modell A), så valen '
  'ligger bredvid i stället för i faktura_rad. FÖRUTSÄTTNING FÖR NYCKELN: '
  '(vo_nummer, kalla, kalla_id) pekar ut exakt EN rad så länge ackordraderna '
  'är en per ROLL och flyttraderna bär sitt flytt-id. Blir ackordet en rad '
  'per maskin spricker kopplingen tyst — då måste nyckeln ändras samtidigt.';

comment on column faktura_rad_val.uppskjuten is
  'Raden tas inte med nu utan flyttas till slutredovisningen. Ett VAL, och '
  'det blockerar INTE underlaget. Skilt från faktura_rad.status '
  'vantar_leverantorsfaktura, som är ett tillstånd ingen valt.';


-- ═══ 4. faktura_rad.status: 'uppskjuten' ═════════════════════════════════
--
-- Tre saker som kräver olika handling får inte se likadana ut:
--
--   fel                        blockerar HELA underlaget
--   vantar_leverantorsfaktura  blockerar inte — beloppet har inte kommit
--   uppskjuten                 blockerar inte — Martin har valt bort raden
--
-- Skillnaden mellan de två sista är vems beslut det är. Ett gemensamt
-- "kommer senare" hade dolt att den ena går att göra något åt.

alter table faktura_rad drop constraint if exists faktura_rad_status_check;
alter table faktura_rad add constraint faktura_rad_status_check
  check (status in ('klar', 'vantar_leverantorsfaktura', 'uppskjuten', 'fel'));

comment on column faktura_rad.status is
  'klar · vantar_leverantorsfaktura · uppskjuten · fel. ENDAST fel blockerar '
  'underlaget. vantar_leverantorsfaktura = beloppet har inte kommit från '
  'underleverantören; uppskjuten = Martin har valt bort raden och den '
  'flyttas till slutredovisningen. Två olika saker som inte får se likadana '
  'ut — skillnaden är vems beslut det är.';


-- ═══ 5. RLS på de två nya tabellerna ═════════════════════════════════════
--
-- Ekonomidata är admin-only, exakt samma mönster som faktura_vo,
-- faktura_underlag och faktura_rad (#565). Ingen ny modell — en tabell som
-- glöms utan RLS är öppen för varje inloggad förare, och det syns inte
-- förrän någon letar.

alter table faktura_manuell_rad enable row level security;
alter table faktura_rad_val     enable row level security;

drop policy if exists faktura_manuell_rad_admin on faktura_manuell_rad;
create policy faktura_manuell_rad_admin on faktura_manuell_rad
  for all to authenticated using (ar_admin()) with check (ar_admin());

drop policy if exists faktura_rad_val_admin on faktura_rad_val;
create policy faktura_rad_val_admin on faktura_rad_val
  for all to authenticated using (ar_admin()) with check (ar_admin());


-- ── Kvitto ──────────────────────────────────────────────────────────────
-- Förväntat: fyra tillstånd på underlaget, fyra på raden, två nya tabeller,
-- och noll rader i allt (ingenting har fakturerats ur appen än).
select 'underlag_status' as vad, pg_get_constraintdef(oid) as definition
  from pg_constraint where conname = 'faktura_underlag_status_check'
union all
select 'rad_status', pg_get_constraintdef(oid)
  from pg_constraint where conname = 'faktura_rad_status_check'
union all
select 'granskat_kraver_tid', pg_get_constraintdef(oid)
  from pg_constraint where conname = 'underlag_granskat_kraver_tid'
union all
select 'utkast_ej_granskat', pg_get_constraintdef(oid)
  from pg_constraint where conname = 'underlag_utkast_ej_granskat'
union all
select 'nya_tabeller', string_agg(table_name, ', ' order by table_name)
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('faktura_manuell_rad', 'faktura_rad_val');
