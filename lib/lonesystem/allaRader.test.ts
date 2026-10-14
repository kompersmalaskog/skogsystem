/**
 * allaRader: PostgREST svarar högst 1000 rader per anrop. En läsning utan paginering tappar tyst allt efter rad 1000 — i årsövertiden
 * betyder det för låg övertid (prod hade 823 arbetsdag-rader 2026-10-13; gränsen nås runt december). Hjälparen läser sida för sida,
 * ordnat på id (en total ordning, annars kan .range() ge dubbletter och luckor), tills en sida är kortare än 1000.
 */
import { describe, it, expect } from "vitest";
import { allaRader, SIDSTORLEK } from "./allaRader";

type Anrop = { order?: [string, any]; range?: [number, number] };

/** En tabell med n rader som svarar som PostgREST: max 1000 per anrop, `.range(a, b)` skär ut sidan. */
function tabell(n: number, fel?: string) {
  const rader = Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  const anrop: Anrop[] = [];
  const bygg = () => {
    const a: Anrop = {};
    anrop.push(a);
    const q: any = {
      order(k: string, o: any) { a.order = [k, o]; return q; },
      range(fran: number, till: number) { a.range = [fran, till]; return q; },
      then(res: any, rej: any) {
        if (fel) return Promise.resolve({ data: null, error: { message: fel } }).then(res, rej);
        const [f, t] = a.range ?? [0, 999];
        return Promise.resolve({ data: rader.slice(f, Math.min(t, f + 999) + 1), error: null }).then(res, rej);
      },
    };
    return q;
  };
  return { bygg, anrop };
}

describe("allaRader", () => {
  it("sidstorleken är PostgREST:s tak: 1000", () => { expect(SIDSTORLEK).toBe(1000); });

  it.each([[0, 1], [1, 1], [999, 1], [1000, 2], [1001, 2], [2500, 3], [3000, 4]])("%s rader läses i %s anrop och ingen tappas", async (n, antalAnrop) => {
    const t = tabell(n);
    const r = await allaRader<{ id: number }>(t.bygg);
    expect(r).toHaveLength(n);
    expect(t.anrop).toHaveLength(antalAnrop);
    expect(r.map(x => x.id)).toEqual(Array.from({ length: n }, (_, i) => i + 1));   // ingen dubblett, ingen lucka, i ordning
  });

  it("varje sida är ordnad på id (total ordning) och har sin egen räckvidd", async () => {
    const t = tabell(2200);
    await allaRader(t.bygg);
    expect(t.anrop.map(a => a.order)).toEqual([["id", { ascending: true }], ["id", { ascending: true }], ["id", { ascending: true }]]);
    expect(t.anrop.map(a => a.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("ett läsfel kastas — aldrig 'inga rader'", async () => {
    await expect(allaRader(tabell(10, "permission denied").bygg)).rejects.toMatchObject({ message: "permission denied" });
  });

  it("ett läsfel på en senare sida kastas också (inte bara de rader som hunnit läsas)", async () => {
    let n = 0;
    const bygg = () => {
      const q: any = { order() { return q; }, range() { return q; }, then(res: any, rej: any) {
        n++;
        return Promise.resolve(n === 1 ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null } : { data: null, error: { message: "timeout" } }).then(res, rej);
      } };
      return q;
    };
    await expect(allaRader(bygg)).rejects.toMatchObject({ message: "timeout" });
  });

  it("null som data (tomt svar utan fel) ger en tom lista", async () => {
    const bygg = () => { const q: any = { order() { return q; }, range() { return q; }, then(res: any, rej: any) { return Promise.resolve({ data: null, error: null }).then(res, rej); } }; return q; };
    expect(await allaRader(bygg)).toEqual([]);
  });
});
