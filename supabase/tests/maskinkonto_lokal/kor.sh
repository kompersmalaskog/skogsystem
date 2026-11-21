#!/bin/sh
# Provar "Maskinen som maskin" (migrationerna 20261120150001–3) mot en TOM lokal Postgres med riktiga roller och RLS:
# #1215:s stub + stub2.sql, #1215:s migrationer, de tre nya, test.sql, sedan mutanter som alla ska få testet att FALLA.
#   pg_ctlcluster 16 main start
#   sh supabase/tests/maskinkonto_lokal/kor.sh        (tabellen "tabell | läsa | skriva | förväntat | ok" skrivs ut)
set -e
D=$(cd "$(dirname "$0")" && pwd)
MIGDIR="${MIGDIR:-$D/../../migrations}"
DB=t_maskinkonto
PSQL="psql -v ON_ERROR_STOP=1 -q -t -A -d $DB -f -"
kor_en() {
  su postgres -c "dropdb --if-exists $DB" 2>/dev/null || true
  su postgres -c "createdb $DB"
  { echo "do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$; do \$\$ begin create role service_role; exception when duplicate_object then null; end \$\$; do \$\$ begin create role anon; exception when duplicate_object then null; end \$\$;"
    grep -vE '^create role (authenticated|service_role|anon)' "$D/../forare_fran_opti_lokal/stub.sql"; cat "$D/stub2.sql"; } | su postgres -c "$PSQL" 2>&1 | { grep -v NOTICE || true; }
  for f in 20261120140001_forare_fran_opti_1_kolumner 20261120140002_forare_fran_opti_2_slagning 20261120140003_forare_fran_opti_3_omrakning \
           20261120140004_forare_fran_opti_4_triggers 20261120150001_maskinkonto_1_grund 20261120150002_maskinkonto_2_sparr 20261120150003_maskinkonto_3_maskin_pa_raden 20261120150004_maskinkonto_4_ledighet_per_maskin 20261120170001_maskinkonto_5_kod_notis 20261121080001_maskinkonto_6_auto_konto; do
    su postgres -c "$PSQL" < "$MIGDIR/$f.sql" 2>&1 | { grep -v NOTICE || true; }
  done
  su postgres -c "$PSQL" < "$D/test.sql" 2>&1 || true
}
UT=$(kor_en)
echo "$UT"
if echo "$UT" | grep -q 'ERROR'; then echo "— en kontroll föll, se raden ovan"; exit 1; fi
echo "$UT" | grep -q 'ALLA KONTROLLER OK' || { echo "FEL: kontrollerna kördes aldrig"; exit 1; }
[ -n "$SKIPPA_MUTANTER" ] && exit 0
T=$(mktemp -d)
mutant() { # namn fil sed-uttryck
  rm -rf "$T/m"; mkdir "$T/m"; cp "$D/../../migrations"/20261120140*.sql "$D/../../migrations"/20261120150*.sql "$D/../../migrations"/20261120170*.sql "$D/../../migrations"/20261121080*.sql "$T/m/"
  sed -i "$3" "$T/m/$2"
  if cmp -s "$D/../../migrations/$2" "$T/m/$2"; then echo "FEL: mutanten '$1' ändrade ingenting"; exit 1; fi
  R=$(MIGDIR="$T/m" SKIPPA_MUTANTER=1 sh "$0" 2>&1) && { echo "FEL: mutanten '$1' överlevde"; exit 1; }
  echo "mutant dödad: $1"
}
mutant "spärren släpper igenom maskinkontot" 20261120150002_maskinkonto_2_sparr.sql "s/using (not (select public.ar_maskinkonto())) with check (not (select public.ar_maskinkonto()))', t);/using (true) with check (true)', t);/"
mutant "ar_maskinkonto är aldrig sant" 20261120150001_maskinkonto_1_grund.sql "s/where user_id = auth.uid() and roll = 'maskin');/where false);/"
mutant "medarbetare kan ändras av maskinkontot" 20261120150002_maskinkonto_2_sparr.sql "s/create policy maskinkonto_nekar_upd on public.medarbetare as restrictive for update to authenticated using (not (select public.ar_maskinkonto())) with check (not (select public.ar_maskinkonto()));//"
mutant "maskinen sätts inte på raden" 20261120150003_maskinkonto_3_maskin_pa_raden.sql "s/if m is not null then new.maskin_id := m; end if;//"
mutant "felräknaren spärrar aldrig" 20261120150001_maskinkonto_1_grund.sql "s/r.fel >= 5/r.fel >= 500/g"
mutant "tio fel i rad ger ingen timme" 20261120150001_maskinkonto_1_grund.sql "s/r.fel_rad >= 10/r.fel_rad >= 1000/g"
mutant "timmen blir en minut" 20261120150001_maskinkonto_1_grund.sql "s/interval '1 hour'/interval '1 minute'/g"
mutant "rätt kod nollar inte tio-i-rad" 20261120150001_maskinkonto_1_grund.sql "s/set fel = 0, fel_rad = 0, last_until = null/set fel = 0, last_until = null/"
mutant "maskin_ledighet läcker typen" 20261120150004_maskinkonto_4_ledighet_per_maskin.sql "s/case when l.typ = 'semester' then 'semester' else 'ledig' end/l.typ/"
mutant "maskin_ledighet tar med väntande ansökningar" 20261120150004_maskinkonto_4_ledighet_per_maskin.sql "s/l.status in ('godkänd', 'registrerad')/true/"
mutant "kvittens från maskinkonto får ingen Opti-förare" 20261120150003_maskinkonto_3_maskin_pa_raden.sql "s/w.roll in ('forare', 'maskin')/w.roll = 'forare'/"
mutant "kodnotisen har ingen tvåminutersgräns" 20261120170001_maskinkonto_5_kod_notis.sql "s/senast > clock_timestamp() - interval '2 minutes'/senast > clock_timestamp() + interval '2 minutes'/"
mutant "en nekad kodnotis loggas inte" 20261120170001_maskinkonto_5_kod_notis.sql "s/insert into maskin_upplasning_logg (maskin_id, medarbetare_id, utfall) values (p_maskin, p_med, 'kod_notis_vantar');//"
mutant "gränsen gäller alla personer gemensamt" 20261120170001_maskinkonto_5_kod_notis.sql "s/where l.medarbetare_id = p_med and l.utfall = 'kod_notis'/where l.utfall = 'kod_notis'/"
mutant "inloggade får anropa kodnotis-funktionen" 20261120170001_maskinkonto_5_kod_notis.sql "s/(uuid, text) to service_role;/(uuid, text) to service_role, authenticated;/"
mutant "ingen-push-utfallet saknas i loggens regel (migration 6 äger regeln nu)" 20261121080001_maskinkonto_6_auto_konto.sql "s/'kod_notis_vantar', 'kod_notis_ingen_push',/'kod_notis_vantar',/"
mutant "loggen saknar auto_nekad" 20261121080001_maskinkonto_6_auto_konto.sql "s/, 'auto_nekad'//"
mutant "medarbetare_visning lämnar ut hela namnet" 20261121080001_maskinkonto_6_auto_konto.sql "s/else split_part(trim(m.namn), ' ', 1) end/else trim(m.namn) end/"
mutant "medarbetare_visning kräver ingen medarbetarrad" 20261121080001_maskinkonto_6_auto_konto.sql "s/where public.aktuell_medarbetare_id() is not null/where true/"
mutant "medarbetare_visning tar obegränsat antal id:n" 20261121080001_maskinkonto_6_auto_konto.sql "s/between 1 and 200/between 1 and 200000/"
mutant "anon får anropa medarbetare_visning" 20261121080001_maskinkonto_6_auto_konto.sql "s/(uuid\[\]) to authenticated;/(uuid[]) to authenticated, anon;/"
mutant "loggen saknar auto_konto" 20261121080001_maskinkonto_6_auto_konto.sql "s/'auto_konto', //"
rm -rf "$T"
echo "MUTATIONSKONTROLL OK"
