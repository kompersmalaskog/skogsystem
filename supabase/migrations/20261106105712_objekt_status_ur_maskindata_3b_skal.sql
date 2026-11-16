-- Del 3b: skälet vid avslut säger när trakten blev klar, och appens skäl bara när det hör till det sista som blev klart.
do $do$
declare d text := pg_get_functiondef('public.objekt_status_ur_maskindata(boolean)'::regprocedure);
  a text := $a$ny_skal := coalesce(d.sts, d.sks, 'Skördning och skotning klara');
      slut := greatest(d.skd, d.std);$a$;
  b text := $b$slut := greatest(d.skd, d.std);
      ny_skal := 'Klar ' || sv_kort_datum(slut) || coalesce(' · ' || coalesce(d.sts, case when d.std is null then d.sks end), '');$b$;
begin
  if position(a in d) = 0 then raise exception 'Hittade inte skälet'; end if;
  execute replace(d, a, b);
end
$do$;
