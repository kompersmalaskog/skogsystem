alter view public.produktion_per_dag set (security_invoker = true);
revoke all on public.produktion_per_dag from anon;