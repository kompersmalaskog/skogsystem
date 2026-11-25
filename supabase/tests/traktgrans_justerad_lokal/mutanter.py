#!/usr/bin/env python3
# Mutationskontroll för migrationen: varje ändring av vyn/RPC:n ska få kor.sh att bli RÖD. Kör: python3 supabase/tests/traktgrans_justerad_lokal/mutanter.py
import os, subprocess, sys
rot = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
os.chdir(rot)
MIG = 'supabase/migrations/20261125150000_traktgrans_justerad.sql'
KOR = 'supabase/tests/traktgrans_justerad_lokal/kor.sh'
orig = open(MIG, encoding='utf8').read()

def kor(mig=None):
    env = dict(os.environ)
    if mig: env['MIGRATION'] = mig
    return subprocess.run(['bash', KOR], env=env, capture_output=True).returncode == 0

if not kor():
    print('BASLINJEN ÄR RÖD'); sys.exit(2)

M = [
  ('vyn byter inte ut Vidas delar (dubbla linjer)', 'and not exists (', 'and not not exists ('),
  ('fel delindex vid utbyte', "|| ':' || p.idx::text)", "|| ':' || (p.idx + 1)::text)"),
  ('RPC:n kräver inte admin', 'if not public.ar_admin() then', 'if false then'),
  ('justerade delar saknar slutpunkt (ringen sluts inte)', "(jd -> 'ring') || jsonb_build_array((jd -> 'ring') -> 0)", "(jd -> 'ring')"),
  ('anon får köra RPC:n', 'from public, anon;', 'from public;'),
  ('tom lista tar inte bort raden', 'delete from public.objekt_traktgrans_justerad where objekt_id = p_objekt;', 'null;'),
  ('orimliga koordinater godtas', "or (p ->> 0)::numeric not between 3 and 32 or (p ->> 1)::numeric not between 50 and 72", ''),
  ('vyn läcker alla properties för justerade delar', "'properties', jsonb_build_object('_lager', 'L_TRAKTDEL'))\n                    order by jd ->> 'partKey')", "'properties', jsonb_build_object('_lager', 'L_TRAKTDEL', 'x', 1))\n                    order by jd ->> 'partKey')"),
  ('authenticated får skriva tabellen direkt', 'grant select on public.objekt_traktgrans_justerad to authenticated;', 'grant all on public.objekt_traktgrans_justerad to authenticated;'),
  ('nyckel utan TRDEL_NR_K-reserv', "coalesce(nullif(btrim(t.f -> 'properties' ->> 'TRDEL_ID'), ''), nullif(btrim(t.f -> 'properties' ->> 'TRDEL_NR_K'), ''))", "nullif(btrim(t.f -> 'properties' ->> 'TRDEL_ID'), '')"),
  ('nyckeln trimmas inte', "nullif(btrim(t.f -> 'properties' ->> 'TRDEL_NR_K'), '')", "nullif(t.f -> 'properties' ->> 'TRDEL_NR_K', '')"),
  ('vyn ger MultiPolygon-delarna som en polygon (delindex tappas)', "when 'MultiPolygon' then t.f -> 'geometry' -> 'coordinates'", "when 'MultiPolygon' then jsonb_build_array(t.f -> 'geometry' -> 'coordinates' -> 0)"),
  ('vyn är inte security_invoker', 'with (security_invoker = true) as\nselect g.objekt_id,\n       jsonb_build_object(\n         \'type\', \'FeatureCollection\',\n         \'features\',\n         case', 'as\nselect g.objekt_id,\n       jsonb_build_object(\n         \'type\', \'FeatureCollection\',\n         \'features\',\n         case'),
]
dod = 0
for namn, fran, till in M:
    if fran not in orig:
        print(f'FEL i mutanten (träffar inget): {namn}'); sys.exit(3)
    open('/tmp/mutant.sql', 'w', encoding='utf8').write(orig.replace(fran, till, 1))
    if kor('/tmp/mutant.sql'): print('ÖVERLEVDE  ' + namn)
    else: print('död       ' + namn); dod += 1
print(f'{dod} av {len(M)} mutanter dödades')
