-- Massavedens längd: samma svar, snabbare. Förarpasset slogs upp per stock med opti_tid_utc på varje fakt_skift-rad
-- (7,7 s för 30 dagar på H8E -26, nära PostgREST:s 8 s, och sidhämtningen kör funktionen igen per sida). Nu räknas passen
-- om till UTC EN gång för fönstret och slås upp per stam (inte per stock). Kolumner, regler och ordning oförändrade.
create or replace function public.massa_langd(p_maskiner text[], p_fran date, p_till date)
 returns table(maskin_id text, operator_id text, operator_namn text, medarbetare_id uuid, dag date, tradslag text, langd_dm integer, antal bigint, summa_cm bigint)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with st as materialized (
    select distinct on (d.maskin_id, d.stam_key)
      d.maskin_id, d.stam_key, opti_tid_utc(d.tidpunkt, d.tid_ar_utc) as t, d.tradslag_id
    from detalj_stam d
    where d.maskin_id = any(p_maskiner)
      and d.tidpunkt >= (p_fran::timestamp at time zone 'Europe/Stockholm') - interval '1 day'
      and d.tidpunkt <  ((p_till + 1)::timestamp at time zone 'Europe/Stockholm') + interval '1 day'
    order by d.maskin_id, d.stam_key, d.tidpunkt
  ),
  sk as materialized (
    select f.maskin_id, f.operator_id, f.inloggning_tid,
           opti_tid_utc(f.inloggning_tid, f.tid_ar_utc) as fran,
           opti_tid_utc(f.utloggning_tid, f.tid_ar_utc) as till
    from fakt_skift f
    where f.maskin_id = any(p_maskiner)
      and f.inloggning_tid < ((p_till + 1)::timestamp at time zone 'Europe/Stockholm') + interval '2 days'
      and f.utloggning_tid >= (p_fran::timestamp at time zone 'Europe/Stockholm') - interval '2 days'
  ),
  sto as (
    select st.*,
           (select sk.operator_id from sk
             where sk.maskin_id = st.maskin_id and st.t >= sk.fran and st.t <= sk.till
             order by sk.inloggning_tid desc limit 1) as operator_id
    from st
  ),
  x as (
    select sto.maskin_id,
           (sto.t at time zone 'Europe/Stockholm')::date as dag,
           coalesce(tr.namn, 'Okänt') as tradslag,
           k.langd_cm,
           sto.operator_id
    from sto
    join detalj_stock k on k.maskin_id = sto.maskin_id and k.stem_key = sto.stam_key
    left join dim_tradslag tr on tr.tradslag_id = sto.tradslag_id
    where k.sortiment_namn ilike 'massa%' and k.langd_cm > 0
  )
  select x.maskin_id, x.operator_id, o.operator_namn, om.medarbetare_id, x.dag, x.tradslag,
         round(x.langd_cm / 10.0)::int as langd_dm, count(*) as antal, sum(x.langd_cm)::bigint as summa_cm
  from x
  left join dim_operator o on o.operator_id = x.operator_id
  left join operator_medarbetare om on om.operator_id = x.operator_id
  where x.dag between p_fran and p_till
  group by 1, 2, 3, 4, 5, 6, 7
  order by 1, 2, 5, 6, 7;
$function$;
