create or replace function egenkontroll_last_nar_klar()
returns trigger language plpgsql as $$
begin
  -- Medvetet underhall: select set_config('app.egenkontroll_tillat_andring','on',true)
  -- i SAMMA transaktion. Behovs for att aterppna en runda (t.ex. ta bort en
  -- felaktig matpunkt), vilket annars kraver att triggern droppas.
  if coalesce(current_setting('app.egenkontroll_tillat_andring', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if old.status = 'klar' then
    raise exception 'Egenkontrollen ar avslutad och kan inte andras'
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace trigger egenkontroll_last
  before update or delete on egenkontroll
  for each row execute function egenkontroll_last_nar_klar();

comment on function egenkontroll_last_nar_klar() is
  'Fjarde laset pa en klar runda. Punkter, foton och provytor var redan lasta; sjalva rundan var det inte, sa kommentaren som gar med i A4-rapporten till Vida gick att andra via API:et.';