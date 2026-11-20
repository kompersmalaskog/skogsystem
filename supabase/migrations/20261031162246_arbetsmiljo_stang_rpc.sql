-- Triggerfunktionerna ska aldrig anropas via /rest/v1/rpc. Läsfunktionerna bara för inloggade.
revoke execute on function public.am_svar_till_atgard() from public, anon, authenticated;
revoke execute on function public.am_maskinkoll_vakt() from public, anon, authenticated;
revoke execute on function public.am_svar_vakt() from public, anon, authenticated;
revoke execute on function public.am_fraga_uppdaterad() from public, anon, authenticated;
revoke execute on function public.ar_skyddsombud() from public, anon;
revoke execute on function public.ar_am_lasare() from public, anon;
grant execute on function public.ar_skyddsombud() to authenticated;
grant execute on function public.ar_am_lasare() to authenticated;
