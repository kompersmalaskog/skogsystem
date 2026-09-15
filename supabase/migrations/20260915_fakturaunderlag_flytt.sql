-- Fakturaunderlag för flyttar — auto-skapat underlag som faktureringsvyn läser.
-- Flyttloggens Fakturering-flik är ett KVITTO som speglar status; den skickar inget.
-- Idempotent. Martin-sidan kör i Supabase SQL editor.

-- 0. Sender-era-kolumner utgår (verifierat nollanvända; hela livscykeln bor på
--    underlagsraden, så originalflytten rörs aldrig).
alter table maskin_flytt drop column if exists skickad_tid;
alter table maskin_flytt drop column if exists fakturerad_tid;

-- 1. Underlagstabell: en rad per fakturerbar flytt
create table if not exists fakturaunderlag_flytt (
  id                uuid primary key default gen_random_uuid(),
  flytt_id          uuid not null unique references maskin_flytt(id) on delete cascade,
  skapad_tid        timestamptz not null default now(),

  -- Redigerbara kopior (justeras i faktureringsvyn; originalflytten rörs aldrig)
  km                numeric,
  kund              text,

  -- Referens för visning (från→till löses upp som i Flyttloggen)
  datum             date,
  maskin            text,
  fran_objekt_id    text,
  fran_plats_id     uuid,
  till_objekt_id    text,
  till_plats_id     uuid,

  -- Kontrollstationens livscykel — stryka = MÄRKA, aldrig radera
  status            text not null default 'aktiv' check (status in ('aktiv','struken')),
  struken_tid       timestamptz,
  struken_av        text,
  struken_anledning text,
  fakturerad_tid    timestamptz,

  constraint struken_konsistens check ((status = 'struken') = (struken_tid is not null))
);

-- 2. Auto-skapa när en flytt avslutas fakturerbar.
--    Minimal + läsande: INSERT:ar bara raden ur flyttens fält, inget annat.
--    SECURITY DEFINER + fast search_path så förarens skrivning kan skapa raden
--    trots ekonomi-RLS, utan search_path-kapning.
create or replace function skapa_fakturaunderlag_flytt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fakturerbar is true
     and new.sluttid is not null
     and coalesce(new.avbruten, false) = false then
    insert into fakturaunderlag_flytt
      (flytt_id, km, kund, datum, maskin,
       fran_objekt_id, fran_plats_id, till_objekt_id, till_plats_id)
    values
      (new.id, new.flytt_km, new.kund, new.starttid::date,
       coalesce(new.extern_maskin, new.maskin_id),
       new.fran_objekt_id, new.fran_plats_id, new.till_objekt_id, new.till_plats_id)
    on conflict (flytt_id) do nothing;   -- dubbelskyddet
  end if;
  return new;
end
$$;

drop trigger if exists trg_fakturaunderlag_flytt on maskin_flytt;
create trigger trg_fakturaunderlag_flytt
  after insert or update of sluttid, fakturerbar, avbruten
  on maskin_flytt
  for each row
  execute function skapa_fakturaunderlag_flytt();

-- 3. Backfill: befintliga ofakturerade fakturerbara flyttar
insert into fakturaunderlag_flytt
  (flytt_id, km, kund, datum, maskin,
   fran_objekt_id, fran_plats_id, till_objekt_id, till_plats_id)
select
  mf.id, mf.flytt_km, mf.kund, mf.starttid::date,
  coalesce(mf.extern_maskin, mf.maskin_id),
  mf.fran_objekt_id, mf.fran_plats_id, mf.till_objekt_id, mf.till_plats_id
from maskin_flytt mf
where mf.fakturerbar is true
  and mf.sluttid is not null
  and coalesce(mf.avbruten, false) = false
on conflict (flytt_id) do nothing;

-- RLS: lägg fakturaunderlag_flytt i admin/ekonomi-listan separat (mönstret i
-- 20260524153759_rls_ekonomi_admin_only_och_push.sql). Triggern skriver ändå
-- tack vare SECURITY DEFINER.
