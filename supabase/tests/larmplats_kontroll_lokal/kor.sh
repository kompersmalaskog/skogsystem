#!/usr/bin/env bash
# Provar migrationen 20261110162301_larmplats_kontroll.sql mot en lokal Postgres med riktiga roller och RLS (stubbade objekt/medarbetare).
# Kör: bash supabase/tests/larmplats_kontroll_lokal/kor.sh   (kräver pg_ctlcluster 16 main start)
set -euo pipefail
cd "$(dirname "$0")/../../.."
DB=larmplats_test
su postgres -c "dropdb --if-exists $DB" >/dev/null; su postgres -c "createdb $DB"
P() { su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $DB $*"; }
P "-c \"do \\\$\\\$ begin create role authenticated; exception when duplicate_object then null; end \\\$\\\$; do \\\$\\\$ begin create role anon; exception when duplicate_object then null; end \\\$\\\$;\""
P "-f supabase/tests/larmplats_kontroll_lokal/stub.sql"
P "-f supabase/migrations/20261110162301_larmplats_kontroll.sql"
P "-f supabase/tests/larmplats_kontroll_lokal/test.sql"
echo "ALLA KONTROLLER OK"
