create or replace function egenkontroll_notering_last_nar_klar()
returns trigger language plpgsql as $$
declare runda uuid;
begin
  runda := case when tg_op = 'DELETE' then old.egenkontroll_id else new.egenkontroll_id end;
  if exists (select 1 from egenkontroll e where e.id = runda and e.status = 'klar') then
    raise exception 'Egenkontrollen ar avslutad och noteringarna kan inte andras'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.foto_id is not null and not exists (
       select 1 from egenkontroll_foto f
       where f.id = new.foto_id and f.egenkontroll_id = new.egenkontroll_id) then
    raise exception 'Fotot hor inte till den har rundan' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then new.andrad := now(); end if;
  return new;
end $$;

create or replace trigger egenkontroll_notering_last
  before insert or update or delete on egenkontroll_notering
  for each row execute function egenkontroll_notering_last_nar_klar();