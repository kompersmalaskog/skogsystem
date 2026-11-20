// @vitest-environment jsdom
/**
 * RENDERINGSKONTROLL: ledighetsvyn litar aldrig på data den inte kunde läsa.
 *
 * Före: ETT fel i någon av de två läsningarna (saldo, ansökningar) kastade BÅDA, och
 * saldokorten sa "Kopplas via Fortnox" / "Inte satt ännu" — ett påstående om kunskap vi
 * inte hade. "Ansök om ledighet" var aktiv trots att ansökningarna inte lästs: då är
 * `ansokningar` en tom lista och dubbelbokningskontrollen jämför mot ingenting.
 *
 * Supabase är en kedjebar fake (ingen nätverkstrafik, ingen inloggning); varje tabell
 * kan svara med data, ett fel, ett kast eller aldrig.
 */
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Svar = { data?: unknown; error?: unknown } | "kasta" | "aldrig";
const tabeller = vi.hoisted(() => ({ aktuell: {} as Record<string, Svar> }));

vi.mock("@/lib/supabase", () => {
  const kedja = (tabell: string) => {
    let enkel = false;
    const p: any = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === "then") {
          const svar = tabeller.aktuell[tabell];
          if (svar === "aldrig") return () => {};
          return (res: any, rej: any) => {
            if (svar === "kasta") return Promise.reject(new Error("nätverket föll")).then(res, rej);
            const s = (svar ?? { data: null }) as { data?: unknown; error?: unknown };
            const rad = s.data === undefined ? null : s.data;
            return Promise.resolve({ data: s.error ? null : enkel ? rad : rad ?? [], error: s.error ?? null }).then(res, rej);
          };
        }
        if (prop === "single" || prop === "maybeSingle") return () => { enkel = true; return p; };
        return () => p;
      },
      apply() { return p; },
    });
    return p;
  };
  return { supabase: { from: (t: string) => kedja(t) } };
});

import type { CurrentMedarbetare } from "@/lib/CurrentMedarbetareContext";
import MigVy from "./_components/MigVy";
import { useLedighetData } from "./_components/useLedighetData";

const FORARE: CurrentMedarbetare = { id: "m-1", namn: "Test Förare", roll: "forare", maskin_id: null, partner_user_id: null };
const ADMIN: CurrentMedarbetare = { ...FORARE, id: "m-admin", namn: "Test Admin", roll: "admin" };
const FEL = { message: "fejkat fel", code: "XX000" };
const SALDO = { semester_dagar_kvar: 12.5, atk_timmar_kvar: 24, kalla: "manuell", uppdaterad_at: "2026-10-01T07:00:00Z" };
const ANSOKAN = (id: string, mid: string, status: string) => ({
  id, medarbetare_id: mid, anvandare_id: "Någon", typ: "semester", startdatum: "2099-11-02", slutdatum: "2099-11-06",
  status, kommentar: null, skapad_at: "2026-09-20T08:00:00Z", ersatter_datum: null, fran_tid: null, till_tid: null,
});

let rot: ReturnType<typeof createRoot> | null = null;
let behallare: HTMLDivElement | null = null;
let konsol: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  konsol = vi.spyOn(console, "error").mockImplementation(() => {});
  behallare = document.createElement("div");
  document.body.appendChild(behallare);
});
afterEach(() => {
  act(() => { rot?.unmount(); });
  behallare?.remove();
  rot = null; behallare = null;
  konsol.mockRestore();
});

const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const text = () => document.body.textContent ?? "";
const ansokKnapp = () => Array.from(document.querySelectorAll("button")).find(b => /Ansök om ledighet/.test(b.textContent ?? "")) as HTMLButtonElement;

async function visa(svar: Record<string, Svar>, medarbetare = FORARE) {
  tabeller.aktuell = svar;
  rot = createRoot(behallare!);
  await act(async () => { rot!.render(<MigVy medarbetare={medarbetare} />); });
  await flush();
}

