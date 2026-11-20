-- Traktanalysen som körs AV SIG SJÄLV på servern (cron /api/cron/traktanalys) mot Vidas traktgräns: vattenskydd, naturreservat, Natura 2000,
-- fornlämningar (RAÄ), nyckelbiotoper, biotopskydd, Skog & Historia. Martin 2026-11-05: "vi vet det först när vi öppnar trakten och då kanske
-- skördaren redan är på plats". Egen kolumn (inte trakt_data) så planeringssidans autospar av trakt_data aldrig skriver över serverns resultat.
-- Form: { at, grans, fynd: [{ type, name, details, warning, id, url, plats: {lat,lng} | null }], fel: [text] }. Skrivs bara av servern.
alter table public.objekt add column if not exists trakt_analys jsonb;
comment on column public.objekt.trakt_analys is 'Serverns traktanalys mot Vidas traktgräns (cron). { at, grans, fynd[], fel[] }. Läs via lib/traktAnalys/markning.ts.';
