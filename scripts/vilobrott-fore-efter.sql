-- ─────────────────────────────────────────────────────────────────────────────
-- VILOBROTT FÖRE/EFTER — export av underlaget (bara SELECT, ändrar ingenting).
-- Ger EN rad med EN JSON-kolumn (`export`) som scripts/vilobrott-fore-efter.ts läser. Samma fönster som Vilobrott-listan:
-- från den första i månaden tre månader bakåt (laddaVilobrottLista). Kör i Supabase SQL editor, kopiera värdet i `export` till en fil
-- (t.ex. vilobrott-export.json) och kör:
--
--     npx tsx scripts/vilobrott-fore-efter.ts vilobrott-export.json
--
-- Rapporten listar vilka brott som FÖRSVINNER, TILLKOMMER eller ÄNDRAS och vad som händer med lagrade rader i tabellen vilobrott.
-- Kontrollera de försvunna mot prod: tiden före förarens första pass i fönstret (eller en ny förares första dagar) respektive vilan efter
-- sista passet fram till nu ska vara verklig vila; ett nytt dygnsvilobrott ska höra till ett pass som korsar midnatt.
-- ─────────────────────────────────────────────────────────────────────────────
with f as (select date_trunc('month', current_date - interval '3 months')::date as fran)
select jsonb_pretty(jsonb_build_object(
  'nu',   to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'fran', (select fran from f),
  'trosklar', (select jsonb_build_object(
      'dygnsvila_krav_h', dygnsvila_krav_h, 'dygnsvila_varning_h', dygnsvila_varning_h, 'veckovila_krav_h', veckovila_krav_h,
      'veckovila_fonster_dagar', veckovila_fonster_dagar, 'kompensation_deadline_dagar', kompensation_deadline_dagar)
    from gs_avtal where giltigt_fran <= current_date and (giltigt_till is null or giltigt_till >= current_date)
    order by giltigt_fran desc limit 1),
  'medarbetare', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'namn', namn) order by namn), '[]') from medarbetare),
  'arbetsdag', (select coalesce(jsonb_agg(jsonb_build_object('medarbetare_id', medarbetare_id, 'datum', datum, 'start_tid', start_tid, 'slut_tid', slut_tid) order by datum), '[]')
    from arbetsdag, f where datum >= f.fran),
  'extra_tid', (select coalesce(jsonb_agg(jsonb_build_object('medarbetare_id', medarbetare_id, 'datum', datum, 'start_tid', start_tid, 'slut_tid', slut_tid) order by datum), '[]')
    from extra_tid, f where datum >= f.fran and slut_tid is not null),
  'vilobrott', (select coalesce(jsonb_agg(jsonb_build_object('medarbetare_id', medarbetare_id, 'typ', typ, 'datum', datum, 'vila_h', vila_h,
      'besvarat_av_forare', besvarat_av_forare, 'orsak', orsak) order by datum), '[]')
    from vilobrott, f where datum >= f.fran)
)) as export;
