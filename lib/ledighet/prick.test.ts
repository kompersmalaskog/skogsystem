import { describe, it, expect, vi } from "vitest";
import { tolkaPrick, hamtaLedighetPrick, markeraLedighetSett } from "./prick";

const rpcSvar = (data: unknown, error: unknown = null) => ({ rpc: vi.fn(async () => ({ data, error })) } as any);

describe("tolkaPrick — strikt, aldrig en påhittad siffra", () => {
  it("godkännare: väntande + egna nya beslut = summa", () => {
    expect(tolkaPrick({ att_godkanna: 2, nya_beslut: 1, nya_beslut_ids: ["x"], nya_beslut_till: "2026-10-14T08:00:00Z" })).toEqual({
      attGodkanna: 2, nyaBeslut: 1, nyaBeslutIds: ["x"], nyaBeslutTill: "2026-10-14T08:00:00Z", antal: 3,
    });
  });

  it("anställd: bara nya beslut", () => {
    expect(tolkaPrick({ att_godkanna: 0, nya_beslut: 1, nya_beslut_ids: ["x"], nya_beslut_till: "t" })).toMatchObject({ antal: 1, attGodkanna: 0 });
  });

  it("inget att göra → antal 0 (märket visas då inte)", () => {
    expect(tolkaPrick({ att_godkanna: 0, nya_beslut: 0, nya_beslut_ids: [], nya_beslut_till: null })).toMatchObject({ antal: 0, nyaBeslutIds: [], nyaBeslutTill: null });
  });

  it("fel form → null (inte 0): null, sträng, saknade eller negativa/NaN-tal", () => {
    for (const d of [null, undefined, "x", 5, {}, { att_godkanna: 1 }, { att_godkanna: "1", nya_beslut: 0 }, { att_godkanna: -1, nya_beslut: 0 }, { att_godkanna: NaN, nya_beslut: 0 }]) {
      expect(tolkaPrick(d)).toBeNull();
    }
  });

  it("ogiltiga ids filtreras bort, inte kastas", () => {
    expect(tolkaPrick({ att_godkanna: 0, nya_beslut: 1, nya_beslut_ids: ["a", 3, null], nya_beslut_till: 7 })).toMatchObject({ nyaBeslutIds: ["a"], nyaBeslutTill: null });
  });
});

describe("hamtaLedighetPrick — läsfel är null, aldrig 0", () => {
  it("lyckad läsning → tolkat svar; anropar RPC:n ledighet_prick", async () => {
    const sb = rpcSvar({ att_godkanna: 1, nya_beslut: 0, nya_beslut_ids: [], nya_beslut_till: null });
    expect(await hamtaLedighetPrick(sb)).toMatchObject({ antal: 1 });
    expect(sb.rpc).toHaveBeenCalledWith("ledighet_prick");
  });
  it("RPC-fel (t.ex. migrationen inte körd) → null", async () => {
    expect(await hamtaLedighetPrick(rpcSvar(null, { message: "function does not exist" }))).toBeNull();
  });
  it("kastat fel (nätverket föll) och saknad rpc → null", async () => {
    expect(await hamtaLedighetPrick({ rpc: async () => { throw new Error("nät"); } } as any)).toBeNull();
    expect(await hamtaLedighetPrick({} as any)).toBeNull();
  });
});

describe("markeraLedighetSett", () => {
  it("skickar p_till (det senaste beslutet som visades)", async () => {
    const sb = rpcSvar(null);
    expect(await markeraLedighetSett(sb, "2026-10-14T08:00:00Z")).toBe(true);
    expect(sb.rpc).toHaveBeenCalledWith("ledighet_markera_sett", { p_till: "2026-10-14T08:00:00Z" });
  });
  it("misslyckas → false (pricken ligger då kvar)", async () => {
    expect(await markeraLedighetSett(rpcSvar(null, { message: "x" }), "t")).toBe(false);
    expect(await markeraLedighetSett({ rpc: async () => { throw new Error("nät"); } } as any, "t")).toBe(false);
  });
});
