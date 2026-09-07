// Notis-flush: växlarna (push_aktiv/daglig_pamin_aktiv) och låsskärmstexten.
// skippOrsak är ren; byggMeddelande körs mot prod-DB (läser bara) för Stefans
// 2026-08-13 (start 03:00, brandrisk obesvarad) → "brandrisk?" ska med.
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

for (const l of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}
vi.mock("@/lib/auth/server", () => ({ kravRoll: async () => ({ ok: false, res: new Response("", { status: 401 }) }), ADMIN_ROLLER: ["admin", "chef"] }));

describe("skippOrsak — växlarna avgör", async () => {
  const { skippOrsak } = await import("../app/api/notis/flush/route");
  it("push av → ingen notis alls", () => {
    expect(skippOrsak({ push_aktiv: false, daglig_pamin_aktiv: true }, "dagsslut")).toMatch(/push avstängd/);
    expect(skippOrsak({ push_aktiv: false, daglig_pamin_aktiv: true }, "manadsskifte")).toMatch(/push avstängd/);
  });
  it("daglig påminnelse av → bara dagsslut stoppas", () => {
    expect(skippOrsak({ push_aktiv: true, daglig_pamin_aktiv: false }, "dagsslut")).toMatch(/daglig påminnelse avstängd/);
    expect(skippOrsak({ push_aktiv: true, daglig_pamin_aktiv: false }, "manadsskifte")).toBeNull();
  });
  it("allt på / okänd medarbetare → skicka", () => {
    expect(skippOrsak({ push_aktiv: true, daglig_pamin_aktiv: true }, "dagsslut")).toBeNull();
    expect(skippOrsak(null, "dagsslut")).toBeNull();
  });
});

describe("byggMeddelande — låsskärmstext", async () => {
  const { byggMeddelande } = await import("../app/api/notis/flush/route");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  it("dagsslut med obesvarad brandrisk (Stefan 2026-08-13 03:00) → '… · brandrisk? · Stämmer?'", async () => {
    const st = await sb.from("medarbetare").select("id").ilike("namn", "Stefan%").maybeSingle();
    const m = await byggMeddelande({ typ: "dagsslut", mottagare_id: st.data!.id, datum: "2026-08-13" });
    console.log("  ", m.title, "|", m.body);
    expect(m.title).toBe("Din arbetsdag");
    expect(m.body).toMatch(/^\d+h \d+min · brandrisk\? · Stämmer\?$/);
    expect(m.body).not.toMatch(/km/);
  }, 30_000);
  it("dagsslut utan brandriskfråga (Stefan 2026-08-19 06:00) → '… · Stämmer?'", async () => {
    const st = await sb.from("medarbetare").select("id").ilike("namn", "Stefan%").maybeSingle();
    const m = await byggMeddelande({ typ: "dagsslut", mottagare_id: st.data!.id, datum: "2026-08-19" });
    console.log("  ", m.title, "|", m.body);
    expect(m.body).toMatch(/^\d+h \d+min · Stämmer\?$/);
  }, 30_000);
  it("manadsskifte → kort sammanfattning", async () => {
    const m = await byggMeddelande({ typ: "manadsskifte", mottagare_id: "x", payload: { period: "2026-08", obekraftade: 3, obesvarade: 2, oforklarade: 1 } });
    console.log("  ", m.title, "|", m.body);
    expect(m.title).toBe("Augusti 2026: fixa innan lönen");
    expect(m.body).toBe("3 obekräftade dagar · 2 brandriskfrågor · 1 tidsavvikelse");
  });
});
