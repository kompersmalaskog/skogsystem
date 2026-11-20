-- fakt_skift: ett befintligt pass kan bara UTÖKAS (tidigaste inloggning, senaste utloggning) — databasen vaktar det själv.
--
-- Bakgrund: R64428 2026-10-12 (Oskar). Passet 07:04–15:14 blev 13:49–14:52 när Sandåsen-filen (exporterad 2026-10-14, bär
-- bara Sandåsens del av dagen) importerades, och arbetsdagen blev 45 min i stället för 471. Importens sammanslagning
-- (skogsmaskin_import_version_6.py, sla_ihop_skift_kuvert) gör redan min/max, men var "best effort": kunde den befintliga
-- raden inte läsas skrev upserten filens egna tider rakt över. Importen är rättad (en rad vars befintliga pass inte kan
-- läsas skrivs inte alls) — den här triggern är andra spärren, så att ingen framtida skrivväg (annat skript, handskriven
-- SQL, ny importversion) kan krympa ett mätt pass.
--
-- Regler vid UPDATE (inklusive INSERT … ON CONFLICT DO UPDATE, som PostgREST:s merge-duplicates gör):
--   inloggning_tid          kan bara gå TIDIGARE   (en senare eller tom inloggning ersätts av den gamla)
--   maskin_inloggning_tid   kan bara gå tidigare, och tappas aldrig till NULL
--   utloggning_tid          kan bara gå SENARE     (en tidigare eller tom utloggning ersätts av den gamla)
--     UNDANTAG: ett syntetiskt (Rottne, shift_key 'SYN_…') pass får kortas till en annan förares inloggning på samma
--     maskin och dag (±1 s) — det är kapningen från #737 (R64428 2026-10-07: Oskar fick Martins utloggning 20:50).
--   langd_sek               räknas om till spännet när en tid ersatts.
--
-- Medvetet underhåll (en enstaka rättning som SKA förkorta ett pass): i samma transaktion,
--   select set_config('app.skift_tillat_andring', 'on', true);
-- före UPDATE. Inställningen gäller bara den transaktionen.
--
-- Additiv: ingen kolumn, inget data ändras. INSERT berörs inte. Ångra: drop trigger fakt_skift_bara_utoka on fakt_skift;

create or replace function public.fakt_skift_bara_utoka()
returns trigger
language plpgsql
as $$
declare
  ersatt boolean := false;
  annan  boolean;
begin
  if coalesce(current_setting('app.skift_tillat_andring', true), '') = 'on' then
    return new;
  end if;

  if old.inloggning_tid is not null
     and (new.inloggning_tid is null or new.inloggning_tid > old.inloggning_tid) then
    new.inloggning_tid := old.inloggning_tid;
    ersatt := true;
  end if;

  if old.maskin_inloggning_tid is not null
     and (new.maskin_inloggning_tid is null or new.maskin_inloggning_tid > old.maskin_inloggning_tid) then
    new.maskin_inloggning_tid := old.maskin_inloggning_tid;
  end if;

  if old.utloggning_tid is not null
     and (new.utloggning_tid is null or new.utloggning_tid < old.utloggning_tid) then
    annan := false;
    if new.utloggning_tid is not null and old.shift_key like 'SYN\_%' then
      -- tabellen slås upp via TG_TABLE_*, så samma funktion fungerar på en provtabell i ett test
      execute format(
        'select exists (select 1 from %I.%I o'
        || ' where o.maskin_id = $1 and o.datum = $2 and o.id <> $3'
        || '   and o.operator_id is distinct from $4'
        || '   and o.inloggning_tid between $5 - interval ''1 second'' and $5 + interval ''1 second'')',
        TG_TABLE_SCHEMA, TG_TABLE_NAME)
      into annan
      using new.maskin_id, new.datum, new.id, new.operator_id, new.utloggning_tid;
    end if;
    if not coalesce(annan, false) then
      new.utloggning_tid := old.utloggning_tid;
      ersatt := true;
    end if;
  end if;

  if ersatt and new.inloggning_tid is not null and new.utloggning_tid is not null then
    new.langd_sek := floor(extract(epoch from (new.utloggning_tid - new.inloggning_tid)))::int;
  end if;

  return new;
end;
$$;

drop trigger if exists fakt_skift_bara_utoka on public.fakt_skift;
create trigger fakt_skift_bara_utoka
  before update on public.fakt_skift
  for each row execute function public.fakt_skift_bara_utoka();

comment on function public.fakt_skift_bara_utoka() is
  'Ett befintligt pass i fakt_skift kan bara utökas (tidigare inloggning, senare utloggning). Undantag: syntetiskt pass kapat vid annan förares inloggning. Underhåll: set_config(''app.skift_tillat_andring'',''on'',true) i transaktionen.';
