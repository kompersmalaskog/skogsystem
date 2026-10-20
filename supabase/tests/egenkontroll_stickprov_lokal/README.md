Lokalt test av egenkontrollens månadsstickprov (PR 5), mot en tom Postgres 16 med stubbtabeller (ingen Supabase behövs).

    createdb t
    psql -v ON_ERROR_STOP=1 -q -d t -f stub.sql
    for f in ../../migrations/20261020093{115,121,149}_egenkontroll_stickprov_*.sql; do psql -v ON_ERROR_STOP=1 -q -d t -f $f; done
    # del 4 har första dragningsmånad 2026-11-01; testet kör den med 2000-01-01 så den går att prova idag:
    sed "s/date '2026-11-01'/date '2000-01-01'/" ../../migrations/20261020093202_egenkontroll_stickprov_4_publik.sql | psql -v ON_ERROR_STOP=1 -q -d t
    for f in ../../migrations/202610201301{00,}*_egenkontroll_stickprov_5*.sql; do :; done   # 5a, sedan 5b (ersätter dragningen):
    psql -v ON_ERROR_STOP=1 -q -d t -f ../../migrations/20261020130000_egenkontroll_stickprov_5a_ankare_forsok.sql
    psql -v ON_ERROR_STOP=1 -q -d t -f ../../migrations/20261020130100_egenkontroll_stickprov_5b_dra_med_granne.sql
    psql -v ON_ERROR_STOP=1 -q -d t -f data.sql
    psql -v ON_ERROR_STOP=1 -q -d t -f test.sql

data.sql är prod-objekten (id, namn, typ, plats, avslutsdatum) 2026-10-20; ett objekt har fått faktisk_slut i stället för tidsstämpel för att prova reservvägen.
Testet slutar med raderna "rättigheter ok" och inga felmeddelanden. Förväntat bland annat: "omräknat ankare stämmer: true" (regel version 2: första kandidaten i fro-ordning med en granne), "grannar = brute force: true",
"inget kluster: valda=1 … ankare_forsok=3", "aldrig ensam när ett kluster finns true", och oktober (6 kandidater, 100 dragningar i en rullad transaktion),
"tunn månad ... valda=2 förklaring=tunn_manad", "ankare utan plats: valda=1", och exakt EN notis i kön för Martin med skickas_at=infinity.
