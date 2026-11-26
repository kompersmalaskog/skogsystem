"use client";
// Lön › Arbetstid (Martin 2026-11-26): samma gränser som föraren ser i Min tid — månad, år och snitt per vecka — för
// alla förare på en gång, hela tiden. Svaret överst i ord, en rad per förare (den som ligger närmast en gräns först),
// och ett tryck öppnar förarens gränser precis som han ser dem. Företagsledare står inte med (arbetstidslagen gäller inte).
import { useEffect, useState } from "react";
import { AVSTAND, FARG, TYP } from "@/lib/design/tokens";
import type { ArbetstidForare, Niva } from "@/lib/arbetstidsgranser";
import { ADMIN_GRUPPER, adminRader, adminSvar, type AdminRad } from "@/lib/arbetstidVisning";
import Svarsrad from "@/components/design/Svarsrad";
import GransLista from "@/components/arbetstid/GransLista";
import { Fel, Laddar, Lank, Lista, Rad, Sektion, Sheet, Stod } from "./ui";

type Svar = { ok: boolean; forare?: ArbetstidForare[]; varningar?: string[]; meddelande?: string };

const FARG_NIVA: Record<Niva, string> = { lugn: FARG.text2, gul: FARG.orange, rod: FARG.rod };

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
      {ADMIN_GRUPPER.map(({ niva, rubrik }) => {
        const grupp = rader.filter(r => r.niva === niva);
        if (grupp.length === 0) return null;
        return (
          <div key={niva} data-arbetstid-grupp={niva}>
            <Sektion orange={niva !== "lugn"}>{rubrik}</Sektion>
            <Lista>
              {grupp.map((r, i) => (
                <Rad key={r.id} attr={{ "data-arbetstid-rad": r.id, "data-niva": r.niva }} chevron onClick={() => setOppen(r.id)} sista={i === grupp.length - 1}
                  rubrik={r.namn} detalj={<DelarText rad={r} />} />
              ))}
            </Lista>
          </div>
        );
      })}
      {rader.length > 0 && (
        <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text3 }}>Tryck på en förare för att se alla gränser. Samma tal som föraren ser i Min tid.</p>
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

/** Bara gränserna som är nära eller över, i ord. Inget att säga = "Allt inom gränserna". */
function DelarText({ rad }: { rad: AdminRad }) {
  if (rad.delar.length === 0) return <span data-arbetstid-delar="">Allt inom gränserna</span>;
  return (
    <span data-arbetstid-delar="">
      {rad.delar.map(d => (
        <span key={d.id} data-del={d.id} data-niva={d.niva} style={{ display: "block", color: FARG_NIVA[d.niva] }}>{d.text}</span>
      ))}
    </span>
  );
}
