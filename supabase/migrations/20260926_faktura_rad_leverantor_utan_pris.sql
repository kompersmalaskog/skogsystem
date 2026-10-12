-- faktura_rad: en leverantörsrad får VÄNTA på sitt belopp.
-- Martin kör i Supabase SQL editor. Idempotent.
--
-- ─────────────────────────────────────────────────────────────────────────
-- PROBLEMET: två regler i #565 motsäger varandra, och radbyggaren gick rakt
-- in i motsägelsen första gången den kördes.
--
--   constraint rad_pris_agare
--     check ((prisagare = 'leverantor') = (a_pris is not null))
--
--   status ... check (status in ('klar','vantar_leverantorsfaktura','fel'))
--
-- Statusen 'vantar_leverantorsfaktura' finns just för tillståndet "vi vet att
-- det är en leverantörskostnad men beloppet har inte kommit än" — en flytt
-- över 30 km körs av åkeri och priset är okänt tills deras faktura dyker upp.
-- Likhetstecknet i constrainten förbjuder exakt det: en 'leverantor'-rad
-- MÅSTE ha ett belopp, alltid.
--
-- Raden går alltså inte att spara i det tillstånd den ska kunna ha. Fem av
-- sex aktiva flyttar i fakturaunderlag_flytt är över 30 km, så det är
-- normalfallet och inte ett hörn.
--
-- RÄTTELSEN: behåll KÄRNREGELN — exakt en radtyp får lagra belopp — men
-- släpp kravet att den alltid gör det.
--
--   före:  (prisagare = 'leverantor') = (a_pris is not null)
--   efter:  a_pris is null or prisagare = 'leverantor'
--
-- Det som skyddades är kvar: en 'app'-rad kan fortfarande ALDRIG bära ett
-- belopp, så det uträknade ackordspriset går inte att spara "för
-- bekvämlighets skull" — och acord_flyttkostnad (borttagen i #423) kan inte
-- återuppstå inuti radmodellen. En 'fortnox'-rad kan inte heller lagra det
-- hämtade priset.
--
-- Det som släpps är bara riktningen åt andra hållet: en leverantörsrad utan
-- belopp är ett GILTIGT, ärligt tillstånd. Att i stället sätta prisagare
-- 'app' medan man väntar hade varit en lögn — prisets ägare byter inte när
-- fakturan kommer, det är leverantören hela vägen.
--
-- PARET SOM GÖR TILLSTÅNDET LÄSBART läggs till samtidigt: saknas beloppet
-- ska raden säga att den väntar. Utan den kan en leverantörsrad stå som
-- 'klar' utan pris och tyst bli noll kronor på fakturan.
-- ─────────────────────────────────────────────────────────────────────────

alter table faktura_rad drop constraint if exists rad_pris_agare;

alter table faktura_rad add constraint rad_pris_agare
  check (a_pris is null or prisagare = 'leverantor');

alter table faktura_rad drop constraint if exists rad_leverantor_vantar;

alter table faktura_rad add constraint rad_leverantor_vantar
  check (
    prisagare <> 'leverantor'
    or a_pris is not null
    or status = 'vantar_leverantorsfaktura'
  );

comment on constraint rad_pris_agare on faktura_rad is
  'Endast prisagare=leverantor FÅR bära ett belopp. app och fortnox räknas '
  'respektive hämtas vid visning och lagras aldrig. Kravet att en '
  'leverantörsrad ALLTID har ett belopp är borttaget (20260926) — den kan '
  'vänta på leverantörens faktura, och då bär den status '
  'vantar_leverantorsfaktura (se rad_leverantor_vantar).';

-- ── Kvitto ──────────────────────────────────────────────────────────────
-- Förväntat: två constraints, och noll befintliga rader som bryter mot dem
-- (tabellen är tom i dag).
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'faktura_rad'::regclass
  and conname in ('rad_pris_agare', 'rad_leverantor_vantar')
order by conname;

select count(*) as rader_i_tabellen from faktura_rad;
