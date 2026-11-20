-- Skotarlass: städa efter den gamla självbekräftelsen (bekraftad_av = 'auto', före 2026-10-21).
--
-- Elefanten (A130743, Mölleryd) 2026-10-20 har 19 lass som den gamla funktionen bekräftade av sig själv: var 8–10 min, alla 20 m³ (kopierat
-- från lass 3), medan Opti säger 5–7 lass den dagen. Ingen människa har sagt ja till dem. De RADERAS inte — de räknas bara inte som skotat
-- förrän en planerare granskat dem, och varje beslut loggas med hur lasset såg ut före.
--
--  1. bekraftad_av får värdet 'planerare' (en planerare har granskat och sagt ja). 'auto' skrivs aldrig mer av appen men finns kvar i datan.
--  2. skotar_lass_granskning: append-only logg över varje beslut (bekräftat, struket, slagit ihop) med lassets hela tillstånd FÖRE.
--  3. skotar_lass_granska(): admin-RPC som bekräftar / stryker / slår ihop lass som ligger kvar som 'auto' — atomiskt, med logg.
--  4. En trigger som gör att INGEN väg längre kan skapa ett nytt 'auto' (en gammal klient som skickar det får ett lass som väntar på föraren).
--  5. Det som räknar appens lass som skotat lämnar 'auto' utanför: vyn skotar_lass_sortiment_skalat, Färdigskotad (skotar_avslut_berakna)
--     och admin-jämförelsen skotar_lass_mot_opti (som i stället visar de obekräftade på egna kolumner).
--
-- Additiv. Körs av Martin (apply_migration); inget i prod är ändrat före det. Supabase-MCP:n kan hänga på stora funktionstexter och på DROP —
-- skulle det hända, kör filen i SQL-editorn.

-- ── 1. 'planerare' som bekräftare ───────────────────────────────────────────────────────────────────────────────────────
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'skotar_lass'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%bekraftad_av%'
  loop
    execute format('alter table skotar_lass drop constraint %I', c);
  end loop;
end $$;
alter table skotar_lass add constraint skotar_lass_bekraftad_av_check check (bekraftad_av in ('auto', 'forare', 'planerare'));

-- ── 2. Loggen ───────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists skotar_lass_granskning (
  id         uuid primary key default gen_random_uuid(),
  lass_id    uuid not null,
  objekt_id  uuid not null,
  beslut     text not null check (beslut in ('bekraftad', 'struken', 'slogs_ihop', 'tog_emot')),
  -- slogs_ihop: lasset som volymen lades på. tog_emot: tomt (det ÄR mottagaren).
  mal_lass   uuid,
  anledning  text,
  av         uuid not null,
  tid        timestamptz not null default now(),
  -- Lassets hela tillstånd före beslutet (rad, delar och sortiment), så att inget går förlorat.
  fore       jsonb not null
);
create index if not exists skotar_lass_granskning_lass_idx on skotar_lass_granskning (lass_id, tid);
create index if not exists skotar_lass_granskning_objekt_idx on skotar_lass_granskning (objekt_id, tid);

alter table skotar_lass_granskning enable row level security;
revoke all on skotar_lass_granskning from public, anon, authenticated;
grant select on skotar_lass_granskning to authenticated;
-- Läsning: bara admin. Skrivning: ingen policy alls — loggen skrivs bara av skotar_lass_granska() (security definer) och kan aldrig ändras eller raderas.
create policy skotar_lass_granskning_sel on skotar_lass_granskning for select to authenticated using (ar_admin());

