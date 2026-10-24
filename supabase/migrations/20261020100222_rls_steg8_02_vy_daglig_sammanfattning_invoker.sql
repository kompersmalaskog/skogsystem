alter view public.vy_daglig_sammanfattning set (security_invoker = true);
revoke all on public.vy_daglig_sammanfattning from anon;