-- ─────────────────────────────────────────────────────────────
-- MEDARBETARE.FORETAGSLEDARE — delägare / företagsledare: arbetstidslagen gäller inte.
--
-- Arbetstidslagen (ATL) gäller inte den som själv leder företaget eller är delägare i en sådan ställning att hen bestämmer över sin
-- egen arbetstid. Lagkontrollen för arbetstid (Admin → Översikt → Arbetstid, lib/arbetstidsgranser) ska därför inte larma på dem:
-- en person med boolean foretagsledare = true visas GRÅTT i kortet med "Delägare – arbetstidslagen gäller inte", utan gul/röd och
-- utan att räknas i menysiffran. Siffrorna räknas ändå. Martin bockar själv i Martin och Joacim i Admin → Medarbetare efter merge
-- (rutan "Företagsledare / delägare"); migrationen sätter ingen, så ingen byter status av sig själv.
--
-- NOT NULL DEFAULT false: befintliga rader blir vanliga förare (Postgres fyller kolumnen direkt). Additiv, idempotent, ingen RLS-ändring
-- (policyerna på medarbetare gäller hela raden). KÖRS MOT PROD FÖRE KODEN: Admin → Medarbetare och kortet Arbetstid väljer kolumnen.
-- Kortet tål att kolumnen saknas (kör utan undantag och varnar); Medarbetare-fliken likaså (väljer om utan kolumnen och döljer rutan).
-- ─────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.medarbetare ADD COLUMN IF NOT EXISTS foretagsledare boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.medarbetare.foretagsledare IS
  'Företagsledare / delägare: arbetstidslagen gäller inte. true = visas grått i lagkontrollen för arbetstid (Admin → Översikt), aldrig gul/röd, räknas inte i menysiffran. Sätts av admin i Admin → Medarbetare. Default false.';

COMMIT;

-- Läs in schemat i PostgREST direkt (annars kan "Could not find the 'foretagsledare' column" visas en stund):
NOTIFY pgrst, 'reload schema';

-- EFTER:
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--    where table_schema = 'public' and table_name = 'medarbetare' and column_name = 'foretagsledare';
--     → foretagsledare | boolean | NO | false
--   select namn, foretagsledare from medarbetare order by namn;
--     → alla false (Martin bockar själv i Martin och Joacim i Admin → Medarbetare)
--
-- ÅNGRA (om det behövs):
--   alter table public.medarbetare drop column if exists foretagsledare;
