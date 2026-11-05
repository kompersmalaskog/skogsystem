\set ON_ERROR_STOP on
insert into medarbetare values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into objekt values ('00000000-0000-0000-0000-000000000001', null);
-- skördaren körde förbi punkten 2 nov, skotaren långt bort
insert into hyttspar (objekt_id, maskin_id, roll, datum, points) values
 ('00000000-0000-0000-0000-000000000001', 'PONS', 'skordare', '2026-11-02', '[{"lat":56.0,"lng":15.0,"tid":"2026-11-02T13:30:00Z"},{"lat":56.00005,"lng":15.0,"tid":"2026-11-02T13:31:00Z"}]'),
 ('00000000-0000-0000-0000-000000000001', 'A13', 'skotare', '2026-11-03', '[{"lat":56.01,"lng":15.0,"tid":"2026-11-03T10:00:00Z"}]');
select set_config('test.jag', '00000000-0000-0000-0000-00000000000a', false);
-- 1. försöker förfalska fotograf och skapad_at, framtida tagen_at
insert into avvikelse (id, objekt_id, typ, lat, lng, foto_sokvag, foto_sha256, tagen_at, skapad_at, skapad_av)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000001', 'stenmur', 56.0, 15.0, 'x/1.jpg', repeat('a', 64), now() + interval '3 days', '2000-01-01', '00000000-0000-0000-0000-00000000000b');
select case when skapad_av = '00000000-0000-0000-0000-00000000000a' then 'OK fotograf från servern' else 'FEL fotograf' end from avvikelse where id = '00000000-0000-0000-0000-0000000000f1';
select case when skapad_at > now() - interval '1 minute' then 'OK tid från servern' else 'FEL tid' end from avvikelse where id = '00000000-0000-0000-0000-0000000000f1';
select case when tagen_at <= now() then 'OK tagen_at aldrig i framtiden' else 'FEL tagen_at' end from avvikelse where id = '00000000-0000-0000-0000-0000000000f1';
select case when jsonb_array_length(korspar_fore->'traffar') = 1 and korspar_fore->'traffar'->0->>'roll' = 'skordare' then 'OK skördarens spår hittat, skotarens inte' else 'FEL korspar '||korspar_fore::text end from avvikelse where id = '00000000-0000-0000-0000-0000000000f1';
-- 2. kort taget 1 nov (före skördaren) → inga träffar, men spår på trakten räknas bara före
insert into avvikelse (id, objekt_id, typ, lat, lng, foto_sokvag, foto_sha256, tagen_at)
values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000001', 'korskada', 56.0, 15.0, 'x/2.jpg', repeat('b', 64), '2026-11-01T08:00:00Z');
select case when jsonb_array_length(korspar_fore->'traffar') = 0 and (korspar_fore->>'spar_pa_trakten_fore')::int = 0 then 'OK före allt spår: inga träffar' else 'FEL '||korspar_fore::text end from avvikelse where id = '00000000-0000-0000-0000-0000000000f2';
-- 3. kan inte ändras eller raderas
do $$ begin update avvikelse set typ = 'annat'; raise exception 'FEL update gick'; exception when insufficient_privilege then raise notice 'OK update spärrad'; end $$;
do $$ begin delete from avvikelse; raise exception 'FEL delete gick'; exception when insufficient_privilege then raise notice 'OK delete spärrad'; end $$;
-- 4. utan medarbetare → nekas
select set_config('test.jag', '', false);
do $$ begin insert into avvikelse (id, objekt_id, typ, lat, lng, foto_sokvag, foto_sha256, tagen_at) values (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'annat', 56, 15, 'x', repeat('c',64), now()); raise exception 'FEL utan medarbetare gick'; exception when insufficient_privilege then raise notice 'OK utan medarbetare nekas'; end $$;
-- 5. ogiltig hash / typ
select set_config('test.jag', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin insert into avvikelse (id, objekt_id, typ, lat, lng, foto_sokvag, foto_sha256, tagen_at) values (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'annat', 56, 15, 'x', 'abc', now()); raise exception 'FEL hash'; exception when check_violation then raise notice 'OK ogiltig hash nekas'; end $$;
-- 6. underhåll med flaggan
begin; select set_config('app.avvikelse_tillat_andring','on',true); delete from avvikelse where id = '00000000-0000-0000-0000-0000000000f2'; rollback;
select 'OK underhåll går med flaggan';
