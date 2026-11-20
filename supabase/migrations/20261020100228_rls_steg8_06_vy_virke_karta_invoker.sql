alter view public.vy_virke_karta set (security_invoker = true);
revoke all on public.vy_virke_karta from anon;