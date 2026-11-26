"use client";
// Löneunderlag (Admin → Lön), per förare. Två delar:
//   - ForarListRad: EN rad i listan — namnet, förarens läge i ord och hur många saker som är kvar att kolla. Påminn till höger när
//     föraren inte godkänt. Allt annat (lönerader, uträkning, dagar) står i Förare · Månad, som raden öppnar.
//   - AttKolla: i Förare · Månad — det som är kvar överst (orange), med "Se dagen" och en mindre "Ser rätt ut"; kvitterat nedtonat
//     under "Kollat". Plus "Bra att veta" (sant men ingen åtgärd).
// Ren presentation: all data kommer färdig ur lib/admin/loneunderlagVy, och knapparna gör sitt via props.
import React from "react";
import { AVSTAND, FARG, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { FORAR_STATUS_TEXT } from "@/lib/lonesystem/forarGodkannande";
import { arKvitterbar, kvarAttKolla, type ForarKort, type Mal, type VyRad } from "@/lib/admin/loneunderlagVy";
import { Ikon, Lank, Lista, Rad, Sektion, Tertiar } from "./ui";

/** Påminn-knappens tillstånd för en förare: undefined = ännu inte tryckt. */
export type PaminnTillstand = "skickar" | "skickad" | "koad" | "nyss" | `fel:${string}`;

const PAMINN_TEXT: Record<string, string> = {
  skickar: "Skickar…",
  skickad: "Påmind",
  koad: "Påmind · köad",
  nyss: "Påmind nyss",
};

const STATUS_FARG = { vantar: FARG.orange, godkand: FARG.gron, skickad: FARG.text2 } as const;

const attKollaText = (n: number) => `${n} ${n === 1 ? "sak" : "saker"} att kolla`;

/**
 * En förare i listan. Hela raden öppnar Förare · Månad; Påminn är en egen knapp och öppnar inget.
 * `pagaende`: månaden är inte slut — inget godkännande att visa, inget att påminna om.
 */
export function ForarListRad({ k, pagaende, paminn, onPaminn, onOppna, sista }: {
  k: ForarKort;
  pagaende: boolean;
  paminn?: string;
  onPaminn: () => void;
  onOppna: () => void;
  sista: boolean;
}) {
  const kvar = kvarAttKolla(k);
  const status = pagaende ? null : k.forarStatus;
  const fel = paminn?.startsWith("fel:") ? paminn.slice(4) : null;
  const visaPaminn = status === "vantar";
  return (
    <div data-forare={k.id} role="button" tabIndex={0} aria-label={`${k.namn}, öppna månaden`}
      onClick={e => { if (!(e.target as HTMLElement).closest("button")) onOppna(); }}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOppna(); } }}
      style={{ padding: `${AVSTAND.m}px 0`, borderBottom: sista ? "none" : `1px solid ${FARG.linje}`, cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: AVSTAND.m, minHeight: TRAFFYTA.min }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>{k.namn}</div>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
            {status && <span data-forare-status={status} style={{ color: STATUS_FARG[status] }}>{FORAR_STATUS_TEXT[status]}</span>}
            {status && kvar > 0 && " · "}
            {kvar > 0 && <span data-att-kolla={kvar} style={{ color: FARG.orange }}>{attKollaText(kvar)}</span>}
            {!status && kvar === 0 && "Inget att kolla"}
          </div>
          {/* Det som måste rättas innan föraren kan skickas, eller i nästa lön: orange. Varför föraren väntar igen: dämpat. */}
          {k.saknarAnstNr && <div data-saknar-anstnr="" style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.xs }}>Anställningsnummer saknas – kan inte skickas</div>}
          {k.andradEfterSkickat && <div data-andrad-skickat="" style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.xs }}>{k.andradEfterSkickat.text}</div>}
          {status === "vantar" && k.andrad && <div data-andrad="" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{k.andrad.text}</div>}
          {fel && <div data-paminn-fel="" style={{ ...TYP.meta, color: FARG.rod, marginTop: AVSTAND.xs }}>{fel}</div>}
        </div>
        {visaPaminn && (
          paminn && !fel
            ? <span data-paminn-status={paminn} style={{ ...TYP.meta, color: FARG.text2, flexShrink: 0 }}>{PAMINN_TEXT[paminn] ?? ""}</span>
            : <Lank smal onClick={onPaminn} style={{ flexShrink: 0 }}>Påminn</Lank>
        )}
        <Ikon namn="chevron_right" farg={FARG.text3} />
      </div>
    </div>
  );
}

/**
 * I Förare · Månad: "Att kolla" (kvar överst, kvitterat nedtonat under "Kollat") och "Bra att veta". Varje kvitterbar punkt har en mindre
 * "Ser rätt ut" bredvid knappen som leder dit. `kanKvittera` är falskt när kvittensen inte går att spara: då finns ingen sådan knapp.
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
  const bra = [...k.helglon.map(t => ({ id: `helg-${t}`, text: t })), ...k.info];
  return (
    <>
      {(kvar.length > 0 || k.saknarAnstNr) && (
        <>
          <Sektion orange topp={AVSTAND.s}>Att kolla</Sektion>
          <Lista>
            {k.saknarAnstNr && (
              <Rad attr={{ "data-kolla": "anstnr" }} rubrikFarg={FARG.orange} rubrik="Anställningsnummer saknas"
                detalj="Kan inte skickas till Fortnox utan det." sista={kvar.length === 0}
                hoger={<Lank smal onClick={() => onMal({ typ: "person", id: k.id })}>Fyll i</Lank>} />
            )}
            {kvar.map((r, i) => (
              <Rad key={r.id} attr={{ "data-kolla": r.id }} rubrikFarg={FARG.orange} rubrik={r.text} sista={i === kvar.length - 1}>
                {(r.mal || (kanKvittera && arKvitterbar(r.id))) && (
                  <span style={{ display: "flex", gap: AVSTAND.l, flexWrap: "wrap", alignItems: "center" }}>
                    {r.mal && <Lank smal onClick={() => onMal(r.mal!)}>{r.knapp}</Lank>}
                    {kanKvittera && arKvitterbar(r.id) && <Tertiar smal onClick={() => onKvittera(r)}>Ser rätt ut</Tertiar>}
                  </span>
                )}
              </Rad>
            ))}
          </Lista>
        </>
      )}
      {kollat.length > 0 && (
        <>
          <Sektion>Kollat</Sektion>
          <Lista>
            {kollat.map((r, i) => (
              <Rad key={r.id} attr={{ "data-kolla": r.id, "data-kvitterad": "" }} dampad rubrik={r.text} sista={i === kollat.length - 1}
                hoger={<Tertiar smal onClick={() => onAngra(r)}>Ångra</Tertiar>} />
            ))}
          </Lista>
        </>
      )}
      {bra.length > 0 && (
        <>
          <Sektion>Bra att veta</Sektion>
          <Lista>
            {bra.map((r, i) => (
              <Rad key={r.id} attr={{ "data-info": r.id, ...(r.id.startsWith("utj-") ? { "data-utjamning-period": "" } : {}) }}
                dampad rubrik={r.text} sista={i === bra.length - 1} />
            ))}
          </Lista>
        </>
      )}
    </>
  );
}
