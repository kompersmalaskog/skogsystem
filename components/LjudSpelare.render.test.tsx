// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const sign = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { storage: { from: () => ({ createSignedUrl: (...a: any[]) => sign(...a) }) } } }));

import { LjudSpelare } from "./LjudSpelare";

const PUBLIK = "https://mxydghzfacbenbgpodex.supabase.co/storage/v1/object/public/audio/9e1a/1772282860793/x.webm";
let cont: HTMLDivElement;
async function montera(src: string | null) {
  const rot = createRoot(cont);
  await act(async () => { rot.render(<LjudSpelare src={src} />); });
  return rot;
}
beforeEach(() => { sign.mockReset(); cont = document.createElement("div"); document.body.replaceChildren(cont); });

describe("LjudSpelare", () => {
  it("ett befintligt ljud (gammal publik URL) spelas via en signerad länk", async () => {
    sign.mockResolvedValue({ data: { signedUrl: "https://signerad.example/x?token=abc" }, error: null });
    await montera(PUBLIK);
    const a = cont.querySelector("audio")!;
    expect(a.getAttribute("src")).toBe("https://signerad.example/x?token=abc");
    expect(sign).toHaveBeenCalledWith("9e1a/1772282860793/x.webm", 600);
    expect(a.hasAttribute("controls")).toBe(true);
  });
  it("en nyss inspelad blob (förhandslyssning) spelas som den är utan att storage rörs", async () => {
    await montera("blob:https://app.example.se/abc");
    expect(cont.querySelector("audio")!.getAttribute("src")).toBe("blob:https://app.example.se/abc");
    expect(sign).not.toHaveBeenCalled();
  });
  it("storage nekar → ett vänligt fel i stället för en trasig spelare", async () => {
    sign.mockResolvedValue({ data: null, error: { message: "not allowed" } });
    await montera(PUBLIK);
    expect(cont.querySelector("audio")).toBeNull();
    expect(cont.querySelector("[data-ljud-fel]")!.textContent).toContain("kunde inte laddas");
  });
  it("går länken ut (felhändelse) skapas EN ny, sedan inte fler", async () => {
    sign.mockResolvedValueOnce({ data: { signedUrl: "https://s/1" }, error: null }).mockResolvedValueOnce({ data: { signedUrl: "https://s/2" }, error: null });
    await montera(PUBLIK);
    const a = cont.querySelector("audio")!;
    await act(async () => { a.dispatchEvent(new Event("error")); });
    expect(cont.querySelector("audio")!.getAttribute("src")).toBe("https://s/2");
    await act(async () => { cont.querySelector("audio")!.dispatchEvent(new Event("error")); });
    expect(sign).toHaveBeenCalledTimes(2);
  });
  it("tom källa ritar ingenting", async () => {
    await montera(null);
    expect(cont.innerHTML).toBe("");
  });
});
