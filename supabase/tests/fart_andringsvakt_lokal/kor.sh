#!/bin/bash
# Kör: bash supabase/tests/fart_andringsvakt_lokal/kor.sh  (kräver lokal Postgres 16: pg_ctlcluster 16 main start)
set -e
cd "$(dirname "$0")/../../.."
DB=fart_andringsvakt_test
su postgres -c "dropdb --if-exists $DB && createdb $DB"
su postgres -c "psql -q $DB -v ON_ERROR_STOP=1 -f supabase/tests/fart_andringsvakt_lokal/stub.sql -f ${MIGRATION:-supabase/migrations/20261122180000_fart_andringsvakt.sql} -f supabase/tests/fart_andringsvakt_lokal/test.sql"
