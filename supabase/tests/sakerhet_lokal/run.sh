#!/usr/bin/env bash
# Provar säkerhetsmigrationerna mot en lokal Postgres (som superanvändare) med riktiga roller och RLS.
#   su postgres -c "createdb sakerhet_test" && bash supabase/tests/sakerhet_lokal/run.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"; MIG="$DIR/../../migrations"
DB="${DB:-sakerhet_test}"
P() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $DB" ; }
su postgres -c "psql -X -q -d $DB" <<<"drop schema if exists test cascade; drop schema if exists storage cascade; drop schema if exists auth cascade; drop schema public cascade; create schema public;" >/dev/null
P < "$DIR/stub.sql"
for f in "$@"; do P < "$MIG/$f"; done
