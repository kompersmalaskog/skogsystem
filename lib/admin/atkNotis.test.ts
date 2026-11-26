import { describe, it, expect } from "vitest";
import { byggAtkNotis, ATK_LANK } from "./atkNotis";

const maj = Date.parse("2026-05-05T08:00:00Z");
const n = (extra: any = {}) => ({ mottagare_id: "a", payload: { period: "2026" }, skapad_at: "2026-05-05T07:00:00Z", ...extra });
const las = (rad: any, fel?: string) => async () => ({ rad, fel });

describe("byggAtkNotis", () => {
  it("skickar till den som inte valt, med länk till Saldon", async () => {
    const u = await byggAtkNotis(n(), las({ harValt: false, foretagsledare: false }), maj);
    expect(u.typ).toBe("skicka");
    if (u.typ === "skicka") { expect(u.meddelande.url).toBe(ATK_LANK); expect(u.meddelande.body).toContain("15 maj"); }
  });
  it("hoppar över: redan valt, företagsledare, stängt, för gammal", async () => {
    expect((await byggAtkNotis(n(), las({ harValt: true, foretagsledare: false }), maj)).typ).toBe("hoppa_over");
    expect((await byggAtkNotis(n(), las({ harValt: false, foretagsledare: true }), maj)).typ).toBe("hoppa_over");
    expect((await byggAtkNotis(n(), las({ harValt: false, foretagsledare: false }), Date.parse("2026-05-20T08:00:00Z"))).typ).toBe("hoppa_over");
    expect((await byggAtkNotis(n({ skapad_at: "2026-05-03T07:00:00Z" }), las({ harValt: false, foretagsledare: false }), maj)).typ).toBe("hoppa_over");
  });
  it("läsfel skjuter upp", async () => {
    expect((await byggAtkNotis(n(), las(null, "nät"), maj)).typ).toBe("uppskjut");
  });
});
