-- Gallringens "gallrade yta": svaret på appens förslag om första och andra gallring i samma trakt (lib/gallringDelar.ts).
--
-- Appen delar den gallrade ytan i en klenare (första gallring) och en grövre del (andra gallring) när stammarnas grovlek
-- skiljer sig tydligt mellan två delar av trakten. En människa svarar: stämmer, tvärtom eller "det var en gallring".
-- En rad per trakt, nyckeln 'delning'. Samma tabell, samma behörighet och samma stämpel som svaren om bitarna.
-- Bara CHECK-villkoren ändras; befintliga rader påverkas inte.

alter table public.gallring_yta_svar drop constraint if exists gallring_yta_svar_svar_check;
alter table public.gallring_yta_svar drop constraint if exists gallring_yta_svar_check;

alter table public.gallring_yta_svar add constraint gallring_yta_svar_check check (
     (nyckel like 'u:%' and svar in ('gallring', 'vag', 'enstaka', 'inte_hit'))
  or (nyckel like 'e:%' and svar in ('grans_fel', 'lamnat', 'senare'))
  or (nyckel = 'delning' and svar in ('stammer', 'tvartom', 'en'))
);
