#!/usr/bin/env bash
# Kör provet för arbete_timpris mot en LOKAL Postgres — aldrig mot prod.
#
#   bash supabase/tests/arbete_timpris_lokal/kor.sh
#
# Kräver en startad kluster och rollerna authenticated/service_role:
#   pg_ctlcluster 16 main start
#   su postgres -c "createdb arbetspris_test"
#   su postgres -c "psql -d arbetspris_test -c 'create role authenticated; create role service_role'"
set -euo pipefail

DB="${DB:-arbetspris_test}"
HAR="$(cd "$(dirname "$0")" && pwd)"
ROT="$(cd "$HAR/../../.." && pwd)"

echo "— migrationen —"
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $ROT/supabase/migrations/20261116120000_arbete_timpris.sql"

echo "— provet (rullas tillbaka) —"
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $HAR/test.sql"

echo "— städar —"
su postgres -c "psql -q -d $DB -c 'drop table if exists arbete_timpris'"
echo "KLART"
