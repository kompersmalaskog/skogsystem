/**
 * Punkt 4: /api/personal. En förare får aldrig en kollegas telefon, anhörig, utbildning eller ledighet; admin ser alla;
 * utloggad får 401. Svaret bär aldrig adress, e-post eller friskvård (de ägs av Admin › Medarbetare).
 * PATCH: föraren ändrar bara SIN EGEN telefon och anhörig, admin vem som helst — och bara de fyra fälten.
 * Riktig autentisera/målMedarbetareId; service-klienten är en minnesdatabas så att svaret kan granskas rad för rad.
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

const med = (vem: keyof typeof SESSION) => { g.__session = SESSION[vem]; };
const FORARE1 = "m-forare";   // = SESSION.forare.medarbetareId
const FORARE2 = "m-annan";
const ADMIN = "m-admin";

function seed(): MinnesDb {
  return skapaMinnesDb({
    medarbetare: [
      { id: ADMIN, namn: "Admin Adminsson", roll: "admin", epost: "admin@x.se", telefon: "070-0", hemadress: "Adminvägen 1", maskin_id: null, friskvard_budget_total: 5000, friskvard_budget_anvant: 100, anhorig_namn: "Adm Anh", anhorig_telefon: "070-A", anhorig_relation: "make", aktiv: true, skyddsombud: true },
      { id: FORARE1, namn: "Förare Ett", roll: "forare", epost: "forare@x.se", telefon: "070-1", hemadress: "Egna gatan 1", maskin_id: "R64101", friskvard_budget_total: 3000, friskvard_budget_anvant: 0, anhorig_namn: "Egen Anh", anhorig_telefon: "070-E", anhorig_relation: "syskon", aktiv: true, skyddsombud: false },
      { id: FORARE2, namn: "Förare Två", roll: "forare", epost: "annan@x.se", telefon: "070-2", hemadress: "Kollegans hemlighetsväg 99", maskin_id: "R64428", friskvard_budget_total: 3000, friskvard_budget_anvant: 250, anhorig_namn: "Kollegans Anhörig", anhorig_telefon: "070-K", anhorig_relation: "förälder", aktiv: true, skyddsombud: false },
    ],
    utbildning_status: [
      { medarbetare_id: FORARE1, utbildning_namn: "Egen HLR", status: "giltig", kravtyp: "bestallare", giltig_till: "2030-01-01" },
      { medarbetare_id: FORARE2, utbildning_namn: "Kollegans Motorsågskort", status: "saknas", kravtyp: "lag", giltig_till: null },
    ],
    ledighet_ansokningar: [
      { id: "l0", medarbetare_id: FORARE1, typ: "semester", startdatum: "2000-01-03", slutdatum: "2000-01-07", status: "godkänd" },
      { id: "l1", medarbetare_id: FORARE1, typ: "atk", startdatum: "2099-03-02", slutdatum: "2099-03-02", status: "väntar" },
      { id: "l2", medarbetare_id: FORARE1, typ: "semester", startdatum: "2099-06-01", slutdatum: "2099-06-05", status: "godkänd" },
      { id: "l3", medarbetare_id: FORARE1, typ: "semester", startdatum: "2099-07-01", slutdatum: "2099-07-05", status: "godkänd" },
      { id: "l4", medarbetare_id: FORARE2, typ: "tjanstledig", startdatum: "2099-05-01", slutdatum: "2099-05-30", status: "godkänd" },
    ],
    medarbetare_mat: [
      { medarbetare_id: FORARE1, mat: "Egen laktosfri" },
      { medarbetare_id: FORARE2, mat: "Kollegans glutenfri" },
    ],
    dim_maskin: [
      { maskin_id: "R64101", visningsnamn: "H8E -23", modell: null, tillverkare: null, maskin_typ: "Harvester" },
      { maskin_id: "R64428", visningsnamn: "H8E -26", modell: null, tillverkare: null, maskin_typ: "Harvester" },
    ],
  });
}
beforeEach(() => {
  nollstall(); g.__db = seed();
  // Logga varje .eq(kolumn, värde) per tabell: frågorna ska vara begränsade redan i databasen, inte bara i svaret.
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

  it("förare → bara sig själv: egen telefon, anhörig, utbildning och ledighet, ingenting om kollegan", async () => {
    med("forare");
    const r = await GET();
    expect(r.status).toBe(200);
    const text = JSON.stringify(await r.clone().json());
    const j = await r.json();
    expect(j.arAdmin).toBe(false);
    expect(j.egenId).toBe(FORARE1);
    expect(j.personal.map((p: any) => p.id)).toEqual([FORARE1]);
    const jag = j.personal[0];
    expect(jag.telefon).toBe("070-1");
    expect(jag.anhorig_telefon).toBe("070-E");
    expect(jag.maskin_namn).toBe("H8E -23");
    expect(jag.utbildning.map((u: any) => u.namn)).toEqual(["Egen HLR"]);
    for (const hemligt of ["070-2", "Kollegans Anhörig", "070-K", "Kollegans Motorsågskort", "tjanstledig", "Adm Anh", "070-A"]) {
      expect(text, hemligt).not.toContain(hemligt);
    }
  });

  it("förare: person-, utbildnings- och ledighetsfrågan begränsas till den egna raden redan i databasen", async () => {
    med("forare");
    await GET();
    expect(g.__eq).toContainEqual(["medarbetare", "id", FORARE1]);
    expect(g.__eq).toContainEqual(["utbildning_status", "medarbetare_id", FORARE1]);
    expect(g.__eq).toContainEqual(["ledighet_ansokningar", "medarbetare_id", FORARE1]);
  });

  it("skyddsombudet syns för alla — namn och telefon, aldrig hens anhörig", async () => {
    for (const vem of ["forare", "admin"] as const) {
      med(vem);
      const j = await (await GET()).json();
      expect(j.skyddsombud, vem).toEqual({ id: ADMIN, namn: "Admin Adminsson", telefon: "070-0" });
      if (vem === "forare") expect(JSON.stringify(j)).not.toContain("Adm Anh");
    }
  });

  it("svaret bär aldrig adress, e-post eller friskvård — de ägs av Admin › Medarbetare", async () => {
    med("admin");
    const text = JSON.stringify(await (await GET()).json());
    for (const ute of ["Adminvägen 1", "Egna gatan 1", "Kollegans hemlighetsväg 99", "admin@x.se", "annan@x.se", "friskvard", "hemadress", "epost"]) {
      expect(text, ute).not.toContain(ute);
    }
  });

  it("ledighet: bara godkänd/registrerad, inte redan slutad, den närmaste först", async () => {
    med("forare");
    const j = await (await GET()).json();
    expect(j.personal[0].ledighet).toEqual({ typ: "semester", startdatum: "2099-06-01", slutdatum: "2099-06-05" });
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

  it("admin → alla, med kollegans anhörig och utbildning", async () => {
    med("admin");
    const j = await (await GET()).json();
    expect(j.arAdmin).toBe(true);
    expect(j.personal.map((p: any) => p.id).sort()).toEqual([ADMIN, FORARE1, FORARE2].sort());
    const annan = j.personal.find((p: any) => p.id === FORARE2);
    expect(annan.anhorig_namn).toBe("Kollegans Anhörig");
    expect(annan.utbildning).toEqual([{ namn: "Kollegans Motorsågskort", status: "saknas", kravtyp: "lag", giltig_till: null }]);
    expect(annan.ledighet?.typ).toBe("tjanstledig");
  });

  it("en förare kan inte be om en annan: inga parametrar styr vems rad som läses", async () => {
    // GET tar inga argument alls — det som bestämmer är sessionen. (Signaturen är GET(): inget id, ingen query.)
    expect(GET.length).toBe(0);
  });
});

describe("PATCH /api/personal/[id] — telefon och anhörig", () => {
  const patch = (id: string, body: Record<string, unknown>) =>
    PATCH(anrop(`/api/personal/${id}`, { method: "PATCH", body: JSON.stringify(body) }), ctx({ id }));
  const rad = (id: string) => g.__db.tabeller.medarbetare.find((m: any) => m.id === id);

  it("utloggad nekas, inget skrivs", async () => {
    med("utloggad");
    expect(nekad((await patch(FORARE1, { telefon: "HACKAD" })).status)).toBe(true);
    expect(g.__db.skrivlogg).toEqual([]);
  });

  it("förare kan inte ändra en kollega: 403, raden orörd", async () => {
    med("forare");
    const r = await patch(FORARE2, { telefon: "HACKAD", anhorig_telefon: "HACKAD" });
    expect(r.status).toBe(403);
    expect(rad(FORARE2).telefon).toBe("070-2");
    expect(g.__db.skrivlogg).toEqual([]);
  });

  it("förare ändrar sin egen telefon och anhörig", async () => {
    med("forare");
    const r = await patch(FORARE1, { telefon: " 070-111 ", anhorig_namn: "Ny Anhörig", anhorig_relation: "sambo", anhorig_telefon: "070-999" });
    expect(r.status).toBe(200);
    expect(rad(FORARE1)).toMatchObject({ telefon: "070-111", anhorig_namn: "Ny Anhörig", anhorig_relation: "sambo", anhorig_telefon: "070-999" });
  });

  it("förare kan aldrig nå roll, maskin, adress, lön eller friskvård — fälten ignoreras", async () => {
    med("forare");
    const r = await patch(FORARE1, { telefon: "070-111", roll: "admin", maskin_id: "X", hemadress: "Ny väg", timlon_kr: 999, friskvard_budget_total: 99999, aktiv: false, skyddsombud: true });
    expect(r.status).toBe(200);
    expect(rad(FORARE1)).toMatchObject({ roll: "forare", maskin_id: "R64101", hemadress: "Egna gatan 1", friskvard_budget_total: 3000, aktiv: true, skyddsombud: false, telefon: "070-111" });
    expect(rad(FORARE1).timlon_kr).toBeUndefined();
  });

  it("tom text sparas som null; bara okända fält → 400", async () => {
    med("forare");
    expect((await patch(FORARE1, { anhorig_relation: "  " })).status).toBe(200);
    expect(rad(FORARE1).anhorig_relation).toBeNull();
    expect((await patch(FORARE1, { roll: "admin" })).status).toBe(400);
  });

  it("admin ändrar en kollegas telefon", async () => {
    med("admin");
    expect((await patch(FORARE2, { telefon: "070-222" })).status).toBe(200);
    expect(rad(FORARE2).telefon).toBe("070-222");
  });
});

describe("Mat — personens egen uppgift, bara den själv och admin", () => {
  const patch = (id: string, body: Record<string, unknown>) =>
    PATCH(anrop(`/api/personal/${id}`, { method: "PATCH", body: JSON.stringify(body) }), ctx({ id }));
  const mat = (id: string) => g.__db.tabeller.medarbetare_mat.find((m: any) => m.medarbetare_id === id);

  it("förare ser sin egen mat, aldrig kollegans — och frågan begränsas i databasen", async () => {
    med("forare");
    const j = await (await GET()).json();
    expect(j.personal[0].mat).toBe("Egen laktosfri");
    expect(JSON.stringify(j)).not.toContain("Kollegans glutenfri");
    expect(g.__eq).toContainEqual(["medarbetare_mat", "medarbetare_id", FORARE1]);
  });

  it("admin ser allas mat; den som inte skrivit något får null", async () => {
    med("admin");
    const j = await (await GET()).json();
    const per = Object.fromEntries(j.personal.map((p: any) => [p.id, p.mat]));
    expect(per).toEqual({ [ADMIN]: null, [FORARE1]: "Egen laktosfri", [FORARE2]: "Kollegans glutenfri" });
  });

  it("läsfel på mat: fältet utelämnas, resten av vyn fungerar", async () => {
    med("admin");
    g.__db.injiceraFel("medarbetare_mat.select", { message: "boom" });
    const r = await GET();
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.personal.every((p: any) => !("mat" in p))).toBe(true);
  });

  it("anställningsdatum bara till admin", async () => {
    g.__db.tabeller.medarbetare.forEach((m: any) => { m.anstallningsdatum = null; });
    med("forare");
    expect("anstallningsdatum" in (await (await GET()).json()).personal[0]).toBe(false);
    med("admin");
    expect((await (await GET()).json()).personal.every((p: any) => p.anstallningsdatum === null)).toBe(true);
  });

  it("förare skriver sin egen mat; tom text tar bort raden", async () => {
    med("forare");
    expect((await patch(FORARE1, { mat: " vegetarian " })).status).toBe(200);
    expect(mat(FORARE1)).toMatchObject({ mat: "vegetarian", andrad_av: FORARE1 });
    expect((await patch(FORARE1, { mat: "  " })).status).toBe(200);
    expect(mat(FORARE1)).toBeUndefined();
  });

  it("förare kan inte skriva en kollegas mat: 403, inget skrivs", async () => {
    med("forare");
    expect((await patch(FORARE2, { mat: "HACKAD" })).status).toBe(403);
    expect(mat(FORARE2).mat).toBe("Kollegans glutenfri");
    expect(g.__db.skrivlogg).toEqual([]);
  });

  it("för lång text eller fel typ → 400", async () => {
    med("forare");
    expect((await patch(FORARE1, { mat: "x".repeat(201) })).status).toBe(400);
    expect((await patch(FORARE1, { mat: 5 })).status).toBe(400);
  });
});
