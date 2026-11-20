alter table egenkontroll_punkt
  drop constraint egenkontroll_punkt_kalla_check,
  drop constraint egenkontroll_punkt_del_check,
  drop constraint egenkontroll_punkt_avvikelse_typ_check,
  drop constraint avvikelsetyp_kraver_avvikelse,
  drop constraint status_hor_till_del,
  drop constraint egenkontroll_punkt_egenkontroll_id_ordning_key;

alter table egenkontroll_punkt
  add constraint egenkontroll_punkt_kalla_check
    check (kalla in ('markering','fast','observation')),
  add constraint egenkontroll_punkt_del_check
    check (del in ('plan','utforande','matning','observation')),
  add constraint egenkontroll_punkt_avvikelse_typ_check
    check (avvikelse_typ in ('korspar','stubbhojd','hansyn_skadad','hansyn','annat')),
  add constraint avvikelsetyp_kraver_avvikelse
    check (avvikelse_typ is null or status = 'avvikelse' or kalla = 'observation'),
  add constraint status_hor_till_del check (
    status is null
    or (kalla = 'observation' and status in ('bra','battre','avvikelse'))
    or (kalla <> 'observation' and (
         (del = 'plan'      and status in ('ok','avvikelse'))
      or (del = 'utforande' and status in ('bra','godkant','battre'))
      or (del = 'matning'   and status in ('ok','battre'))))),
  add constraint observation_ar_komplett check (
    (kalla = 'observation') = (del = 'observation')
    and (kalla <> 'observation' or (status is not null and avvikelse_typ is not null
         and lat is not null and lng is not null and markering_id is null)));

create unique index egenkontroll_punkt_ordning_plan_key
  on egenkontroll_punkt (egenkontroll_id, ordning) where kalla <> 'observation';

comment on constraint observation_ar_komplett on egenkontroll_punkt is
  'En observation ar alltid komplett nar den sparas: ton, typ och position kravs. kalla och del foljs at sa de aldrig glider isar. Observationen hor inte till planen och har darfor ingen markering.';

create or replace function egenkontroll_punkt_last_nar_klar()
returns trigger language plpgsql as $$
declare runda uuid;
begin
  runda := case when tg_op = 'INSERT' then new.egenkontroll_id else old.egenkontroll_id end;
  if exists (select 1 from egenkontroll e where e.id = runda and e.status = 'klar') then
    raise exception 'Egenkontrollen ar avslutad och kan inte andras'
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists egenkontroll_punkt_last on egenkontroll_punkt;
create trigger egenkontroll_punkt_last
  before insert or update or delete on egenkontroll_punkt
  for each row execute function egenkontroll_punkt_last_nar_klar();