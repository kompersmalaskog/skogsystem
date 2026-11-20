-- vilobrott som i prod (20260520135311 + policyerna i 20260524125051), utan index.
create table public.vilobrott (
  id uuid primary key default gen_random_uuid(),
  medarbetare_id uuid not null references medarbetare(id),
  typ text not null check (typ in ('dygnsvila','veckovila')),
  datum date not null, vila_h numeric not null, krav_h numeric not null,
  beskrivning text, upptackt_tid timestamptz not null default now(),
  besvarat_av_forare boolean not null default false,
  orsak text, orsak_fritext text, besvarat_tid timestamptz,
  kvitterad_av_chef uuid references medarbetare(id), kvitterad_tid timestamptz,
  skapad timestamptz not null default now(),
  unique (medarbetare_id, typ, datum)
);
alter table public.vilobrott enable row level security;
create policy vilobrott_select on vilobrott for select to authenticated using (medarbetare_id = aktuell_medarbetare_id() or ar_admin());
create policy vilobrott_update on vilobrott for update to authenticated using (medarbetare_id = aktuell_medarbetare_id() or ar_admin()) with check (medarbetare_id = aktuell_medarbetare_id() or ar_admin());
create policy vilobrott_insert on vilobrott for insert to authenticated with check (medarbetare_id = aktuell_medarbetare_id() or ar_admin());
create policy vilobrott_admin_delete on vilobrott for delete to authenticated using (ar_admin());
grant select, insert, update, delete on public.vilobrott to authenticated, service_role;
insert into medarbetare (id, user_id, namn, epost, roll) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Martin', 'm@x', 'admin'),
  ('00000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-00000000000f', 'Stefan', 's@x', 'förare');
insert into vilobrott (id, medarbetare_id, typ, datum, vila_h, krav_h, besvarat_av_forare, orsak)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000f', 'dygnsvila', '2026-10-12', 8.5, 11, true, 'oforutsedd');
