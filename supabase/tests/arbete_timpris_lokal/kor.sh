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

# Migrationen slås upp på sitt NAMN, inte på sin version: prod stämplar
# tidpunkten för körningen, och filen döps om till den versionen efteråt. Ett
# hårdkodat tidsstämpel hade därför pekat på en fil som inte längre finns.
MIG=( "$ROT"/supabase/migrations/*_arbete_timpris.sql )
if [ "${#MIG[@]}" -ne 1 ] || [ ! -f "${MIG[0]}" ]; then
  echo "FEL: hittade ${#MIG[@]} migrationer som matchar *_arbete_timpris.sql — ska vara exakt 1" >&2
  exit 1
fi

echo "— migrationen (${MIG[0]##*/}) —"
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f ${MIG[0]}"

echo "— provet (rullas tillbaka) —"
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $HAR/test.sql"

echo "— städar —"
su postgres -c "psql -q -d $DB -c 'drop table if exists arbete_timpris'"
echo "KLART"
