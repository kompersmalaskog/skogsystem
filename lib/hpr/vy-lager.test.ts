import { describe, it, expect } from "vitest";
import { arAktuell, byggLista, sammaTid, tillKort, VY_VERSION, type LagradRad, type ObjektKort, type ObjektMeta } from "./vy-lager";
import { readFileSync } from "fs";

const kort = (key: string, lage: 1 | 2, volym: number): ObjektKort => ({
  objectKey: key, objektNamn: "lagrat namn", status: "active", lastFileAt: null, dagarSedanFil: 99,
  lage, gradePct: 80, volymM3: volym, mening: null, headline: null, trend: null,
});
const meta = (key: string, fil: string | null, status: "active" | "completed" = "completed"): ObjektMeta =>
  ({ object_key: key, object_name: `Objekt ${key}`, status, last_file_at: fil });
const rad = (key: string, fil: string | null, k: ObjektKort | null, version = VY_VERSION): LagradRad =>
  ({ object_key: key, last_file_at: fil, version, kort: k });

const NU = new Date("2026-10-21T08:00:00Z");

describe("sammaTid / arAktuell", () => {
  it("jämför som tid, inte som text", () => {
    expect(sammaTid("2026-10-20T10:00:00+00:00", "2026-10-20T10:00:00.000Z")).toBe(true);
    expect(sammaTid("2026-10-20T10:00:00Z", "2026-10-20T10:00:01Z")).toBe(false);
    expect(sammaTid(null, null)).toBe(true);
    expect(sammaTid(null, "2026-10-20T10:00:00Z")).toBe(false);
  });
  it("inaktuell vid ny fil, annan version eller saknad rad", () => {
    expect(arAktuell(rad("a", "2026-10-20T10:00:00Z", null), "2026-10-20T10:00:00Z")).toBe(true);
    expect(arAktuell(rad("a", "2026-10-19T10:00:00Z", null), "2026-10-20T10:00:00Z")).toBe(false);
    expect(arAktuell(rad("a", "2026-10-20T10:00:00Z", null, VY_VERSION - 1), "2026-10-20T10:00:00Z")).toBe(false);
    expect(arAktuell(undefined, null)).toBe(false);
  });
});

describe("byggLista", () => {
  const F1 = "2026-10-20T10:00:00Z";
  const F2 = "2026-10-21T06:00:00Z";

  it("aktuellt kort visas utan uppdateras, med levande namn, status och dagar", () => {
    const l = byggLista([meta("a", F1, "active")], new Set(["a"]), [rad("a", F1, kort("a", 1, 10))], NU);
    expect(l.inaktuella).toEqual([]);
    expect(l.objekt).toHaveLength(1);
    expect(l.objekt[0].uppdateras).toBe(false);
    expect(l.objekt[0].objektNamn).toBe("Objekt a");
    expect(l.objekt[0].status).toBe("active");
    expect(l.objekt[0].dagarSedanFil).toBe(0);
  });

  it("ny fil: förra kortet står kvar med uppdateras och objektet ska räknas", () => {
    const l = byggLista([meta("a", F2)], new Set(["a"]), [rad("a", F1, kort("a", 1, 10))], NU);
    expect(l.objekt[0].uppdateras).toBe(true);
    expect(l.inaktuella).toEqual(["a"]);
  });

  it("aldrig räknat: väntar med namn, aldrig ett påhittat kort", () => {
    const l = byggLista([meta("a", F1)], new Set(["a"]), [], NU);
    expect(l.objekt).toEqual([]);
    expect(l.vantar).toEqual([{ objectKey: "a", objektNamn: "Objekt a", status: "completed" }]);
    expect(l.inaktuella).toEqual(["a"]);
  });

  it("utan fördelningsmål: varken kort, väntan eller räkning", () => {
    const l = byggLista([meta("a", F1)], new Set(), [], NU);
    expect(l).toEqual({ objekt: [], vantar: [], inaktuella: [] });
  });

  it("aktuell rad utan kort (inga mål på produkterna) visas inte", () => {
    const l = byggLista([meta("a", F1)], new Set(["a"]), [rad("a", F1, null)], NU);
    expect(l).toEqual({ objekt: [], vantar: [], inaktuella: [] });
  });

  it("läge 2 först, sedan störst volym; aktiva räknas först", () => {
    const l = byggLista(
      [meta("a", F1), meta("b", F1), meta("c", F1), meta("e", F2), meta("d", F2, "active")],
      new Set(["a", "b", "c", "d", "e"]),
      [rad("a", F1, kort("a", 1, 50)), rad("b", F1, kort("b", 2, 5)), rad("c", F1, kort("c", 1, 90))],
      NU
    );
    expect(l.objekt.map((o) => o.objectKey)).toEqual(["b", "c", "a"]);
    expect(l.inaktuella).toEqual(["d", "e"]);
  });
});

describe("tillKort", () => {
  it("tar bort produkternas detaljer men behåller allt annat", () => {
    const k = tillKort({ ...kort("a", 2, 10), produkter: [] });
    expect("produkter" in k).toBe(false);
    expect(k.lage).toBe(2);
  });
});

describe("vakter", () => {
  it("listans API räknar aldrig själv (det var det som gav timeout)", () => {
    const src = readFileSync("app/api/fordelning/route.ts", "utf8");
    expect(src).not.toMatch(/hamtaObjektData|byggObjektVy|raknaOchSparaVy/);
  });
  it("importen räknar vyn när filen kommer, utan att kunna fälla importen", () => {
    const src = readFileSync("lib/hpr/import-fordelning.ts", "utf8");
    expect(src).toMatch(/try \{\s*await raknaOchSparaVy\(supabase, objectKey, objektData\);/);
  });
  it("omräkningen går ett objekt i taget (parallellt gav statement timeout)", () => {
    const src = readFileSync("app/api/fordelning/berakna/route.ts", "utf8");
    expect(src).not.toMatch(/Promise\.all/);
  });
});
