-- Skotarläge del 1: lassrapportering i appen (ersätter Opti-rapporteringen).
--
-- NYA tabeller — appens lass skrivs ALDRIG i fakt_lass/fakt_lass_sortiment (Opti-filerna äger dem), så admin kan jämföra de två per trakt.
--   skotar_lass            ett lass (en rad per lass; id skapas i klienten → synken är idempotent)
--   skotar_lass_del        en lossning inom lasset ("Lass 7 · del 2" = samma last på ett andra avlägg)
--   skotar_lass_sortiment  förarens m³ per sortiment och del — ORIGINALVÄRDET, skrivs aldrig om
--   skotar_trakt_avslut    "Färdigskotad": skalfaktorer så skotat = skördat per sortiment; förarens värden bevaras ovan
-- Skalat värde lagras aldrig på lassraden: vyn skotar_lass_sortiment_skalat räknar det ur faktorerna.
--
-- Avläggen har ingen egen tabell: Vidas avlägg ligger i objekt_geometri och egna avlägg är markeringar (planering_markeringar,
-- symbol 'landing') — "Nytt avlägg här?" skapar en vanlig markering, så alla ser den direkt. Lassdelen bär avlägget som text
-- ('vida:<nummer>' | 'egen:<markeringens id>') plus det visade numret.
--
-- KÖRS INTE FÖRRÄN MARTIN SÄGER ATT VI SLÄPPER (migration och release i samma svep). Additiv: bara nya objekt, inget befintligt rörs
-- utom att dim_objekt.skotning_avslutad sätts av skotar_farduskotat (bara där den är NULL — samma regel som lib/avslutaObjekt.ts).

create table if not exists skotar_lass (
  id             uuid primary key,
  objekt_id      uuid not null references objekt(id) on delete cascade,
  vo_nummer      text,
  maskin_id      text not null,
  medarbetare_id uuid,
  lass_nummer    integer not null,
  datum          date not null,                       -- maskinens lokala dag (Europe/Stockholm)
  status         text not null default 'foreslaget'
                 check (status in ('foreslaget', 'vantar_forare', 'bekraftat', 'struket')),
  bekraftad_av   text check (bekraftad_av in ('auto', 'forare')),
  bekraftad_tid  timestamptz,
  spar           jsonb not null default '[]'::jsonb,  -- [{lat,lng,tid}] tunnad spårdel sedan förra lossningen
  vagar          jsonb not null default '[]'::jsonb,  -- [{vag,sek,andel}] tid per stickväg (för "kvar per väg")
  skapad         timestamptz not null default now(),
  andrad         timestamptz not null default now(),  -- klientens ändringstid: senaste ändring vinner vid synk
  mottagen       timestamptz not null default now()
);
create index if not exists skotar_lass_objekt_idx on skotar_lass (objekt_id, maskin_id, lass_nummer);
create index if not exists skotar_lass_vo_idx on skotar_lass (vo_nummer, datum);

create table if not exists skotar_lass_del (
  lass_id       uuid not null references skotar_lass(id) on delete cascade,
  del_nr        integer not null,
  avlagg_id     text,                                  -- 'vida:<nummer>' | 'egen:<id>' | null (ej valt)
  avlagg_nummer text,
  lossad_tid    timestamptz not null,
  lat           double precision not null,
  lng           double precision not null,
  primary key (lass_id, del_nr)
);
create index if not exists skotar_lass_del_avlagg_idx on skotar_lass_del (avlagg_id);

create table if not exists skotar_lass_sortiment (
  lass_id        uuid not null,
  del_nr         integer not null,
  sortiment_nyckel text not null,                      -- skördarens namn, städat (lib/skotarLass/sortiment.ts) | 'ved_markagare'
  sortiment_namn text not null,
  m3_forare      numeric not null check (m3_forare >= 0),
  primary key (lass_id, del_nr, sortiment_nyckel),
  foreign key (lass_id, del_nr) references skotar_lass_del(lass_id, del_nr) on delete cascade
);

create table if not exists skotar_trakt_avslut (
  objekt_id    uuid primary key references objekt(id) on delete cascade,
  vo_nummer    text,
  avslutad_tid timestamptz not null default now(),
  avslutad_av  uuid,
  skordat      jsonb not null,    -- {nyckel: m³} skördarens mätning vid avslutet
  rapporterat  jsonb not null,    -- {nyckel: m³} förarens summa vid avslutet (originalvärdena)
  faktorer     jsonb not null,    -- {nyckel: faktor} skördat / rapporterat där rapporterat > 0
  tillagg      jsonb not null,    -- {nyckel: m³} skördat där inget rapporterats (kan inte skalas)
  skillnad_m3  numeric not null   -- skördat − rapporterat, summerat över positiva sortiment (det "Har du fått med allt?" frågade om)
);

