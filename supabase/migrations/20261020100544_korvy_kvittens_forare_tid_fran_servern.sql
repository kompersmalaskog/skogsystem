create or replace function public.korvy_kvittens_forare_satt_tid()
returns trigger
language plpgsql
as $$
begin
  new.kvitterad_at := now();
  return new;
end
$$;

create or replace trigger korvy_kvittens_forare_tid
  before insert or update on public.korvy_kvittens_forare
  for each row execute function public.korvy_kvittens_forare_satt_tid();