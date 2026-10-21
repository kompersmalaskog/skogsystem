"use client";
// Delar av förarkortet i Löneunderlag (Admin → Lön): statusraden (Väntar på föraren · Godkänd av föraren · Skickad, med Påminn) och
// "Att kolla" med kvittering ("Ser rätt ut" — sparas, räknas inte längre, visas nedtonad). Ren presentation: all data kommer färdig ur
// lib/admin/loneunderlagVy, och knapparna gör sitt via props.
import React from "react";
import { AVSTAND, FARG, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { FORAR_STATUS_TEXT } from "@/lib/lonesystem/forarGodkannande";
import { arKvitterbar, type ForarKort, type Mal, type VyRad } from "@/lib/admin/loneunderlagVy";
import { Lank, Tertiar } from "./ui";

/** Påminn-knappens tillstånd för en förare: undefined = ännu inte tryckt. */
export type PaminnTillstand = "skickar" | "skickad" | "koad" | "nyss" | `fel:${string}`;

const PAMINN_TEXT: Record<string, string> = {
  skickar: "Skickar påminnelse…",
  skickad: "Påminnelse skickad",
  koad: "Påminnelse köad – går ut inom några minuter",
  nyss: "Påminnelse skickades nyss",
};

const STATUS_FARG = { vantar: FARG.orange, godkand: FARG.gron, skickad: FARG.text2 } as const;

/** "Väntar på föraren" (orange, med Påminn) · "Godkänd av föraren" (grön) · "Skickad". Företagsledare har ingen status. */
export function StatusRad({ k, paminn, onPaminn }: { k: ForarKort; paminn?: string; onPaminn: () => void }) {
  if (!k.forarStatus) return null;
  const fel = paminn?.startsWith("fel:") ? paminn.slice(4) : null;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.s, minHeight: TRAFFYTA.min }}>
        <span data-forare-status={k.forarStatus} style={{ ...TYP.meta, fontWeight: TYP.listtitel.fontWeight, color: STATUS_FARG[k.forarStatus] }}>
          {FORAR_STATUS_TEXT[k.forarStatus]}
        </span>
        {k.forarStatus === "vantar" && (
          paminn && !fel
            ? <span data-paminn-status={paminn} style={{ ...TYP.meta, color: FARG.text2, textAlign: "right" }}>{PAMINN_TEXT[paminn] ?? ""}</span>
            : <Tertiar smal onClick={onPaminn} style={{ flexShrink: 0 }}>Påminn</Tertiar>
        )}
      </div>
      {fel && <p data-paminn-fel="" style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>{fel}</p>}
      {/* Godkännandet nollställdes av en ändring i månaden: det syns, så att man vet varför föraren väntar igen. */}
      {k.andrad && <p data-andrad="" style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>{k.andrad.text}</p>}
    </>
  );
}

/**
 * "Att kolla": det som är kvar överst (orange), kvitterat nedtonat under "Kollat". Varje kvitterbar punkt har "Ser rätt ut" bredvid knappen som
 * leder dit det kan åtgärdas. `kanKvittera` är falskt när kvittensen inte går att spara (tabellen finns inte än): då finns inga knappar.
 */
export function AttKolla({ k, kanKvittera, onMal, onKvittera, onAngra }: {
  k: ForarKort;
  kanKvittera: boolean;
  onMal: (mal: Mal) => void;
  onKvittera: (rad: VyRad) => void;
  onAngra: (rad: VyRad) => void;
}) {
  const kvar = k.kolla.filter(r => !r.kvitterad);
  const kollat = k.kolla.filter(r => r.kvitterad);
  return (
    <>
      {kvar.length > 0 && (
        <>
          <p style={{ margin: `${AVSTAND.m}px 0 ${AVSTAND.xs}px`, ...TYP.micro, color: FARG.orange }}>Att kolla</p>
          {kvar.map(r => (
            <div key={r.id} data-kolla={r.id} style={{ minHeight: TRAFFYTA.min, display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: AVSTAND.xs }}>
              <span style={{ ...TYP.meta, color: FARG.orange }}>{r.text}</span>
              {(r.mal || (kanKvittera && arKvitterbar(r.id))) && (
                <span style={{ display: "flex", gap: AVSTAND.l, flexWrap: "wrap" }}>
                  {r.mal && <Lank smal onClick={() => onMal(r.mal!)}>{r.knapp}</Lank>}
                  {kanKvittera && arKvitterbar(r.id) && <Tertiar smal onClick={() => onKvittera(r)}>Ser rätt ut</Tertiar>}
                </span>
              )}
            </div>
          ))}
        </>
      )}
      {kollat.length > 0 && (
        <>
          <p style={{ margin: `${AVSTAND.m}px 0 ${AVSTAND.xs}px`, ...TYP.micro, color: FARG.text3 }}>Kollat</p>
          {kollat.map(r => (
            <div key={r.id} data-kolla={r.id} data-kvitterad="" style={{ minHeight: TRAFFYTA.min, display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.s }}>
              <span style={{ ...TYP.meta, color: FARG.text3 }}>{r.text}</span>
              <Tertiar smal onClick={() => onAngra(r)} style={{ flexShrink: 0 }}>Ångra</Tertiar>
            </div>
          ))}
        </>
      )}
    </>
  );
}
