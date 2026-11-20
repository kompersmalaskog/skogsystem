-- Levande referenstabell (normalisera(), kontroll_produktfalt()): policyn FÖRE enable, annars läser inloggade tomt.
create policy normalisering_karta_las on public.normalisering_karta for select to authenticated using (true);
alter table public.normalisering_karta enable row level security;
revoke all on public.normalisering_karta from anon;