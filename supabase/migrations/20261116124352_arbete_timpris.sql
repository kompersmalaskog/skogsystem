-- Timpriset för VÅRT EGET manuella arbete, så fakturaunderlaget kan prissätta
-- timmarna ur arbetsrapporten i stället för att visa "—".
--
-- VARFÖR EN EGEN TABELL OCH INTE acord_ovrigt
-- acord_ovrigt bär kronor per m³fub (kvalitetssakring 1,5, massa_3m_tillagg 10).
-- Det här är kronor per TIMME. Samma tabell för två enheter är en fälla: en
-- läsare som summerar raderna får ett tal utan mening, och felet syns först på
-- en faktura.
--
-- VARFÖR BARA EN RAD
-- Martin har bekräftat 490 kr/tim för manuell fällning (2026-11-16). Hans
-- fakturor visar också planering 490, brandbevakning 450 och täckpapp 30 kr/m,
-- men de satserna har han inte sagt — och ett pris som går till kund får inte
-- gissas. De läggs in som DATARADER när han säger till, utan kodändring.
--
-- FACIT: Bågskyttebanan RP J-Hus -25, faktura 2026181 rad 5:
--   "Man tim" 16 tim à 490 = 7 840 kr
-- Arbetsrapporten har 15,87 debiterbara timmar på samma trakt (Martin rundade
-- till 16). Appen räknar alltså samma pris på samma timmar.
--
-- GILTIG FRÅN 2026-11-01, INTE TIDIGARE. Martins instruktion är "nu och framåt
-- — du behöver inte rätta något bakåt". 490 gäller i dag; om satsen har gällt
-- längre är det en rad att backdatera, inte en gissning att bygga in.
-- Trakter som avräknats före dess visar timmarna utan pris, som förut.

create table if not exists arbete_timpris (
  nyckel      text    not null,
  timpris     numeric not null check (timpris > 0),
  giltig_fran date    not null,
  giltig_till date,
  primary key (nyckel, giltig_fran),
  check (giltig_till is null or giltig_till >= giltig_fran)
);

comment on table arbete_timpris is
  'Timpris för vårt eget manuella arbete (fakturaunderlaget). KRONOR PER TIMME — '
  'inte per m³fub; de satserna bor i acord_ovrigt. Nyckeln är extra_tid.aktivitet_typ.';
comment on column arbete_timpris.nyckel is
  'Matchar extra_tid.aktivitet_typ: manuellt, planering, flytt, markagare. '
  'En typ utan rad prissätts inte — timmarna visas utan belopp, aldrig med ett gissat.';

alter table arbete_timpris enable row level security;

-- Prislistor läses av alla inloggade (som acord_priser och acord_ovrigt) och
-- skrivs bara av service_role. Ingen app-väg skriver priser.
drop policy if exists arbete_timpris_las on arbete_timpris;
create policy arbete_timpris_las on arbete_timpris
  for select to authenticated using (true);

grant select on arbete_timpris to authenticated;

-- Den enda sats Martin bekräftat.
insert into arbete_timpris (nyckel, timpris, giltig_fran)
values ('manuellt', 490, '2026-11-01')
on conflict (nyckel, giltig_fran) do nothing;
