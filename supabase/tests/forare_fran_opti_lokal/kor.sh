#!/bin/sh
# Provar "Föraren från Opti" (migrationerna 20261120140001–5) mot en TOM lokal Postgres: stub, migrationerna, test.sql, sedan fyra
# mutanter som alla ska få testet att FALLA. Sista raderna ska vara "ALLA KONTROLLER OK" och "MUTATIONSKONTROLL OK".
#
#   pg_ctlcluster 16 main start
#   sh supabase/tests/forare_fran_opti_lokal/kor.sh
#
# MIGDIR=<mapp> provar en annan uppsättning migrationer (så gör mutationskontrollen).
set -e
D=$(cd "$(dirname "$0")" && pwd)
MIGDIR="${MIGDIR:-$D/../../migrations}"
DB=t_forare_opti
PSQL="psql -v ON_ERROR_STOP=1 -q -t -A -d $DB -f -"
kor_en() {
  su postgres -c "dropdb --if-exists $DB" 2>/dev/null || true
  su postgres -c "createdb $DB"
  ROLLER="do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$; do \$\$ begin create role service_role; exception when duplicate_object then null; end \$\$; do \$\$ begin create role anon; exception when duplicate_object then null; end \$\$;"
  { echo "$ROLLER"; grep -vE '^create role (authenticated|service_role|anon)' "$D/stub.sql"; } | su postgres -c "$PSQL" 2>&1 | { grep -v NOTICE || true; }
  for f in 20261120140001_forare_fran_opti_1_kolumner 20261120140002_forare_fran_opti_2_slagning 20261120140003_forare_fran_opti_3_omrakning \
           20261120140004_forare_fran_opti_4_triggers; do
    su postgres -c "$PSQL" < "$MIGDIR/$f.sql" 2>&1 | { grep -v NOTICE || true; }
  done
  UT=$(su postgres -c "$PSQL" < "$D/test.sql" 2>&1) || true
  echo "$UT"
}
UT=$(kor_en)
echo "$UT" | grep -E 'OK|FEL|ERROR' || true
if echo "$UT" | grep -q 'ERROR'; then echo "— en kontroll föll, se raden ovan"; exit 1; fi
echo "$UT" | grep -q 'ALLA KONTROLLER OK' || { echo "FEL: kontrollerna kördes aldrig (tom utdata)"; exit 1; }

# Mutationskontroll: varje mutant ska göra att testet faller. Ett test som är grönt på en trasig migration bevisar ingenting.
[ -n "$SKIPPA_MUTANTER" ] && exit 0
T=$(mktemp -d)
mutant() { # namn fil sed-uttryck
  rm -rf "$T/m"; mkdir "$T/m"; cp "$D/../../migrations"/2026112014000*.sql "$T/m/"
  sed -i "$3" "$T/m/$2"
  if cmp -s "$D/../../migrations/$2" "$T/m/$2"; then echo "FEL: mutanten '$1' ändrade ingenting"; exit 1; fi
  R=$(MIGDIR="$T/m" SKIPPA_MUTANTER=1 sh "$0" 2>&1) && { echo "FEL: mutanten '$1' överlevde"; exit 1; }
  echo "mutant dödad: $1"
}
mutant "kvittenstiden skyddas inte vid omräkning" 20261120140003_forare_fran_opti_3_omrakning.sql "s/and coalesce(current_setting('app.forare_omrakning', true), '') = 'on'/and false/"
mutant "strukna lass räknas om" 20261120140004_forare_fran_opti_4_triggers.sql "s/if new.status = 'struket' then return new; end if;//"
mutant "ledighet ignoreras i schemat" 20261120140002_forare_fran_opti_2_slagning.sql "s/and not exists (/and true or not exists (/"
mutant "äldsta passet vinner i stället för senaste" 20261120140002_forare_fran_opti_2_slagning.sql "s/order by opti_tid_utc(s.inloggning_tid, s.tid_ar_utc) desc, s.id desc/order by opti_tid_utc(s.inloggning_tid, s.tid_ar_utc) asc, s.id asc/"
rm -rf "$T"
echo "MUTATIONSKONTROLL OK"
