/**
 * Punkt 4: /api/personal. En förare får aldrig en kollegas adress, närstående, budget eller certifikat; admin ser allt;
 * utloggad får 401. Ändra-rutterna (PATCH, certifikat) är bara för admin. Riktig autentisera/kravRoll; service-klienten är
 * en minnesdatabas så att svaret kan granskas rad för rad.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { nollstall, SESSION } from "@/lib/testStod/authFakes";
import { skapaMinnesDb, type MinnesDb } from "@/lib/testStod/minnesDb";

const g = globalThis as any;

vi.mock("next/headers", async () => (await import("@/lib/testStod/authFakes")).nextHeadersFake);
vi.mock("@supabase/ssr", async () => (await import("@/lib/testStod/authFakes")).ssrFake);
vi.mock("@supabase/supabase-js", () => ({ createClient: () => { (globalThis as any).__tjanstAnvandningar++; return (globalThis as any).__db; } }));

import { GET } from "@/app/api/personal/route";
import { PATCH } from "@/app/api/personal/[id]/route";
import { POST as certPost } from "@/app/api/personal/[id]/certifikat/route";
import { PATCH as certPatch, DELETE as certDelete } from "@/app/api/personal/[id]/certifikat/[certId]/route";

const med = (vem: keyof typeof SESSION) => { g.__session = SESSION[vem]; };
const FORARE1 = "m-forare";   // = SESSION.forare.medarbetareId
const FORARE2 = "m-annan";
const ADMIN = "m-admin";

function seed(): MinnesDb {
  return skapaMinnesDb({
    medarbetare: [
      { id: ADMIN, namn: "Admin Adminsson", roll: "admin", epost: "admin@x.se", telefon: "070-0", hemadress: "Adminvägen 1", maskin_id: null, friskvard_budget_total: 5000, friskvard_budget_anvant: 100, anhorig_namn: "Adm Anh", anhorig_telefon: "070-A", anhorig_relation: "make", aktiv: true },
      { id: FORARE1, namn: "Förare Ett", roll: "forare", epost: "forare@x.se", telefon: "070-1", hemadress: "Egna gatan 1", maskin_id: "R64101", friskvard_budget_total: 3000, friskvard_budget_anvant: 0, anhorig_namn: "Egen Anh", anhorig_telefon: "070-E", anhorig_relation: "syskon", aktiv: true },
      { id: FORARE2, namn: "Förare Två", roll: "forare", epost: "annan@x.se", telefon: "070-2", hemadress: "Kollegans hemlighetsväg 99", maskin_id: "R64428", friskvard_budget_total: 3000, friskvard_budget_anvant: 250, anhorig_namn: "Kollegans Anhörig", anhorig_telefon: "070-K", anhorig_relation: "förälder", aktiv: true },
    ],
    medarbetare_certifikat: [
      { id: "c1", medarbetare_id: FORARE1, namn: "Egen certifikat", aktiv: true, utgar_datum: "2027-01-01" },
      { id: "c2", medarbetare_id: FORARE2, namn: "Kollegans certifikat", aktiv: true, utgar_datum: "2027-02-01" },
    ],
  });
}
beforeEach(() => {
  nollstall(); g.__db = seed();
  // Logga varje .eq(kolumn, värde) per tabell: certifikatfrågan ska vara begränsad redan i databasen, inte bara i svaret.
  g.__eq = [] as Array<[string, string, unknown]>;
  const orig = g.__db.from.bind(g.__db);
  g.__db.from = (t: string) => { const b = orig(t); const eq = b.eq; b.eq = (...a: any[]) => { g.__eq.push([t, a[0], a[1]]); return eq.apply(b, a); }; return b; };
});

const anrop = (path = "/api/personal", init?: RequestInit) => new Request(`https://app.example.se${path}`, init) as any;
const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as any;
const nekad = (s: number) => s === 401 || s === 403;

describe("GET /api/personal", () => {
  it("utloggad → 401, och service-nyckeln rörs inte", async () => {
    med("utloggad");
    const r = await GET();
    expect(r.status).toBe(401);
    expect(g.__tjanstAnvandningar).toBe(0);
  });

  it("förare → bara sig själv: en rad, egna certifikat, ingenting om kollegan", async () => {
    med("forare");
    const r = await GET();
    expect(r.status).toBe(200);
    const text = JSON.stringify(await r.clone().json());
    const j = await r.json();
    expect(j.personal.map((p: any) => p.id)).toEqual([FORARE1]);
    expect(j.personal[0].hemadress).toBe("Egna gatan 1");
    expect(j.personal[0].certifikat.map((c: any) => c.id)).toEqual(["c1"]);
    for (const hemligt of ["Kollegans hemlighetsväg 99", "Kollegans Anhörig", "070-K", "annan@x.se", "Kollegans certifikat", "Adminvägen 1", "Adm Anh"]) {
      expect(text, hemligt).not.toContain(hemligt);
    }
  });

  it("förare: både personfrågan och certifikatfrågan begränsas till den egna raden redan i databasen", async () => {
    med("forare");
    await GET();
    expect(g.__eq).toContainEqual(["medarbetare", "id", FORARE1]);
    expect(g.__eq).toContainEqual(["medarbetare_certifikat", "medarbetare_id", FORARE1]);
  });

  it("admin: ingen begränsning till en person", async () => {
    med("admin");
    await GET();
    expect(g.__eq.filter((e: any[]) => e[1] === "id" || e[1] === "medarbetare_id")).toEqual([]);
  });

  it("förare utan medarbetarrad → 404, ingenting läses", async () => {
    g.__session = { email: "okand@x.se", roll: null, medarbetareId: null };
    const r = await GET();
    expect(r.status).toBe(404);
    expect(g.__tjanstAnvandningar).toBe(0);
  });

  it("admin → alla med adress, närstående och certifikat", async () => {
    med("admin");
    const r = await GET();
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.personal.map((p: any) => p.id).sort()).toEqual([ADMIN, FORARE1, FORARE2].sort());
    const annan = j.personal.find((p: any) => p.id === FORARE2);
    expect(annan.hemadress).toBe("Kollegans hemlighetsväg 99");
    expect(annan.anhorig_namn).toBe("Kollegans Anhörig");
    expect(annan.certifikat.map((c: any) => c.id)).toEqual(["c2"]);
  });

  it("en förare kan inte be om en annan: inga parametrar styr vems rad som läses", async () => {
    med("forare");
    // GET tar inga argument alls — det som bestämmer är sessionen. (Signaturen är GET(): inget id, ingen query.)
    expect(GET.length).toBe(0);
  });
});

describe("ändra-rutterna är bara för admin", () => {
  const patch = (id: string) => PATCH(anrop(`/api/personal/${id}`, { method: "PATCH", body: JSON.stringify({ telefon: "HACKAD", hemadress: "Hackad" }) }), ctx({ id }));
  it("PATCH: utloggad och förare nekas, raden är orörd", async () => {
    for (const vem of ["utloggad", "forare"] as const) {
      med(vem);
      for (const id of [FORARE1, FORARE2]) expect(nekad((await patch(id)).status), `${vem} ${id}`).toBe(true);
    }
    expect(g.__db.tabeller.medarbetare.some((m: any) => m.telefon === "HACKAD")).toBe(false);
    expect(g.__db.skrivlogg).toEqual([]);
  });
  it("PATCH: admin ändrar", async () => {
    med("admin");
    expect((await patch(FORARE2)).status).toBe(200);
    expect(g.__db.tabeller.medarbetare.find((m: any) => m.id === FORARE2).telefon).toBe("HACKAD");
  });

  it("certifikat POST/PATCH/DELETE: utloggad och förare nekas, inget skrivs", async () => {
    for (const vem of ["utloggad", "forare"] as const) {
      med(vem);
      expect(nekad((await certPost(anrop(`/api/personal/${FORARE2}/certifikat`, { method: "POST", body: JSON.stringify({ namn: "Falskt" }) }), ctx({ id: FORARE2 }))).status), `post ${vem}`).toBe(true);
      expect(nekad((await certPatch(anrop(`/api/personal/${FORARE2}/certifikat/c2`, { method: "PATCH", body: JSON.stringify({ namn: "Hackat" }) }), ctx({ id: FORARE2, certId: "c2" }))).status), `patch ${vem}`).toBe(true);
      expect(nekad((await certDelete(anrop(`/api/personal/${FORARE2}/certifikat/c2`, { method: "DELETE" }), ctx({ id: FORARE2, certId: "c2" }))).status), `delete ${vem}`).toBe(true);
    }
    expect(g.__db.skrivlogg).toEqual([]);
  });
  it("certifikat: admin kommer in (inte 401/403)", async () => {
    med("admin");
    const r = await certPost(anrop(`/api/personal/${FORARE2}/certifikat`, { method: "POST", body: JSON.stringify({ namn: "Nytt cert", utgar_datum: "2028-01-01" }) }), ctx({ id: FORARE2 }));
    expect(nekad(r.status)).toBe(false);
  });
});
