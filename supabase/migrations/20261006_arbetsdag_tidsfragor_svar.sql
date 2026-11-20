-- Förarens bekräftade rast-/passfrågor (kvällsvyn i Dag, "Saker att svara på").
-- Form: { "rast": "10:00|16:12|95" } = id → start|slut|rast när svaret gavs. Ändras tiderna
-- stämmer signaturen inte längre och frågan ställs om. Utan kolumnen kom rastfrågan tillbaka
-- efter varje omladdning (samma fel som brandriskfrågan hade).
-- Idempotent. Ingen RLS-ändring: arbetsdag har redan förarens update-policy på egen rad.
alter table public.arbetsdag add column if not exists tidsfragor_svar jsonb;

comment on column public.arbetsdag.tidsfragor_svar is
  'Förarens bekräftade rast-/passfrågor: id (rast|lang|negativ) -> "start|slut|rast" när svaret gavs. NULL = inga svar.';
