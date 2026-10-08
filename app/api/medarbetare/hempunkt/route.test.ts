import { describe, it, expect, vi, beforeEach } from "vitest";

const kravRoll = vi.fn();
const bekrafta = vi.fn();
vi.mock("@/lib/auth/server", () => ({ kravRoll: (...a: any[]) => kravRoll(...a), ADMIN_ROLLER: ["admin"] }));
vi.mock("@/lib/hempunkt", () => ({ bekraftaHempunkt: (...a: any[]) => bekrafta(...a) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));

import { POST } from "./route";

const anropa = (body: any) => POST(new Request("https://app.example/api/medarbetare/hempunkt", { method: "POST", body: JSON.stringify(body) }) as any);

describe("POST /api/medarbetare/hempunkt", () => {
  beforeEach(() => { vi.clearAllMocks(); kravRoll.mockResolvedValue({ ok: true, session: {} }); bekrafta.mockResolvedValue({ ok: true }); });

  it("kräver admin: ingen skrivning utan behörighet", async () => {
    kravRoll.mockResolvedValue({ ok: false, res: new Response("", { status: 403 }) });
    expect((await anropa({ id: "m1", atgard: "stammer" })).status).toBe(403);
    expect(bekrafta).not.toHaveBeenCalled();
  });
  it("Stämmer går vidare till skrivningen med medarbetaren", async () => {
    const r = await anropa({ id: "m1", atgard: "stammer" });
    expect(await r.json()).toEqual({ ok: true });
    expect(bekrafta.mock.calls[0][1]).toBe("m1");
    expect(bekrafta.mock.calls[0][2]).toEqual({ atgard: "stammer" });
  });
  it("Flytta skickar punkten vidare", async () => {
    await anropa({ id: "m1", atgard: "flytta", lat: 56.39, lng: 14.77 });
    expect(bekrafta.mock.calls[0][2]).toEqual({ atgard: "flytta", lat: 56.39, lng: 14.77 });
  });
  it("ett nej från skrivningen blir 422 med felet, aldrig ok", async () => {
    bekrafta.mockResolvedValue({ ok: false, fel: "Hittade bara byn – sätt punkten på huset" });
    const r = await anropa({ id: "m1", atgard: "stammer" });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toContain("Hittade bara byn");
  });
  it("saknad medarbetare eller okänd åtgärd: 400 utan skrivning", async () => {
    expect((await anropa({ atgard: "stammer" })).status).toBe(400);
    expect((await anropa({ id: "m1", atgard: "radera" })).status).toBe(400);
    expect(bekrafta).not.toHaveBeenCalled();
  });
});
