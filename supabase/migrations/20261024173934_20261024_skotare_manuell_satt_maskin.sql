-- Fyra rader i skotare_objekt_manuell bar TIMMAR men ingen MASKIN, och en sadan
-- rad gar inte att prissatta: timpriset bor i maskin_timpris per maskin.
--   Bjallerhult au + ga 22 tim · Dockemala AU 2026 12,5 · Jarnemala Rapp Au 4
--   · Marie Krokshult vindf 3
-- Martin 2026-10-24: "det ar maskinen som inte kan sanda filer". JD810E ar den
-- ENDA maskinen i dim_maskin med datakalla = 'manuell', sa meningen pekar
-- entydigt. Timpriset ar 950 kr/tim i alla tre prisperioder, sa rattelsen ar
-- prisneutral oavsett datum.
-- De ovriga 54 raderna utan maskin bar INGA timmar (volymposter migrerade fran
-- dim_objekt.skotad_volym_manuell) och ror vi inte.
-- CHECK-sparren ligger i en EGEN migration och vantar pa att formularet kraver
-- maskin: en constraint som slar till i en vy vi inte rort blir ett naket
-- databasfel hos en forare.
do $$
declare
  v_utan_maskin int;
  v_manuella    int;
begin
  select count(*) into v_utan_maskin
    from skotare_objekt_manuell
   where g15_timmar is not null and maskin_id is null;

  if v_utan_maskin <> 4 then
    raise exception
      'Vantade 4 rader med timmar utan maskin (inventerade 2026-10-24), hittade %. Kor inte blint.',
      v_utan_maskin;
  end if;

  if not exists (
    select 1 from dim_maskin where maskin_id = 'JD810E' and datakalla = 'manuell'
  ) then
    raise exception 'JD810E finns inte som manuell maskin i dim_maskin - premissen galler inte.';
  end if;

  select count(*) into v_manuella from dim_maskin where datakalla = 'manuell';
  if v_manuella <> 1 then
    raise exception
      'Fler an en maskin har datakalla = manuell (%). Da pekar "maskinen som inte kan sanda filer" inte entydigt.',
      v_manuella;
  end if;
end $$;

update skotare_objekt_manuell
   set maskin_id      = 'JD810E',
       notering       = coalesce(notering || ' · ', '')
                        || 'maskin satt 2026-10-24: timmar utan maskin, 810E ar enda manuellt rapporterande maskinen',
       uppdaterad_tid = now()
 where g15_timmar is not null
   and maskin_id is null;
