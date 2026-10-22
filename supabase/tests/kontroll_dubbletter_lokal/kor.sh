#!/bin/sh
# Kör testerna mot en tom lokal Postgres (peer-auth som postgres):
#   sh supabase/tests/kontroll_dubbletter_lokal/kor.sh
set -e
cd "$(dirname "$0")"
DB=kontroll_dubbletter_test
su postgres -c "dropdb --if-exists $DB && createdb $DB"
su postgres -c "cd $(pwd) && psql -q -d $DB -f test.sql"
su postgres -c "dropdb $DB && createdb $DB"
if su postgres -c "cd $(pwd) && psql -q -v ON_ERROR_STOP=1 -d $DB -f test_sparr.sql" 2>sparr.err; then
  echo "FEL: spärren stoppade inte rensningen"; exit 1
fi
grep -q "Avbryter" sparr.err || { echo "FEL: fel orsak till avbrottet"; cat sparr.err; exit 1; }
echo "spärren stoppar rensningen vid avvikande kopior: ok"
rm -f sparr.err
su postgres -c "dropdb $DB"
