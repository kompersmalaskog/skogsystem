/**
 * Punkt 1: debug-nyckeln är borta. Inga rutter släpper in på en sträng i URL:en — bara en inloggad admin (diagnostik,
 * manuella körningar) eller en inloggad användare (Kalibrering, som förare använder). Riktig kravRoll/kravInloggad körs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { nollstall, SESSION, tjanst } from "@/lib/testStod/authFakes";

const g = globalThis as any;
const NYCKEL = "skogsystem" + "-debug"; // skrivs isär så att testet inte larmar på sig själv

vi.mock("next/headers", async () => (await import("@/lib/testStod/authFakes")).nextHeadersFake);
vi.mock("@supabase/ssr", async () => (await import("@/lib/testStod/authFakes")).ssrFake);
vi.mock("@supabase/supabase-js", async () => {
  const f = await import("@/lib/testStod/authFakes");
  return { createClient: () => { (globalThis as any).__tjanstAnvandningar++; return f.tjanst(); } };
});
vi.mock("@/lib/lonesystem/server", async () => {
  const f = await import("@/lib/testStod/authFakes");
  return {
    serverSupabase: () => { (globalThis as any).__tjanstAnvandningar++; return f.tjanst(); },
    getFortnoxClient: async () => { throw new Error("ingen Fortnox i test"); },
  };
});

import { GET as appState } from "@/app/api/app-state/route";
import { POST as avtalPamin } from "@/app/api/avtal/notify-pamin/route";
import { POST as fordonPamin } from "@/app/api/fordon/notify-pamin/route";
import { POST as syncVouchers } from "@/app/api/fortnox/sync-vouchers/route";
import { POST as syncInvoices } from "@/app/api/fortnox/sync-invoices/route";
import { GET as kalTradslag } from "@/app/api/kalibrering/tradslag/route";
import { GET as kalDiagnos } from "@/app/api/kalibrering/diagnos/route";
import { GET as kalKalender } from "@/app/api/kalibrering/kalender/route";
import { GET as kalObjekt } from "@/app/api/kalibrering/objekt/route";
import { GET as kalKontroll } from "@/app/api/kalibrering/kontroll/route";
import { GET as kalBedomning } from "@/app/api/kalibrering/bedomning/route";
import { GET as kalKontroller } from "@/app/api/kalibrering/kontroller/route";

const med = (vem: keyof typeof SESSION) => { g.__session = SESSION[vem]; };
const anrop = (path: string, method = "GET") =>
  new Request(`https://app.example.se${path}${path.includes("?") ? "&" : "?"}key=${NYCKEL}`, { method }) as any;
const nekad = (s: number) => s === 401 || s === 403;

beforeEach(() => { nollstall(); });

// Rutter där bara admin får in. `ok` = vad admin får tillbaka utan att något annat behövs.
const ADMIN_RUTTER: Array<[string, (r: any) => Promise<Response>, string, string]> = [
  ["app-state", appState as any, "/api/app-state", "GET"],
  ["avtal/notify-pamin", avtalPamin as any, "/api/avtal/notify-pamin", "POST"],
  ["fordon/notify-pamin", fordonPamin as any, "/api/fordon/notify-pamin", "POST"],
  ["fortnox/sync-vouchers", syncVouchers as any, "/api/fortnox/sync-vouchers", "POST"],
  ["fortnox/sync-invoices", syncInvoices as any, "/api/fortnox/sync-invoices", "POST"],
];

describe.each(ADMIN_RUTTER)("%s: bara admin, aldrig en nyckel i URL:en", (_namn, handler, path, method) => {
  it("utloggad nekas även med den gamla nyckeln — och service-nyckeln rörs inte", async () => {
    med("utloggad");
    const r = await handler(anrop(path, method));
    expect(nekad(r.status)).toBe(true);
    expect(g.__tjanstAnvandningar).toBe(0);
  });
  it("förare nekas även med den gamla nyckeln — och service-nyckeln rörs inte", async () => {
    med("forare");
    const r = await handler(anrop(path, method));
    expect(nekad(r.status)).toBe(true);
    expect(g.__tjanstAnvandningar).toBe(0);
  });
  it("admin kommer in (inte 401/403)", async () => {
    med("admin");
    const r = await handler(anrop(path, method));
    expect(nekad(r.status), `status ${r.status}`).toBe(false);
    if (path.includes("notify-pamin")) expect(r.status).toBe(200);   // inget att skicka i testet: ett vanligt ok, inte ett kast
  });
});

describe("app-state: admin utan id får ett vanligt 400 (vakten är passerad), inte 'Ogiltig nyckel'", () => {
  it("400 och ingen text om nyckel", async () => {
    med("admin");
    const r = await (appState as any)(anrop("/api/app-state"));
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).not.toMatch(/nyckel/i);
  });
});

describe("pamin-rutterna: cron-hemligheten fungerar fortfarande utan session", () => {
  it("Bearer AVTAL_NOTIFY_SECRET / CRON_SECRET släpps in", async () => {
    process.env.AVTAL_NOTIFY_SECRET = "avtal-hemlig"; process.env.CRON_SECRET = "cron-hemlig";
    med("utloggad");
    const a = await (avtalPamin as any)(new Request("https://app.example.se/api/avtal/notify-pamin", { method: "POST", headers: { authorization: "Bearer avtal-hemlig" } }));
    expect(nekad(a.status)).toBe(false);
    const f = await (fordonPamin as any)(new Request("https://app.example.se/api/fordon/notify-pamin", { method: "POST", headers: { authorization: "Bearer cron-hemlig" } }));
    expect(nekad(f.status)).toBe(false);
    const fel = await (avtalPamin as any)(new Request("https://app.example.se/api/avtal/notify-pamin", { method: "POST", headers: { authorization: "Bearer fel" } }));
    expect(nekad(fel.status)).toBe(true);
  });
});

// Kalibrering är en förarvy (vyregistret: forare har 'kalibrering'): inloggad räcker, utloggad nekas, ingen nyckel.
const KALIBRERING: Array<[string, (r: any) => Promise<Response>, string]> = [
  ["tradslag", kalTradslag as any, "/api/kalibrering/tradslag?maskin_id=R64101"],
  ["diagnos", kalDiagnos as any, "/api/kalibrering/diagnos?maskin_id=R64101"],
  ["kalender", kalKalender as any, "/api/kalibrering/kalender?manad=2026-10"],
  ["objekt", kalObjekt as any, "/api/kalibrering/objekt"],
  ["kontroll", kalKontroll as any, "/api/kalibrering/kontroll?filnamn=x"],
  ["bedomning", kalBedomning as any, "/api/kalibrering/bedomning?maskin_id=R64101"],
  ["kontroller", kalKontroller as any, "/api/kalibrering/kontroller?maskin_id=R64101"],
];
describe.each(KALIBRERING)("kalibrering/%s", (_namn, handler, path) => {
  it("utloggad nekas — även med den gamla nyckeln", async () => {
    med("utloggad");
    expect((await handler(anrop(path))).status).toBe(401);
    expect(g.__tjanstAnvandningar).toBe(0);
  });
  it("förare och admin kommer in UTAN nyckel", async () => {
    for (const vem of ["forare", "admin"] as const) {
      med(vem);
      const r = await handler(new Request(`https://app.example.se${path}`) as any);
      expect(nekad(r.status), `${vem}: ${r.status}`).toBe(false);
    }
  });
});

describe("debug-rutterna är borta", () => {
  it("debug-token och debug-result finns inte längre", () => {
    expect(existsSync(join(__dirname, "../fortnox/debug-token"))).toBe(false);
    expect(existsSync(join(__dirname, "../fortnox/debug-result"))).toBe(false);
  });
});

// Larmar om nyckeln kommer tillbaka var som helst i källan, eller om en route börjar jämföra ?key= mot en bokstavlig sträng.
const ROT = join(__dirname, "..", "..", "..");
function filer(dir: string, ut: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) filer(p, ut);
    else if (/\.(ts|tsx|js|mjs|py|yml|yaml|json|ps1|sql)$/.test(n)) ut.push(p);
  }
  return ut;
}
describe("strängen kommer inte tillbaka", () => {
  const alla = ["app", "lib", "components", "scripts", ".github", "supabase", "middleware.ts"].map(d => join(ROT, d)).filter(existsSync)
    .flatMap(p => (statSync(p).isDirectory() ? filer(p) : [p]))
    .filter(p => p !== __filename.replace(/\\/g, "/"));
  it("inget i repot nämner debug-nyckeln", () => {
    const traffar = alla.filter(p => readFileSync(p, "utf8").includes(NYCKEL)).map(p => relative(ROT, p));
    expect(traffar).toEqual([]);
  });
  it("ingen route jämför ?key= mot en bokstavlig sträng (hemligheter kommer ur miljön, och bara i headern)", () => {
    const traffar = alla.filter(p => p.includes("/app/api/") && /searchParams\.get\(\s*['"]key['"]\s*\)\s*[!=]==?\s*['"]/.test(readFileSync(p, "utf8"))).map(p => relative(ROT, p));
    expect(traffar).toEqual([]);
  });
});
