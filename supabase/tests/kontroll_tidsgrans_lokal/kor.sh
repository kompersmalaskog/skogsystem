#!/bin/sh
# Kör mot en tom lokal Postgres (peer-auth som postgres):
#   sh supabase/tests/kontroll_tidsgrans_lokal/kor.sh
set -e
cd "$(dirname "$0")"
DB=kontroll_tidsgrans_test
su postgres -c "dropdb --if-exists $DB && createdb $DB"
su postgres -c "cd $(pwd) && psql -q -v ON_ERROR_STOP=1 -d $DB -f test.sql"
su postgres -c "dropdb $DB"
