#!/usr/bin/env bash
# Provar migrationen 20261025180000_vilobrott_hanterat.sql mot en lokal Postgres med riktiga roller och RLS.
#   pg_ctlcluster 16 main start; su postgres -c "createdb vilobrott_test"; bash supabase/tests/vilobrott_hanterat_lokal/kor.sh
# Avslutar med 1 om något prov faller. MIG=<fil> provar en annan (eller ingen: MIG=) migration — då ska proven falla.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"; ROT="$DIR/../.."
DB="${DB:-vilobrott_test}"
MIG="${MIG-20261025180000_vilobrott_hanterat.sql}"
P() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $DB" ; }
su postgres -c "psql -X -q -d $DB" <<<"drop schema if exists test cascade; drop schema if exists storage cascade; drop schema if exists auth cascade; drop schema public cascade; create schema public;" >/dev/null 2>&1
P < "$ROT/tests/sakerhet_lokal/stub.sql" >/dev/null || { echo "stub föll"; exit 1; }
P < "$DIR/stub.sql" >/dev/null || { echo "vilobrott-stub föll"; exit 1; }
if [ -n "$MIG" ]; then P < "$ROT/migrations/$MIG" >/dev/null || { echo "migrationen föll"; exit 1; }; fi
ut=$(P < "$DIR/test.sql" 2>&1); kod=$?
echo "$ut" | grep -oE "(OK|FEL) .*" || true
if [ $kod -ne 0 ] || echo "$ut" | grep -qE "FEL |ERROR"; then echo "$ut" | grep ERROR | head -3; echo "✗ föll"; exit 1; fi
echo "✓ alla prov"
