// INNEHÅLLSTEST för förarens tidsspecifikation: min-manad-svaret och PDF:en mot
// riktig prod-data. Auth mockas i testprocessen till en förares id (ingen deployad
// bypass). PDF:en läses TILLBAKA med pdf-parse — vi kontrollerar texten, inte att
// "bytes kom". Kör: npx vitest run lib/lonesystem/minmanad.innehall.test.ts
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

for (const l of fs.readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
// Ingen top-level await (tsconfig-target): Stefans id slås upp lazily i mocken.
let STEFAN = "";
const stefanId = async () => STEFAN || (STEFAN = (await sb.from("medarbetare").select("id").ilike("namn", "Stefan%").maybeSingle()).data!.id as string);

vi.mock("@/lib/auth/server", () => ({
  målMedarbetareId: async (begart?: string | null) => {
    const egen = await stefanId();
    return begart && begart !== egen
      ? { ok: false, res: new Response(JSON.stringify({ ok: false, error: "Kan bara läsa egen data" }), { status: 403 }) }
      : { ok: true, id: egen, session: {} };
  },
}));

describe("POST /api/lon/min-manad (Stefan, augusti 2026)", () => {
  it("returnerar hans rader, dagar och saknas-data — och 403 för annans id", async () => {
    const { POST } = await import("../../app/api/lon/min-manad/route");
    const res = await POST({ json: async () => ({ arbetsmanad: "2026-08" }) } as any);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.loneperiod).toBe("2026-09");
    const m = j.medarbetare;
    expect(m.medarbetare_id).toBe(await stefanId());
    expect(m.rader.map((r: any) => r.SalaryCode)).toContain("11");
    expect(m.dagar.length).toBe(m.arbetsdagar);
    expect(m.dagar.every((d: any) => typeof d.arbetad_min === "number" && Array.isArray(d.objekt))).toBe(true);
    expect(typeof m.ob.timmar).toBe("number");
    expect(m.km_grans).toBeGreaterThan(0);
    console.log(`  Stefan aug: ${m.arbetsdagar} dagar, rader ${m.rader.map((r: any) => `${r.SalaryCode}=${r.Number}`).join(" ")}, OB ${m.ob.timmar} tim, obesvarade ${m.ob.obesvarade}, synk ${m.synk.length}`);
    console.log(`  första dag: ${JSON.stringify(m.dagar[0])}`);
    const andra = await POST({ json: async () => ({ arbetsmanad: "2026-08", medarbetare_id: "00000000-0000-0000-0000-000000000000" }) } as any);
    expect(andra.status).toBe(403);
  }, 60_000);
});

describe("GET /api/lon/min-manad/pdf", () => {
  it("ger en riktig PDF vars text bär namn, lönerader och dag-för-dag", async () => {
    const { GET } = await import("../../app/api/lon/min-manad/pdf/route");
    const res = await GET({ nextUrl: new URL("http://x/api/lon/min-manad/pdf?arbetsmanad=2026-08") } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const ut = path.resolve(__dirname, "../../.tmp/tidsspec-test.pdf");
    fs.writeFileSync(ut, buf);
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buf });
    const txt = (await parser.getText()).text;
    expect(txt).toContain("Tidsspecifikation");
    expect(txt).toContain("Stefan");
    expect(txt).toContain("Går till lönen");
    expect(txt).toContain("Timlön");
    expect(txt).toContain("Dag för dag");
    expect(txt).not.toMatch(/\bkr\b/i);
    console.log(`  PDF ${buf.length} bytes, ${txt.split("\n").length} textrader → ${ut}`);
    console.log("  utdrag: " + txt.replace(/\s+/g, " ").slice(0, 400));
  }, 60_000);
});
