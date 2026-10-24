-- Gallringens "gallrade yta": svaret på appens förslag om första och andra gallring i samma trakt (lib/gallringDelar.ts).
--
-- Appen delar den gallrade ytan i en klenare (första gallring) och en grövre del (andra gallring) när stammarnas grovlek
-- skiljer sig tydligt mellan två delar av trakten. En människa svarar: stämmer, tvärtom, "det var en gallring" — eller
-- ritar gränsen själv ('ritad'). En rad per trakt, nyckeln 'delning'. Samma tabell, behörighet och stämpel som svaren
-- om bitarna.
--
-- geometri (bara för 'ritad'): {"del": "forsta"|"andra", "ring": [[lng, lat], ...]} — ringen runt den ena delen.
-- Befintliga rader påverkas inte.

alter table public.gallring_yta_svar add column if not exists geometri jsonb;

alter table public.gallring_yta_svar drop constraint if exists gallring_yta_svar_svar_check;
alter table public.gallring_yta_svar drop constraint if exists gallring_yta_svar_check;

alter table public.gallring_yta_svar add constraint gallring_yta_svar_check check (
     (nyckel like 'u:%' and svar in ('gallring', 'vag', 'enstaka', 'inte_hit'))
  or (nyckel like 'e:%' and svar in ('grans_fel', 'lamnat', 'senare'))
  or (nyckel = 'delning' and svar in ('stammer', 'tvartom', 'en', 'ritad'))
);

alter table public.gallring_yta_svar drop constraint if exists gallring_yta_svar_ritad_geometri;
alter table public.gallring_yta_svar add constraint gallring_yta_svar_ritad_geometri check (
  svar <> 'ritad' or (geometri ? 'del' and geometri ? 'ring' and jsonb_array_length(geometri -> 'ring') >= 3)
);
