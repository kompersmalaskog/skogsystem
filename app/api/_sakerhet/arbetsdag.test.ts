/**
 * Punkt 5: /api/arbetsdag/[id]/objekt (GET/POST) och /[oid] (PATCH/DELETE). Arbetsdagen måste vara den inloggades egen
 * (eller anroparen admin), annars 403 — och en rad (oid) måste höra till arbetsdagen i sökvägen, annars kunde en förare
 * ange sin egen dag och en kollegas rad. Riktig autentisera; service-klienten är en minnesdatabas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { nollstall, SESSION } from "@/lib/testStod/authFakes";
import { skapaMinnesDb, type MinnesDb } from "@/lib/testStod/minnesDb";

const g = globalThis as any;

vi.mock("next/headers", async () => (await import("@/lib/testStod/authFakes")).nextHeadersFake);
vi.mock("@supabase/ssr", async () => (await import("@/lib/testStod/authFakes")).ssrFake);
vi.mock("@supabase/supabase-js", () => ({ createClient: () => { (globalThis as any).__tjanstAnvandningar++; return (globalThis as any).__db; } }));

import { GET, POST } from "@/app/api/arbetsdag/[id]/objekt/route";
import { PATCH, DELETE } from "@/app/api/arbetsdag/[id]/objekt/[oid]/route";

const med = (vem: keyof typeof SESSION) => { g.__session = SESSION[vem]; };
const MIN_DAG = "dag-min", ANNANS_DAG = "dag-annan";
const MIN_RAD = "rad-min", ANNANS_RAD = "rad-annan";

function seed(): MinnesDb {
  return skapaMinnesDb({
    arbetsdag: [
      { id: MIN_DAG, medarbetare_id: "m-forare", datum: "2026-10-20" },
      { id: ANNANS_DAG, medarbetare_id: "m-annan", datum: "2026-10-20" },
    ],
    arbetsdag_objekt: [
      { id: MIN_RAD, arbetsdag_id: MIN_DAG, objekt_namn: "Mitt objekt", arbetad_min: 100, ordning: 1 },
      { id: ANNANS_RAD, arbetsdag_id: ANNANS_DAG, objekt_namn: "Kollegans objekt", arbetad_min: 200, ordning: 1 },
    ],
  });
}
beforeEach(() => { nollstall(); g.__db = seed(); });

const req = (method: string, body?: unknown) =>
  new Request("https://app.example.se/api/arbetsdag/x/objekt", { method, ...(body ? { body: JSON.stringify(body) } : {}) }) as any;
const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as any;
const rader = () => g.__db.tabeller.arbetsdag_objekt as any[];

describe("GET /api/arbetsdag/[id]/objekt", () => {
  it("utloggad → 401, service-nyckeln rörs inte", async () => {
    med("utloggad");
    expect((await GET(req("GET"), ctx({ id: MIN_DAG }))).status).toBe(401);
    expect(g.__tjanstAnvandningar).toBe(0);
  });
  it("förare läser sin egen dag", async () => {
    med("forare");
    const r = await GET(req("GET"), ctx({ id: MIN_DAG }));
    expect(r.status).toBe(200);
    expect((await r.json()).objekt.map((o: any) => o.id)).toEqual([MIN_RAD]);
  });
  it("förare läser en kollegas dag → 403 och ingen rad i svaret", async () => {
    med("forare");
    const r = await GET(req("GET"), ctx({ id: ANNANS_DAG }));
    expect(r.status).toBe(403);
    expect(JSON.stringify(await r.json())).not.toContain("Kollegans objekt");
  });
  it("förare ber om en arbetsdag som inte finns → 404", async () => {
    med("forare");
    expect((await GET(req("GET"), ctx({ id: "finns-inte" }))).status).toBe(404);
  });
  it("förare utan medarbetarrad → 404", async () => {
    g.__session = { email: "okand@x.se", roll: null, medarbetareId: null };
    expect((await GET(req("GET"), ctx({ id: MIN_DAG }))).status).toBe(404);
  });
  it("admin läser vilken dag som helst", async () => {
    med("admin");
    const r = await GET(req("GET"), ctx({ id: ANNANS_DAG }));
    expect(r.status).toBe(200);
    expect((await r.json()).objekt.map((o: any) => o.id)).toEqual([ANNANS_RAD]);
  });
});

describe("POST /api/arbetsdag/[id]/objekt", () => {
  const ny = { objekt_namn: "Nytt", arbetad_min: 30 };
  it("utloggad → 401", async () => {
    med("utloggad");
    expect((await POST(req("POST", ny), ctx({ id: MIN_DAG }))).status).toBe(401);
    expect(g.__db.skrivlogg).toEqual([]);
  });
  it("förare lägger till på sin egen dag", async () => {
    med("forare");
    expect((await POST(req("POST", ny), ctx({ id: MIN_DAG }))).status).toBe(200);
    expect(rader().filter(r => r.arbetsdag_id === MIN_DAG)).toHaveLength(2);
  });
  it("förare lägger till på en kollegas dag → 403, inget skrivs", async () => {
    med("forare");
    expect((await POST(req("POST", ny), ctx({ id: ANNANS_DAG }))).status).toBe(403);
    expect(g.__db.skrivlogg).toEqual([]);
    expect(rader()).toHaveLength(2);
  });
  it("admin lägger till på vilken dag som helst", async () => {
    med("admin");
    expect((await POST(req("POST", ny), ctx({ id: ANNANS_DAG }))).status).toBe(200);
    expect(rader().filter(r => r.arbetsdag_id === ANNANS_DAG)).toHaveLength(2);
  });
});

describe("PATCH /DELETE /api/arbetsdag/[id]/objekt/[oid]", () => {
  const patch = (id: string, oid: string) => PATCH(req("PATCH", { arbetad_min: 1 }), ctx({ id, oid }));
  const del = (id: string, oid: string) => DELETE(req("DELETE"), ctx({ id, oid }));

  it("utloggad nekas (401) — inget ändras", async () => {
    med("utloggad");
    expect((await patch(MIN_DAG, MIN_RAD)).status).toBe(401);
    expect((await del(MIN_DAG, MIN_RAD)).status).toBe(401);
    expect(g.__db.skrivlogg).toEqual([]);
  });
  it("förare ändrar och raderar sin egen rad", async () => {
    med("forare");
    expect((await patch(MIN_DAG, MIN_RAD)).status).toBe(200);
    expect(rader().find(r => r.id === MIN_RAD).arbetad_min).toBe(1);
    expect((await del(MIN_DAG, MIN_RAD)).status).toBe(200);
    expect(rader().some(r => r.id === MIN_RAD)).toBe(false);
  });
  it("förare mot en kollegas dag (rätt dag-id, kollegans rad) → 403, raden orörd", async () => {
    med("forare");
    expect((await patch(ANNANS_DAG, ANNANS_RAD)).status).toBe(403);
    expect((await del(ANNANS_DAG, ANNANS_RAD)).status).toBe(403);
    expect(rader().find(r => r.id === ANNANS_RAD)).toMatchObject({ arbetad_min: 200 });
    expect(g.__db.skrivlogg).toEqual([]);
  });
  it("förare byter ID: sin egen dag i sökvägen men kollegans rad → 404, kollegans rad orörd (IDOR-tricket)", async () => {
    med("forare");
    expect((await patch(MIN_DAG, ANNANS_RAD)).status).toBe(404);
    expect((await del(MIN_DAG, ANNANS_RAD)).status).toBe(404);
    expect(rader().find(r => r.id === ANNANS_RAD)).toMatchObject({ arbetad_min: 200 });
  });
  it("admin ändrar och raderar en kollegas rad", async () => {
    med("admin");
    expect((await patch(ANNANS_DAG, ANNANS_RAD)).status).toBe(200);
    expect(rader().find(r => r.id === ANNANS_RAD).arbetad_min).toBe(1);
    expect((await del(ANNANS_DAG, ANNANS_RAD)).status).toBe(200);
    expect(rader().some(r => r.id === ANNANS_RAD)).toBe(false);
  });
  it("admin med fel dag/rad-par → 404 (raden hör inte till dagen)", async () => {
    med("admin");
    expect((await patch(MIN_DAG, ANNANS_RAD)).status).toBe(404);
    expect(rader().find(r => r.id === ANNANS_RAD)).toMatchObject({ arbetad_min: 200 });
  });
});
