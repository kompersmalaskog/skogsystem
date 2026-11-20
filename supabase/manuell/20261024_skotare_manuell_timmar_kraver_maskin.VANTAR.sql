-- 20261024_skotare_manuell_timmar_kraver_maskin.sql
--
-- VÄNTAR. KÖR DEN INTE FÖRRÄN FORMULÄRET KRÄVER MASKIN.
--
-- Regeln är rätt: en rad i skotare_objekt_manuell som bär TIMMAR måste säga
-- vems de är, annars går den inte att prissätta — timpriset bor i
-- maskin_timpris per maskin och kostnadsstället i maskin_kostnadsstalle per
-- maskin. Samma motsägelse som faktura_rad hade, där rad_pris_agare krävde ett
-- belopp på en leverantörsrad medan statusen vantar_leverantorsfaktura fanns
-- just för att beloppet saknades.
--
-- MEN: tabellen skrivs från en vy som det här spåret inte äger. En CHECK som
-- slår till där blir ett naket databasfel hos en förare, och design.md säger
-- att felmeddelanden ska säga vad användaren SKA GÖRA. Spärren hör därför ihop
-- med att formuläret gör maskinfältet obligatoriskt när timmar fylls i
-- ("Hellre färre val än fler. Varje valfritt fält är en fråga föraren måste
-- besvara. Ta bort det eller gör det obligatoriskt.").
--
-- ORDNING:
--   1. formuläret kräver maskin när g15_timmar fylls i   <- görs i koden
--   2. den här migrationen                                <- då, inte före
--
-- Datan är redan rättad: 20261024_skotare_manuell_satt_maskin (kört
-- 2026-10-24) satte JD810E på de fyra rader som bar timmar utan maskin.
-- Kvitto efter den körningen: JD810E 7 rader 171,5 tim · A130743 1 rad 32 tim.
--
-- Guarden nedan stoppar körningen om någon rad hunnit bli timmar-utan-maskin
-- igen — då är formuläret inte åtgärdat, och spärren hade bara flyttat felet
-- från fakturan till föraren.

do $$
declare
  v_brott int;
begin
  select count(*) into v_brott
    from skotare_objekt_manuell
   where g15_timmar is not null
     and maskin_id is null;

  if v_brott > 0 then
    raise exception
      '% rader bär timmar utan maskin. Formuläret skriver dem fortfarande — laga det först, annars blir spärren ett databasfel i förarens ansikte.',
      v_brott;
  end if;
end $$;

-- Volym utan maskin är fortfarande tillåtet, med flit: ackordpriset hänger på
-- trakten och inte på vem som körde, och 54 av tabellens rader är sådana
-- volymposter migrerade från dim_objekt.skotad_volym_manuell.
alter table skotare_objekt_manuell
  add constraint skotare_manuell_timmar_kraver_maskin
  check (g15_timmar is null or maskin_id is not null);
