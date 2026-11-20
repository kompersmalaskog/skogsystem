import { describe, it, expect } from "vitest";
import { tolkaInbjudan, ilikeExakt, arKontoFinns, arMailGrans } from "./inbjudan";
import { kontrolleraLosen, lankFel, LOSEN_MIN } from "./valkommen";

const ok = { namn: "  Test Person ", epost: " Test.Person@Exempel.SE ", telefon: " 070-123 45 67 ", roll: "forare" };

describe("tolkaInbjudan", () => {
  it("trimmar, gemener på e-posten, tom telefon blir null", () => {
    const t = tolkaInbjudan(ok);
    expect(t).toEqual({ ok: true, data: { namn: "Test Person", epost: "test.person@exempel.se", telefon: "070-123 45 67", roll: "forare" } });
    const u = tolkaInbjudan({ ...ok, telefon: "   " });
    expect(u.ok && u.data.telefon).toBeNull();
  });
  it("roll: bara forare och admin — allt annat avvisas (ingen 'chef', ingen 'förare' med ö, ingen tom)", () => {
    for (const roll of ["chef", "förare", "", undefined, null, 1, "Admin"]) {
      expect(tolkaInbjudan({ ...ok, roll }).ok, String(roll)).toBe(false);
    }
    expect(tolkaInbjudan({ ...ok, roll: "admin" }).ok).toBe(true);
  });
  it("namn och e-post krävs; e-posten måste se ut som en e-post", () => {
    expect(tolkaInbjudan({ ...ok, namn: " " }).ok).toBe(false);
    for (const epost of ["", "a", "a@b", "a b@c.se", "@c.se", "a@@c.se"]) expect(tolkaInbjudan({ ...ok, epost }).ok, epost).toBe(false);
    expect(tolkaInbjudan(null).ok).toBe(false);
    expect(tolkaInbjudan("text").ok).toBe(false);
  });
  it("gränser på längd", () => {
    expect(tolkaInbjudan({ ...ok, namn: "x".repeat(121) }).ok).toBe(false);
    expect(tolkaInbjudan({ ...ok, telefon: "1".repeat(41) }).ok).toBe(false);
  });
});

describe("hjälpare", () => {
  it("ilikeExakt släpper inte igenom jokertecken", () => {
    expect(ilikeExakt("a_b%c\\d@x.se")).toBe("a\\_b\\%c\\\\d@x.se");
  });
  it("arKontoFinns / arMailGrans känner igen Supabases fel", () => {
    expect(arKontoFinns({ code: "email_exists" })).toBe(true);
    expect(arKontoFinns({ message: "A user with this email address has already been registered" })).toBe(true);
    expect(arKontoFinns({ code: "unexpected_failure", message: "boom" })).toBe(false);
    expect(arKontoFinns(null)).toBe(false);
    expect(arMailGrans({ code: "over_email_send_rate_limit" })).toBe(true);
    expect(arMailGrans({ status: 429 })).toBe(true);
    expect(arMailGrans({ code: "email_exists" })).toBe(false);
  });
});

describe("valkommen", () => {
  it("lösenord: minst åtta tecken och lika", () => {
    expect(kontrolleraLosen("x".repeat(LOSEN_MIN - 1), "x".repeat(LOSEN_MIN - 1))).toMatch(/minst/);
    expect(kontrolleraLosen("abcdefgh", "abcdefgX")).toMatch(/olika/);
    expect(kontrolleraLosen("abcdefgh", "abcdefgh")).toBeNull();
  });
  it("länkfel: utgången länk skiljs från annat fel; ren token ger inget fel", () => {
    expect(lankFel("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid")).toBe("utgangen");
    expect(lankFel("#error=server_error")).toBe("annat");
    expect(lankFel("#access_token=abc&refresh_token=def&type=invite")).toBeNull();
    expect(lankFel("")).toBeNull();
  });
});