-- ── 3. Granskningen ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- p_beslut: 'bekrafta' (lassen räknas som skotat, bekraftad_av = 'planerare'), 'stryk' (status 'struket'), 'slaihop' (p_mal tar emot de andras
-- m³ per sortiment på sin första del, övriga stryks). Bara lass som är kvar som 'auto' och inte struket kan granskas, och alla valda ska höra
-- till samma trakt och maskin. Allt eller inget.
create or replace function skotar_lass_granska(p_beslut text, p_lass uuid[], p_mal uuid default null, p_anledning text default null) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_antal int;
  v_grupper int;
  v_gamla int;
  v_objekt uuid;
  v_anledning text := nullif(btrim(coalesce(p_anledning, '')), '');
  r record;
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;
  if not ar_admin() then raise exception 'Bara en planerare kan granska lass'; end if;
  if p_beslut not in ('bekrafta', 'stryk', 'slaihop') then raise exception 'Okänt beslut: %', p_beslut; end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_lass, '{}')) x;
  if cardinality(v_ids) = 0 then raise exception 'Inga lass valda'; end if;

  perform 1 from skotar_lass where id = any(v_ids) for update;
  select count(*), count(distinct objekt_id::text || '|' || maskin_id), count(*) filter (where bekraftad_av = 'auto' and status <> 'struket'), min(objekt_id::text)::uuid
    into v_antal, v_grupper, v_gamla, v_objekt
  from skotar_lass where id = any(v_ids);
  if v_antal <> cardinality(v_ids) then raise exception 'Något av lassen finns inte'; end if;
  if v_gamla <> v_antal then raise exception 'Bara obekräftade lass från den gamla funktionen kan granskas här'; end if;
  if v_grupper <> 1 then raise exception 'Lassen måste höra till samma trakt och maskin'; end if;

  if p_beslut = 'slaihop' then
    if cardinality(v_ids) < 2 then raise exception 'Välj minst två lass att slå ihop'; end if;
    if p_mal is null or not (p_mal = any(v_ids)) then raise exception 'Välj vilket lass de andra ska slås ihop i'; end if;
    if not exists (select 1 from skotar_lass_del where lass_id = p_mal and del_nr = 1) then raise exception 'Lasset saknar en första del'; end if;
  end if;

  -- Loggen först: lassets hela tillstånd före beslutet.
  for r in select * from skotar_lass where id = any(v_ids) order by lass_nummer loop
    insert into skotar_lass_granskning (lass_id, objekt_id, beslut, mal_lass, anledning, av, fore)
    values (
      r.id, r.objekt_id,
      case p_beslut
        when 'bekrafta' then 'bekraftad'
        when 'stryk' then 'struken'
        else case when r.id = p_mal then 'tog_emot' else 'slogs_ihop' end
      end,
      case when p_beslut = 'slaihop' and r.id <> p_mal then p_mal else null end,
      v_anledning, auth.uid(),
      jsonb_build_object(
        'lass', to_jsonb(r),
        'delar', (
          select coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object('sortiment', (
            select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from skotar_lass_sortiment s where s.lass_id = d.lass_id and s.del_nr = d.del_nr
          ))), '[]'::jsonb)
          from skotar_lass_del d where d.lass_id = r.id
        )
      )
    );
  end loop;

  if p_beslut = 'bekrafta' then
    update skotar_lass set status = 'bekraftat', bekraftad_av = 'planerare', bekraftad_tid = now(), andrad = now() where id = any(v_ids);
  elsif p_beslut = 'stryk' then
    update skotar_lass set status = 'struket', andrad = now() where id = any(v_ids);
  else
    insert into skotar_lass_sortiment (lass_id, del_nr, sortiment_nyckel, sortiment_namn, m3_forare)
    select p_mal, 1, s.sortiment_nyckel, min(s.sortiment_namn), sum(s.m3_forare)
    from skotar_lass_sortiment s
    where s.lass_id = any(v_ids) and s.lass_id <> p_mal
    group by s.sortiment_nyckel
    on conflict (lass_id, del_nr, sortiment_nyckel) do update set m3_forare = skotar_lass_sortiment.m3_forare + excluded.m3_forare;
    update skotar_lass set status = 'bekraftat', bekraftad_av = 'planerare', bekraftad_tid = now(), andrad = now() where id = p_mal;
    update skotar_lass set status = 'struket', andrad = now() where id = any(v_ids) and id <> p_mal;
  end if;

  return jsonb_build_object('beslut', p_beslut, 'antal', v_antal, 'mal', p_mal, 'objekt_id', v_objekt);
end;
$$;

revoke execute on function skotar_lass_granska(text, uuid[], uuid, text) from public, anon;
grant execute on function skotar_lass_granska(text, uuid[], uuid, text) to authenticated;

-- ── 4. Inget nytt 'auto' ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Appen skriver inte 'auto' sedan 2026-10-21, men en gammal klient (cachad app, lass som låg i kön) kan fortfarande skicka det. Ett NYTT 'auto' görs
-- om till ett lass som väntar på föraren; ett lass som redan är 'auto' och förblir det (omskickat) rörs inte.
create or replace function skotar_lass_ingen_auto() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.bekraftad_av = 'auto' then
    -- Redan 'auto' och förblir det (en gammal klient skickar om det): rör inte. Vid INSERT ... ON CONFLICT ser vi det på att raden redan finns.
    if tg_op = 'UPDATE' and old.bekraftad_av = 'auto' then return new; end if;
    if tg_op = 'INSERT' and exists (select 1 from skotar_lass where id = new.id and bekraftad_av = 'auto') then return new; end if;
    new.bekraftad_av := null;
    new.bekraftad_tid := null;
    if new.status = 'bekraftat' then new.status := 'vantar_forare'; end if;
  end if;
  return new;
end;
$$;
create or replace trigger skotar_lass_ingen_auto before insert or update on skotar_lass for each row execute function skotar_lass_ingen_auto();

-- ── 5. Det gamla obekräftade räknas inte som skotat ─────────────────────────────────────────────────────────────────────
create or replace view skotar_lass_sortiment_skalat with (security_invoker = true) as
select l.id as lass_id, l.objekt_id, l.maskin_id, l.lass_nummer, l.datum, l.status,
       d.del_nr, d.avlagg_id, d.avlagg_nummer, d.lossad_tid,
       r.sortiment_nyckel, r.sortiment_namn, r.m3_forare,
       r.m3_forare * coalesce((a.faktorer ->> r.sortiment_nyckel)::numeric, 1) as m3_skalat
