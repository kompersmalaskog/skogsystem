alter view public.vy_normalisering_luckor set (security_invoker = true);
revoke all on public.vy_normalisering_luckor from anon;