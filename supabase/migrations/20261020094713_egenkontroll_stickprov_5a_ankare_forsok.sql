-- Egenkontrollens månadsstickprov, del 5a: ankare_forsok + tabellkommentaren om den nya regeln. 2026-10-20 (Martin).
-- Rör inte de körda delarna 1-4. ADD COLUMN är ingen UPDATE, så låstriggern berörs inte.
--
-- ankare_forsok = hur många ankare som prövades i fro-ordning innan ett med granne hittades (1 = första duger). Hade inget ankare en
-- granne drogs det första ensamt och ankare_forsok är antalet kandidater. Null = rad dragen med regeln i del 3 (algoritm_version 1).
-- Den blinda fläcken (ett objekt som är kandidat månad efter månad utan att dras) går att räkna fram ur kandidater + valda; ingen regel byggs för den nu.
alter table egenkontroll_stickprov add column if not exists ankare_forsok int;

comment on table egenkontroll_stickprov is
  'Månadens stickprov för egenkontrollen. En rad per månad, dras en gång (första läsningen i månaden), låst. Från algoritm_version 2: ankare = första kandidaten i fro-ordning (md5(fro || '':'' || id), stigande) som har minst en granne inom troskel_km; har ingen det dras den första ensam. ankare_forsok = antal prövade ankare. Se kommentaren i del 1 för hela omräkningen.';