from skotar_lass l
join skotar_lass_del d on d.lass_id = l.id
join skotar_lass_sortiment r on r.lass_id = d.lass_id and r.del_nr = d.del_nr
left join skotar_trakt_avslut a on a.objekt_id = l.objekt_id
where l.status <> 'struket' and l.bekraftad_av is distinct from 'auto';

-- Admin-jämförelsen: app_* räknar bara det som räknas som skotat; gammal_* är de obekräftade (gammal funktion) som ligger kvar att granska.
-- objekt_id sist (nya kolumner läggs alltid sist i en vy som ersätts).
create or replace view skotar_lass_mot_opti with (security_invoker = true) as
with app as (
  select l.objekt_id, l.vo_nummer, l.maskin_id,
         count(distinct l.id) filter (where l.bekraftad_av is distinct from 'auto') as app_lass,
         coalesce(sum(r.m3_forare) filter (where l.bekraftad_av is distinct from 'auto'), 0) as app_m3,
         count(distinct l.id) filter (where l.bekraftad_av = 'auto') as gammal_lass,
         coalesce(sum(r.m3_forare) filter (where l.bekraftad_av = 'auto'), 0) as gammal_m3
  from skotar_lass l
  left join skotar_lass_sortiment r on r.lass_id = l.id
  where l.status <> 'struket' and ar_admin()
  group by l.objekt_id, l.vo_nummer, l.maskin_id
),
opti as (
  select f.objekt_id as vo_nummer, f.maskin_id, count(*) as opti_lass, coalesce(sum(f.volym_m3sub), 0) as opti_m3
  from fakt_lass f
  where ar_admin()
  group by f.objekt_id, f.maskin_id
)
select coalesce(app.vo_nummer, opti.vo_nummer) as vo_nummer,
       coalesce(app.maskin_id, opti.maskin_id) as maskin_id,
       coalesce(app.app_lass, 0) as app_lass, coalesce(app.app_m3, 0) as app_m3,
       coalesce(opti.opti_lass, 0) as opti_lass, coalesce(opti.opti_m3, 0) as opti_m3,
       coalesce(app.gammal_lass, 0) as gammal_lass, coalesce(app.gammal_m3, 0) as gammal_m3,
       app.objekt_id as objekt_id
from app
full join opti on opti.vo_nummer = app.vo_nummer and opti.maskin_id = app.maskin_id
where app.app_lass is not null;

grant select on skotar_lass_sortiment_skalat, skotar_lass_mot_opti to authenticated;

-- Färdigskotad: appens rapporterade volym per sortiment (nämnaren i skalfaktorn) utan det gamla obekräftade.
create or replace function skotar_avslut_berakna(p_objekt uuid, p_opti jsonb) returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_skordat jsonb;
  v_rapp jsonb;
  v_opti jsonb := '{}'::jsonb;
  v_fakt jsonb := '{}'::jsonb;
  v_till jsonb := '{}'::jsonb;
  v_skillnad numeric := 0;
  k text;
  s numeric;
  r numeric;
  o numeric;
  t numeric;
begin
  select coalesce(jsonb_object_agg(nyckel, m3), '{}'::jsonb) into v_skordat from skotar_skordat(p_objekt);
  select coalesce(jsonb_object_agg(sortiment_nyckel, m3), '{}'::jsonb) into v_rapp
  from (
    select rs.sortiment_nyckel, sum(rs.m3_forare) as m3
    from skotar_lass l
    join skotar_lass_sortiment rs on rs.lass_id = l.id
    where l.objekt_id = p_objekt and l.status <> 'struket' and l.bekraftad_av is distinct from 'auto'
    group by rs.sortiment_nyckel
  ) x;
  for k in select jsonb_object_keys(v_skordat) union select jsonb_object_keys(v_rapp) loop
    s := coalesce((v_skordat ->> k)::numeric, 0);
    r := coalesce((v_rapp ->> k)::numeric, 0);
    o := least(greatest(coalesce((coalesce(p_opti, '{}'::jsonb) ->> k)::numeric, 0), 0), s);
    t := s - o;
    if o > 0 then v_opti := v_opti || jsonb_build_object(k, o); end if;
    if r > 0 then v_fakt := v_fakt || jsonb_build_object(k, t / r);
    elsif t > 0 then v_till := v_till || jsonb_build_object(k, t);
    end if;
    v_skillnad := v_skillnad + greatest(t - r, 0);
  end loop;
  return jsonb_build_object('skordat', v_skordat, 'rapporterat', v_rapp, 'opti', v_opti, 'faktorer', v_fakt, 'tillagg', v_till, 'skillnad_m3', v_skillnad);
end;
$$;
