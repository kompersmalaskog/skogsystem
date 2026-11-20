-- Vyn lyder anroparens RLS i stället för ägarens (postgres), och anon förlorar läsrätten. Ingen läsare i appen; anon läste markägare, inköpare och koordinater genom den.
alter view public.planering_vy set (security_invoker = true);
revoke all on public.planering_vy from anon;