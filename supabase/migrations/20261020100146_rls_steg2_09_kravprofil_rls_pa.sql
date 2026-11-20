-- Levande referenstabell (massaved_mal(), anropas av appen som inloggad): policyn FÖRE enable.
create policy kravprofil_las on public.kravprofil for select to authenticated using (true);
alter table public.kravprofil enable row level security;
revoke all on public.kravprofil from anon;