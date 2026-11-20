-- gs_avtal: ALLA inloggade får LÄSA avtalet. Skrivning är fortfarande bara admin (policyn gs_avtal_admin rörs inte).
--
-- Varför: policyn gs_avtal_admin (FOR ALL, TO authenticated, USING ar_admin()) gör att en FÖRARE får 0 rader — utan fel.
-- Kontrollerat i prod 2026-10-14 (roll förare, begäran som authenticated): select count(*) from gs_avtal → 0.
-- Följden i appen: Arbetsrapports gs_avtal-läsning ger null för varje förare. Mitt avtal fick då inget att visa (och visade
-- reservvärden som om de vore avtalet — det är rättat i samma PR), vilotrösklarna (dygnsvila/veckovila) blev null så
-- vilovarningarna inte visas, och km-gränsen, traktamentet och övertidstaket föll på sina reserver. Admin såg allt rätt,
-- så ingen märkte det.
--
-- Vad som exponeras: avtalets parametrar (övertidstak, vilotider, ATK-procent, tillägg, kr-satser). Det är ett kollektivavtal,
-- inte personuppgifter; /api/app-state skickar redan en del av dem till förarens klient. Ska kr-satserna INTE vara läsbara
-- för förare är alternativet en vy med bara de kolumner förarna behöver — säg till, så byter jag.
--
-- Additiv: en ny SELECT-policy. Körs FÖRE production förs fram (kod och schema ska inte glida isär).

DROP POLICY IF EXISTS gs_avtal_las ON public.gs_avtal;
CREATE POLICY gs_avtal_las ON public.gs_avtal
  FOR SELECT TO authenticated
  USING (true);

-- Verifiering (som förare, i en transaktion som rullas tillbaka):
--   select count(*) from public.gs_avtal;                       -- förväntat: 1 (förut 0)
--   select policyname, cmd from pg_policies where tablename = 'gs_avtal' order by 1;
--     → gs_avtal_admin (ALL) och gs_avtal_las (SELECT)
--   update public.gs_avtal set namn = namn;                     -- som förare: 0 rader (skrivning är fortfarande admin)
--
-- Återställning:
--   DROP POLICY IF EXISTS gs_avtal_las ON public.gs_avtal;
