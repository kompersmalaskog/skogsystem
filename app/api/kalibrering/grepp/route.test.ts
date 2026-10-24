/**
 * Greppet: läsrutten (alla inloggade, räknar ALDRIG) och cron-rutten (räknar om det som ligger efter, bara cron-hemligheten eller en admin).
 * Avgörande: att öppna vyn kan aldrig starta en omräkning — det var vad Martin bad om 2026-10-24.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const g = globalThis as any;
vi.mock("@/lib/auth/server", () => ({
  kravInloggad: async () => (g.__inloggad === false ? { ok: false, res: new Response(JSON.stringify({ ok: false }), { status: 401 }) } : { ok: true, session: {} }),
  kravRoll: async () => (g.__admin ? { ok: true, session: {} } : { ok: false, res: new Response(JSON.stringify({ ok: false }), { status: g.__inloggad === false ? 401 : 403 }) }),
  ADMIN_ROLLER: ["admin"],
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async (namn: string, args: any) => {
      g.__rpc.push({ namn, args });
      if (g.__rpcFel?.[namn]) return { data: null, error: g.__rpcFel[namn] };
      if (namn === "kalibrering_grepp_rakna" && g.__raknaFel?.includes(args.p_objekt)) return { data: null, error: { message: "timeout" } };
      return { data: g.__rpcSvar[namn] ?? [], error: null };
    },
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: g.__maskiner ?? [{ maskin_id: "M1" }], error: g.__maskinFel ? { message: "x" } : null }) }) }),
    }),
  }),
}));

import { GET as LAS } from "./route";
import { GET as CRON } from "../../cron/kalibrering-grepp/route";

const las = (q = "?maskin_id=M1") => LAS({ url: `https://app.example/api/kalibrering/grepp${q}` } as any);
const cron = (auth?: string) => CRON({ headers: new Headers(auth ? { authorization: auth } : {}) } as any);
const anrop = (namn: string) => g.__rpc.filter((a: any) => a.namn === namn);

beforeEach(() => {
  g.__rpc = []; g.__rpcFel = {}; g.__raknaFel = []; g.__inloggad = true; g.__admin = false; g.__maskiner = undefined; g.__maskinFel = false;
  g.__rpcSvar = {
    kalibrering_grepp_status: [
      { objekt_id: "liten", antal_stammar: 10, antal_raknade: 10, aktuell: false },
      { objekt_id: "stor", antal_stammar: 5000, antal_raknade: 5000, aktuell: false },
      { objekt_id: "klar", antal_stammar: 300, antal_raknade: 290, aktuell: true },
    ],
    kalibrering_grepp_sammanstall: [{ manad: "2026-09", tradslag: "TALL", klass: "300+", stammar: "8", steg: "400", still: "100", summa_andel: 2 }],
  };
  process.env.CRON_SECRET = "hemlig";
});

describe("GET /api/kalibrering/grepp (läsning)", () => {
  it("alla inloggade får läsa — en förare behöver inte vara admin", async () => {
    g.__admin = false;
    const r = await las();
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.rader).toEqual([{ manad: "2026-09", tradslag: "TALL", klass: "300+", stammar: 8, steg: 400, still: 100, summaAndel: 2 }]);
  });

  it("ej inloggad: 401", async () => {
    g.__inloggad = false;
    expect((await las()).status).toBe(401);
  });

  it("räknar ALDRIG: kvar säger hur många som ligger efter, kalibrering_grepp_rakna anropas inte", async () => {
    const j = await (await las()).json();
    expect(j.kvar).toBe(2);
    expect(j.stammarTotalt).toBe(5310);
    expect(j.stammarRaknade).toBe(5300);
    expect(anrop("kalibrering_grepp_rakna")).toHaveLength(0);
  });

  it("allt aktuellt: kvar 0", async () => {
    g.__rpcSvar.kalibrering_grepp_status = [{ objekt_id: "klar", antal_stammar: 1, antal_raknade: 1, aktuell: true }];
    expect((await (await las()).json()).kvar).toBe(0);
  });

  it("migrationen inte körd: tillganglig false (inget fel)", async () => {
    g.__rpcFel.kalibrering_grepp_status = { code: "PGRST202", message: "Could not find the function" };
    const j = await (await las()).json();
    expect(j.tillganglig).toBe(false);
    expect(j.orsak).toBe("migration");
  });

  it("ett riktigt läsfel är ett fel (500), aldrig tomma rader", async () => {
    g.__rpcFel.kalibrering_grepp_sammanstall = { message: "boom" };
    expect((await las()).status).toBe(500);
  });

  it("maskin_id krävs", async () => {
    expect((await las("")).status).toBe(400);
  });
});

describe("GET /api/cron/kalibrering-grepp (omräkning)", () => {
  it("utan cron-hemlighet och utan admin: nekas och inget räknas", async () => {
    expect((await cron()).status).toBe(403);
    expect((await cron("Bearer fel")).status).toBe(403);
    expect(anrop("kalibrering_grepp_rakna")).toHaveLength(0);
  });

  it("utan inloggning: 401", async () => {
    g.__inloggad = false;
    expect((await cron()).status).toBe(401);
  });

  it("cron-hemligheten räcker (ingen session)", async () => {
    g.__inloggad = false;
    const r = await cron("Bearer hemlig");
    expect(r.status).toBe(200);
  });

  it("en inloggad admin får köra för hand", async () => {
    g.__admin = true;
    expect((await cron()).status).toBe(200);
  });

  it("räknar bara det som ligger efter, största först", async () => {
    const j = await (await cron("Bearer hemlig")).json();
    expect(anrop("kalibrering_grepp_rakna").map((a: any) => a.args.p_objekt)).toEqual(["stor", "liten"]);
    expect(j.raknade).toBe(2);
    expect(j.kvar).toBe(0);
    expect(j.ok).toBe(true);
  });

  it("ett objekt som faller stoppar inte de andra och syns i svaret", async () => {
    g.__raknaFel = ["stor"];
    const j = await (await cron("Bearer hemlig")).json();
    expect(j.ok).toBe(false);
    expect(j.fel).toEqual(["M1:stor"]);
    expect(j.raknade).toBe(1);
  });

  it("migrationen inte körd: ingenting att räkna, svaret säger det", async () => {
    g.__rpcFel.kalibrering_grepp_status = { code: "42883", message: "function does not exist" };
    const j = await (await cron("Bearer hemlig")).json();
    expect(j.saknas).toBe(true);
    expect(anrop("kalibrering_grepp_rakna")).toHaveLength(0);
  });

  it("ett läsfel på maskinlistan är ett fel, inte 'inga maskiner'", async () => {
    g.__maskinFel = true;
    expect((await cron("Bearer hemlig")).status).toBe(500);
  });
});

describe("källvakter", () => {
  it("ingen av kalibreringsrutterna för Greppet/Per grovlek har debug-nyckel eller kräver admin för att läsa", async () => {
    const fs = await import("node:fs");
    for (const f of ["app/api/kalibrering/grepp/route.ts", "app/api/kalibrering/grovlek/route.ts"]) {
      const k = fs.readFileSync(f, "utf8");
      expect(k).toContain("kravInloggad");
      expect(k).not.toMatch(/kravRoll\(/);
      expect(k).not.toMatch(/searchParams\.get\(["']key["']\)/);
    }
  });

  it("läsrutten kan inte anropa omräkningen", async () => {
    const fs = await import("node:fs");
    const k = fs.readFileSync("app/api/kalibrering/grepp/route.ts", "utf8");
    expect(k).not.toContain("raknaOmGrepp");
    expect(k).not.toContain("kalibrering_grepp_rakna");
  });

  it("cron-jobbet står i vercel.json", async () => {
    const fs = await import("node:fs");
    const v = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
    expect(v.crons.some((c: any) => c.path === "/api/cron/kalibrering-grepp")).toBe(true);
  });
});
