-- Ändra arbetsdag.rast_min default från 30 till 0.
--
-- Regel: rast = bara det föraren faktiskt markerat som Meal break i maskinen.
-- Ingen markering = 0 minuter rast. Ingen schablon, ingen automatisk gissning.
--
-- Den gamla defaulten på 30 var en sannolikt välmenande fallback men kolliderar
-- med vår regel. Importen sätter rast_min explicit från Meal break-summering så
-- nya rader påverkas inte av defaulten — men en sanity-fix av schemat så det
-- matchar regeln vi byggt UI:t och vilo-detekteringen kring.
--
-- Synk-useEffect i Arbetsrapport.tsx (commit 8ca29e6) faller redan tillbaka till
-- 0 om rast_min är null, så detta är dubbel försäkring: appen och schemat säger
-- samma sak.

ALTER TABLE arbetsdag ALTER COLUMN rast_min SET DEFAULT 0;
