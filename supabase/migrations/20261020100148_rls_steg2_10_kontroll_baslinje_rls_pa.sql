-- Levande referenstabell (kontroll_produktfalt()): policyn FÖRE enable.
create policy kontroll_baslinje_las on public.kontroll_baslinje for select to authenticated using (true);
alter table public.kontroll_baslinje enable row level security;
revoke all on public.kontroll_baslinje from anon;