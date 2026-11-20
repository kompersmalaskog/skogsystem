#!/bin/sh
# Kör testet mot en tom lokal Postgres (peer-auth som postgres):
#   sh supabase/tests/kalibrering_historik_lokal/kor.sh
set -e
cd "$(dirname "$0")"
DB=kalibrering_historik_test
su postgres -c "dropdb --if-exists $DB && createdb $DB"
su postgres -c "cd $(pwd) && psql -q -d $DB -f test.sql"
su postgres -c "dropdb $DB"
