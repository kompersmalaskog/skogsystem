Lokalt test av egenkontrollens noteringar (PR 9a), mot en tom Postgres 16 med stubbtabeller (ingen Supabase behövs).

    createdb t
    psql -v ON_ERROR_STOP=1 -q -d t -f stub.sql
    psql -v ON_ERROR_STOP=1 -q -d t -f ../../migrations/20261021074334_egenkontroll_notering_1_tabell.sql
    psql -v ON_ERROR_STOP=1 -q -d t -f ../../migrations/20261021074341_egenkontroll_notering_2_las.sql
    psql -v ON_ERROR_STOP=1 -q -d t -f test.sql

Sista raden ska säga `rader_som_inte_ar_true = 0`. Testet täcker kontrollerna (koordinater, pil, tom etikett, förskjutning, foto från annan runda) och låset:
notering på öppen runda -> rundan avslutas -> INSERT, UPDATE och DELETE ger 23514 och raden är orörd. Tom etikett via UPDATE ger 23514, så appen gör DELETE.
Samma prov mot prod (2026-10-21, allt borttaget efteråt) gav samma utfall för det som går att prova där; UPDATE/DELETE på en KLAR runda provas bara här.
