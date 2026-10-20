alter view public.lager_varningar set (security_invoker = true);
revoke all on public.lager_varningar from anon;