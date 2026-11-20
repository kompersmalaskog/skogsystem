// @vitest-environment jsdom
/** /valkommen: den inbjudna väljer lösenord. Provar sidans lägen med en fake-klient (ingen riktig inloggning). */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const getSession = vi.fn();
const updateUser = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: (...a: any[]) => getSession(...a), updateUser: (...a: any[]) => updateUser(...a) } } }));

import ValkommenPage from "./page";

let cont: HTMLDivElement; let rot: Root;
const text = () => cont.textContent || "";
async function montera(hash = "") {
  window.location.hash = hash;
  rot = createRoot(cont);
  await act(async () => { rot.render(<ValkommenPage />); });
  await act(async () => { await Promise.resolve(); });
}
async function skriv(el: HTMLInputElement, v: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const faltet = () => Array.from(cont.querySelectorAll<HTMLInputElement>("input[type=password]"));
const skickaForm = async () => { await act(async () => { cont.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); };

beforeEach(() => { getSession.mockReset(); updateUser.mockReset(); cont = document.createElement("div"); document.body.replaceChildren(cont); });
afterEach(() => { act(() => rot?.unmount()); window.location.hash = ""; });

describe("/valkommen", () => {
  it("med session (länken från mailet har loggat in): två lösenordsfält och Spara", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    await montera("#access_token=abc&type=invite");
    expect(faltet()).toHaveLength(2);
    expect(text()).toContain("Välj ett lösenord");
    expect(text()).toContain("Spara lösenord");
  });
  it("utgången länk (otp_expired i adressen): förklaring, inga fält, ingen session efterfrågas", async () => {
    await montera("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    expect(faltet()).toHaveLength(0);
    expect(text()).toContain("Länken har gått ut");
    expect(getSession).not.toHaveBeenCalled();
    expect(cont.querySelector("a")!.getAttribute("href")).toBe("/login");
  });
  it("ingen session: bara en förklaring och länk till inloggningen — inga fält som kunde byta någons lösenord", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await montera();
    expect(faltet()).toHaveLength(0);
    expect(text()).toContain("fungerar inte längre");
  });
  it("för kort lösenord och olika lösenord ger ett fel och sparar ingenting", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    await montera();
    await skriv(faltet()[0], "kort"); await skriv(faltet()[1], "kort");
    await skickaForm();
    expect(text()).toContain("minst 8 tecken");
    await skriv(faltet()[0], "langtlosenord1"); await skriv(faltet()[1], "langtlosenord2");
    await skickaForm();
    expect(text()).toContain("Lösenorden är olika");
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("giltigt lösenord sparas med updateUser och sidan säger Klart", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    updateUser.mockResolvedValue({ error: null });
    vi.useFakeTimers();
    await montera();
    await skriv(faltet()[0], "langtlosenord1"); await skriv(faltet()[1], "langtlosenord1");
    await skickaForm();
    vi.useRealTimers();
    expect(updateUser).toHaveBeenCalledWith({ password: "langtlosenord1" });
    expect(text()).toContain("Klart");
  });
  it("Supabase nekar sparningen: ett vänligt fel, fälten kvar", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    updateUser.mockResolvedValue({ error: { message: "weak" } });
    await montera();
    await skriv(faltet()[0], "langtlosenord1"); await skriv(faltet()[1], "langtlosenord1");
    await skickaForm();
    expect(text()).toContain("kunde inte sparas");
    expect(faltet()).toHaveLength(2);
  });
});
