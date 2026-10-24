-- APPENS PROGNOS FRYSES, OCH FACIT PER TRAKT (2026-10-24, Martin: "hur bygger vi så man ser utfallet också — vad tog objektet mot
-- prognosen Jocke sätter kontra den som appen räknar ut").
--
-- Problemet: det finns ETT prognosfält per roll (objekt.manuell_prognos). Appens G15-förslag ligger där tills planeraren trycker Stämmer,
-- och då är det hans — efteråt går det inte att veta om 42 tim var hans bedömning eller appens förslag som han godkände.
--
-- Lösningen: appens prognos fryses EN gång, innan maskinen börjat, i en egen kolumn som aldrig rörs igen.
--   objekt.app_prognos jsonb  = { "skordare": 42, "skotare": 38, "metod": {...}, "raknad": "2026-10-27T08:00:00Z", "kalla": "import" }
--   Skrivs av importen (/api/import-trakt) och av engångsfyllningen (/api/prognos/frys) — bara när kolumnen är NULL och ingen G15-tid
--   finns på trakten (en prognos satt i efterhand är ingen prognos). Timmarna är G15-timmar som manuell_prognos.
--
-- prognos_facit(): en rad per AVSLUTAD trakt och roll där det finns utfall — blev (G15 ur fakt_tid), planerarens prognos (manuell_prognos),
-- appens (app_prognos). Bygger på prognos_utfall() (samma JOIN-regel: produktion och tid aggregerade var för sig). Rader utan app_prognos
-- tas med (planerarens prognos mot utfallet finns ju) — appen visar "–" i den kolumnen. Ingen beräkning av träffsäkerhet här; appen räknar.
--
-- Rollback: alter table objekt drop column app_prognos; drop function prognos_facit();

alter table public.objekt add column if not exists app_prognos jsonb;
comment on column public.objekt.app_prognos is 'Appens G15-prognos per roll, fryst innan maskinen börjat (import eller /api/prognos/frys). Rörs aldrig efteråt.';

create or replace function public.prognos_facit()
returns table (
  objekt_id        uuid,
  namn             text,
  typ              text,
  klart            timestamptz,
  volym_objekt     numeric,
  skordad_m3       numeric,
  skordare_g15     numeric,
  skotare_g15      numeric,
  manuell_prognos  jsonb,
  app_prognos      jsonb,
  prognos_av       text
)
language sql
stable
security invoker
set search_path = public
as $$
  select u.objekt_id, coalesce(nullif(btrim(o.namn), ''), o.vo_nummer, 'Objekt'), u.typ, o.avslutad_timestamp,
         u.volym_objekt, u.skordad_m3, u.skordare_g15, u.skotare_g15,
         o.manuell_prognos, o.app_prognos, o.prognos_godkand_av
  from public.prognos_utfall() u
  join public.objekt o on o.id = u.objekt_id
  where u.typ in ('slutavverkning', 'gallring')
$$;

grant execute on function public.prognos_facit() to authenticated;

-- Kvitto: select count(*), count(app_prognos) from public.prognos_facit();   -- app_prognos är 0 tills första trakten frysts efter releasen
