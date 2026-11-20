CREATE OR REPLACE FUNCTION public.aktuell_medarbetare_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM medarbetare WHERE user_id = auth.uid() LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.ar_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM medarbetare WHERE user_id = auth.uid() AND roll = 'admin');
$$;
