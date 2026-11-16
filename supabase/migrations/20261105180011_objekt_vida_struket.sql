-- Stryk det som inte gäller i Vidas text (Martin 2026-11-05).
-- objekt.anteckningar (Vidas traktdirektiv) ändras aldrig. Planeraren stryker en DEL av texten; strecket sparas här som
-- [{ "del": "<delens text>", "av": "<förnamn>", "at": "<iso-tid>" }] och visas i Planeringen, Översikten (Min plan) och — utan det strukna — i hytten.
-- NULL = inget struket. Logiken: lib/vidaStruket.ts. Importen (/api/import-trakt) skriver aldrig kolumnen.
-- Behörighet: samma som resten av objekt-raden (update_objekt). Appen visar bara knappen för admin.
alter table public.objekt add column if not exists vida_struket jsonb;
comment on column public.objekt.vida_struket is 'Delar av Vidas traktdirektiv (anteckningar) som planeraren strukit: [{del, av, at}]. Texten i anteckningar ändras aldrig. lib/vidaStruket.ts';
