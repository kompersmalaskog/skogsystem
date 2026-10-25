-- AVSLUT UR MASKINDATA, del 1 av 4: kolumnerna (Martin 2026-10-24: "gör det helt automatiskt men jag kan göra
-- det själv om det inte skulle funka").
--
-- Skördning och skotning sätts klara av databasen när maskinen har GÅTT VIDARE till ett annat objekt
-- (del 2–4). En människa går alltid före:
--   *_auto_skal   satt = datumet sattes av avslut_ur_maskindata och får ändras/tas bort av den igen.
--                 NULL = datumet sattes av en människa (eller via Godkänn) — rörs aldrig av automatiken.
--   *_ej_klar     true = en människa har sagt "Inte klar än" — automatiken sätter inget på objektet.
-- Additivt, default false/NULL — rör ingen befintlig data.

ALTER TABLE public.dim_objekt
  ADD COLUMN IF NOT EXISTS skordning_ej_klar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skotning_ej_klar  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skordning_auto_skal text,
  ADD COLUMN IF NOT EXISTS skotning_auto_skal  text;

COMMENT ON COLUMN public.dim_objekt.skordning_ej_klar IS
  'true = en människa sa "Inte klar än" — avslut_ur_maskindata sätter inte skordning_avslutad.';
COMMENT ON COLUMN public.dim_objekt.skotning_ej_klar IS
  'true = en människa sa "Inte klar än" — avslut_ur_maskindata sätter inte skotning_avslutad.';
COMMENT ON COLUMN public.dim_objekt.skordning_auto_skal IS
  'Satt av avslut_ur_maskindata: varför skördningen räknas klar ("Giant körde vidare till Skälviken 22 okt"). NULL = människans datum.';
COMMENT ON COLUMN public.dim_objekt.skotning_auto_skal IS
  'Satt av avslut_ur_maskindata: varför skotningen räknas klar. NULL = människans datum.';
