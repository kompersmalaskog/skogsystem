Lokalt test av besöksmigrationen (`20261022170000_besok_pa_trakten.sql`) mot en tom Postgres 16 med stubbtabeller (ingen Supabase behövs).

    ./kor.sh          # som root i sandlådan: använder användaren postgres; annars se stegen i skriptet

Sista raderna ska säga `rader_som_inte_ar_true = 0` och `kontroller = 31`. Testet täcker: ingen anon-åtkomst till någon tabell eller funktion, token-tabellen går inte att läsa av någon inloggad (bara via
funktionerna, bara admin), förare kan inte skriva besök, kvittens och SMS-logg bara som sig själv och med servertid, en kvittens per (besök, maskin), volymfunktionen bara för service_role.
Mutationskontroll: tio ändringar av migrationen (revoke borta, policy `true`, trigger borta, adminkravet borta, tokenlängd) — alla ger minst en röd rad.
