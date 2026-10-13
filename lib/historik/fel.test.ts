import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { felSlag, felText, HistorikFel, slagForKod } from "./fel";
import { hamtaMaskinAr, hamtaObjekt } from "./data";

/** Kedjebar fake som svarar som PostgREST: { data, error } (supabase-js kastar inte). */
function fake(svar: { data: unknown; error: { code?: string; message: string } | null }) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "range", "eq"]) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve(svar).then(res);
  return { from: () => q } as unknown as SupabaseClient;
}

describe("felkod → slag", () => {
  it("57014 är tid, 42501 är behörighet, allt annat är annat", () => {
    expect(slagForKod("57014")).toBe("tid");
    expect(slagForKod("42501")).toBe("behorighet");
    expect(slagForKod("PGRST301")).toBe("annat");
    expect(slagForKod(null)).toBe("annat");
    expect(slagForKod(undefined)).toBe("annat");
  });
  it("ett fel som inte kom ur databaslagret är annat", () => {
    expect(felSlag(new Error("nätverket föll"))).toBe("annat");
    expect(felSlag("text")).toBe("annat");
    expect(felSlag(new HistorikFel("tid", "x"))).toBe("tid");
  });
});

describe("texterna", () => {
  it("timeout: exakt den text som föraren/admin ska läsa", () => {
    expect(felText("tid")).toBe("Det tog för lång tid att hämta historiken. Försök igen om en stund.");
  });
  it("behörighetstexten är den enda som nämner behörighet", () => {
    expect(felText("behorighet")).toContain("behörighet");
    expect(felText("tid")).not.toMatch(/behörighet/i);
    expect(felText("annat")).not.toMatch(/behörighet/i);
  });
  it("objekt-varianten säger objekten", () => {
    expect(felText("tid", "objekten")).toBe("Det tog för lång tid att hämta objekten. Försök igen om en stund.");
  });
});

describe("data.ts: fel ur databasen får rätt slag", () => {
  it("statement timeout (57014) i maskinsammanställningen → tid, och databasens text följer med bara i felobjektet", async () => {
    const e = await hamtaMaskinAr(fake({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } })).catch((x) => x);
    expect(e).toBeInstanceOf(HistorikFel);
    expect(e.slag).toBe("tid");
    expect(e.kod).toBe("57014");
  });
  it("42501 → behörighet", async () => {
    const e = await hamtaMaskinAr(fake({ data: null, error: { code: "42501", message: "permission denied" } })).catch((x) => x);
    expect(e.slag).toBe("behorighet");
  });
  it("tomt svar UTAN fel (RLS släpper inte igenom något) → behörighet", async () => {
    const e = await hamtaMaskinAr(fake({ data: [], error: null })).catch((x) => x);
    expect(e).toBeInstanceOf(HistorikFel);
    expect(e.slag).toBe("behorighet");
  });
  it("objekten: 57014 → tid; ett tomt år är inget fel (år utan objekt finns)", async () => {
    const e = await hamtaObjekt(fake({ data: null, error: { code: "57014", message: "t" } }), "R64101", 2024, null, false).catch((x) => x);
    expect(e.slag).toBe("tid");
    expect(await hamtaObjekt(fake({ data: [], error: null }), "R64101", 2024, null, false)).toEqual([]);
  });
});
