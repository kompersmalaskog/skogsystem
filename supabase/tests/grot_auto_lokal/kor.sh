#!/bin/bash
# Kör: bash supabase/tests/grot_auto_lokal/kor.sh  (kräver lokal Postgres 16: pg_ctlcluster 16 main start)
set -e
cd "$(dirname "$0")/../../.."
DB=grot_auto_test
su postgres -c "dropdb --if-exists $DB && createdb $DB"
su postgres -c "psql -q $DB -v ON_ERROR_STOP=1 -f supabase/tests/grot_auto_lokal/stub.sql -f supabase/migrations/20261121165916_grot_hamtad_automatiskt.sql -f supabase/tests/grot_auto_lokal/test.sql"
