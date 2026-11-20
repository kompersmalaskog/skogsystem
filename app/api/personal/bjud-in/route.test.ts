/**
 * POST /api/personal/bjud-in. Den RIKTIGA kravRoll körs (bara cookies, Supabase-sessionen och admin-klienten är fakes), så
 * "förare får 403" bevisar rollkravet — inte att en mockad vakt säger nej.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const g = globalThis as any;

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

// Sessionen: g.__session = { email, roll } eller null.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: g.__session ? { id: "u1", email: g.__session.email } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: g.__session ? { id: "m-admin", roll: g.__session.roll } : null }) }) }) }),
  }),
}));

// Admin-klienten (service-nyckeln): en liten databas + Auth som loggar vad som görs.
type Rad = { id: string; namn: string; epost: string; telefon: string | null; roll: string; user_id: string | null };
vi.mock("@/lib/auth/admin", () => ({
  adminSupabase: () => {
    g.__adminAnvandes += 1;
    const tabell = () => {
      let filter: ((r: Rad) => boolean) | null = null;
      let op: "select" | "insert" | "delete" | "update" = "select";
      let vals: any = null;
      const b: any = {
        select() { return b; },
        ilike(_k: string, v: string) { const m = v.replace(/\\(.)/g, "$1").toLowerCase(); filter = r => r.epost.toLowerCase() === m; return b; },
        limit() { return b; },
        insert(v: any) { op = "insert"; vals = v; return b; },
        delete() { op = "delete"; return b; },
        update(v: any) { op = "update"; vals = v; return b; },
        eq(_k: string, v: string) { filter = r => r.id === v; return b; },
        then(res: any, rej: any) {
          return Promise.resolve().then(() => {
            if (g.__dbFel) return { data: null, error: { message: "db" } };
            if (op === "insert") {
              const rad: Rad = { id: `m${g.__rader.length + 1}`, user_id: null, telefon: null, ...vals };
              g.__rader.push(rad); g.__skrivna.push({ ...vals });
              return { data: [{ id: rad.id }], error: null };
            }
            if (op === "delete") { g.__rader = g.__rader.filter((r: Rad) => !(filter?.(r))); g.__raderade += 1; return { data: null, error: null }; }
            if (op === "update") { g.__uppdaterade.push(vals); return { data: null, error: null }; }
            return { data: g.__rader.filter((r: Rad) => !filter || filter(r)), error: null };
          }).then(res, rej);
        },
      };
      return b;
    };
    return {
      from: (t: string) => { g.__tabeller.push(t); return tabell(); },
      auth: { admin: { inviteUserByEmail: async (epost: string, opt: any) => { g.__inbjudningar.push({ epost, opt }); return g.__inbjudanSvar(epost); } } },
    };
  },
}));

import { POST } from "./route";

const anrop = (body: unknown, url = "https://app.example.se/api/personal/bjud-in") =>
  POST(new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

const ny = { namn: "Test Person", epost: "Test.Person@exempel.se", telefon: "070-1", roll: "forare" };

beforeEach(() => {
  g.__session = { email: "martin@x.se", roll: "admin" };
  g.__rader = [] as Rad[]; g.__skrivna = []; g.__inbjudningar = []; g.__tabeller = [];
  g.__raderade = 0; g.__uppdaterade = []; g.__adminAnvandes = 0; g.__dbFel = false;
  g.__inbjudanSvar = () => ({ data: { user: { id: "auth1" } }, error: null });
});

describe("bjud-in: vem når routen", () => {
  it("förare → 403, och service-nyckeln rörs aldrig", async () => {
    g.__session = { email: "forare@x.se", roll: "forare" };
    const r = await anrop(ny);
    expect(r.status).toBe(403);
    expect(g.__adminAnvandes).toBe(0);
    expect(g.__inbjudningar).toEqual([]);
    expect(g.__skrivna).toEqual([]);
  });
  it("utloggad → 401 (före 403)", async () => {
    g.__session = null;
    expect((await anrop(ny)).status).toBe(401);
    expect(g.__adminAnvandes).toBe(0);
  });
  it("inloggad utan medarbetare-rad (okänd roll) → 403", async () => {
    g.__session = { email: "x@x.se", roll: null };
    expect((await anrop(ny)).status).toBe(403);
    expect(g.__adminAnvandes).toBe(0);
  });
});

describe("bjud-in: admin bjuder in", () => {
  it("skapar medarbetarraden med vald roll OCH skickar inbjudan till /valkommen på samma adress", async () => {
    const r = await anrop(ny);
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ ok: true, inbjudan: "skickad" });
    expect(g.__skrivna).toEqual([{ namn: "Test Person", epost: "test.person@exempel.se", telefon: "070-1", roll: "forare" }]);
    expect(g.__rader[0].id).toBe(j.id);
    expect(g.__inbjudningar).toHaveLength(1);
    expect(g.__inbjudningar[0].epost).toBe("test.person@exempel.se");
    expect(g.__inbjudningar[0].opt.redirectTo).toBe("https://app.example.se/valkommen");
  });
  it("rollen admin följer med in i raden", async () => {
    await anrop({ ...ny, roll: "admin" });
    expect(g.__skrivna[0].roll).toBe("admin");
  });
  it("raden finns INNAN inbjudan skickas (triggern kopplar kontot till raden på e-post)", async () => {
    g.__inbjudanSvar = () => { expect(g.__rader).toHaveLength(1); return { data: {}, error: null }; };
    expect((await anrop(ny)).status).toBe(200);
  });
  it("ogiltig indata → 400 och ingenting skrivs (roll 'chef', trasig e-post, trasig JSON)", async () => {
    for (const b of [{ ...ny, roll: "chef" }, { ...ny, epost: "inte-en-epost" }, { ...ny, namn: "" }, "{trasig"]) {
      const r = await anrop(b);
      expect(r.status).toBe(400);
    }
    expect(g.__skrivna).toEqual([]);
    expect(g.__inbjudningar).toEqual([]);
  });
});

describe("bjud-in: dubbletter och fel", () => {
  it("e-posten finns redan MED inloggning → 409, ingen ny rad, ingen inbjudan (versaler spelar ingen roll)", async () => {
    g.__rader.push({ id: "m0", namn: "Oskar", epost: "Test.Person@exempel.se", telefon: null, roll: "forare", user_id: "u9" });
    const r = await anrop(ny);
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/Oskar/);
    expect(g.__skrivna).toEqual([]);
    expect(g.__inbjudningar).toEqual([]);
  });
  it("finns redan UTAN inloggning → ny inbjudan till samma rad, ingen dubblett", async () => {
    g.__rader.push({ id: "m0", namn: "Test Person", epost: "test.person@exempel.se", telefon: null, roll: "forare", user_id: null });
    const j = await (await anrop(ny)).json();
    expect(j).toMatchObject({ ok: true, id: "m0", inbjudan: "skickad_igen" });
    expect(g.__skrivna).toEqual([]);
    expect(g.__rader).toHaveLength(1);
    expect(g.__inbjudningar).toHaveLength(1);
  });
  it("inbjudan misslyckas → raden tas bort igen (allt eller inget) och admin får ett svar på svenska", async () => {
    g.__inbjudanSvar = () => ({ data: null, error: { message: "smtp down", status: 500 } });
    const r = await anrop(ny);
    expect(r.status).toBe(502);
    expect((await r.json()).error).toMatch(/lades inte till/);
    expect(g.__rader).toEqual([]);
    expect(g.__raderade).toBe(1);
  });
  it("misslyckas inbjudan för en BEFINTLIG rad rörs raden inte", async () => {
    g.__rader.push({ id: "m0", namn: "Test Person", epost: "test.person@exempel.se", telefon: null, roll: "forare", user_id: null });
    g.__inbjudanSvar = () => ({ data: null, error: { message: "x", status: 500 } });
    expect((await anrop(ny)).status).toBe(502);
    expect(g.__rader).toHaveLength(1);
    expect(g.__raderade).toBe(0);
  });
  it("mailgränsen → 429 med vänlig text, raden tas bort", async () => {
    g.__inbjudanSvar = () => ({ data: null, error: { code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" } });
    const r = await anrop(ny);
    expect(r.status).toBe(429);
    expect(g.__rader).toEqual([]);
  });
  it("kontot finns redan i Auth → raden behålls och ok (ingen ny inbjudan)", async () => {
    g.__inbjudanSvar = () => ({ data: null, error: { code: "email_exists", status: 422, message: "A user with this email address has already been registered" } });
    const j = await (await anrop(ny)).json();
    expect(j).toMatchObject({ ok: true, inbjudan: "konto_fanns" });
    expect(g.__rader).toHaveLength(1);
    expect(g.__raderade).toBe(0);
  });
  it("kontot finns i Auth och raden låg redan där → epost skrivs om så att triggern kopplar dem", async () => {
    g.__rader.push({ id: "m0", namn: "Test Person", epost: "test.person@exempel.se", telefon: null, roll: "forare", user_id: null });
    g.__inbjudanSvar = () => ({ data: null, error: { code: "email_exists", status: 422, message: "x" } });
    await anrop(ny);
    expect(g.__uppdaterade).toEqual([{ epost: "test.person@exempel.se" }]);
  });
  it("databasen går inte att läsa → 500, ingen inbjudan", async () => {
    g.__dbFel = true;
    expect((await anrop(ny)).status).toBe(500);
    expect(g.__inbjudningar).toEqual([]);
  });
});
