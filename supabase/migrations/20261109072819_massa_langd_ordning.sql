-- Massavedens längd: samma funktion med fast ordning, så att klienten kan läsa den sida för sida (PostgREST ger högst 1 000 rader per
-- anrop; 30 dagar för H8E -26 är ~1 100 rader). Bara ORDER BY tillagd.

create or replace function public.massa_langd(p_maskiner text[], p_fran date, p_till date)
 returns table(maskin_id text, operator_id text, operator_namn text, medarbetare_id uuid, dag date, tradslag text, langd_dm integer, antal bigint, summa_cm bigint)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with st as (
    select distinct on (d.maskin_id, d.stam_key)
      d.maskin_id, d.stam_key, opti_tid_utc(d.tidpunkt, d.tid_ar_utc) as t, d.tradslag_id
    from detalj_stam d
    where d.maskin_id = any(p_maskiner)
      and d.tidpunkt >= (p_fran::timestamp at time zone 'Europe/Stockholm') - interval '1 day'
      and d.tidpunkt <  ((p_till + 1)::timestamp at time zone 'Europe/Stockholm') + interval '1 day'
    order by d.maskin_id, d.stam_key, d.tidpunkt
  ),
  x as (
    select st.maskin_id,
           (st.t at time zone 'Europe/Stockholm')::date as dag,
           coalesce(tr.namn, 'Okänt') as tradslag,
           k.langd_cm,
           (select f.operator_id from fakt_skift f
             where f.maskin_id = st.maskin_id
               and st.t >= opti_tid_utc(f.inloggning_tid, f.tid_ar_utc)
               and st.t <= opti_tid_utc(f.utloggning_tid, f.tid_ar_utc)
             order by f.inloggning_tid desc limit 1) as operator_id
    from st
    join detalj_stock k on k.maskin_id = st.maskin_id and k.stem_key = st.stam_key
    left join dim_tradslag tr on tr.tradslag_id = st.tradslag_id
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

