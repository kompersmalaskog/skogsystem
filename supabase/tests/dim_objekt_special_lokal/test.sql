-- Körs efter stub.sql och migrationen. Varje kontroll raisar vid fel; "OK" skrivs sist.
\set ON_ERROR_STOP on
do $$
declare n int;
begin
  -- 1. Befintliga rader får special=false och skäl NULL (inget ändras för någon).
  select count(*) into n from public.dim_objekt where special is not false or special_skal is not null;
  if n <> 0 then raise exception 'befintliga rader ska vara special=false/skäl null (fick % avvikande)', n; end if;

  -- 2. Flagga + skäl går att skriva.
  update public.dim_objekt set special = true, special_skal = 'Vindfällor' where objekt_id = '11177558';
  select count(*) into n from public.dim_objekt where special and special_skal = 'Vindfällor';
  if n <> 1 then raise exception 'special + skäl sparades inte'; end if;

  -- 3. Skäl utan flagga avvisas (CHECK).
  begin
    update public.dim_objekt set special_skal = 'Spöke' where objekt_id = 'A110148_1';
    raise exception 'skäl utan special borde ha avvisats';
  exception when check_violation then null;
  end;

  -- 4. Flagga utan skäl är tillåten (skälet skrivs efteråt i UI).
  update public.dim_objekt set special = true where objekt_id = 'A110148_1';
  update public.dim_objekt set special = false, special_skal = null where objekt_id = 'A110148_1';

  -- 5. special kan inte bli NULL (NOT NULL), så "special is true" räcker som filter.
  begin
    update public.dim_objekt set special = null where objekt_id = 'A110148_1';
    raise exception 'special=null borde ha avvisats';
  exception when not_null_violation then null;
  end;

  -- 6. exkludera är orörd.
  select count(*) into n from public.dim_objekt where exkludera is true;
  if n <> 0 then raise exception 'exkludera ska vara orörd'; end if;
end $$;

-- 7. Migrationen går att köra igen (idempotent).
\i supabase/migrations/20261021164434_dim_objekt_special.sql
select 'OK' as resultat;
