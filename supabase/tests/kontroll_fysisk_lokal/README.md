Lokalt test för `20261024180014_kontroll_stock_fysisk_1_rensa.sql`, `…_2_unikt_index.sql` och
`20261024180041_kalibrering_kontroller_funktion.sql`.
Kör: `sh supabase/tests/kontroll_fysisk_lokal/kor.sh` (Postgres 15+ — `NULLS NOT DISTINCT`).
Täcker: maskinen numrerar om stammarna i varje kumulativ fil (samma fysiska stock under olika stam_nummer
rensas), tidigast kontroll_datum behålls före lägst id, lika datum → lägst id, omätt stock (NULL-mättid)
räknas som lika, en riktig omkontroll (annan operatörsmättid) blir egen rad, matpunkter följer med (cascade),
indexet vaktar omnumrerade kopior, `ON CONFLICT … DO NOTHING` mot nyckeln släpper bara igenom det nya,
spärren avbryter vid avvikande kopior, och `kalibrering_kontroller()` döljer kontroller utan egen stock
utan att radera något.
