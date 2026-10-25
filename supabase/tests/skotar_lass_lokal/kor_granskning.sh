#!/bin/sh
# Provar granskningsmigrationen (20261025184152) mot en tom lokal Postgres: stub, alla skotar_lass-migrationer i ordning, sedan test_granskning.sql.
# Sista raden ska vara "OK granskning". MIGRATION=<fil> provar en annan version av granskningsmigrationen (mutationskontroll).
set -e
D=$(cd "$(dirname "$0")" && pwd)
M="$D/../../migrations"
su postgres -c "dropdb --if-exists t_granskning" 2>/dev/null
su postgres -c "createdb t_granskning"
FILER="$D/stub.sql"
for f in $(ls "$M" | grep -E '^[0-9]+_skotar_lass_.*\.sql$' | grep -v '20261025184152' | sort); do FILER="$FILER $M/$f"; done
FILER="$FILER ${MIGRATION:-$M/20261025184152_skotar_lass_granskning.sql} $D/test_granskning.sql"
# Rollerna är gemensamma för hela klustret och kan finnas från ett annat test: skapa dem bara om de saknas.
ROLLER="do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$; do \$\$ begin create role anon; exception when duplicate_object then null; end \$\$;"
for f in $FILER; do
  if [ "$f" = "$D/stub.sql" ]; then
    { echo "$ROLLER"; grep -v '^create role authenticated' "$f"; } | su postgres -c "psql -v ON_ERROR_STOP=1 -q -t -A -d t_granskning -f -" 2>&1 | { grep -v NOTICE || true; }
  else
    su postgres -c "psql -v ON_ERROR_STOP=1 -q -t -A -d t_granskning -f -" < "$f" 2>&1 | { grep -v NOTICE || true; }
  fi
done
