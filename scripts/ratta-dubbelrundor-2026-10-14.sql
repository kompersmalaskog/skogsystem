-- Rättning av de fyra flyttdag-rader som drabbats av dubbelrunda-felet och
-- sluttid-före-start-felet (se lib/lastbilRunda.ts, kedjeregeln).
--
-- KÖR INTE FÖRE GRANSKNING. Martin kör i Supabase SQL editor, efter att han sett
-- före/efter-tabellen. Idempotent: varje UPDATE har gammalt värde i WHERE, så en
-- omkörning (eller en rad som ändrats sedan granskningen) rör ingenting.
--
-- ORSAK (kort): förarens "Framme på LBC" stängde rundan medan bilen var ute
-- (600 m, 13,8 km, 40 km från basen). Nästa cron-cykel öppnade en NY auto-runda
-- vid utekörningens ursprungliga avfärd. De första milen och litrarna räknades
-- därför i två rundor. Rättningen flyttar den senare rundans start till den
-- förras sluttid och räknar om mätare, bränsle och tid ur lastbil_logg — samma
-- sak den nya koden gör från och med nu.
--
--   rad        före → efter                         partner (behålls orörd)
--   c454bda3   108,0 km → 66,5 km   (−41,5)         ff5ec997  41,5 km  ✓ summan stämmer
--   95ab0c15    90,1 km → 19,3 km   (−70,8)         fbc62bae  70,8 km  ✓
--   9f54fd7e   167,0 km → 74,9 km   (−92,1)         7d42c5c5  92,4 km  (0,3 km glapp, se nedan)
--   514d88e1   sluttid 11 aug → = starttid, −0,1 l → NULL, påhittad hemresa → NULL
--
-- 7d42c5c5 / 9f54fd7e: 0,3 km skiljer eftersom 9f54fd7e:s gamla startpunkt låg
-- 250 m efter 7d42c5c5:s. Ingen dubbelräkning återstår.
--
-- GRÄNSFALL ATT VETA: 9f54fd7e är Joacims runda (medarbetare_id satt) och räknas
-- som arbetstid i admins arbetstidsgränser (flyttdag.total_tid_min). Den går från
-- 406 till 211 min. 7d42c5c5 (196 min) täckte redan samma förmiddag, så 1 sep
-- räknas efter rättningen en gång (196 + 211 = 407 min, 03:50–10:37) i stället för
-- två (196 + 406). Lönen läser inte flyttdag.
--
-- ÅNGRA (om något ser fel ut): värdena "före" står i kommentarerna vid varje UPDATE.

begin;

-- 20 aug: Martins runda ff5ec997 stängdes 05:44:30 med bilen 600 m utanför radien.
update flyttdag set
  starttid           = '2026-08-20 05:44:30.47+00',   -- före: 2026-08-20 04:04:46+00
  start_odometer_m   = 298283340,                      -- före: 298241850
  start_odometer_tid = '2026-08-20 05:42:40+00',       -- före: 2026-08-20 04:04:46+00
  matare_km          = 66.5,                           -- före: 108
  bransle_l          = 31.3,                           -- före: 50.8
  total_tid_min      = 166                             -- före: 266
where id = 'c454bda3-3730-4079-909e-21d742d2ca7c'
  and starttid = '2026-08-20 04:04:46+00' and matare_km = 108;

-- 28 aug: Joacims runda fbc62bae: "Kör hem" 10:14:12 och "Framme" 10:14:15, 13,8 km från basen.
update flyttdag set
  starttid           = '2026-08-28 10:14:15.091+00',  -- före: 2026-08-28 08:00:06+00
  start_odometer_m   = 298835240,                      -- före: 298764380
  start_odometer_tid = '2026-08-28 10:10:31+00',       -- före: 2026-08-28 08:00:06+00
  matare_km          = 19.3,                           -- före: 90.1
  bransle_l          = 6.6,                            -- före: 41.6
  total_tid_min      = 18                              -- före: 152
where id = '95ab0c15-ca30-4088-9f6e-368bcc37262d'
  and starttid = '2026-08-28 08:00:06+00' and matare_km = 90.1;

-- 1 sep: Joacims runda 7d42c5c5: "Kör hem" 07:06:15 och "Framme" 07:06:20, 40 km från basen.
update flyttdag set
  starttid           = '2026-09-01 07:06:20.703+00',  -- före: 2026-09-01 03:51:46+00
  start_odometer_m   = 299034550,                      -- före: 298942410
  start_odometer_tid = '2026-09-01 06:56:56+00',       -- före: 2026-09-01 03:51:46+00
  matare_km          = 74.9,                           -- före: 167
  bransle_l          = 40.1,                           -- före: 86.6
  total_tid_min      = 211                             -- före: 406
where id = '9f54fd7e-43b7-40d6-aaee-abf9a99c2fdf'
  and starttid = '2026-09-01 03:51:46+00' and matare_km = 167;

-- 12 aug: rundan startades på basen 18:33 och bilen rörde sig aldrig.
-- Säkerhetsnätet gav den sluttid 11 aug 10:43 (en fryst parkeringspunkt).
update flyttdag set
  sluttid       = '2026-08-12 18:33:09.684+00',        -- före: 2026-08-11 10:43:30+00
  bransle_l     = null,                                -- före: -0.1 (mätarbrus)
  hem_km        = null,                                -- före: 1.4 (ur punkter från 11 aug)
  tid_hem_min   = null,                                -- före: 3
  total_tid_min = 0                                    -- före: null
where id = '514d88e1-038a-453e-8f65-ea571593a5d2'
  and sluttid = '2026-08-11 10:43:30+00';

-- ── Kvitto ──────────────────────────────────────────────────────────────
-- Förväntat: 4 rader enligt "efter" ovan, och noll överlappande par.
select left(id::text, 8) as runda, starttid, sluttid, matare_km, bransle_l, total_tid_min
from flyttdag
where left(id::text, 8) in ('c454bda3', '95ab0c15', '9f54fd7e', '514d88e1')
order by starttid;

select count(*) as overlappande_par
from flyttdag a
join flyttdag b on a.id < b.id and a.starttid < b.sluttid and b.starttid < a.sluttid
where a.sluttid >= a.starttid and b.sluttid >= b.starttid and a.starttid >= '2026-08-01';

select count(*) as sluttid_fore_start from flyttdag where sluttid < starttid;

-- Granska kvittot, kör sedan COMMIT; (eller ROLLBACK; om något ser fel ut).
