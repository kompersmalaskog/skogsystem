#!/bin/sh
# Provar lasscykeln (migration 20261118100350) mot en TOM lokal Postgres:
# stub, migrationen, test.sql. Sista raderna ska vara "ALLA KONTROLLER OK"
# och "MUTATIONSKONTROLL OK".
#
#   pg_ctlcluster 16 main start
#   sh supabase/tests/skotar_lass_cykel_lokal/kor.sh
#
# MIGRATION=<fil> provar en annan version (mutationskontroll: ta bort strict
# eller bygg tillbaka självjoinen och se att testet faller).
set -e
D=$(cd "$(dirname "$0")" && pwd)
M="$D/../../migrations"
DB=t_lasscykel
su postgres -c "dropdb --if-exists $DB" 2>/dev/null || true
su postgres -c "createdb $DB"
# Rollerna är gemensamma för klustret och kan finnas från ett annat test.
ROLLER="do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$; do \$\$ begin create role service_role; exception when duplicate_object then null; end \$\$;"
{ echo "$ROLLER"; grep -vE '^create role (authenticated|service_role)' "$D/stub.sql"; } \
  | su postgres -c "psql -v ON_ERROR_STOP=1 -q -t -A -d $DB -f -" 2>&1 | { grep -v NOTICE || true; }
su postgres -c "psql -v ON_ERROR_STOP=1 -q -t -A -d $DB -f -" \
  < "${MIGRATION:-$M/20261118100350_skotar_lass_cykel.sql}" 2>&1 | { grep -v NOTICE || true; }
# set -e får inte döda skriptet innan felet skrivits ut — fånga koden själv.
UT=$(su postgres -c "psql -v ON_ERROR_STOP=1 -q -t -A -d $DB -f -" < "$D/test.sql" 2>&1) || true
echo "$UT" | grep -E 'OK|FEL|MUTANT|ERROR' || true
# EN TOM UTDATA ÄR INGET GODKÄNT. Kräv båda raderna, annars kördes testet inte.
# Skilj "en kontroll FÖLL" från "testet kördes aldrig" — ett missvisande
# felmeddelande är lika illa som ett missat fel.
if echo "$UT" | grep -q 'ERROR'; then echo "— en kontroll föll, se raden ovan"; exit 1; fi
echo "$UT" | grep -q 'ALLA KONTROLLER OK' || { echo "FEL: kontrollerna kördes aldrig (tom utdata)"; exit 1; }
echo "$UT" | grep -q 'MUTATIONSKONTROLL OK' || { echo "FEL: mutationskontrollen kördes aldrig"; exit 1; }
