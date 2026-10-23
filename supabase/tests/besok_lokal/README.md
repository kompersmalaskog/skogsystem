Lokalt test av besöksmigrationen (`20261022170000_besok_pa_trakten.sql`) mot en tom Postgres 16 med stubbtabeller (ingen Supabase behövs).

    ./kor.sh          # som root i sandlådan: använder användaren postgres; annars se stegen i skriptet

Sista raderna ska säga `rader_som_inte_ar_true = 0` och `kontroller = 31`. Testet täcker: ingen anon-åtkomst till någon tabell eller funktion, token-tabellen går inte att läsa av någon inloggad (bara via
funktionerna, bara admin), förare kan inte skriva besök, kvittens och SMS-logg bara som sig själv och med servertid, en kvittens per (besök, maskin), volymfunktionen bara för service_role.
Mutationskontroll: tio ändringar av migrationen (revoke borta, policy `true`, trigger borta, adminkravet borta, tokenlängd) — alla ger minst en röd rad.

**Uppstramningen (`20261023190000_besok_uppstramning.sql`):** `./kor2.sh` kör båda migrationerna (+ `stub2.sql` med `ar_admin()` och `service_role` med BYPASSRLS) och `test2.sql`. Ska säga `rader_som_inte_ar_true = 0` och `kontroller = 20`. Täcker: förare ser inga besök/kvittenser/SMS-rader, ingen inloggad kan skriva en kvittens, SMS-logg bara admin och bara som sig själv, händelsekolumnen (fyra värden, default `oppnad`), ingen ändring/radering/tömning, servern (service_role) skriver kvittens, anon fortfarande utestängd. Mutanter (policy `true`, adminkravet borta, revoke borta, kvittens `true`, händelsevärde borta) ger röda rader — utom "kvittens `true`" som täcks av återkallad INSERT-rätt (dubbelt skydd).
