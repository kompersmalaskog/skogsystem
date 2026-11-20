#!/usr/bin/env bash
# Kör: bash supabase/tests/avvikelse_lokal/kor.sh (lokal Postgres 16, pg_ctlcluster 16 main start)
set -e
cd "$(dirname "$0")"
DB=avvikelse_test
su postgres -c "dropdb --if-exists $DB" >/dev/null; su postgres -c "createdb $DB"
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB" < stub.sql
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB" < ../../migrations/20261104093236_avvikelse_bevis.sql
su postgres -c "psql -tA -v ON_ERROR_STOP=1 -d $DB" < test.sql 2>&1 | grep -E "OK|FEL|ERROR"
