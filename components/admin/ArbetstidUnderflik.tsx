"use client";
// Lön › Arbetstid (Martin 2026-11-26): samma gränser som föraren ser i Min tid — månad, år och snitt per vecka — för
// alla förare på en gång, hela tiden. Svaret överst i ord, en rad per förare (den som ligger närmast en gräns först),
// och ett tryck öppnar förarens gränser precis som han ser dem. Företagsledare står inte med (arbetstidslagen gäller inte).
import { useEffect, useState } from "react";
import { AVSTAND, FARG, TYP } from "@/lib/design/tokens";
import type { ArbetstidForare, Niva } from "@/lib/arbetstidsgranser";
import { adminRader, adminSvar, type AdminRad } from "@/lib/arbetstidVisning";
import Svarsrad from "@/components/design/Svarsrad";
import GransLista from "@/components/arbetstid/GransLista";
import { Etikett, Fel, Laddar, Lank, Lista, Rad, Sheet, Stod } from "./ui";

type Svar = { ok: boolean; forare?: ArbetstidForare[]; varningar?: string[]; meddelande?: string };

const FARG_NIVA: Record<Niva, string> = { lugn: FARG.text2, gul: FARG.orange, rod: FARG.rod };
const ORD_NIVA: Record<Niva, string | null> = { lugn: null, gul: "Nära gränsen", rod: "Över gränsen" };

export default function ArbetstidUnderflik() {
  const [svar, setSvar] = useState<Svar | null>(null);
  const [forsok, setForsok] = useState(0);
  const [oppen, setOppen] = useState<string | null>(null);
  useEffect(() => {
    let avbruten = false;
    setSvar(null);
    fetch("/api/lon/arbetstid", { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (!avbruten) setSvar(j); })
      .catch(e => { if (!avbruten) setSvar({ ok: false, meddelande: e?.message || String(e) }); });
    return () => { avbruten = true; };
  }, [forsok]);

  if (!svar) return <Laddar>Räknar arbetstiden …</Laddar>;
  if (!svar.ok) return <Fel onForsok={() => setForsok(f => f + 1)}>Kunde inte räkna arbetstiden: {svar.meddelande || "okänt fel"}</Fel>;

  const rader = adminRader(svar.forare || []);
  const s = adminSvar(rader);
  const vald = rader.find(r => r.id === oppen) || null;
  const nu = new Date();

  return (
    <div data-arbetstid-sida="">
      <Svarsrad rubrik={rader.length === 0 ? "Ingen förare har arbetstid i år än" : s.text} avvikelse={s.niva !== "lugn"} />
      {rader.length > 0 && (
        <div>
          <Lista>
            {rader.map((r, i) => (
              <Rad key={r.id} attr={{ "data-arbetstid-rad": r.id, "data-niva": r.niva }} chevron onClick={() => setOppen(r.id)} sista={i === rader.length - 1}
                rubrik={<span style={{ display: "inline-flex", alignItems: "center", gap: AVSTAND.s, flexWrap: "wrap" }}>
                  {r.namn}{ORD_NIVA[r.niva] && <Etikett farg={FARG_NIVA[r.niva]}>{ORD_NIVA[r.niva]}</Etikett>}
                </span>}
                detalj={<DelarText rad={r} />} />
            ))}
          </Lista>
          <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text3 }}>Månad t.o.m. igår · vecka i snitt över 4 månader. Samma tal som föraren ser i Min tid.</p>
        </div>
      )}
      {(svar.varningar || []).map(v => <Stod key={v} farg={FARG.orange} attr={{ "data-arbetstid-varning": "" }}>{v}</Stod>)}

      {vald && (
        <Sheet titel={vald.namn} onStang={() => setOppen(null)} vanster={<Lank smal onClick={() => setOppen(null)}>Stäng</Lank>} attr={{ "data-arbetstid-forare-ark": vald.id }}>
          <GransLista granser={vald.granser} nu={nu} kort={false} />
          {vald.notiser.map(n => <p key={n} style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{n}</p>)}
        </Sheet>
      )}
    </div>
  );
}

/** "Månad 32 / 50 · År 180 / 250 · Vecka 44 / 48" — en del som är nära eller över får sin färg. */
function DelarText({ rad }: { rad: AdminRad }) {
  return (
    <span data-arbetstid-delar="">
      {rad.delar.map((d, i) => (
        <span key={d.id} data-del={d.id} data-niva={d.niva}>
          {i > 0 && " · "}
          <span style={{ color: d.niva === "lugn" ? undefined : FARG_NIVA[d.niva] }}>{d.text}</span>
        </span>
      ))}
    </span>
  );
}
