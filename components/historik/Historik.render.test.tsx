// @vitest-environment jsdom
/**
 * RENDERINGSTEST för felen i Historik (admin). Fake-supabasen svarar som PostgREST: { data, error } utan att kasta, och som RLS:
 * tomt svar UTAN fel för den som inte är admin. Statement timeout (57014) ska säga "tog för lång tid", behörighetstexten får bara
 * synas vid riktigt behörighetsfel, och databasens egen text får aldrig stå på sidan.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Svar = { data: unknown; error: { code?: string; message: string } | null };
const g = globalThis as unknown as { __svar: Svar };

vi.mock("@/lib/supabase", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "range", "eq"]) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve(g.__svar).then(res);
  return { supabase: { from: () => q } };
});

import HistorikClient from "./HistorikClient";
import JamforClient from "./JamforClient";

let root: Root | null = null;
let cont: HTMLDivElement;
async function monter(el: React.ReactElement) {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cont = document.createElement("div"); document.body.appendChild(cont);
  root = createRoot(cont);
  await act(async () => { root!.render(el); });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
}
const text = () => cont.textContent || "";

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(async () => { await act(async () => { root?.unmount(); }); cont?.remove(); root = null; vi.restoreAllMocks(); });

const TEKNISK = "canceling statement due to statement timeout";

describe("HistorikClient: felen", () => {
  it("statement timeout (57014) → 'tog för lång tid', ingen behörighetstext, ingen teknisk rad", async () => {
    g.__svar = { data: null, error: { code: "57014", message: TEKNISK } };
    await monter(<HistorikClient />);
    expect(text()).toContain("Kunde inte läsa historiken");
    expect(text()).toContain("Det tog för lång tid att hämta historiken. Försök igen om en stund.");
    expect(text()).not.toMatch(/behörighet/i);
    expect(text()).not.toContain(TEKNISK);
    expect(text()).not.toContain("57014");
  });
  it("42501 → behörighetstexten, utan databasens text", async () => {
    g.__svar = { data: null, error: { code: "42501", message: "permission denied for table hist_objekt" } };
    await monter(<HistorikClient />);
    expect(text()).toContain("Du saknar behörighet. Bara roll admin får läsa historiken.");
    expect(text()).not.toContain("permission denied");
  });
  it("tomt svar utan fel (RLS) → behörighetstexten", async () => {
    g.__svar = { data: [], error: null };
    await monter(<HistorikClient />);
    expect(text()).toContain("Du saknar behörighet.");
  });
  it("annat fel → allmän text utan behörighet och utan teknisk rad", async () => {
    g.__svar = { data: null, error: { code: "PGRST000", message: "connection refused" } };
    await monter(<HistorikClient />);
    expect(text()).toContain("Något gick fel när historiken skulle hämtas. Ladda om sidan.");
    expect(text()).not.toMatch(/behörighet/i);
    expect(text()).not.toContain("connection refused");
  });
});

describe("JamforClient: samma regler", () => {
  it("57014 → 'tog för lång tid' utan behörighetstext", async () => {
    g.__svar = { data: null, error: { code: "57014", message: TEKNISK } };
    await monter(<JamforClient />);
    expect(text()).toContain("Det tog för lång tid att hämta historiken. Försök igen om en stund.");
    expect(text()).not.toMatch(/behörighet/i);
    expect(text()).not.toContain(TEKNISK);
  });
  it("42501 → behörighetstexten", async () => {
    g.__svar = { data: null, error: { code: "42501", message: "permission denied" } };
    await monter(<JamforClient />);
    expect(text()).toContain("Du saknar behörighet.");
  });
});