describe("Ledighet — Mig: läsfel är aldrig 'ingen'", () => {
  it("friskt: Ansök är aktiv, saldot visas, inget fel", async () => {
    await visa({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { data: [ANSOKAN("a1", "m-1", "väntar")] } });
    expect(ansokKnapp().disabled).toBe(false);
    expect(text()).toContain("12,5");
    expect(text()).toContain("24");
    expect(text()).toContain("Väntar på besked");
    expect(text()).not.toContain("Kunde inte");
  });

  it("ansökningarna kunde inte läsas: Ansök är SPÄRRAD, felet säger varför, saldot står kvar", async () => {
    await visa({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { error: FEL } });
    expect(ansokKnapp().disabled).toBe(true);
    expect(text()).toContain("Kunde inte läsa dina ansökningar");
    expect(text()).toContain("spärrad");
    expect(text()).not.toContain("Väntar på besked");
    // Saldot lästes — ett fel i den andra läsningen får inte kasta det.
    expect(text()).toContain("12,5");
    expect(text()).not.toContain("Kunde inte läsas");
  });

  it("saldot kunde inte läsas: kortet säger det — inte 'Kopplas via Fortnox' eller 'Inte satt ännu'", async () => {
    await visa({ medarbetare_saldo: { error: FEL }, ledighet_ansokningar: { data: [ANSOKAN("a1", "m-1", "väntar")] } });
    expect(text().match(/Kunde inte läsas/g)?.length).toBe(2);
    expect(text()).not.toContain("Kopplas via Fortnox");
    expect(text()).not.toContain("Inte satt ännu");
    expect(text()).not.toContain("Saldo saknas");
    // Ansökningarna lästes — listan visas och Ansök är aktiv.
    expect(text()).toContain("Väntar på besked");
    expect(ansokKnapp().disabled).toBe(false);
  });

  it("båda felar: båda felen visas och Ansök är spärrad", async () => {
    await visa({ medarbetare_saldo: { error: FEL }, ledighet_ansokningar: { error: FEL } });
    expect(ansokKnapp().disabled).toBe(true);
    expect(text()).toContain("Kunde inte läsa dina ansökningar");
    expect(text().match(/Kunde inte läsas/g)?.length).toBe(2);
  });

  it("ett KASTAT fel (nätverket föll) blir också ett läsfel — inte 'Läser…' för alltid", async () => {
    await visa({ medarbetare_saldo: "kasta", ledighet_ansokningar: "kasta" });
    expect(text()).not.toContain("Läser dina ansökningar");
    expect(ansokKnapp().disabled).toBe(true);
    expect(text()).toContain("Kunde inte läsa dina ansökningar");
  });

  it("medan ansökningarna läses är Ansök spärrad (listan är då tom, inte 'ingen krock')", async () => {
    await visa({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: "aldrig" });
    expect(text()).toContain("Läser dina ansökningar");
    expect(ansokKnapp().disabled).toBe(true);
  });

  it("KÄNT tomt är fortfarande känt tomt: ingen saldorad → 'Saldo saknas', NULL-värden → de gamla texterna", async () => {
    await visa({ medarbetare_saldo: { data: null }, ledighet_ansokningar: { data: [] } });
    expect(text().match(/Saldo saknas/g)?.length).toBe(2);
    expect(text()).not.toContain("Kunde inte läsas");
    expect(ansokKnapp().disabled).toBe(false);
    rot!.unmount(); rot = null; behallare!.innerHTML = "";
    await visa({ medarbetare_saldo: { data: { ...SALDO, semester_dagar_kvar: null, atk_timmar_kvar: null } }, ledighet_ansokningar: { data: [] } });
    expect(text()).toContain("Kopplas via Fortnox");
    expect(text()).toContain("Inte satt ännu");
  });

  it("godkännare: väntande hos andra visas friskt, men inte under läsfel", async () => {
    await visa({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { data: [ANSOKAN("b1", "m-2", "väntar")] } }, ADMIN);
    expect(text()).toContain("1 att godkänna");
    rot!.unmount(); rot = null; behallare!.innerHTML = "";
    await visa({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { error: FEL } }, ADMIN);
    expect(text()).not.toContain("att godkänna");
  });
});

describe("useLedighetData — två läsningar, två utfall", () => {
  let ut: ReturnType<typeof useLedighetData> | null = null;
  const Sond = () => {
    const d = useLedighetData("m-1");
    useEffect(() => { ut = d; });
    return null;
  };
  const montera = async (svar: Record<string, Svar>) => {
    tabeller.aktuell = svar; ut = null;
    rot = createRoot(behallare!);
    await act(async () => { rot!.render(<Sond />); });
    await flush();
  };

  it("bara saldot felar: saldoLasfel, men ansökningarna används", async () => {
    await montera({ medarbetare_saldo: { error: FEL }, ledighet_ansokningar: { data: [ANSOKAN("a1", "m-1", "väntar")] } });
    expect(ut!.saldoLasfel).toBe(true);
    expect(ut!.lasfel).toBeNull();
    expect(ut!.ansokningar).toHaveLength(1);
    expect(ut!.laddar).toBe(false);
  });

  it("bara ansökningarna felar: lasfel, men saldot används", async () => {
    await montera({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { error: FEL } });
    expect(ut!.lasfel).not.toBeNull();
    expect(ut!.saldoLasfel).toBe(false);
    expect(ut!.saldo?.semester_dagar_kvar).toBe(12.5);
  });

  it("omläsning som lyckas efter ett fel släpper båda felen", async () => {
    await montera({ medarbetare_saldo: { error: FEL }, ledighet_ansokningar: { error: FEL } });
    expect(ut!.lasfel).not.toBeNull();
    expect(ut!.saldoLasfel).toBe(true);
    tabeller.aktuell = { medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { data: [] } };
    await act(async () => { await ut!.hamtaOm(); });
    expect(ut!.lasfel).toBeNull();
    expect(ut!.saldoLasfel).toBe(false);
    expect(ut!.saldo?.atk_timmar_kvar).toBe(24);
  });

  it("friskt läge → omläsning som felar: lasfel sätts (listan ska då inte litas på)", async () => {
    await montera({ medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { data: [ANSOKAN("a1", "m-1", "godkänd")] } });
    expect(ut!.lasfel).toBeNull();
    tabeller.aktuell = { medarbetare_saldo: { data: SALDO }, ledighet_ansokningar: { error: FEL } };
    await act(async () => { await ut!.hamtaOm(); });
    expect(ut!.lasfel).not.toBeNull();
    expect(ut!.saldoLasfel).toBe(false);
  });
});
