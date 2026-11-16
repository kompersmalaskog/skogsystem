-- Del 5: samma timjobb kör statusen efter avslutet.
select cron.schedule('avslut_ur_maskindata', '25 * * * *',
  'SELECT count(*) FROM public.avslut_ur_maskindata(true); SELECT count(*) FROM public.objekt_status_ur_maskindata(true);');
