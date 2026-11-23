-- "Viktigt" på en kommentar på kartan (Martin 2026-11-23, efter Brokamåla): en kommentar får två fält —
--   viktigt  = EN rad (högst 60 tecken) som föraren ska se direkt: gul, fet, överst på kortet, som etikett på kartan i körvyn och överst i "Hela trakten".
--   text     = "Övrigt" = det som alltid funnits (fri text). Befintliga kommentarer är därmed redan Övrigt; inget skrivs om.
-- Tillägget är additivt och nullbart: appen fungerar före migrationen (den läser utan kolumnen när den saknas och döljer Viktigt-fältet),
-- och en rad kan nu ha bara Viktigt (text får vara tom när viktigt finns).
--
-- KÖRS AV CLAUDE I CHATTEN (apply_migration) — inte av PR-sessionen. Efteråt: hämta versionen ur schema_migrations och döp om filen (Deploy-flöde punkt 5).
-- RLS och triggers är oförändrade: den som skrev raden ändrar den (inklusive viktigt), författare och tid sätts av servern som förut.

alter table public.kartkommentar add column if not exists viktigt text;

-- Viktigt är en rad: inga radbrytningar, inte tomt, högst 60 tecken.
alter table public.kartkommentar drop constraint if exists kartkommentar_viktigt_check;
alter table public.kartkommentar add constraint kartkommentar_viktigt_check
  check (viktigt is null or (length(btrim(viktigt)) between 1 and 60 and viktigt !~ E'[\\r\\n]'));

-- Förut krävdes text. Nu räcker Viktigt (text får vara tom), men en rad med varken eller är fortfarande otillåten.
alter table public.kartkommentar drop constraint if exists kartkommentar_text_check;
alter table public.kartkommentar drop constraint if exists kartkommentar_text_eller_viktigt;
alter table public.kartkommentar add constraint kartkommentar_text_eller_viktigt
  check (length(btrim(text)) > 0 or viktigt is not null);

comment on column public.kartkommentar.viktigt is 'Viktigt-raden: en rad, högst 60 tecken. Visas gult överst på kortet, som etikett på kartan i körvyn och överst i Hela trakten. text = Övrigt.';
