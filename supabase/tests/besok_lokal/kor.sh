#!/bin/sh
# Kör besöksmigrationen mot en tom lokal Postgres och provar den (se README). Sista raderna ska säga: rader_som_inte_ar_true = 0
# MIGRATION=<fil> provar en annan version av migrationen (mutationskontroll). Filerna matas via stdin så att postgres-användaren inte behöver läsrätt.
set -e
D=$(cd "$(dirname "$0")" && pwd)
su postgres -c "dropdb --if-exists t_besok" 2>/dev/null
su postgres -c "createdb t_besok"
for f in "$D/stub.sql" "${MIGRATION:-$D/../../migrations/20261022170000_besok_pa_trakten.sql}" "$D/test.sql"; do
  su postgres -c "psql -v ON_ERROR_STOP=1 -q -t -A -d t_besok -f -" < "$f" 2>&1 | { grep -v NOTICE || true; }
done
