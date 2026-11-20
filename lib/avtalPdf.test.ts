import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  AVTAL_BUCKET, AVTAL_PDF_MAX_BYTES, SIGNERAD_LANK_SEKUNDER, MEDD_EJ_UPPLADDAT, MEDD_KUNDE_INTE_OPPNA,
  avtalPdfPath, arSaknadFil, signeraAvtalPdf, kontrolleraAvtalPdf, oppnaAvtalPdf,
} from "./avtalPdf";

const klient = (svar: { data?: any; error?: any } | (() => never)) => {
  const createSignedUrl = vi.fn(async () => { if (typeof svar === "function") svar(); return { data: (svar as any).data ?? null, error: (svar as any).error ?? null }; });
  const from = vi.fn(() => ({ createSignedUrl }));
  return { storage: { from }, createSignedUrl, from };
};

afterEach(() => { vi.unstubAllGlobals(); });

describe("signeraAvtalPdf", () => {
  it("sökvägen saknas: 'Avtalet är inte uppladdat än', och Storage anropas inte", async () => {
    for (const p of [null, undefined, "", "   "]) {
      const k = klient({ data: { signedUrl: "x" } });
      expect(await signeraAvtalPdf(k, p)).toEqual({ ok: false, skal: "saknas", meddelande: MEDD_EJ_UPPLADDAT });
      expect(k.createSignedUrl).not.toHaveBeenCalled();
    }
  });
  it("ger en signerad länk för bucketen avtal, med kort giltighet", async () => {
    const k = klient({ data: { signedUrl: "https://s.example/a.pdf?token=1" } });
    expect(await signeraAvtalPdf(k, "abc.pdf")).toEqual({ ok: true, url: "https://s.example/a.pdf?token=1" });
    expect(k.from).toHaveBeenCalledWith("avtal");
    expect(k.createSignedUrl).toHaveBeenCalledWith("abc.pdf", 60);
    expect(AVTAL_BUCKET).toBe("avtal");
    expect(SIGNERAD_LANK_SEKUNDER).toBe(60);
  });
  it("filen finns inte (objekt eller bucket saknas, 404): 'inte uppladdat än'", async () => {
    for (const error of [{ message: "Object not found", statusCode: "404" }, { message: "Bucket not found" }, { message: "x", status: 404 }]) {
      expect(await signeraAvtalPdf(klient({ error }), "abc.pdf")).toEqual({ ok: false, skal: "saknas", meddelande: MEDD_EJ_UPPLADDAT });
    }
  });
  it("andra fel (nät, session, kast) är 'fel' — och säger aldrig att filen saknas", async () => {
    for (const k of [klient({ error: { message: "Failed to fetch" } }), klient({ data: {} }), klient(() => { throw new Error("nätverket föll"); })]) {
      expect(await signeraAvtalPdf(k, "abc.pdf")).toEqual({ ok: false, skal: "fel", meddelande: MEDD_KUNDE_INTE_OPPNA });
    }
  });
  it("arSaknadFil", () => {
    expect(arSaknadFil({ message: "Object not found" })).toBe(true);
    expect(arSaknadFil({ statusCode: 404 })).toBe(true);
    expect(arSaknadFil({ message: "JWT expired" })).toBe(false);
    expect(arSaknadFil(null)).toBe(false);
  });
});

