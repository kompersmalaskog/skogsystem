-- Låset och kontrollerna på egenkontroll_notering (migrationerna 20261021074334 + 20261021074341), mot stubbtabeller.
-- Varje rad i resultatet ska säga true. Slutar med antalet rader som INTE är true (ska vara 0).
create temp table resultat (vad text, ok boolean);

-- Kör en sats och förväntar sig en viss SQLSTATE (null = ska gå igenom).
create function forvanta(p_vad text, p_sql text, p_state text) returns void language plpgsql as $$
declare s text;
begin
  begin
    execute p_sql;
    s := null;
  exception when others then
    s := sqlstate;
  end;
  insert into resultat values (p_vad, s is not distinct from p_state);
end $$;

insert into egenkontroll (id, status) values ('00000000-0000-4000-8000-000000000001', 'pagaende'), ('00000000-0000-4000-8000-000000000002', 'pagaende');
insert into egenkontroll_foto (id, egenkontroll_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001'),
                                                         ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000002');

-- GILTIGA
select forvanta('punkt på karta', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','karta','punkt','Stenmur','[[14.5,56.1]]')$$, null);
select forvanta('linje på karta med pil', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, pil, etikett, avsikt, koordinater) values ('00000000-0000-4000-8000-000000000001','karta','linje',true,'Basvägen skulle gått här','skulle','[[14.5,56.1],[14.51,56.11]]')$$, null);
select forvanta('linje på foto med förskjutning', $$insert into egenkontroll_notering (egenkontroll_id, underlag, foto_id, typ, etikett, koordinater, etikett_dx, etikett_dy) values ('00000000-0000-4000-8000-000000000001','foto','00000000-0000-4000-8000-0000000000f1','linje','Infart','[[0.1,0.2],[0.9,0.8]]',0.3,-0.1)$$, null);

-- AVVISADE (23514 = check_violation)
select forvanta('punkt med 2 koordinater', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','karta','punkt','x','[[14.5,56.1],[14.6,56.2]]')$$, '23514');
select forvanta('linje med 1 koordinat', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','karta','linje','x','[[14.5,56.1]]')$$, '23514');
select forvanta('u > 1 på foto', $$insert into egenkontroll_notering (egenkontroll_id, underlag, foto_id, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','foto','00000000-0000-4000-8000-0000000000f1','punkt','x','[[1.2,0.5]]')$$, '23514');
select forvanta('v < 0 på foto', $$insert into egenkontroll_notering (egenkontroll_id, underlag, foto_id, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','foto','00000000-0000-4000-8000-0000000000f1','punkt','x','[[0.5,-0.1]]')$$, '23514');
select forvanta('lat > 90 på karta', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','karta','punkt','x','[[14.5,91]]')$$, '23514');
select forvanta('koordinat som text', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','karta','punkt','x','[["a","b"]]')$$, '23514');
select forvanta('koordinater som objekt', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','karta','punkt','x','{"a":1}')$$, '23514');
select forvanta('pil på punkt', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, pil, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','karta','punkt',true,'x','[[14.5,56.1]]')$$, '23514');
select forvanta('tom etikett', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','karta','punkt','   ','[[14.5,56.1]]')$$, '23514');
select forvanta('etikett över 280 tecken', format($$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','karta','punkt',%L,'[[14.5,56.1]]')$$, repeat('a', 281)), '23514');
select forvanta('foto utan foto_id', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','foto','punkt','x','[[0.5,0.5]]')$$, '23514');
select forvanta('karta med foto_id', $$insert into egenkontroll_notering (egenkontroll_id, underlag, foto_id, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','karta','00000000-0000-4000-8000-0000000000f1','punkt','x','[[14.5,56.1]]')$$, '23514');
select forvanta('förskjutning på karta', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, etikett, koordinater, etikett_dx, etikett_dy) values ('00000000-0000-4000-8000-000000000001','karta','punkt','x','[[14.5,56.1]]',0.1,0.1)$$, '23514');
select forvanta('bara dx', $$insert into egenkontroll_notering (egenkontroll_id, underlag, foto_id, typ, etikett, koordinater, etikett_dx) values ('00000000-0000-4000-8000-000000000001','foto','00000000-0000-4000-8000-0000000000f1','punkt','x','[[0.5,0.5]]',0.1)$$, '23514');
select forvanta('förskjutning över 2 bildbredder', $$insert into egenkontroll_notering (egenkontroll_id, underlag, foto_id, typ, etikett, koordinater, etikett_dx, etikett_dy) values ('00000000-0000-4000-8000-000000000001','foto','00000000-0000-4000-8000-0000000000f1','punkt','x','[[0.5,0.5]]',2.5,0)$$, '23514');
select forvanta('okänd avsikt', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, etikett, avsikt, koordinater) values ('00000000-0000-4000-8000-000000000001','karta','punkt','x','kanske','[[14.5,56.1]]')$$, '23514');
select forvanta('foto från annan runda', $$insert into egenkontroll_notering (egenkontroll_id, underlag, foto_id, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','foto','00000000-0000-4000-8000-0000000000f2','punkt','x','[[0.5,0.5]]')$$, '23514');

-- ÖPPEN RUNDA: UPDATE uppdaterar andrad, tom etikett via UPDATE avvisas (appen ska göra DELETE), DELETE går, även i CTE-form.
update egenkontroll_notering set andrad = '2000-01-01' where etikett = 'Stenmur';
select forvanta('UPDATE på öppen runda', $$update egenkontroll_notering set etikett = 'Stenmur (rättad)' where etikett = 'Stenmur'$$, null);
insert into resultat select 'andrad uppdaterad av triggern', andrad > '2000-01-01' from egenkontroll_notering where etikett = 'Stenmur (rättad)';
select forvanta('tom etikett via UPDATE avvisas', $$update egenkontroll_notering set etikett = '' where etikett = 'Stenmur (rättad)'$$, '23514');
select forvanta('DELETE på öppen runda (CTE)', $$with d as (delete from egenkontroll_notering where etikett = 'Stenmur (rättad)' returning 1) select count(*) from d$$, null);
insert into resultat select 'raden är borta', count(*) = 0 from egenkontroll_notering where etikett like 'Stenmur%';

-- KLAR RUNDA: notering skapad medan rundan var öppen, sedan avslutad -> INSERT, UPDATE och DELETE ska ge 23514 och raden ska vara orörd.
insert into egenkontroll_notering (id, egenkontroll_id, underlag, typ, etikett, koordinater) values ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000001','karta','punkt','Kulturlämning','[[14.5,56.1]]');
update egenkontroll set status = 'klar' where id = '00000000-0000-4000-8000-000000000001';
select forvanta('INSERT på klar runda', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000001','karta','punkt','Ny','[[14.5,56.1]]')$$, '23514');
select forvanta('UPDATE på klar runda', $$update egenkontroll_notering set etikett = 'Ändrad' where id = '00000000-0000-4000-8000-0000000000a1'$$, '23514');
select forvanta('UPDATE av avsikt på klar runda', $$update egenkontroll_notering set avsikt = 'skulle' where id = '00000000-0000-4000-8000-0000000000a1'$$, '23514');
select forvanta('DELETE på klar runda', $$delete from egenkontroll_notering where id = '00000000-0000-4000-8000-0000000000a1'$$, '23514');
select forvanta('DELETE på klar runda (CTE)', $$with d as (delete from egenkontroll_notering where id = '00000000-0000-4000-8000-0000000000a1' returning 1) select count(*) from d$$, '23514');
insert into resultat select 'raden på klar runda är orörd', count(*) = 1 and bool_and(etikett = 'Kulturlämning' and avsikt = 'blev') from egenkontroll_notering where id = '00000000-0000-4000-8000-0000000000a1';
-- en annan, öppen runda påverkas inte
select forvanta('INSERT på annan öppen runda', $$insert into egenkontroll_notering (egenkontroll_id, underlag, typ, etikett, koordinater) values ('00000000-0000-4000-8000-000000000002','karta','punkt','Ok','[[14.5,56.1]]')$$, null);

-- RÄTTIGHETER
insert into resultat select 'anon har inga rättigheter', not has_table_privilege('anon', 'egenkontroll_notering', 'select');
insert into resultat select 'authenticated kan läsa och skriva', has_table_privilege('authenticated', 'egenkontroll_notering', 'select') and has_table_privilege('authenticated', 'egenkontroll_notering', 'insert') and has_table_privilege('authenticated', 'egenkontroll_notering', 'update') and has_table_privilege('authenticated', 'egenkontroll_notering', 'delete');

select vad, ok from resultat order by ok, vad;
select count(*) filter (where not ok) as rader_som_inte_ar_true, count(*) as rader from resultat;
