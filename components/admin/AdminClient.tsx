"use client";
// Admin-skalet. Dator först: sidomeny till vänster, innehåll med maxbredd. I telefon faller menyn tillbaka på
// en bottenmeny. Flik och underflik står i adressen (nav.tsx). Översikten är en att-göra-lista (Oversikt.tsx)
// och siffran i menyn är samma lista.
import React from "react";
import { useSearchParams } from "next/navigation";
import { AVSTAND, FARG, FONT, LAYOUT, RADIE, TRAFFYTA, TYP, designCss, medSafeBotten } from "@/lib/design/tokens";
import { Ikon, Markering, Titel, MAXBREDD_ADMIN } from "./ui";
import { AdminNavProvider, FLIKAR, lasNav, useAdminNav } from "./nav";
import { useAttGora } from "./useAttGora";
import Oversikt from "./Oversikt";
import MedarbetareFlik from "./MedarbetareFlik";
import MaskinerFlik from "./MaskinerFlik";
import AvtalFlik from "./AvtalFlik";
import LonFlik from "./LonFlik";

/** Sidomenyns bredd på dator. Ett layoutmått. */
const MENYBREDD = 240;
const DATORBREDD = 900;
/** Bottenmenyns höjd i telefon, utan hemindikatorn. Ett layoutmått. */
const BOTTENHOJD = 64;

// Klasser, för det inline-stilar inte kan: bredd-brytpunkten mellan sidomeny och bottenmeny.
const adminCss = `
  .adm-rot { background: ${FARG.bg}; color: ${FARG.text}; font-family: ${FONT}; min-height: calc(100vh - ${LAYOUT.topbar}); }
  .adm-meny { display: none; }
  .adm-bott { display: flex; }
  .adm-inn { padding: ${AVSTAND.xl}px ${AVSTAND.sidmarginal}px calc(${BOTTENHOJD + AVSTAND.xl}px + ${LAYOUT.safeBotten}); }
  .adm-kol { max-width: ${MAXBREDD_ADMIN}px; margin: 0 auto; }
  .adm-post:focus-visible { outline: 2px solid ${FARG.text2}; outline-offset: 2px; }
  @media (min-width: ${DATORBREDD}px) {
    .adm-rot { display: flex; }
    .adm-meny { display: flex; flex-direction: column; gap: ${AVSTAND.xs}px; flex: 0 0 ${MENYBREDD}px; box-sizing: border-box;
      position: sticky; top: ${LAYOUT.topbar}; height: calc(100vh - ${LAYOUT.topbar}); overflow-y: auto;
      padding: ${AVSTAND.xl}px ${AVSTAND.l}px; border-right: 1px solid ${FARG.linje}; }
    .adm-bott { display: none; }
    .adm-inn { flex: 1; min-width: 0; padding: ${AVSTAND.xxl}px ${AVSTAND.xl}px ${AVSTAND.xxl}px; }
  }
`;

type Anvandare = { id: string; namn?: string | null; roll: string };

export default function AdminClient({ currentUser }: { currentUser: Anvandare }) {
  const sp = useSearchParams();
  return (
    <AdminNavProvider initial={lasNav(sp)}>
      <Skal currentUser={currentUser} />
    </AdminNavProvider>
  );
}

function Skal({ currentUser }: { currentUser: Anvandare }) {
  const { nav, gaTill } = useAdminNav();
  const att = useAttGora();
  const antal = att.laddar ? 0 : att.saker.length;
  const aktiv = FLIKAR.find(f => f.key === nav.flik) || FLIKAR[0];
  const nyMedarbetare = nav.flik === "medarbetare" && !!nav.params.ny;

  const postStil = (vald: boolean) => ({
    display: "flex", alignItems: "center", gap: AVSTAND.m, width: "100%", minHeight: TRAFFYTA.min,
    padding: `0 ${AVSTAND.m}px`, borderRadius: RADIE.rad, border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
    background: vald ? FARG.fyllning : "transparent", color: vald ? FARG.text : FARG.text2, ...TYP.listtitel,
  });

  return (
    <div className="adm-rot">
      <style>{designCss}{adminCss}</style>

      <aside className="adm-meny" aria-label="Admin">
        {FLIKAR.map(f => {
          const vald = nav.flik === f.key && !nyMedarbetare;
          return (
            <button key={f.key} type="button" className="adm-post" onClick={() => gaTill({ flik: f.key })} aria-current={vald ? "page" : undefined} style={postStil(vald)}>
              <Ikon namn={f.ikon} farg={vald ? FARG.text : FARG.text2} fylld={vald} />
              <span style={{ flex: 1 }}>{f.label}</span>
              {f.key === "oversikt" && antal > 0 && <Markering antal={antal} />}
            </button>
          );
        })}
        <div style={{ height: 1, background: FARG.linje, margin: `${AVSTAND.m}px 0` }} />
        <button type="button" className="adm-post" onClick={() => gaTill({ flik: "medarbetare", params: { ny: "1" } })} aria-current={nyMedarbetare ? "page" : undefined}
          style={{ ...postStil(nyMedarbetare), color: FARG.text }}>
          <Ikon namn="add" farg={FARG.text} />
          <span>Ny medarbetare</span>
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ ...TYP.meta, color: FARG.text3, padding: `0 ${AVSTAND.m}px` }}>{currentUser.namn || "—"} · admin</div>
      </aside>

      <main className="adm-inn">
        <div className="adm-kol" key={`${nav.flik}-${nyMedarbetare ? "ny" : ""}`}>
          <div className="tona-in">
            {!nyMedarbetare && <Titel>{aktiv.label}</Titel>}
            {nav.flik === "oversikt"    && <Oversikt att={att} />}
            {nav.flik === "medarbetare" && <MedarbetareFlik />}
            {nav.flik === "maskiner"    && <MaskinerFlik />}
            {nav.flik === "lon"         && <LonFlik currentUser={currentUser} />}
            {nav.flik === "avtal"       && <AvtalFlik />}
          </div>
        </div>
      </main>

      <nav className="adm-bott" aria-label="Admin"
        style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, justifyContent: "space-around", alignItems: "flex-start", background: FARG.kort, borderTop: `1px solid ${FARG.linje}`, padding: `${AVSTAND.s}px ${AVSTAND.s}px ${medSafeBotten(AVSTAND.s)}` }}>
        {FLIKAR.map(f => {
          const vald = nav.flik === f.key;
          return (
            <button key={f.key} type="button" className="adm-post" onClick={() => gaTill({ flik: f.key })} aria-current={vald ? "page" : undefined}
              style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: AVSTAND.xs, minHeight: TRAFFYTA.primar, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: vald ? FARG.text : FARG.text2, ...TYP.micro, textTransform: "none", letterSpacing: 0 }}>
              <Ikon namn={f.ikon} farg={vald ? FARG.text : FARG.text2} fylld={vald} />
              <span>{f.label}</span>
              {f.key === "oversikt" && antal > 0 && (
                <span style={{ position: "absolute", top: 0, left: "calc(50% + 6px)" }}><Markering antal={antal} /></span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
