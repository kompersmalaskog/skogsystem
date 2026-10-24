alter view public.vy_kalibrering_status set (security_invoker = true);
revoke all on public.vy_kalibrering_status from anon;