Lokalt test för `20261022091051_kontroll_stock_dubbletter_1_rensa.sql` och `…_2_unikt_index.sql`.
Kör: `sh supabase/tests/kontroll_dubbletter_lokal/kor.sh` (Postgres 15+ — `NULLS NOT DISTINCT`).
Täcker: äldsta kopian behålls, matpunkter följer med (cascade), omätt stock (NULL-mättid) räknas som lika,
en riktig omkontroll (annan operatörsmättid) blir egen rad, Rössmåla-objektet rättas, indexet vaktar,
`ON CONFLICT … DO NOTHING` mot nyckeln släpper bara igenom det nya, och spärren avbryter vid avvikande kopior.
