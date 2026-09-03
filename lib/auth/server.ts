// ─────────────────────────────────────────────────────────────
// Server-side auth för API-rutter — EN implementation (var sex kopior av
// `autentisera()` i olika routes). Identiteten är Supabase-sessionen i cookien;
// medarbetaren slås upp på e-post. Ingen fallback någonsin: saknas user → 401,
// saknas medarbetare-träff → 404. Klienten får ALDRIG välja vem den är.
//
// Tre nivåer:
//   kravInloggad()      — alla inloggade (kartproxies, egen data)
//   kravRoll([...])     — t.ex. ['admin','chef'] för Fortnox/lön/register
//   målMedarbetareId(x) — "vems data?": alltid den inloggades egen; admin/chef
//                         får peka på någon annan; alla andra som skickar ett
//                         främmande id får 403 (larm, inte tyst rättning).
// ─────────────────────────────────────────────────────────────
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const ADMIN_ROLLER = ["admin", "chef"] as const;

export type AuthSession = {
  user: { id: string; email: string } | null;
  medarbetareId: string | null;
  roll: string | null;
};

export async function autentisera(): Promise<AuthSession> {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) return { user: null, medarbetareId: null, roll: null };
  // Anon-klient + RLS: medarbetare-tabellen låter den inloggade läsa sin egen rad.
  const { data: med } = await authClient
    .from("medarbetare")
    .select("id, roll")
    .eq("epost", user.email)
    .maybeSingle();
  return {
    user: { id: user.id, email: user.email },
    medarbetareId: med?.id ?? null,
    roll: med?.roll ?? null,
  };
}

const json = (status: number, error: string) =>
  NextResponse.json({ ok: false, error }, { status });

export const svar401 = () => json(401, "Ej inloggad");
export const svar403 = (msg = "Saknar behörighet") => json(403, msg);
export const svar404Medarbetare = () => json(404, "Ingen medarbetare kopplad till inloggningen");

type Vakt<T> = { ok: true } & T | { ok: false; res: NextResponse };

/** Inloggad session krävs. */
export async function kravInloggad(): Promise<Vakt<{ session: AuthSession }>> {
  const session = await autentisera();
  if (!session.user) return { ok: false, res: svar401() };
  return { ok: true, session };
}

/** Inloggad + en av rollerna. 401 före 403 — avslöja aldrig rollkrav för utomstående. */
export async function kravRoll(roller: readonly string[]): Promise<Vakt<{ session: AuthSession }>> {
  const session = await autentisera();
  if (!session.user) return { ok: false, res: svar401() };
  if (!session.roll || !roller.includes(session.roll)) {
    return { ok: false, res: svar403(`Kräver ${roller.join("/")}`) };
  }
  return { ok: true, session };
}

/**
 * Vems medarbetare-id gäller anropet? Egen id ur sessionen. Ett `begart` id
 * som avviker accepteras BARA för admin/chef — för alla andra är det ett
 * försök att läsa någon annans data → 403, aldrig tyst byte till egen.
 */
export async function målMedarbetareId(begart: string | null | undefined): Promise<Vakt<{ id: string; session: AuthSession }>> {
  const session = await autentisera();
  if (!session.user) return { ok: false, res: svar401() };
  if (!session.medarbetareId) return { ok: false, res: svar404Medarbetare() };
  const egen = session.medarbetareId;
  if (begart && begart !== egen) {
    if (session.roll && (ADMIN_ROLLER as readonly string[]).includes(session.roll)) {
      return { ok: true, id: begart, session };
    }
    return { ok: false, res: svar403("Kan bara läsa egen data") };
  }
  return { ok: true, id: egen, session };
}
