-- Prognos-fliken DEL 3: skotningsavstånd, beståndsform, basvägsarbete.
--
-- Alla nya kolumner är nullable / default false → påverkar INGET befintligt objekt förrän
-- planeraren fyller i dem i Prognos-fliken. Inga CHECK-constraints på text-fälten (mjuka värden,
-- samma mönster som objekt.status): appen skriver bara 'kort'|'medel'|'langt' resp.
-- 'brett'|'medel'|'smalt', men DB:n låser inte fast det.
--
-- basvag_timmar = ENGÅNGSTID för basvägsanläggning. Den läggs på skotarens tidsförslag SEPARAT
-- (aldrig i den volymberoende ha/timme-modellen) och dras bort igen innan ett avslutat objekt
-- används som historik-underlag — se lib/prognos-forslag.ts + app/planering/page.tsx historik-effekten.

alter table objekt add column if not exists skotningsavstand text;    -- 'kort' | 'medel' | 'langt'
alter table objekt add column if not exists bestand_form    text;     -- 'brett' | 'medel' | 'smalt'
alter table objekt add column if not exists basvag_kravs     boolean not null default false;
alter table objekt add column if not exists basvag_timmar    numeric; -- engångstid (h), INTE volymberoende

comment on column objekt.skotningsavstand is 'Prognos: skotningsavstånd till avlägg (kort/medel/langt). Faktor på skotarens tidsförslag.';
comment on column objekt.bestand_form    is 'Prognos: beståndsform (brett/medel/smalt). Faktor på båda maskiner, mest skotaren.';
comment on column objekt.basvag_kravs    is 'Prognos: kräver objektet basvägsanläggning?';
comment on column objekt.basvag_timmar   is 'Prognos: engångstid för basväg (h). Läggs på skotarförslaget separat; aldrig i ha/timme-snittet.';
