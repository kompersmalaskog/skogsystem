-- RLS Fas 1 — stäng anon-nyckelläckan på objekt + medarbetare + fakt_tid_test
--
-- BAKGRUND
-- `objekt`, `medarbetare` och `fakt_tid_test` har Row Level Security AVSTÄNGT, dvs
-- fullt läs- och skrivbara för vem som helst med den publika anon-nyckeln (markägares
-- telefon/epost, personalens namn/maskinkoppling osv). Det här steget täpper
-- läckan utan att bryta någon befintlig vy.
--
-- STRATEGI (medvetet val, se brief-oversikt-karta.md "Säkerhet")
-- Slå INTE bara på RLS (det låser ute allt). Aktivera RLS + lägg en tillåtande
-- policy för rollen `authenticated`:
--   * anon-nyckeln (utan inloggad session) får INGEN åtkomst  -> läckan stängd
--   * alla inloggade användare behåller full läs/skriv         -> inga vyer bryts
--
-- medarbetare har redan strikta, vilande policies (medarbetare_select = egen rad
-- ELLER admin, admin-only insert/delete; migration 20260524131614). När RLS
-- aktiveras blir de skarpa. Den tillåtande Fas 1-policyn nedan OR-kombineras med
-- dem (Postgres ORar permissiva policies), så nettoeffekten blir "alla inloggade
-- får allt" — exakt det Fas 1 vill ha.
--
-- FAS 2 (senare, EJ nu): snäva åt till rollbaserad åtkomst — `forare` ser bara
-- sin egen maskins objekt, `admin` ser allt. Det görs genom att DROPPA
-- `*_fas1_authenticated_all`-policyerna nedan; medarbetares strikta policies
-- vaknar då av sig själva, och objekt får nya forare/admin-policies. Lås inte
-- förare till "bara egna" förrän förarvyns roll-logik är testad i alla vyer.
--
-- Idempotent: DROP POLICY IF EXISTS före varje CREATE.

-- objekt -----------------------------------------------------------------
ALTER TABLE public.objekt ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS objekt_fas1_authenticated_all ON public.objekt;
CREATE POLICY objekt_fas1_authenticated_all ON public.objekt
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- medarbetare ------------------------------------------------------------
ALTER TABLE public.medarbetare ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS medarbetare_fas1_authenticated_all ON public.medarbetare;
CREATE POLICY medarbetare_fas1_authenticated_all ON public.medarbetare
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- fakt_tid_test ----------------------------------------------------------
-- Tredje öppna tabellen (brief-oversikt-karta.md "Säkerhet"). Namnet (_test)
-- antyder skräp/scratch-data — om det bekräftas bör tabellen DROPpas i en
-- uppföljning istället för att leva vidare. Tills dess: säkra den by default med
-- samma authenticated-policy så läckan är stängd oavsett.
ALTER TABLE public.fakt_tid_test ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fakt_tid_test_fas1_authenticated_all ON public.fakt_tid_test;
CREATE POLICY fakt_tid_test_fas1_authenticated_all ON public.fakt_tid_test
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
