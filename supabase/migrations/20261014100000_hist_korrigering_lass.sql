-- Historikimport (steg 10): korrigeringstabell + lass per skift.
-- Bara CREATE TABLE/POLICY/ENABLE RLS för den nya hist_korrigering och ALTER TABLE hist_skift ADD COLUMN antal_lass. Inget annat rörs.
-- hist_korrigering: manuella rättelser av ett fält på en rapport (nu: falt = 'atgard'). hist_objekt.atgard skrivs aldrig över; vyerna läser åtgärden härifrån först.
-- RLS: bara admin läser (public.ar_admin()); ingen skrivpolicy => skrivning bara med service_role.

create table hist_korrigering (
  sha256 text not null references hist_rapport(sha256),
  falt text not null,
  nytt_varde text not null,
  orsak text not null,
  skapad timestamptz not null default now(),
  primary key (sha256, falt)
);

alter table hist_korrigering enable row level security;

create policy hist_korrigering_las on hist_korrigering for select to authenticated using ((select public.ar_admin()));

alter table hist_skift add column antal_lass integer;
