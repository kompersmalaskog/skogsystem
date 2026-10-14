-- Rättning: Oskar Nilsson, R64428, 2026-10-12 — passet 07:04–15:14 (fakt_skift) och arbetsdagen 07:04–15:14, rast 19.
-- Körs av planeringschatten (inte av Claude). EN transaktion: antingen stämmer allt eller ingenting ändras.
--
-- Vad som hände: Sandåsen-filen (exporterad 2026-10-14, bär bara Sandåsens del av dagen, 13:49–14:52) skrev över det
-- befintliga passet i fakt_skift, och arbetsdag följde med: 13:49–14:52, rast 18, arbetad 45 min i stället för 471.
-- Orsak och rättning i importen: se PR (scripts/test_skift_kuvert.py). arbetsdag_objekt (361 / 99 / 11 = 471 min) rördes
-- aldrig och stämmer redan med rättningen.
--
-- Värdena (ärlig data — varje tid har sin källa):
--   inloggning_tid  = maskin_inloggning_tid 07:04:07.329814   (maskinens egen OperatorLoginTime; passets egen första
--                                                              WorkTime, ca 13 s senare, skrevs över och går inte att läsa tillbaka)
--   utloggning_tid  = 15:14:00                                 (minuten ur arbetsdag_objekt.slut_tid = den första synkens slut;
--                                                              sekunderna är okända och sätts inte på gissning)
--   rast_min        = 19    (fakt_tid.rast_sek 1139 = 18,98 min; routen /api/mom-import avrundar, Math.round)
--   arbetad_min     = GENERATED (slut − start − rast) → 471, samma som summan i arbetsdag_objekt
--
-- Fungerar både före och efter migration 20261014122108 (triggern släpper igenom utökning av ett pass).

begin;

-- 0. FÖRE (ska visa 13:49:44.80883 / 14:52:45.261796 resp. 13:49 / 14:52 / 18 / 45)
select 'fore_skift' k, id::text, inloggning_tid::text a, utloggning_tid::text b, langd_sek::text c
  from fakt_skift where id = 69971
union all
select 'fore_dag', id::text, start_tid::text, slut_tid::text, rast_min::text || ' / ' || arbetad_min::text
  from arbetsdag where id = 'b500faa5-b044-4951-ab42-a89e2e09fe29';

-- 1. fakt_skift: bara OM raden fortfarande står på de skadade värdena (annars har någon redan rört den)
do $$
declare n int;
begin
  update fakt_skift
     set inloggning_tid = maskin_inloggning_tid,                       -- 07:04:07.329814
         utloggning_tid = '2026-10-12 15:14:00+00',
         langd_sek      = floor(extract(epoch from ('2026-10-12 15:14:00+00'::timestamptz - maskin_inloggning_tid)))::int
   where id = 69971
     and maskin_id = 'R64428' and datum = '2026-10-12' and operator_id = 'R64428_8'
     and shift_key = 'SYN_2026-10-12_R64428_8'
     and inloggning_tid = '2026-10-12 13:49:44.80883+00'
     and utloggning_tid = '2026-10-12 14:52:45.261796+00'
     and maskin_inloggning_tid = '2026-10-12 07:04:07.329814+00';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'fakt_skift 69971: % rader uppdaterade (väntade 1) — raden har ändrats sedan utredningen, avbryter', n; end if;
end $$;

-- 2. arbetsdag: bara om dagen är oredigerad och obekräftad och fortfarande står på de skadade värdena
do $$
declare n int;
begin
  update arbetsdag
     set start_tid = '07:04', slut_tid = '15:14', rast_min = 19
   where id = 'b500faa5-b044-4951-ab42-a89e2e09fe29'
     and medarbetare_id = '3ca89ab0-c723-445a-a03d-9b3d488566b0' and datum = '2026-10-12'
     and coalesce(redigerad, false) = false and coalesce(bekraftad, false) = false
     and start_tid = '13:49' and slut_tid = '14:52' and rast_min = 18;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'arbetsdag b500faa5: % rader uppdaterade (väntade 1) — dagen har ändrats eller bekräftats, avbryter', n; end if;
end $$;

-- 3. EFTER (ska visa 07:04:07.329814 / 15:14:00 / 29392 resp. 07:04 / 15:14 / 19 / 471, och 471 i objektsumman)
select 'efter_skift' k, id::text, inloggning_tid::text a, utloggning_tid::text b, langd_sek::text c
  from fakt_skift where id = 69971
union all
select 'efter_dag', id::text, start_tid::text, slut_tid::text, rast_min::text || ' / ' || arbetad_min::text
  from arbetsdag where id = 'b500faa5-b044-4951-ab42-a89e2e09fe29'
union all
select 'efter_objektsumma', arbetsdag_id::text, sum(arbetad_min)::text, count(*)::text, ''
  from arbetsdag_objekt where arbetsdag_id = 'b500faa5-b044-4951-ab42-a89e2e09fe29' group by arbetsdag_id;

-- Kontrollera de tre EFTER-raderna. Stämmer de: commit. Annars: rollback.
commit;

-- OBS: nästa import som berör 2026-10-12 bygger om arbetsdagen ur fakt_skift (Python-vägen, _create_arbetsdag). Den
-- trunkerar rasten (int(1139/60) = 18) där routen avrundar (19): dagen blir då 472 i stället för 471. Skillnaden är
-- känd och ligger utanför den här rättningen (se PR-texten).
