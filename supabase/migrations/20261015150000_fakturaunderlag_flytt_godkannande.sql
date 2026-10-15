-- fakturaunderlag_flytt: flyttar GODKÄNNS med ett tryck innan de når faktureringen.
-- Martin kör i Supabase SQL editor. Idempotent (kan köras om utan skada).
--
-- ─────────────────────────────────────────────────────────────────────────
-- MODELLEN ÄR ARBETSRAPPORTENS: systemet föreslår, en människa bekräftar.
--
-- En arbetsdag är obekräftad tills föraren trycker Stämmer. En flytt är på samma
-- sätt ogodkänd tills admin trycker Godkänn (Lastbilen › Fakturering › Att
-- godkänna). Stämmer något inte stryks flytten med anledning (status/struken_*,
-- finns sedan förut) — en flytt som aldrig godkänts kan alltså strykas direkt.
--
--   godkand_tid  NULL = ogodkänd, väntar. Satt = godkänd.
--   godkand_av   vem som tryckte (medarbetarens namn). Backfill: 'backfill 2026-10-15'.
--
-- NY RAD FRÅN TRIGGERN = OGODKÄND. Triggern skapa_fakturaunderlag_flytt() rörs
-- inte: den sätter aldrig godkand_tid, och kolumnen saknar default, så varje
-- ny rad börjar som NULL.
--
-- ─────────────────────────────────────────────────────────────────────────
-- KONTRAKTET (gäller från och med den här migrationen)
--
--   FAKTURERINGSVYN LÄSER BARA RADER MED godkand_tid IS NOT NULL.
--
-- En ogodkänd flytt finns inte för faktureringen: den syns inte i en VO:s
-- underlag, ger inget hinder i listan och räknas inte som fakturerbar. Läsarna
-- (båda läser samma tabell):
--   • lib/faktura/hamtaUnderlag.ts   — filtret `godkand_tid is not null`
--   • faktura_oversikt()             — migrationen 20261015150100
-- Ny kod som läser underlaget för fakturering ska göra detsamma. Lastbilen
-- (Fakturering-fliken och remsan) läser medvetet ALLA rader: den är platsen
-- där flyttar godkänns, och den visar ogodkända under "Att godkänna".
-- ─────────────────────────────────────────────────────────────────────────

alter table fakturaunderlag_flytt add column if not exists godkand_tid timestamptz;
alter table fakturaunderlag_flytt add column if not exists godkand_av  text;

comment on column fakturaunderlag_flytt.godkand_tid is
  'NULL = ogodkänd (väntar på admin). Satt = godkänd och därmed synlig för faktureringsvyn. '
  'Kontraktet: faktureringsvyn läser bara rader med godkand_tid satt. Nya rader från '
  'triggern är alltid NULL.';
comment on column fakturaunderlag_flytt.godkand_av is
  'Vem som godkände (medarbetarens namn). Sätts ihop med godkand_tid. '
  '''backfill 2026-10-15'' = rader som redan låg hos faktureringen när godkännandet infördes.';

-- godkand_tid och godkand_av hör ihop: båda satta eller båda NULL.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'godkand_konsistens'
       and conrelid = 'fakturaunderlag_flytt'::regclass
  ) then
    alter table fakturaunderlag_flytt
      add constraint godkand_konsistens
      check ((godkand_tid is null) = (godkand_av is null));
  end if;
end $$;

-- Backfill: raderna som redan låg hos faktureringen (aktiva, hittills inga fakturerade) är i
-- praktiken granskade — de godkänns med skapad_tid. Strukna rader lämnas: en struken flytt
-- behöver aldrig godkännas. Körs om utan effekt (bara rader som ännu är NULL).
update fakturaunderlag_flytt
   set godkand_tid = skapad_tid,
       godkand_av  = 'backfill 2026-10-15'
 where godkand_tid is null
   and status = 'aktiv';

-- Lastbilens påminnelse ("N flyttar väntar på godkännande") söker ogodkända aktiva rader.
create index if not exists ix_fakturaunderlag_flytt_ogodkanda
  on fakturaunderlag_flytt (datum)
  where godkand_tid is null and status = 'aktiv' and fakturerad_tid is null;

-- ── Kvitto ──────────────────────────────────────────────────────────────
-- Förväntat idag (före första nya flytten): rader 8, godkända 8, ogodkända 0, strukna 0.
select count(*)                                                   as rader,
       count(*) filter (where godkand_tid is not null)            as godkanda,
       count(*) filter (where godkand_tid is null and status = 'aktiv') as ogodkanda,
       count(*) filter (where status = 'struken')                 as strukna,
       count(*) filter (where godkand_tid is not null and godkand_av is null) as inkonsekventa
from fakturaunderlag_flytt;

-- ── Ångra ───────────────────────────────────────────────────────────────
-- drop index if exists ix_fakturaunderlag_flytt_ogodkanda;
-- alter table fakturaunderlag_flytt drop constraint if exists godkand_konsistens;
-- alter table fakturaunderlag_flytt drop column if exists godkand_av, drop column if exists godkand_tid;
-- (Gör först om faktura_oversikt() och hamtaUnderlag.ts, som läser godkand_tid.)