alter table skotar_lass enable row level security;
alter table skotar_lass_del enable row level security;
alter table skotar_lass_sortiment enable row level security;
alter table skotar_trakt_avslut enable row level security;

-- Samma öppna authenticated-mönster som hyttspar: lassen är objekt-delade arbetsdata. Radering bara admin.
drop policy if exists skotar_lass_sel on skotar_lass;
drop policy if exists skotar_lass_ins on skotar_lass;
drop policy if exists skotar_lass_upd on skotar_lass;
drop policy if exists skotar_lass_del_admin on skotar_lass;
create policy skotar_lass_sel on skotar_lass for select to authenticated using (true);
create policy skotar_lass_ins on skotar_lass for insert to authenticated with check (true);
create policy skotar_lass_upd on skotar_lass for update to authenticated using (true) with check (true);
create policy skotar_lass_del_admin on skotar_lass for delete to authenticated using (ar_admin());

drop policy if exists skotar_lass_del_sel on skotar_lass_del;
drop policy if exists skotar_lass_del_ins on skotar_lass_del;
drop policy if exists skotar_lass_del_upd on skotar_lass_del;
drop policy if exists skotar_lass_del_del on skotar_lass_del;
create policy skotar_lass_del_sel on skotar_lass_del for select to authenticated using (true);
create policy skotar_lass_del_ins on skotar_lass_del for insert to authenticated with check (true);
create policy skotar_lass_del_upd on skotar_lass_del for update to authenticated using (true) with check (true);
create policy skotar_lass_del_del on skotar_lass_del for delete to authenticated using (true);   -- skotar_lass_spara byter ut delarna

drop policy if exists skotar_lass_sortiment_sel on skotar_lass_sortiment;
drop policy if exists skotar_lass_sortiment_ins on skotar_lass_sortiment;
drop policy if exists skotar_lass_sortiment_upd on skotar_lass_sortiment;
drop policy if exists skotar_lass_sortiment_del on skotar_lass_sortiment;
create policy skotar_lass_sortiment_sel on skotar_lass_sortiment for select to authenticated using (true);
create policy skotar_lass_sortiment_ins on skotar_lass_sortiment for insert to authenticated with check (true);
create policy skotar_lass_sortiment_upd on skotar_lass_sortiment for update to authenticated using (true) with check (true);
create policy skotar_lass_sortiment_del on skotar_lass_sortiment for delete to authenticated using (true);

-- Avslutet skrivs bara av skotar_farduskotat (DEFINER); alla inloggade läser (kvar-räkningen behöver faktorerna).
drop policy if exists skotar_trakt_avslut_sel on skotar_trakt_avslut;
create policy skotar_trakt_avslut_sel on skotar_trakt_avslut for select to authenticated using (true);

