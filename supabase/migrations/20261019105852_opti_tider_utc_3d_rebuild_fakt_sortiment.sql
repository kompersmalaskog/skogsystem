-- rebuild_fakt_sortiment: fakt_sortiment.datum är maskinens LOKALA dag, nu via flaggan tid_ar_utc.
-- Före: (sm.tidpunkt AT TIME ZONE 'UTC')::date. Efter: opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc)::date. Inget annat ändras.
--
-- Skriven som en PATCH av den befintliga funktionsdefinitionen och inte som hela funktionen: Supabase-MCP:ns apply_migration/execute_sql
-- hängde (60 s) varje gång hela texten skickades, trots att varje delbit gick igenom för sig (bisekterat 2026-10-19). Patchen
-- avbryter om ersättningen inte träffar exakt en gång. Efteråt är funktionskroppen byte för byte den i
-- git-historiken (md5 b7b8982e50c131fc9e9364ffb836d4d5) — kontrollerat mot prod.
DO $patch$
DECLARE
  d text := pg_get_functiondef('public.rebuild_fakt_sortiment(text,text)'::regprocedure);
  n text;
BEGIN
  n := replace(d, '(sm.tidpunkt AT TIME ZONE ''UTC'')::date AS datum', 'opti_tid_lokal(sm.tidpunkt, sm.tid_ar_utc)::date AS datum');
  IF n = d THEN
    RAISE EXCEPTION 'rebuild_fakt_sortiment: ersättningen träffade inte';
  END IF;
  IF (length(d) - length(replace(d, '(sm.tidpunkt AT TIME ZONE ''UTC'')::date AS datum', ''))) <> length('(sm.tidpunkt AT TIME ZONE ''UTC'')::date AS datum') THEN
    RAISE EXCEPTION 'rebuild_fakt_sortiment: ersättningen träffade fler än en gång';
  END IF;
  EXECUTE n;
END
$patch$;
