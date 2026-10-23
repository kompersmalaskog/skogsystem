#!/bin/sh
# Kör BÅDA besöksmigrationerna mot en tom lokal Postgres och provar uppstramningen (test2.sql). Sista raderna ska säga: rader_som_inte_ar_true = 0
# MIGRATION2=<fil> provar en annan version av andra migrationen (mutationskontroll).
set -e
D=$(cd "$(dirname "$0")" && pwd)
su postgres -c "dropdb --if-exists t_besok2" 2>/dev/null
su postgres -c "createdb t_besok2"
for f in "$D/stub.sql" "$D/stub2.sql" "$D/../../migrations/20261022170000_besok_pa_trakten.sql" "${MIGRATION2:-$D/../../migrations/20261023190000_besok_uppstramning.sql}" "$D/test2.sql"; do
  su postgres -c "psql -v ON_ERROR_STOP=1 -q -t -A -d t_besok2 -f -" < "$f" 2>&1 | { grep -v NOTICE || true; }
done
