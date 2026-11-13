-- Rader äldre än 90 dagar rensas varje natt.
create function public.fart_logg_rensa() returns integer language sql security definer set search_path = public as $$
  with d as (delete from public.fart_logg where skapad < now() - interval '90 days' returning 1) select count(*)::int from d
$$;
revoke all on function public.fart_logg_rensa() from public, anon, authenticated;
select cron.schedule('fart-logg-rensa', '17 2 * * *', 'select public.fart_logg_rensa()');
