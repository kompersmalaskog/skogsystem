import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/lonesystem/fortnox", () => ({ exchangeFortnoxCode: vi.fn(async () => ({ access_token: "a", refresh_token: "r", expires_in: 3600 })) }));
vi.mock("@/lib/lonesystem/server", () => ({
  säkraKopplingFinns: vi.fn(async () => "k1"),
  sparaTokens: vi.fn(async () => undefined),
  fortnoxRedirectUri: vi.fn(() => "https://app.example/api/fortnox/callback"),
}));

import { GET } from "./route";

const anrop = (q: string, cookie?: string) =>
  GET(new NextRequest(`https://app.example/api/fortnox/callback?${q}`, cookie ? { headers: { cookie } } : undefined));
const mal = (res: Response) => new URL(res.headers.get("location")!);

/**
 * Efter Fortnox-inloggningen ska man landa där kvittot ritas: Lön → Lönesystem. Förut gick
 * återhoppet till /admin utan flik → Översikt, där inget läser lonesystem_ok/-fel, så varken
 * "Anslutningen lyckades" eller felet syntes någonsin.
 */
describe("Fortnox-callback landar på Lön → Lönesystem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lyckad anslutning", async () => {
    const m = mal(await anrop("code=c&state=s", "fortnox_state=s"));
    expect(m.pathname).toBe("/admin");
    expect(m.searchParams.get("flik")).toBe("lon");
    expect(m.searchParams.get("underflik")).toBe("system");
    expect(m.searchParams.get("lonesystem_ok")).toBe("1");
  });
  it("fel från Fortnox", async () => {
    const m = mal(await anrop("error=access_denied&error_description=Nekad"));
    expect(m.searchParams.get("flik")).toBe("lon");
    expect(m.searchParams.get("underflik")).toBe("system");
    expect(m.searchParams.get("lonesystem_fel")).toBe("Nekad");
  });
  it("ogiltigt state", async () => {
    const m = mal(await anrop("code=c&state=s", "fortnox_state=annat"));
    expect(m.searchParams.get("flik")).toBe("lon");
    expect(m.searchParams.get("underflik")).toBe("system");
    expect(m.searchParams.get("lonesystem_fel")).toContain("Ogiltigt state");
  });
});
