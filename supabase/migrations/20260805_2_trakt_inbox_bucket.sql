-- 2026-08-05  storage: privat bucket trakt-inbox
--
-- Staging för inkommande trakthandlingar (.envz/.zip). Innehåller markägares namn, telefon
-- och e-post → får ALDRIG vara anon-läsbar. Filen når aldrig routen som multipart (Vercels
-- ~4,5 MB body-gräns); i stället laddar klienten upp hit via en signerad uppladdnings-URL
-- (createSignedUploadUrl, genereras server-side med service-role) och routen laddar ner här
-- med service-role.
--
-- INGA policies för anon/authenticated: RLS default-deny gör att bara service-role (som går
-- förbi RLS) kan läsa/skriva. Den signerade uppladdnings-URL:ens token kringgår RLS.
-- Klienten läser ALDRIG härifrån.
--
-- KRÄVER att 20260805_1_storage_globala_policies_snava.sql körts först — annars täcker de
-- gamla dfrif8-policyerna fortfarande denna bucket för anon (bucket_id <> 'kartbilder').
--
-- Medvetet utan allowed_mime_types: .envz rapporteras ofta som application/octet-stream av
-- webbläsaren; en mime-vitlista skulle avvisa uppladdningen. Storlekstaket är server-backstop,
-- klient-sidans storlekskontroll är den begripliga felvägen.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('trakt-inbox', 'trakt-inbox', false, 26214400)   -- 25 MB (envz ~8,4 MB + marginal)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;
