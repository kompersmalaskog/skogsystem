-- RLS-granskning steg 5: sex SECURITY DEFINER-funktioner som gav produktion/tid/lass till anon, plus maskin_har_manuell_datakalla (DEFINER) och maskindata_flertrad_period (INVOKER, bara grant-ytan).
revoke execute on function public.maskindata_avbrott(text[], date, date)          from public, anon;
revoke execute on function public.maskindata_lass(text[], date, date)             from public, anon;
revoke execute on function public.maskindata_lass_senaste(text[])                 from public, anon;
revoke execute on function public.maskindata_produktion(text[], date, date)       from public, anon;
revoke execute on function public.maskindata_produktion_senaste(text[])           from public, anon;
revoke execute on function public.maskindata_tid(text[], date, date)              from public, anon;
revoke execute on function public.maskin_har_manuell_datakalla(text)              from public, anon;
revoke execute on function public.maskindata_flertrad_period(text[], date, date)  from public, anon;