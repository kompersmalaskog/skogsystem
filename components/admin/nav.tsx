"use client";
// Var man är i admin: flik, underflik och det man öppnat (person, maskin, dagarnas filter). Allt står i
// adressen, så en omladdning (eller en länk från Översikten) hamnar på samma ställe. Adressen skrivs med
// replaceState: ingen ny sida, ingen omrendering av resten.
import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AdminFlik } from "@/lib/admin/attGora";

export const FLIKAR: { key: AdminFlik; label: string; ikon: string }[] = [
  { key: "oversikt",    label: "Översikt",    ikon: "checklist" },
  { key: "medarbetare", label: "Medarbetare", ikon: "group" },
  { key: "maskiner",    label: "Maskiner",    ikon: "agriculture" },
  { key: "lon",         label: "Lön",         ikon: "payments" },
  { key: "avtal",       label: "Avtal",       ikon: "description" },
];

export type AdminNav = { flik: AdminFlik; underflik: string | null; params: Record<string, string> };

/** Parametrar som aldrig är läge: Fortnox-kvittot läses och rensas av Lönesystem själv. */
const EJ_LAGE = new Set(["flik", "underflik", "lonesystem_ok", "lonesystem_fel"]);

export function lasNav(sp: { get(k: string): string | null; forEach(f: (v: string, k: string) => void): void } | null | undefined): AdminNav {
  const f = sp?.get("flik");
  const flik = (FLIKAR.some(x => x.key === f) ? f : "oversikt") as AdminFlik;
  const params: Record<string, string> = {};
  sp?.forEach((v, k) => { if (!EJ_LAGE.has(k)) params[k] = v; });
  return { flik, underflik: sp?.get("underflik") || null, params };
}

export function navUrl(n: AdminNav): string {
  const q = new URLSearchParams();
  q.set("flik", n.flik);
  if (n.underflik) q.set("underflik", n.underflik);
  for (const [k, v] of Object.entries(n.params)) q.set(k, v);
  return `/admin?${q.toString()}`;
}

function skrivUrl(n: AdminNav) {
  try { window.history.replaceState(window.history.state, "", navUrl(n)); } catch { /* adressen är en bekvämlighet, aldrig ett krav */ }
}

type Ctx = {
  nav: AdminNav;
  /** Gå till en flik (och eventuellt en underflik eller något som ska öppnas). Gamla parametrar följer inte med. */
  gaTill: (mal: { flik: AdminFlik; underflik?: string | null; params?: Record<string, string> }) => void;
  /** Ändra en parameter i adressen utan att byta flik (null tar bort den). */
  sattParam: (k: string, v: string | null) => void;
  sattUnderflik: (u: string | null) => void;
};

const NavCtx = createContext<Ctx | null>(null);

export function AdminNavProvider({ initial, children }: { initial: AdminNav; children: ReactNode }) {
  const [nav, setNav] = useState<AdminNav>(initial);
  const byt = useCallback((n: AdminNav) => { setNav(n); skrivUrl(n); }, []);
  const gaTill = useCallback((mal: { flik: AdminFlik; underflik?: string | null; params?: Record<string, string> }) => {
    byt({ flik: mal.flik, underflik: mal.underflik ?? null, params: mal.params ?? {} });
  }, [byt]);
  const sattParam = useCallback((k: string, v: string | null) => {
    setNav(n => {
      const params = { ...n.params };
      if (v == null) delete params[k]; else params[k] = v;
      const nytt = { ...n, params };
      skrivUrl(nytt);
      return nytt;
    });
  }, []);
  const sattUnderflik = useCallback((u: string | null) => {
    setNav(n => { const nytt = { ...n, underflik: u, params: {} }; skrivUrl(nytt); return nytt; });
  }, []);
  const varde = useMemo(() => ({ nav, gaTill, sattParam, sattUnderflik }), [nav, gaTill, sattParam, sattUnderflik]);
  return <NavCtx.Provider value={varde}>{children}</NavCtx.Provider>;
}

export function useAdminNav(): Ctx {
  const c = useContext(NavCtx);
  if (!c) throw new Error("useAdminNav utanför AdminNavProvider");
  return c;
}
