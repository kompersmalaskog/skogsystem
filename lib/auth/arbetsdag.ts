// Ägarkontroll för rutter som läser eller ändrar en arbetsdags rader med service-nyckeln (förbi RLS): arbetsdagen måste
// vara den inloggades egen, annars krävs admin. Incident-bakgrund (audit 2026-10-22): rutterna kollade bara "inloggad", så
// vilken förare som helst kunde läsa, ändra och radera en kollegas objektfördelning — och därmed hens tid och lön.
import { createClient } from "@supabase/supabase-js";
import { autentisera, svar401, svar403, svar404Medarbetare } from "@/lib/auth/server";

type Resultat = { ok: true; arAdmin: boolean } | { ok: false; res: Response };

/**
 * 401 utloggad · 404 ingen medarbetare kopplad · 404 arbetsdagen finns inte · 403 arbetsdagen är någon annans (och du är
 * inte admin). Admin kommer in på alla arbetsdagar; för en admin som anger ett id som saknas svarar vi 404 vid skrivning
 * av raden (den vet routen själv), inte här.
 */
export async function kravArbetsdagAgare(arbetsdagId: string): Promise<Resultat> {
  const sess = await autentisera();
  if (!sess.user) return { ok: false, res: svar401() };
  if (!sess.medarbetareId) return { ok: false, res: svar404Medarbetare() };
  if (sess.roll === "admin") return { ok: true, arAdmin: true };

  const { data, error } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ).from("arbetsdag").select("medarbetare_id").eq("id", arbetsdagId).maybeSingle();
  if (error) return { ok: false, res: Response.json({ ok: false, error: "Kunde inte kontrollera arbetsdagen" }, { status: 500 }) };
  // Samma svar för "finns inte" och "någon annans" skulle dölja om id:t finns; 403 för båda vore tydligast mot en angripare,
  // men en förare som öppnar en dag som aldrig funnits ska få veta det: 404 för saknad, 403 för annans.
  if (!data) return { ok: false, res: Response.json({ ok: false, error: "Arbetsdagen finns inte" }, { status: 404 }) };
  if (data.medarbetare_id !== sess.medarbetareId) return { ok: false, res: svar403("Det här är inte din arbetsdag") };
  return { ok: true, arAdmin: false };
}
