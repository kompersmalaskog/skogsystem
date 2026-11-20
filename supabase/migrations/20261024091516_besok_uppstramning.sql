-- Besök – uppstramning (2026-10-23). Bygger på 20261022170000_besok_pa_trakten (körd i prod). Additiv/begränsande: inga data tas bort, inga tabeller tas bort.
--
-- 1. Läsning: besök, kvittenser och SMS-logg läses bara av admin (planerare). Förut: alla inloggade — varje förare kunde läsa alla besökares namn och telefonnummer
--    och markägarens nummer för alla objekt. Hytten läser i stället via serverrutten /api/besok/hytt, som kontrollerar att maskinen är kopplad till objektet.
-- 2. Kvittens ("Uppfattat"): skrivs bara av servern (service role). Maskin, roll, förare och testläge avgörs av servern — föraren kan inte sätta dem. Ingen inloggad användare
--    har längre skrivrätt på tabellen (policyn blir `false` och INSERT-rätten återkallas).
-- 3. SMS-logg: bara admin får skriva en rad, och raden är en HÄNDELSE (öppnad / kopierad / bekräftad skickad / bekräftad ej skickad). Bara 'skickad' räknas som skickat –
--    påminnelsen tystnar inte av att knappen trycktes. Befintliga rader blir 'oppnad' (alltså inte skickade).
--
-- ALTER POLICY används i stället för att skapa om policyerna: Supabase-MCP:n hänger på vissa satser (jfr CLAUDE.md), och en ALTER ändrar bara villkoret.

alter table public.objekt_besok_sms
  add column if not exists handelse text not null default 'oppnad'
  check (handelse in ('oppnad', 'kopierad', 'skickad', 'ej_skickad'));

-- 1. Läsning bara för admin.
alter policy besok_sel on public.objekt_besok using (public.ar_admin());
alter policy besok_kvittens_sel on public.objekt_besok_kvittens using (public.ar_admin());
alter policy besok_sms_sel on public.objekt_besok_sms using (public.ar_admin());

-- 2. Kvittens: ingen skrivning från inloggade. Policyn behålls som en spärr (with check false); INSERT-rätten återkallas dessutom.
alter policy besok_kvittens_ins on public.objekt_besok_kvittens with check (false);

-- 3. SMS-loggen: bara admin skriver, och bara som sig själv.
alter policy besok_sms_ins on public.objekt_besok_sms with check (public.ar_admin() and oppnad_av = public.korvy_min_medarbetare());

-- Tabellrättigheter: inloggade får bara det policyerna behöver (läsa; SMS-loggen även infoga). Det återkallar också Supabase-standardens övriga skrivrättigheter
-- (ändra, radera och tömma tabellen – den sista kringgår RLS).
revoke all on public.objekt_besok, public.objekt_besok_kvittens, public.objekt_besok_sms from authenticated;
grant select on public.objekt_besok, public.objekt_besok_kvittens, public.objekt_besok_sms to authenticated;
grant insert on public.objekt_besok_sms to authenticated;
