// @vitest-environment jsdom
// Förarflödet från början till slut: "Framme på LBC" tryckt med bilen långt från basen frågar först.
// Monterar HELA MaskinflyttClient (jsdom, tabell-fake) med en pågående dag på väg hem, trycker på
// Framme och följer vad som händer — fråga, "Nej, jag kör vidare" (inget sparas) och "Ja, avsluta ändå"
// (rundan stängs som förut). Hooks ligger före tidiga returer; testet fångar "Rendered more/fewer hooks".

import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const BAS = { lat: 56.459, lng: 14.702 };
const mock = vi.hoisted(() => ({
  bil: { lat: 56.585, lng: 14.702 } as { lat: number; lng: number } | null,   // ~14 km från basen
  loggAlderMin: 1,
  loggFel: false,
  uppdateringar: [] as { tabell: string; varden: any }[],
}));

vi.mock("@/lib/supabase", () => {
  const dag = () => ({
    id: "dag-1", starttid: new Date().toISOString(), start_lat: 56.459, start_lng: 14.702, start_kalla: "manuell",
    tillkorning_km: 12, start_odometer_m: 1_000_000, start_odometer_tid: new Date().toISOString(), odometer_stale: false,
    hemresa_start_tid: new Date(Date.now() - 10 * 60000).toISOString(), hemresa_start_odometer_m: 1_050_000,
  });
  const tabell = (t: string): any[] => {
    switch (t) {
      case "flyttdag": return [dag()];
      case "medarbetare": return [{ id: "m-1", namn: "Test Förare", hem_lat: BAS.lat, hem_lng: BAS.lng }];
      case "lastbil": return [{ vin: "VIN1", hemmabas_lat: BAS.lat, hemmabas_lng: BAS.lng, hemmabas_radie_m: 300 }];
      case "lastbil_logg": return mock.bil ? [{
        lat: mock.bil.lat, lng: mock.bil.lng, tidpunkt: new Date(Date.now() - mock.loggAlderMin * 60000).toISOString(),
        odometer_m: 1_060_000, bransle_ml: 5_000_000,
      }] : [];
      default: return [];
    }
  };
  class Q {
    private uppd: any = null;
    constructor(private t: string) {}
    select() { return this; } or() { return this; } order() { return this; } is() { return this; } eq() { return this; }
    not() { return this; } in() { return this; } gte() { return this; } lt() { return this; } limit() { return this; }
    update(v: any) { this.uppd = v; mock.uppdateringar.push({ tabell: this.t, varden: v }); return this; }
    insert() { return this; }
    maybeSingle() { return Promise.resolve(this.svar(true)); }
    single() { return Promise.resolve(this.svar(true)); }
    then(res: any, rej: any) { return Promise.resolve(this.svar(false)).then(res, rej); }
    private svar(en: boolean) {
      if (this.t === "lastbil_logg" && mock.loggFel) return { data: null, error: { message: "boom" } };
      const rader = this.uppd ? [{ id: "dag-1" }] : tabell(this.t);
      return { data: en ? (rader[0] ?? null) : rader, error: null };
    }
  }
  return { supabase: { from: (t: string) => new Q(t), auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "forare@example.se" } } }) } } };
});

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));

import MaskinflyttClient from "./MaskinflyttClient";

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let konsol: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  konsol = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mock.bil = { lat: 56.585, lng: 14.702 }; mock.loggAlderMin = 1; mock.loggFel = false; mock.uppdateringar = [];
  (globalThis as any).fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove(); rot = null; behallare = null;
  vi.restoreAllMocks();
});

