#!/usr/bin/env bash
# Kör ALLA databasprov för säkerhetsmigrationerna mot en lokal Postgres: bash supabase/tests/sakerhet_lokal/kor-alla.sh
# (kräver en körande lokal Postgres och databasen sakerhet_test: `pg_ctlcluster 16 main start; su postgres -c "createdb sakerhet_test"`).
# Avslutar med 1 om något prov faller.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONER="${MIGRATIONER:-20261023120000_audio_bucket_privat.sql 20261023120100_medarbetare_skydda_kolumner.sql}"
fel=0
bash "$DIR/run.sh" $MIGRATIONER >/dev/null 2>&1 || { echo "migrationerna gick inte att applicera"; exit 1; }
for t in test_audio test_medarbetare; do
  ut=$(su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d ${DB:-sakerhet_test}" < "$DIR/$t.sql" 2>&1)
  if echo "$ut" | grep -q "ERROR"; then echo "✗ $t: $(echo "$ut" | grep ERROR | head -1)"; fel=1; else echo "✓ $t"; fi
done
exit $fel