-- ── skotar_lass_spara ────────────────────────────────────────────────────────────────────────────────────────────────────
-- Atomisk och idempotent: samma lass skickat två gånger (nätet föll efter att raden gick fram) ger samma resultat. En NYARE version
-- i databasen (andrad) skrivs aldrig över av en äldre — senaste ändring vinner, så en lång offline-kö kan inte backa ett lass.
-- p = { lass: {id, objekt_id, vo_nummer, maskin_id, medarbetare_id, lass_nummer, datum, status, bekraftad_av, bekraftad_tid,
--                spar, vagar, skapad, andrad},
--       delar: [{del_nr, avlagg_id, avlagg_nummer, lossad_tid, lat, lng, rader: [{nyckel, namn, m3}]}] }
create or replace function skotar_lass_spara(p jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  l jsonb := p -> 'lass';
  d jsonb;
  r jsonb;
  v_id uuid := (l ->> 'id')::uuid;
  v_andrad timestamptz := coalesce((l ->> 'andrad')::timestamptz, now());
  v_nu timestamptz;
begin
  if v_id is null then raise exception 'lass.id saknas'; end if;

  select andrad into v_nu from skotar_lass where id = v_id;
  if v_nu is not null and v_nu > v_andrad then
    return jsonb_build_object('sparad', false, 'skal', 'nyare_finns');
  end if;

  insert into skotar_lass (id, objekt_id, vo_nummer, maskin_id, medarbetare_id, lass_nummer, datum, status, bekraftad_av, bekraftad_tid,
                           spar, vagar, skapad, andrad)
  values (v_id, (l ->> 'objekt_id')::uuid, l ->> 'vo_nummer', l ->> 'maskin_id', nullif(l ->> 'medarbetare_id', '')::uuid,
          (l ->> 'lass_nummer')::int, (l ->> 'datum')::date, l ->> 'status', nullif(l ->> 'bekraftad_av', ''),
          nullif(l ->> 'bekraftad_tid', '')::timestamptz, coalesce(l -> 'spar', '[]'::jsonb), coalesce(l -> 'vagar', '[]'::jsonb),
          coalesce((l ->> 'skapad')::timestamptz, now()), v_andrad)
  on conflict (id) do update set
    status = excluded.status, bekraftad_av = excluded.bekraftad_av, bekraftad_tid = excluded.bekraftad_tid,
    spar = excluded.spar, vagar = excluded.vagar, andrad = excluded.andrad, mottagen = now();

  -- Delar och rader byts ut som en helhet (lasset är en enhet; föraren kan ha tagit bort en rad eller en del).
  delete from skotar_lass_del where lass_id = v_id;   -- cascade tar raderna
  for d in select * from jsonb_array_elements(coalesce(p -> 'delar', '[]'::jsonb)) loop
    insert into skotar_lass_del (lass_id, del_nr, avlagg_id, avlagg_nummer, lossad_tid, lat, lng)
    values (v_id, (d ->> 'del_nr')::int, nullif(d ->> 'avlagg_id', ''), nullif(d ->> 'avlagg_nummer', ''),
            (d ->> 'lossad_tid')::timestamptz, (d ->> 'lat')::double precision, (d ->> 'lng')::double precision);
    for r in select * from jsonb_array_elements(coalesce(d -> 'rader', '[]'::jsonb)) loop
      insert into skotar_lass_sortiment (lass_id, del_nr, sortiment_nyckel, sortiment_namn, m3_forare)
      values (v_id, (d ->> 'del_nr')::int, r ->> 'nyckel', r ->> 'namn', (r ->> 'm3')::numeric)
      on conflict (lass_id, del_nr, sortiment_nyckel) do update set m3_forare = skotar_lass_sortiment.m3_forare + excluded.m3_forare;
    end loop;
  end loop;

  return jsonb_build_object('sparad', true);
end;
$$;

grant execute on function skotar_lass_spara(jsonb) to authenticated;

-- ── Skördat per sortiment (samma nyckel som lib/skotarLass/sortiment.ts: städat namn, "hemved" = ved_markagare) ─────────────────────
create or replace function skotar_skordat(p_objekt uuid) returns table (nyckel text, namn text, m3 numeric)
language sql stable
set search_path = public
as $$
  with nr as (
    select o.vo_nummer as nummer from objekt o where o.id = p_objekt and o.vo_nummer is not null
    union
    select a.nummer from objekt_alt_nummer a where a.objekt_id = p_objekt
  )
  select case when s.namn ~* 'hemved' then 'ved_markagare'
              else lower(regexp_replace(btrim(s.namn), '\s+', ' ', 'g')) end as nyckel,
         min(case when s.namn ~* 'hemved' then 'Ved markägare' else s.namn end) as namn,
         sum(f.volym_m3sub) as m3
  from fakt_sortiment f
  join dim_sortiment s on s.sortiment_id = f.sortiment_id
  where f.objekt_id in (select nummer from nr)
  group by 1
  having sum(f.volym_m3sub) > 0;
$$;

grant execute on function skotar_skordat(uuid) to authenticated;

-- ── skotar_farduskotat ───────────────────────────────────────────────────────────────────────────────────────────────────
-- REGEL: när trakten är färdigskotad är skotat EXAKT skördat per sortiment (markägarens ved också). Förarens värden ändras inte;
-- faktorerna läggs i skotar_trakt_avslut och vyn skotar_lass_sortiment_skalat räknar ut det skalade. Idempotent: körs igen räknas allt om.
create or replace function skotar_farduskotat(p_objekt uuid) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_vo text;
  v_skordat jsonb;
  v_rapp jsonb;
  v_fakt jsonb := '{}'::jsonb;
  v_till jsonb := '{}'::jsonb;
  v_skillnad numeric := 0;
  k text;
  s numeric;
  r numeric;
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;
  select vo_nummer into v_vo from objekt where id = p_objekt;
  if not found then raise exception 'Trakten finns inte'; end if;

  select coalesce(jsonb_object_agg(nyckel, m3), '{}'::jsonb) into v_skordat from skotar_skordat(p_objekt);

  select coalesce(jsonb_object_agg(sortiment_nyckel, m3), '{}'::jsonb) into v_rapp
  from (
    select rs.sortiment_nyckel, sum(rs.m3_forare) as m3
    from skotar_lass l
    join skotar_lass_sortiment rs on rs.lass_id = l.id
    where l.objekt_id = p_objekt and l.status <> 'struket'
    group by rs.sortiment_nyckel
  ) x;

  for k in select jsonb_object_keys(v_skordat) union select jsonb_object_keys(v_rapp) loop
    s := coalesce((v_skordat ->> k)::numeric, 0);
    r := coalesce((v_rapp ->> k)::numeric, 0);
    if r > 0 then v_fakt := v_fakt || jsonb_build_object(k, s / r);
    elsif s > 0 then v_till := v_till || jsonb_build_object(k, s);
    end if;
    v_skillnad := v_skillnad + greatest(s - r, 0);
  end loop;

  insert into skotar_trakt_avslut (objekt_id, vo_nummer, avslutad_av, skordat, rapporterat, faktorer, tillagg, skillnad_m3)
  values (p_objekt, v_vo, auth.uid(), v_skordat, v_rapp, v_fakt, v_till, v_skillnad)
  on conflict (objekt_id) do update set
    avslutad_tid = now(), avslutad_av = excluded.avslutad_av, skordat = excluded.skordat, rapporterat = excluded.rapporterat,
    faktorer = excluded.faktorer, tillagg = excluded.tillagg, skillnad_m3 = excluded.skillnad_m3;

  -- Samma regel som lib/avslutaObjekt.ts: bara där datumet saknas (en människas satta datum skrivs aldrig över).
  update dim_objekt set skotning_avslutad = (now() at time zone 'Europe/Stockholm')::date
   where vo_nummer = v_vo and skotning_avslutad is null;

  return jsonb_build_object('skordat', v_skordat, 'rapporterat', v_rapp, 'faktorer', v_fakt, 'tillagg', v_till, 'skillnad_m3', v_skillnad);
end;
$$;

grant execute on function skotar_farduskotat(uuid) to authenticated;

-- ── Vyer ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Det skalade värdet: förarens m³ × avslutets faktor (utan avslut: oförändrat). Avlägg och trakt följer med.
create or replace view skotar_lass_sortiment_skalat with (security_invoker = true) as
select l.id as lass_id, l.objekt_id, l.maskin_id, l.lass_nummer, l.datum, l.status,
       d.del_nr, d.avlagg_id, d.avlagg_nummer, d.lossad_tid,
       r.sortiment_nyckel, r.sortiment_namn, r.m3_forare,
       r.m3_forare * coalesce((a.faktorer ->> r.sortiment_nyckel)::numeric, 1) as m3_skalat
from skotar_lass l
join skotar_lass_del d on d.lass_id = l.id
join skotar_lass_sortiment r on r.lass_id = d.lass_id and r.del_nr = d.del_nr
left join skotar_trakt_avslut a on a.objekt_id = l.objekt_id
where l.status <> 'struket';

-- Admin: appens lass mot Opti per trakt och maskin. Ingenting för föraren. Opti-sidan är fakt_lass (volym_m3sub), appens sidan
-- förarens egna m³ (m3_forare). Skillnaden är en fråga, inte ett fel — se till att jämföra över hela trakten, inte enstaka dagar.
create or replace view skotar_lass_mot_opti with (security_invoker = true) as
with app as (
  select l.objekt_id, l.vo_nummer, l.maskin_id,
         count(distinct l.id) as app_lass,
         coalesce(sum(r.m3_forare), 0) as app_m3
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
       coalesce(opti.opti_lass, 0) as opti_lass, coalesce(opti.opti_m3, 0) as opti_m3
from app
full join opti on opti.vo_nummer = app.vo_nummer and opti.maskin_id = app.maskin_id
where app.app_lass is not null;   -- bara trakter där appen rapporterat

grant select on skotar_lass_sortiment_skalat, skotar_lass_mot_opti to authenticated;
