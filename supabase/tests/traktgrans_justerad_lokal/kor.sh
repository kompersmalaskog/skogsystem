#!/usr/bin/env bash
# Provar migrationen 20261125170026_traktgrans_justerad.sql mot en lokal Postgres med riktiga roller och RLS (stubbade objekt/objekt_geometri/medarbetare).
# Kör: bash supabase/tests/traktgrans_justerad_lokal/kor.sh   (kräver pg_ctlcluster 16 main start)
set -euo pipefail
cd "$(dirname "$0")/../../.."
DB=traktgrans_test
su postgres -c "dropdb --if-exists $DB" >/dev/null; su postgres -c "createdb $DB"
P() { su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $DB $*"; }
P "-c \"do \\\$\\\$ begin create role authenticated; exception when duplicate_object then null; end \\\$\\\$; do \\\$\\\$ begin create role anon; exception when duplicate_object then null; end \\\$\\\$;\""
P "-f supabase/tests/traktgrans_justerad_lokal/stub.sql"
MIG="${MIGRATION:-supabase/migrations/20261125170026_traktgrans_justerad.sql}"
P "-f $MIG"
P "-f supabase/tests/traktgrans_justerad_lokal/test.sql"
echo "ALLA KONTROLLER OK"