const flush = async () => { for (let i = 0; i < 25; i++) await act(async () => { await Promise.resolve(); }); };
const text = () => document.body.textContent ?? "";
const knapp = (re: RegExp) => Array.from(document.querySelectorAll("button")).find(b => re.test(b.textContent ?? "")) as HTMLButtonElement | undefined;
async function klicka(el: HTMLElement) { await act(async () => { el.click(); }); await flush(); }
async function montera() {
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<MaskinflyttClient />); });
  await flush();
}
const hookFel = () => konsol.mock.calls.map(c => String(c[0])).filter(s => /hooks|Rendered (more|fewer)|#310|#300/i.test(s));
const avslutade = () => mock.uppdateringar.filter(u => u.tabell === "flyttdag" && u.varden.status === "avslutad");

describe("Framme på LBC med bilen långt från basen", () => {
  it("startskärmen visar 'På väg hem' med Framme-knappen, utan fråga, och utan hook-krasch", async () => {
    await montera();
    expect(text()).toContain("På väg hem");
    expect(knapp(/Framme på LBC/)).toBeDefined();
    expect(document.querySelector("[data-framme-varning]")).toBeNull();
    expect(hookFel()).toEqual([]);
  });

  it("frågar först: 'Bilen är inte hemma än', ungefär 14 km från basen — och ingenting har sparats", async () => {
    await montera();
    await klicka(knapp(/Framme på LBC/)!);
    const fraga = document.querySelector("[data-framme-varning]") as HTMLElement;
    expect(fraga).not.toBeNull();
    expect(fraga.textContent).toContain("Bilen är inte hemma än");
    expect(fraga.textContent).toMatch(/ungefär 14 km från basen/);
    expect(avslutade()).toEqual([]);
    expect(knapp(/Framme på LBC/)).toBeUndefined();   // frågan ersätter knappen: ett val i taget
    expect(hookFel()).toEqual([]);
  });

  it("'Nej, jag kör vidare': frågan försvinner, rundan är kvar öppen och Framme-knappen är tillbaka", async () => {
    await montera();
    await klicka(knapp(/Framme på LBC/)!);
    await klicka(knapp(/Nej, jag kör vidare/)!);
    expect(document.querySelector("[data-framme-varning]")).toBeNull();
    expect(avslutade()).toEqual([]);
    expect(knapp(/Framme på LBC/)).toBeDefined();
    expect(text()).toContain("På väg hem");
  });

  it("'Ja, avsluta ändå': rundan stängs som förut (status avslutad, sluttid satt)", async () => {
    await montera();
    await klicka(knapp(/Framme på LBC/)!);
    await klicka(knapp(/Ja, avsluta ändå/)!);
    expect(avslutade()).toHaveLength(1);
    expect(avslutade()[0].varden.sluttid).toEqual(expect.any(String));
    expect(document.querySelector("[data-framme-varning]")).toBeNull();
  });

  it("efter 'Nej' går det att trycka Framme igen och få frågan igen (inget minns 'nej' åt föraren)", async () => {
    await montera();
    await klicka(knapp(/Framme på LBC/)!);
    await klicka(knapp(/Nej, jag kör vidare/)!);
    await klicka(knapp(/Framme på LBC/)!);
    expect(document.querySelector("[data-framme-varning]")).not.toBeNull();
    expect(avslutade()).toEqual([]);
  });
});

describe("Framme på LBC när frågan inte behövs eller inte går att avgöra", () => {
  it("bilen på basen: ingen fråga, rundan stängs direkt", async () => {
    mock.bil = { lat: BAS.lat + 0.0005, lng: BAS.lng };   // ~55 m
    await montera();
    await klicka(knapp(/Framme på LBC/)!);
    expect(document.querySelector("[data-framme-varning]")).toBeNull();
    expect(avslutade()).toHaveLength(1);
  });

  it("positionen går inte att läsa: ingen spärr — rundan stängs som förut", async () => {
    mock.loggFel = true;
    await montera();
    await klicka(knapp(/Framme på LBC/)!);
    expect(document.querySelector("[data-framme-varning]")).toBeNull();
    expect(avslutade()).toHaveLength(1);
  });

  it("positionen är för gammal (45 min): ingen fråga på osäker grund", async () => {
    mock.loggAlderMin = 45;
    await montera();
    await klicka(knapp(/Framme på LBC/)!);
    expect(document.querySelector("[data-framme-varning]")).toBeNull();
    expect(avslutade()).toHaveLength(1);
  });
});
