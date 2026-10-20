// @vitest-environment jsdom
/**
 * Admin → Förare · Månad, renderat: Stefan september 2026 (ur prod) genom samma beraknaLoneunderlag som exporten.
 * Kräver att svaret (42 tim 10 min (42,17)), uträkningen, mil, dagarna med km-källa och dagens varningar står på skärmen,
 * och att ingången finns i Löneunderlag (kortets "Öppna" → arket, adressen bär ?forare=).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { stefanUnderlag } from "@/lib/lonesystem/testdata/stefanSep";

vi.mock("@/lib/supabase", () => {
  const fraga = (data: any[]) => ({ select: () => ({ then: (res: any) => Promise.resolve({ data, error: null }).then(res), order: () => Promise.resolve({ data, error: null }), gte: () => ({ lte: () => ({ not: () => Promise.resolve({ data: [], error: null }) , then: (res: any) => Promise.resolve({ data: [], error: null }).then(res) }) }) }) });
  return { supabase: { from: (t: string) => fraga(t === "dim_maskin" ? [{ maskin_id: "PONS20SDJAA270231", visningsnamn: "Giant", modell: "Scorpion Giant 8W" }] : t === "medarbetare" ? [{ id: "stefan", namn: "Stefan Karlsson" }] : []) } };
});

import ForarManadArk from "./ForarManadArk";

let rot: HTMLDivElement; let r: ReturnType<typeof createRoot>;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; rot = document.createElement("div"); document.body.appendChild(rot); r = createRoot(rot); });
afterEach(() => { act(() => r.unmount()); document.body.innerHTML = ""; });

const text = () => document.body.textContent || "";
const q = (s: string) => document.body.querySelector(s) as HTMLElement | null;
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

async function montera(andra?: (d: any) => any, extraTillagg: any[] = []) {
  const { m } = await stefanUnderlag(andra, extraTillagg);
  const stang = vi.fn();
  await act(async () => { r.render(<ForarManadArk m={m} arbetsManad="2026-09" onStang={stang} />); });
  await flush();
  return { stang, m };
}

describe("ForarManadArk — Stefan september 2026", () => {
  it("svaret överst: övertid i tim och min med decimalen i parentes", async () => {
    await montera();
    expect(q("[data-svar]")!.textContent).toBe("42 tim 10 min (42,17)");
    expect(text()).toContain("September");   // arbetsmånaden är namnet
  });

  it("uträkningen: maskintid + extra tid = arbetat − ordinarie = övertid", async () => {
    await montera();
    expect(q('[data-del="maskin"]')!.textContent).toContain("214 tim 10 min");
    expect(q('[data-del="extra"]')!.textContent).toContain("+ Extra tid");
    expect(q('[data-del="extra"]')!.textContent).toContain("4 tim");
    expect(q("[data-arbetat]")!.textContent).toContain("218 tim 10 min (218,17)");
    expect(q("[data-ordinarie]")!.textContent).toContain("176 tim (176,00)");
    expect(q("[data-ordinarie]")!.textContent).toContain("22 vardagar × 8 tim");
    expect(q("[data-overtid]")!.textContent).toContain("42 tim 10 min (42,17)");
  });

  it("extra tid rad för rad med kommentar", async () => {
    await montera();
    const rad = q('[data-extra-post="2026-09-10"]')!;
    expect(rad.textContent).toContain("Annat");
    expect(rad.textContent).toContain("Gokart");
    expect(rad.textContent).toContain("12:15–16:15");
    expect(document.body.querySelectorAll("[data-extra-post]")).toHaveLength(1);
  });

  it("lönerader och mil", async () => {
    await montera();
    expect(q('[data-lonerad="timlon"]')!.textContent).toContain("176 tim (176,00)");
    expect(q('[data-lonerad="premielon_skordare"]')).not.toBeNull();
    expect(q("[data-mil]")!.textContent).toContain("mil");
    expect(q("[data-km]")!.textContent).toContain("km");
    expect(text()).toContain("12 dagar över gränsen");
  });

  it("dagarna: tid, rast, km med källa; avvikelsen står på dagen; tryck visar från → till", async () => {
    await montera();
    const d3 = q('[data-dag="2026-09-03"]')!;
    expect(d3.querySelector("[data-dag-varning]")!.textContent).toContain("rast 3 tim 43 min");
    const d14 = q('[data-dag="2026-09-14"]')!;
    expect(d14.textContent).toContain("41 km beräknad");
    expect(d14.querySelector("[data-dag-detalj]")).toBeNull();
    await act(async () => { (d14.querySelector("button") as HTMLButtonElement).click(); });
    const det = d14.querySelector("[data-dag-detalj]")!.textContent!;
    expect(det).toContain("Hem → Hålabäck au 2025 · 34 km");
    expect(det).toContain("Hallaslätt AU 2026 → Hem · 7 km");
    expect(det).toContain("Maskin Giant");
  });

  it("förarens egen km visas utan platser, och en dag utan källa är grå 'ingen uppgift'", async () => {
    await montera(d => (d.datum === "2026-09-15" ? { ...d, km_kalla: "forare" } : d.datum === "2026-09-16" ? { ...d, km_kalla: null } : d));
    expect(q('[data-dag="2026-09-15"]')!.textContent).toContain("68 km förarens egen");
    expect(q('[data-dag="2026-09-16"]')!.textContent).toContain("68 km ingen uppgift");
    expect(q('[data-dag="2026-09-16"] [data-dag-varning]')).toBeNull();
    await act(async () => { (q('[data-dag="2026-09-15"] button') as HTMLButtonElement).click(); });
    expect(q('[data-dag="2026-09-15"] [data-dag-detalj]')!.textContent).not.toContain("→");
  });

  it("motorns notis om extra tid utan pass står under uträkningen", async () => {
    await montera(undefined, [{ datum: "2026-09-12", typ: "annat", minuter: 60, debiterbar: false, objekt_id: null, kommentar: "Sågade ved", start_tid: "09:00:00", slut_tid: "10:00:00", aktivitet_typ: "annat" }]);
    expect(text()).toContain("extra tid ligger på dagar utan maskinpass");
    expect(q('[data-extra-post="2026-09-12"]')!.textContent).toContain("Sågade ved");
  });

  it("Stäng", async () => {
    const { stang } = await montera();
    await act(async () => { (Array.from(document.body.querySelectorAll("button")).find(b => b.textContent === "Stäng") as HTMLButtonElement).click(); });
    expect(stang).toHaveBeenCalled();
  });
});
