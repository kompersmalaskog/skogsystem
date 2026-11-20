-- Cert › Behörigheter (2026-11-11). Cert läser Utbildning — behörigheterna bor i utbildning_typ / _krav / _bevis.
-- Nytt här: (1) två utbildningstyper som saknades, (2) vilka utbildningar som är SE-krav, (3) "Uppladdat hos SE"
-- per intyg, (4) bucketen utbildningsbevis tar också emot foton (JPEG) — förut bara PDF.

-- (1) Utbildningstyperna (datarader, schemat orört)
insert into public.utbildning_typ (namn, kravtyp, giltighet_manader, galler_alla, beskrivning) values
  ('SYN avverkning', 'certifiering', 60, false, 'SE-krav 3.1.1. Gäller alla som kör maskin.'),
  ('Grundläggande naturvärdesbedömning', 'certifiering', 60, false, 'SE-krav 3.1.8. Gäller den som planerar hänsyn.')
on conflict (namn) do nothing;

-- SYN avverkning gäller alla aktiva medarbetare (alla kör maskin, också admin). Styrs sedan per person i Utbildning.
insert into public.utbildning_krav (utbildning_typ_id, medarbetare_id)
select t.id, m.id from public.utbildning_typ t cross join public.medarbetare m
where t.namn = 'SYN avverkning' and m.aktiv
on conflict do nothing;

-- (2) Vilka utbildningar som är SE-krav
create table public.cert_se_krav (
  utbildning_typ_id uuid primary key references public.utbildning_typ(id) on delete cascade,
  se_krav text not null unique
);
alter table public.cert_se_krav enable row level security;
create policy cert_se_krav_las on public.cert_se_krav for select to authenticated using (true);
create policy cert_se_krav_admin on public.cert_se_krav for all to authenticated
  using ((select public.ar_admin())) with check ((select public.ar_admin()));

insert into public.cert_se_krav (utbildning_typ_id, se_krav)
select id, case namn
  when 'SYN avverkning' then '3.1.1'
  when 'Grundläggande naturvärdesbedömning' then '3.1.8'
  when 'ADR 1.3' then '3.1.9'
  when 'Första hjälpen / HLR' then '3.1.10' end
from public.utbildning_typ
where namn in ('SYN avverkning', 'Grundläggande naturvärdesbedömning', 'ADR 1.3', 'Första hjälpen / HLR');

-- (3) "Uppladdat hos SE" per intyg. Ett nytt intyg (ny rad i utbildning_bevis) är inte uppladdat förrän någon säger det.
create table public.cert_se (
  bevis_id uuid primary key references public.utbildning_bevis(id) on delete cascade,
  uppladdad_se boolean not null default false,
  andrad timestamptz not null default now()
);
alter table public.cert_se enable row level security;
create policy cert_se_admin on public.cert_se for all to authenticated
  using ((select public.ar_admin())) with check ((select public.ar_admin()));
create policy cert_se_egen on public.cert_se for select to authenticated
  using (exists (select 1 from public.utbildning_bevis b
                 where b.id = cert_se.bevis_id and b.medarbetare_id = (select public.aktuell_medarbetare_id())));

revoke all on public.cert_se, public.cert_se_krav from anon;

-- (4) Fotade intyg: bucketen tog bara PDF.
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg']
where id = 'utbildningsbevis';
