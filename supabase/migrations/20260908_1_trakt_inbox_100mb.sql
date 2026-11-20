-- 2026-09-08  trakt-inbox: höj file_size_limit 25 MB -> 100 MB
--
-- 25 MB (26214400) sattes 2026-08-05 när vi trodde envz var ~8 MB. Verkligheten: en stor
-- trakt uppdelad i FYRA traktkartor + en översiktskarta blev 43,6 MB (889174_02) och avvisades.
-- Kartorna ensamma var 39 MB. 100 MB (104857600) ger rejäl marginal utan att ta bort taket —
-- ett avvisat objekt mitt i en arbetsdag ska aldrig bero på att taket satts orealistiskt lågt.
-- Importen loggar dessutom en varning i import_varningar redan vid 50 MB (se route.ts) så vi
-- ser när vi närmar oss taket i stället för att upptäcka det genom ett avvisande.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('trakt-inbox', 'trakt-inbox', false, 104857600)   -- 100 MB
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;
