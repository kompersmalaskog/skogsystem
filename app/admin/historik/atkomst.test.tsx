/**
 * Åtkomst till historiken och jämförelsen (inklusive "Samma förare"): bara roll admin. Servern skickar vidare alla andra: ej inloggad → /login,
 * förare (och alla andra roller, och en inloggad utan medarbetarrad) → /admin. Databasen är det riktiga skyddet (RLS: public.ar_admin() på
 * hist_* och därmed vy_hist_forare_maskin_jamfor; en icke-admin får tomt svar, som klienten visar som "Du saknar behörighet"), den här kontrollen
 * är omdirigeringen. Rollen chef finns inte längre.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Svar = { user: { email?: string } | null; medarbetare: { id: string; roll: string } | null };
const g = globalThis as unknown as { __svar: Svar };

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: g.__svar.user } }) },
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.single = async () => ({ data: g.__svar.medarbetare });
      return q;
    },
  }),
}));
vi.mock("@/components/historik/HistorikClient", () => ({ default: function HistorikClient() { return null; } }));
vi.mock("@/components/historik/JamforClient", () => ({ default: function JamforClient() { return null; } }));

import HistorikSida from "./page";
import JamforSida from "./jamfor/page";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  g.__svar = { user: { email: "admin@example.se" }, medarbetare: { id: "m1", roll: "admin" } };
});

const SIDOR = [["/admin/historik", HistorikSida, "HistorikClient"], ["/admin/historik/jamfor (Maskiner och Samma förare)", JamforSida, "JamforClient"]] as const;

describe.each(SIDOR)("%s", (_namn, Sida, klient) => {
  it("admin kommer in", async () => {
    const el = (await Sida()) as { type: { name: string } };
    expect(el.type.name).toBe(klient);
  });
  it("en förare ser inte sidan: omdirigeras till /admin", async () => {
    g.__svar.medarbetare = { id: "m2", roll: "forare" };
    await expect(Sida()).rejects.toThrow("REDIRECT /admin");
  });
  it("ingen annan roll än admin kommer in (även en roll som inte längre finns)", async () => {
    for (const roll of ["chef", "planerare", "okand", ""]) {
      g.__svar.medarbetare = { id: "m3", roll };
      await expect(Sida(), roll).rejects.toThrow("REDIRECT /admin");
    }
  });
  it("inloggad utan medarbetarrad: omdirigeras till /admin", async () => {
    g.__svar.medarbetare = null;
    await expect(Sida()).rejects.toThrow("REDIRECT /admin");
  });
  it("ej inloggad: omdirigeras till /login", async () => {
    g.__svar.user = null;
    await expect(Sida()).rejects.toThrow("REDIRECT /login");
  });
});
