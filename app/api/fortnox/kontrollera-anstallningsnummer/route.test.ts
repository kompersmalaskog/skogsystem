import { describe, it, expect, vi, beforeEach } from "vitest";

const kravRoll = vi.fn();
const getFortnoxClient = vi.fn();
vi.mock("@/lib/auth/server", () => ({ kravRoll: (...a: any[]) => kravRoll(...a), ADMIN_ROLLER: ["admin"] }));
vi.mock("@/lib/lonesystem/server", () => ({ getFortnoxClient: () => getFortnoxClient() }));

import { POST } from "./route";

const anropa = (body: any) => POST(new Request("https://app.example/api/fortnox/kontrollera-anstallningsnummer", { method: "POST", body: JSON.stringify(body) }) as any);

describe("kontrollera anställningsnummer mot Fortnox", () => {
  beforeEach(() => { vi.clearAllMocks(); kravRoll.mockResolvedValue({ ok: true, session: {} }); });

  it("kräver admin: ingen kontroll utan behörighet", async () => {
    kravRoll.mockResolvedValue({ ok: false, res: new Response("", { status: 403 }) });
    const r = await anropa({ anstallningsnummer: "4711" });
    expect(r.status).toBe(403);
    expect(getFortnoxClient).not.toHaveBeenCalled();
  });
  it("numret finns i Fortnox: hittad med namn", async () => {
    getFortnoxClient.mockResolvedValue({ getEmployees: async () => [{ externt_id: "4710", namn: "Anna Berg" }, { externt_id: "4711", namn: "Nils Ek" }] });
    const j = await (await anropa({ anstallningsnummer: " 4711 " })).json();
    expect(j).toEqual({ ok: true, status: "hittad", namn: "Nils Ek" });
  });
  it("numret finns inte: saknas", async () => {
    getFortnoxClient.mockResolvedValue({ getEmployees: async () => [{ externt_id: "1", namn: "X" }] });
    expect(await (await anropa({ anstallningsnummer: "4711" })).json()).toEqual({ ok: true, status: "saknas" });
  });
  it("Fortnox är inte anslutet: ej_ansluten (inget fel, det är ett läge)", async () => {
    getFortnoxClient.mockRejectedValue(new Error("Fortnox är inte anslutet. Gå till Admin > Lön > Lönesystem och anslut."));
    expect(await (await anropa({ anstallningsnummer: "4711" })).json()).toEqual({ ok: true, status: "ej_ansluten" });
  });
  it("Fortnox svarar med fel: fel med texten, aldrig 'saknas'", async () => {
    getFortnoxClient.mockResolvedValue({ getEmployees: async () => { throw new Error("Fortnox API /employees (500): trasigt"); } });
    const j = await (await anropa({ anstallningsnummer: "4711" })).json();
    expect(j.ok).toBe(false);
    expect(j.status).toBe("fel");
    expect(j.fel).toContain("500");
  });
  it("tomt nummer: 400", async () => {
    expect((await anropa({ anstallningsnummer: "  " })).status).toBe(400);
  });
});
