import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Bara rollen admin kommer in i /admin — samma som databasens ar_admin(). Sidan släppte förut in
 * 'chef' också, men reglerna på gs_avtal, atk_val, lönesystem-tabellerna och medarbetare släpper bara
 * igenom admin, så en chef hade sett en nästan tom admin.
 */
let roll: string | null = "admin";
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { email: "x@example.se" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: roll ? { id: "m1", namn: "X", roll } : null }) }) }) }),
  }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => { throw new Error("REDIRECT:" + u); },
  notFound: () => { throw new Error("NOTFOUND"); },
}));
vi.mock("@/components/admin/AdminClient", () => ({ default: () => null }));
vi.mock("@/lib/markagarrapport/aggregate", () => ({ aggregateMarkagarRapport: async () => ({ status: "objekt_saknas" }) }));
vi.mock("@/components/markagarrapport/SkogenKarta", () => ({ default: () => null }));

import AdminPage from "./page";
import MarkagarLista from "./markagarrapport/page";
import MarkagarObjekt from "./markagarrapport/[objekt_id]/page";

const sidor: [string, () => Promise<unknown>][] = [
  ["/admin", () => AdminPage()],
  ["/admin/markagarrapport", () => MarkagarLista()],
  ["/admin/markagarrapport/[objekt_id]", () => MarkagarObjekt({ params: Promise.resolve({ objekt_id: "1" }) })],
];

describe.each(sidor)("%s", (_namn, ropa) => {
  beforeEach(() => { roll = "admin"; });
  it("förare skickas till /arbetsrapport", async () => {
    roll = "forare";
    await expect(ropa()).rejects.toThrow("REDIRECT:/arbetsrapport");
  });
  it("chef skickas också till /arbetsrapport (rollen finns inte i admin)", async () => {
    roll = "chef";
    await expect(ropa()).rejects.toThrow("REDIRECT:/arbetsrapport");
  });
  it("admin kommer in", async () => {
    roll = "admin";
    const fel: any = await ropa().then(() => null, (e) => e);
    expect(String(fel?.message ?? "")).not.toMatch(/REDIRECT:\/arbetsrapport/);
  });
});
