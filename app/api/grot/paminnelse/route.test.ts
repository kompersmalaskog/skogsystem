// /api/grot/paminnelse — vem som får köra, och när det är torrt respektive skarpt. Det avgörande är att en manuell körning (inloggad
// admin i webbläsaren) ALDRIG köar något av misstag: den är torr om inte ?skarp=1 anges. Bara cron-bearern kör skarpt utan flagga.
import { describe, it, expect, vi, beforeEach } from "vitest";

const kravRoll = vi.fn();
const koa = vi.fn();
vi.mock("@/lib/auth/server", () => ({ kravRoll: (...a: any[]) => kravRoll(...a), ADMIN_ROLLER: ["admin", "chef"] }));
vi.mock("@/lib/grotvy/paminnelse-ko", () => ({ koaGrotPaminnelser: (...a: any[]) => koa(...a) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ falsk: true }) }));

import { NextRequest } from "next/server";

const rapport = (over: any = {}) => ({ ok: true, dry: false, idag: "2026-10-04", listan: 28, medDatum: 0, mottagare: [], kandidater: [], koade: [], redanKoade: [], anmarkningar: [], ...over });
const anrop = (sokvag = "", bearer?: string) =>
  new NextRequest(`http://localhost/api/grot/paminnelse${sokvag}`, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });
const sessionAdmin = () => kravRoll.mockResolvedValue({ ok: true, session: { roll: "admin" } });
const ingenSession = () => kravRoll.mockResolvedValue({ ok: false, res: new Response(JSON.stringify({ ok: false, error: "Ej inloggad" }), { status: 401 }) });

beforeEach(() => {
  kravRoll.mockReset(); koa.mockReset();
  process.env.CRON_SECRET = "testhemlighet";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
  koa.mockImplementation(async (_sb: any, opt: any) => rapport({ dry: opt.dry }));
});

describe("behörighet", () => {
  it("varken cron-bearer eller session → 401 och producenten körs inte", async () => {
    const { GET } = await import("./route");
    ingenSession();
    const r = await GET(anrop());
    expect(r.status).toBe(401);
    expect(koa).not.toHaveBeenCalled();
  });
  it("fel bearer faller tillbaka på sessionen (och stoppas utan den)", async () => {
    const { GET } = await import("./route");
    ingenSession();
    const r = await GET(anrop("", "fel-hemlighet"));
    expect(r.status).toBe(401);
    expect(koa).not.toHaveBeenCalled();
  });
});

describe("torr eller skarp", () => {
  it("cron (Bearer CRON_SECRET) utan flagga → SKARP, och sessionen behöver inte kollas", async () => {
    const { GET } = await import("./route");
    const r = await GET(anrop("", "testhemlighet"));
    expect(r.status).toBe(200);
    expect(koa.mock.calls[0][1]).toMatchObject({ dry: false, idag: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(kravRoll).not.toHaveBeenCalled();
    expect((await r.json()).lage).toBe("skarp");
  });
  it("cron med ?dry=1 → torrt", async () => {
    const { GET } = await import("./route");
    await GET(anrop("?dry=1", "testhemlighet"));
    expect(koa.mock.calls[0][1].dry).toBe(true);
  });
  it("inloggad admin utan flagga → TORRT (en manuell körning köar aldrig av misstag)", async () => {
    const { GET } = await import("./route");
    sessionAdmin();
    const r = await GET(anrop());
    expect(koa.mock.calls[0][1].dry).toBe(true);
    expect((await r.json()).lage).toMatch(/torrkörning/);
  });
  it("inloggad admin med ?skarp=1 → skarpt; med ?skarp=1&dry=1 → torrt (dry vinner)", async () => {
    const { GET } = await import("./route");
    sessionAdmin();
    await GET(anrop("?skarp=1"));
    expect(koa.mock.calls[0][1].dry).toBe(false);
    await GET(anrop("?skarp=1&dry=1"));
    expect(koa.mock.calls[1][1].dry).toBe(true);
  });
  it("POST fungerar som GET", async () => {
    const { POST } = await import("./route");
    await POST(anrop("", "testhemlighet"));
    expect(koa.mock.calls[0][1].dry).toBe(false);
  });
});

describe("larm ska larma", () => {
  it("rapporten ok:false → HTTP 500 med felet i svaret (syns i cron-loggen)", async () => {
    const { GET } = await import("./route");
    koa.mockResolvedValue(rapport({ ok: false, fel: "Hittar ingen aktiv mottagare" }));
    const r = await GET(anrop("", "testhemlighet"));
    expect(r.status).toBe(500);
    expect((await r.json()).fel).toBe("Hittar ingen aktiv mottagare");
  });
});
