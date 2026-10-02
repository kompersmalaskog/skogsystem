-- ForestLink-tillägg (FL) på timpeng: +10 kr/tim på timpriset för maskiner
-- med ForestLink. Beloppet bor i koden (lib/ekonomi/forestlink.ts,
-- FORESTLINK_KR_PER_TIM) — den här kolumnen säger bara VILKA maskiner som har FL.
--
-- ADDITIV: en ny kolumn med default true (de flesta maskiner har FL), så
-- befintliga rader får true utan omskrivning av något annat. JD810E sätts
-- till false. Kör FÖRE merge — koden läser kolumnen i Översikten, Mot ackord,
-- Per klass och fakturaunderlaget och ger ett tydligt fel om den saknas
-- (aldrig ett tyst fallback-pris).

alter table dim_maskin
  add column if not exists forestlink boolean not null default true;

comment on column dim_maskin.forestlink is
  'ForestLink-ansluten: true = +FORESTLINK_KR_PER_TIM kr/tim på timpeng '
  '(lib/ekonomi/forestlink.ts). Konstant hela året, ingen datumhistorik.';

update dim_maskin set forestlink = false where maskin_id = 'JD810E';

-- Kontroll: 810E ska stå false, alla övriga true
select maskin_id, visningsnamn, forestlink from dim_maskin order by maskin_id;
