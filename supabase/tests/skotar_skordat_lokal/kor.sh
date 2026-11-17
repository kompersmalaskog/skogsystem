#!/bin/sh
# Provar skotar_skordat (migration 20261116163052) mot en tom lokal Postgres. Sista raden ska vara "OK skotar_skordat".
# MIGRATION=<fil> provar en annan version (mutationskontroll: den gamla 20261019140033 ska falla).
set -e
D=$(cd "$(dirname "$0")" && pwd)
M="$D/../../migrations"
su postgres -c "dropdb --if-exists t_skordat" 2>/dev/null
su postgres -c "createdb t_skordat"
for f in "$D/stub.sql" "${MIGRATION:-$M/20261116163052_skotar_skordat_maskinobjekt.sql}" "$D/test.sql"; do
  su postgres -c "psql -v ON_ERROR_STOP=1 -q -t -A -d t_skordat -f -" < "$f" 2>&1 | { grep -v '^NOTICE' || true; }
done
