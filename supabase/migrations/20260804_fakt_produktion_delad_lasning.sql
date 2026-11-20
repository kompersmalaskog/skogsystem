-- Delad LÄSNING av produktion — alla inloggade ser all produktion
-- ============================================================================
-- AVSIKTLIGT VAL (inte en bieffekt): varje inloggad användare — förare, nu och
-- framtida anställda — ska kunna LÄSA all produktionsdata i uppföljningsvyn och
-- maskinvy2. Detta speglar det redan tagna beslutet bakom maskinvy-RPC:erna
-- (migration 20260721): "i maskinvyn ska ALLA inloggade se hela maskinens data —
-- fördrat av alla inblandade". En nyanställd förare får därmed se allt automatiskt.
--
-- BAKGRUND: tidigare (migration 20260524153100) begränsade SELECT-policyn på
-- dessa tabeller till den egna operatörens rader (operator_id IN mina_operator_ids()
-- OR ar_admin()). Effekten var att varje förare bara såg sin egen maskin —
-- Stefan "såg allt" enbart för att han kör huvudmaskinen (Scorpion), inte för att
-- han hade någon särskild behörighet. Detta vidgar läsningen till hela flottan.
--
-- OMFATTNING — BARA dessa fyra PRODUKTIONS-tabeller:
--   fakt_produktion, fakt_tid, fakt_avbrott, fakt_lass
-- EJ rörda (avsiktligt): fakt_skift och fakt_kalibrering/_historik behåller sin
-- operatörs-scoping (20260524153100). EKONOMI/LÖN (maskin_timpris, löner,
-- gs_avtal, lonesystem_*, m.fl.) förblir ADMIN-ONLY via sina egna policies
-- (20260524125051, 20260524153759) — de rörs INTE här.
--
-- SKRIVNING FÖRBLIR LÅST: vi ändrar BARA SELECT-policyn. Tabellerna har ingen
-- INSERT/UPDATE/DELETE-policy för authenticated → skrivning är fortsatt nekad för
-- alla förare. Importen skriver via service_role (kringgår RLS). Ingen förare kan
-- ÄNDRA data — bara läsa.

-- fakt_produktion ------------------------------------------------------------
DROP POLICY IF EXISTS fakt_produktion_select ON public.fakt_produktion;
CREATE POLICY fakt_produktion_select ON public.fakt_produktion
  FOR SELECT TO authenticated USING (true);

-- fakt_tid -------------------------------------------------------------------
DROP POLICY IF EXISTS fakt_tid_select ON public.fakt_tid;
CREATE POLICY fakt_tid_select ON public.fakt_tid
  FOR SELECT TO authenticated USING (true);

-- fakt_avbrott ---------------------------------------------------------------
DROP POLICY IF EXISTS fakt_avbrott_select ON public.fakt_avbrott;
CREATE POLICY fakt_avbrott_select ON public.fakt_avbrott
  FOR SELECT TO authenticated USING (true);

-- fakt_lass ------------------------------------------------------------------
DROP POLICY IF EXISTS fakt_lass_select ON public.fakt_lass;
CREATE POLICY fakt_lass_select ON public.fakt_lass
  FOR SELECT TO authenticated USING (true);
