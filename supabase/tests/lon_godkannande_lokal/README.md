Lokalt test av förarens godkännande (nollställning + notis + kvittering), migrationen `20261021100000_lon_forarens_godkannande.sql`,
mot en tom Postgres 16 med stubbtabeller (ingen Supabase behövs).

    createdb t
    psql -v ON_ERROR_STOP=1 -q -d t -f stub.sql
    psql -v ON_ERROR_STOP=1 -q -d t -f ../../migrations/20261021100000_lon_forarens_godkannande.sql
    psql -v ON_ERROR_STOP=1 -q -d t -f test.sql

Sista raden ska säga `rader_som_inte_ar_true = 0`. Mutationskontroll: ändra en rad i migrationen (t.ex. ta bort en kolumn ur jämförelsen) och kör om — minst en rad ska bli false.
