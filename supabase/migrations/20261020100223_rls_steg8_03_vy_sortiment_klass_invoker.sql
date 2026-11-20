alter view public.vy_sortiment_klass set (security_invoker = true);
revoke all on public.vy_sortiment_klass from anon;