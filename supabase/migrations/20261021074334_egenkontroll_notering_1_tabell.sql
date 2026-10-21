-- Noteringar: ord på en karta eller ett foto i en egenkontrollrunda.
-- Egen tabell, aldrig planering_markeringar (en rättelse får inte synas i förarens körvy).

create or replace function egenkontroll_notering_koordinater_ok(p_underlag text, p_typ text, p_k jsonb)
returns boolean language plpgsql immutable as $$
declare e jsonb; n int;
begin
  if jsonb_typeof(p_k) is distinct from 'array' then return false; end if;
  n := jsonb_array_length(p_k);
  if p_typ = 'punkt' then
    if n <> 1 then return false; end if;
  elsif n < 2 or n > 500 then
    return false;
  end if;
  for e in select value from jsonb_array_elements(p_k) loop
    if jsonb_typeof(e) is distinct from 'array' or jsonb_array_length(e) <> 2
       or jsonb_typeof(e->0) is distinct from 'number'
       or jsonb_typeof(e->1) is distinct from 'number' then
      return false;
    end if;
    if p_underlag = 'foto' then
      if (e->>0)::float8 not between 0 and 1 or (e->>1)::float8 not between 0 and 1 then return false; end if;
    else
      if (e->>0)::float8 not between -180 and 180 or (e->>1)::float8 not between -90 and 90 then return false; end if;
    end if;
  end loop;
  return true;
end $$;

create table egenkontroll_notering (
  id              uuid primary key default gen_random_uuid(),
  egenkontroll_id uuid not null references egenkontroll(id) on delete cascade,
  underlag        text not null check (underlag in ('karta','foto')),
  foto_id         uuid references egenkontroll_foto(id) on delete cascade,
  typ             text not null check (typ in ('punkt','linje')),
  pil             boolean not null default false,
  etikett         text not null default '',
  avsikt          text not null default 'blev' check (avsikt in ('blev','skulle')),
  koordinater     jsonb not null,
  etikett_dx      real,
  etikett_dy      real,
  skapad          timestamptz not null default now(),
  andrad          timestamptz not null default now(),
  constraint notering_underlag_foto      check ((underlag = 'foto') = (foto_id is not null)),
  constraint notering_pil_bara_linje     check (not pil or typ = 'linje'),
  constraint notering_etikett_langd      check (char_length(etikett) <= 280),
  constraint notering_har_innehall       check (btrim(etikett) <> ''),
  constraint notering_koordinater        check (egenkontroll_notering_koordinater_ok(underlag, typ, koordinater)),
  constraint notering_forskjutning_par   check ((etikett_dx is null) = (etikett_dy is null)),
  constraint notering_forskjutning_rimlig check (etikett_dx is null or (etikett_dx between -2 and 2 and etikett_dy between -2 and 2)),
  constraint notering_forskjutning_foto  check (etikett_dx is null or underlag = 'foto')
);

create index egenkontroll_notering_runda_idx on egenkontroll_notering (egenkontroll_id, skapad, id);
create index egenkontroll_notering_foto_idx  on egenkontroll_notering (foto_id) where foto_id is not null;

alter table egenkontroll_notering enable row level security;
create policy egenkontroll_notering_all on egenkontroll_notering
  for all to authenticated using (true) with check (true);

revoke all on egenkontroll_notering from anon;
grant select, insert, update, delete on egenkontroll_notering to authenticated, service_role;

comment on table egenkontroll_notering is
  'Ord pa en karta eller ett foto i en egenkontrollrunda. Karta: koordinater = [[lng,lat],...]. Foto: [[u,v],...] i bildens egna koordinater 0..1 (den lagrade bildens bredd/hojd, EXIF redan bakat). avsikt: blev = sa har blev det, skulle = sa har skulle det gjorts. En tom etikett tas bort med DELETE, aldrig med UPDATE (notering_har_innehall). Last nar rundan ar klar (egenkontroll_notering_last).';