describe("oppnaAvtalPdf — fliken öppnas i klicket", () => {
  const stub = (openSvar: any) => {
    const win = { open: vi.fn(() => openSvar), location: { href: "" } };
    vi.stubGlobal("window", win);
    return win;
  };
  it("fliken öppnas FÖRE signeringen (annars blockerar webbläsaren den) och får länken efteråt", async () => {
    const flik = { location: { href: "" }, close: vi.fn() };
    const win = stub(flik);
    const k = klient({ data: { signedUrl: "https://s.example/a.pdf" } });
    k.createSignedUrl.mockImplementationOnce(async () => { expect(win.open).toHaveBeenCalledTimes(1); expect(flik.location.href).toBe(""); return { data: { signedUrl: "https://s.example/a.pdf" }, error: null }; });
    const r = await oppnaAvtalPdf(k, "a.pdf");
    expect(r.ok).toBe(true);
    expect(flik.location.href).toBe("https://s.example/a.pdf");
  });
  it("blockeras fliken byter sidan själv adress", async () => {
    const win = stub(null);
    await oppnaAvtalPdf(klient({ data: { signedUrl: "https://s.example/a.pdf" } }), "a.pdf");
    expect(win.location.href).toBe("https://s.example/a.pdf");
  });
  it("misslyckas signeringen stängs fliken och inget navigeras", async () => {
    const flik = { location: { href: "" }, close: vi.fn() };
    const win = stub(flik);
    const r = await oppnaAvtalPdf(klient({ error: { message: "Object not found" } }), "a.pdf");
    expect(r).toMatchObject({ ok: false, skal: "saknas" });
    expect(flik.close).toHaveBeenCalled();
    expect(flik.location.href).toBe("");
    expect(win.location.href).toBe("");
  });
});

describe("kontrolleraAvtalPdf och avtalPdfPath", () => {
  it("godkänner en PDF", () => {
    expect(kontrolleraAvtalPdf({ name: "a.pdf", type: "application/pdf", size: 1234 })).toBeNull();
    expect(kontrolleraAvtalPdf({ name: "A.PDF", type: "", size: 10 })).toBeNull();   // vissa webbläsare ger tom typ
  });
  it("avvisar allt annat med en mening som säger vad man gör", () => {
    expect(kontrolleraAvtalPdf(null)).toBe("Välj en PDF-fil.");
    expect(kontrolleraAvtalPdf({ name: "a.docx", type: "application/msword", size: 10 })).toBe("Filen är inte en PDF. Välj avtalet som PDF-fil.");
    expect(kontrolleraAvtalPdf({ name: "a.pdf", type: "application/pdf", size: 0 })).toBe("Filen är tom. Välj avtalet som PDF-fil igen.");
    expect(kontrolleraAvtalPdf({ name: "a.pdf", type: "application/pdf", size: AVTAL_PDF_MAX_BYTES + 1 })).toMatch(/för stor.*20 MB/);
    expect(kontrolleraAvtalPdf({ name: "a.pdf", type: "application/pdf", size: AVTAL_PDF_MAX_BYTES })).toBeNull();
  });
  it("en fil per avtalsrad: sökvägen är radens id", () => {
    expect(avtalPdfPath("f5b40c12-1308")).toBe("f5b40c12-1308.pdf");
  });
});

describe("avtalets PDF ligger aldrig i public/ och ingen hårdkodad fil öppnas", () => {
  const rot = path.resolve(__dirname, "..");
  const las = (f: string) => fs.readFileSync(path.join(rot, f), "utf8");
  it("Arbetsrapport öppnar inte längre /avtal/…pdf (en fil som aldrig fanns)", () => {
    const kalla = las("components/arbetsrapport/Arbetsrapport.tsx");
    expect(kalla).not.toMatch(/\/avtal\/skogsavtalet/);
    expect(kalla).not.toMatch(/window\.open\(\s*['"]\/avtal/);
  });
  it("ingen avtals-PDF i public/", () => {
    expect(fs.existsSync(path.join(rot, "public", "avtal"))).toBe(false);
  });
  it("bucketen är privat och bara PDF i migrationen, och skrivning kräver admin", () => {
    const sql = las("supabase/migrations/20261014101036_avtal_pdf_bucket.sql");
    expect(sql).toMatch(/VALUES \('avtal', 'avtal', false, 20971520, ARRAY\['application\/pdf'\]\)/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS avtal_pdf_path text/);
    for (const p of ["avtal_skriv_admin", "avtal_uppdatera_admin", "avtal_radera_admin"]) {
      const block = sql.slice(sql.indexOf(`CREATE POLICY "${p}"`), sql.indexOf(";", sql.indexOf(`CREATE POLICY "${p}"`)));
      expect(block, p).toContain("public.ar_admin()");
    }
    expect(sql).not.toMatch(/TO (anon|public)/i);
    expect(AVTAL_PDF_MAX_BYTES).toBe(20971520);
  });
});
