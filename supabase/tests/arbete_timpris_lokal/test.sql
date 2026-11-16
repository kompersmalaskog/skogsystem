-- Prov för arbete_timpris mot en RIKTIG Postgres.
--
--   bash supabase/tests/arbete_timpris_lokal/kor.sh
--
-- Kontrollerar att satsen går att läsa men inte skriva av appen, att
-- migrationen går att köra om, och att tabellen vägrar omöjliga värden.
-- Allt rullas tillbaka.
begin;

\set ON_ERROR_STOP on

-- ── Den enda sats Martin bekräftat ────────────────────────────────────────
do $$
declare n int; p numeric; f date;
begin
  select count(*) into n from arbete_timpris;
  if n <> 1 then raise exception 'FEL: förväntade EN sats, hittade %', n; end if;

  select timpris, giltig_fran into p, f from arbete_timpris where nyckel = 'manuellt';
  if p <> 490 then raise exception 'FEL: manuell fällning ska vara 490, är %', p; end if;
  if f <> '2026-11-01' then raise exception 'FEL: ska gälla från 2026-11-01, gäller från %', f; end if;

  -- Inga gissade satser: planering, brandbevakning och papp står på Martins
  -- fakturor men är inte bekräftade, och får därför inte finnas här.
  if exists (select 1 from arbete_timpris where nyckel <> 'manuellt') then
    raise exception 'FEL: en sats Martin inte bekräftat ligger i tabellen';
  end if;
  raise notice 'OK  satsen: manuellt 490 kr/tim från 2026-11-01, och inget annat';
end $$;

-- ── Migrationen går att köra om ───────────────────────────────────────────
do $$
declare n int;
begin
  insert into arbete_timpris (nyckel, timpris, giltig_fran)
  values ('manuellt', 490, '2026-11-01')
  on conflict (nyckel, giltig_fran) do nothing;
  select count(*) into n from arbete_timpris;
  if n <> 1 then raise exception 'FEL: omkörningen dubblerade satsen (% rader)', n; end if;
  raise notice 'OK  omkörning: ingen dubblett';
end $$;

-- ── Tabellen vägrar omöjliga värden ───────────────────────────────────────
do $$
begin
  begin
    insert into arbete_timpris (nyckel, timpris, giltig_fran) values ('x', 0, '2026-01-01');
    raise exception 'FEL: 0 kr/tim gick igenom';
  exception when check_violation then raise notice 'OK  0 kr/tim avvisas';
  end;

  begin
    insert into arbete_timpris (nyckel, timpris, giltig_fran) values ('x', -5, '2026-01-01');
    raise exception 'FEL: negativt timpris gick igenom';
  exception when check_violation then raise notice 'OK  negativt timpris avvisas';
  end;

  begin
    insert into arbete_timpris (nyckel, timpris, giltig_fran, giltig_till)
    values ('x', 490, '2026-06-01', '2026-01-01');
    raise exception 'FEL: giltig_till före giltig_fran gick igenom';
  exception when check_violation then raise notice 'OK  bakvänd giltighet avvisas';
  end;
end $$;

-- ── En sats kan ersättas av en ny period, inte skrivas över ───────────────
do $$
declare n int;
begin
  insert into arbete_timpris (nyckel, timpris, giltig_fran)
  values ('manuellt', 520, '2027-01-01');
  select count(*) into n from arbete_timpris where nyckel = 'manuellt';
  if n <> 2 then raise exception 'FEL: en ny period ska vara en NY rad, hittade %', n; end if;
  raise notice 'OK  ny period är en ny rad — historiken står kvar';
  delete from arbete_timpris where giltig_fran = '2027-01-01';
end $$;

-- ── Appen läser men skriver ALDRIG priser ─────────────────────────────────
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from arbete_timpris;
  if n <> 1 then raise exception 'FEL: inloggad ser % satser, ska se 1', n; end if;
  raise notice 'OK  inloggad läser satsen';

  begin
    insert into arbete_timpris (nyckel, timpris, giltig_fran) values ('fusk', 9999, '2026-01-01');
    raise exception 'FEL: en inloggad kunde SKRIVA ett pris';
  exception when insufficient_privilege then raise notice 'OK  inloggad kan inte lägga till en sats';
  end;

  begin
    update arbete_timpris set timpris = 9999 where nyckel = 'manuellt';
    raise exception 'FEL: en inloggad kunde ÄNDRA ett pris';
  exception when insufficient_privilege then raise notice 'OK  inloggad kan inte ändra satsen';
  end;

  begin
    delete from arbete_timpris where nyckel = 'manuellt';
    raise exception 'FEL: en inloggad kunde TA BORT ett pris';
  exception when insufficient_privilege then raise notice 'OK  inloggad kan inte ta bort satsen';
  end;
end $$;
reset role;

rollback;
