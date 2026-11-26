-- Föraren från Opti, del 2: slagningarna. Tre små funktioner, i fallande ordning av hur säkert svaret är:
--   1. opti_forare      — den som var inloggad i Opti på maskinen vid tidpunkten (fakt_skift → operator_medarbetare)
--   2. schema_forare    — schemats förare: den aktiva medarbetare vars maskin det är, om hen inte har heldagsledigt den dagen
--   3. (den inloggade)  — det appen skrev, bara när varken Opti eller schemat vet
--
-- Opti-filen kommer först när föraren loggar ut, så mitt i ett pass finns ingen rad än: då gäller schemats förare, och när filen
-- kommer räknar del 4 om allt i passet (inget att göra för någon människa). En Opti-profil utan koppling (operator_medarbetare)
-- ger ingen träff — då gäller schemats förare, och profilen syns på /datahalsa-listan i PR-texten tills någon kopplar den.
--
-- Funktionerna är SECURITY DEFINER eftersom anroparen (en förare, via en trigger) inte får läsa fakt_skift/ledighet själv, och
-- de svarar bara med ett id. De delas inte ut: bara triggrarna (som kör som ägaren) och service_role anropar dem.

create or replace function public.opti_forare(p_maskin text, p_tid timestamptz)
returns uuid language sql stable security definer set search_path = public as $$
  select om.medarbetare_id
  from (
    select s.operator_id
    from fakt_skift s
    where s.maskin_id = p_maskin
      and s.inloggning_tid is not null
      and p_tid >= opti_tid_utc(s.inloggning_tid, s.tid_ar_utc)
      and p_tid <= coalesce(opti_tid_utc(s.utloggning_tid, s.tid_ar_utc), opti_tid_utc(s.inloggning_tid, s.tid_ar_utc) + interval '16 hours')
    order by opti_tid_utc(s.inloggning_tid, s.tid_ar_utc) desc, s.id desc
    limit 1
  ) c
  left join operator_medarbetare om on om.operator_id = c.operator_id;
$$;

create or replace function public.schema_forare(p_maskin text, p_tid timestamptz)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  f uuid[];
  a uuid[];
begin
  select array_agg(m.id order by m.skapad) filter (where coalesce(m.roll, '') = 'forare'),
         array_agg(m.id order by m.skapad) filter (where coalesce(m.roll, '') <> 'forare')
    into f, a
  from medarbetare m
  where m.maskin_id = p_maskin
    and coalesce(m.aktiv, true)
    and not exists (
      select 1 from ledighet_ansokningar l
      where l.medarbetare_id = m.id and l.status in ('godkänd', 'registrerad') and l.fran_tid is null and l.till_tid is null
        and (p_tid at time zone 'Europe/Stockholm')::date between l.startdatum and l.slutdatum);
  -- Förare först. Exakt EN kandidat är ett svar; två eller ingen är en gissning och blir inget svar.
  if coalesce(array_length(f, 1), 0) = 1 then return f[1]; end if;
  if coalesce(array_length(f, 1), 0) = 0 and coalesce(array_length(a, 1), 0) = 1 then return a[1]; end if;
  return null;
end $$;

create or replace function public.forare_for_maskin(p_maskin text, p_tid timestamptz, p_registrerad uuid)
returns table (forare_id uuid, kalla text) language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  v := opti_forare(p_maskin, p_tid);
  if v is not null then return query select v, 'opti'::text; return; end if;
  v := schema_forare(p_maskin, p_tid);
  if v is not null then return query select v, 'schema'::text; return; end if;
  return query select p_registrerad, 'inloggad'::text;
end $$;

revoke all on function public.opti_forare(text, timestamptz) from public, anon, authenticated;
revoke all on function public.schema_forare(text, timestamptz) from public, anon, authenticated;
revoke all on function public.forare_for_maskin(text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.opti_forare(text, timestamptz) to service_role;
grant execute on function public.schema_forare(text, timestamptz) to service_role;
grant execute on function public.forare_for_maskin(text, timestamptz, uuid) to service_role;
