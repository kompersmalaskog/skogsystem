"use client";
// Maskinkonton och koder (Admin › Medarbetare, längst ned). Svaret först: vilka maskiner som har maskinkonto på, och vilka förare som har valt sin kod.
//   Maskinkonto: admin lägger upp kontot här (e-post + ett lösenord som visas EN gång), slår brytaren på/av per maskin och kan byta lösenord.
//   Av = maskinen fungerar som förut; inga data försvinner åt något håll.
//   Koder: varje förare väljer sin kod själv i telefonen (Mer › Kod för maskinen). Admin kan nollställa en kod.
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, TYP } from "@/lib/design/tokens";
import { Sektion, Stod, Lista, Rad, Falt, Sekundar, Primar, Besked, Fel, Laddar, Reglage, Bekrafta, Sheet, Kort } from "./ui";

type MaskinRad = { maskin_id: string; namn: string; typ: string; kontoFinns: boolean; aktiv: boolean; epost: string | null };
type PersonRad = { id: string; namn: string; roll: string; harKod: boolean };
type Svar = { maskiner: MaskinRad[]; personer: PersonRad[] };

async function anrop(metod: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const r = await fetch("/api/maskin/konto", { method: metod, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

export default function MaskinkontoSektion() {
  const [svar, setSvar] = useState<Svar | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [besked, setBesked] = useState<string | null>(null);
  const [nytt, setNytt] = useState<MaskinRad | null>(null);
  const [visa, setVisa] = useState<{ epost: string | null; losenord: string; maskin: string } | null>(null);
  const [nollstall, setNollstall] = useState<string | null>(null);
  const [adminEpost, setAdminEpost] = useState("");

  const ladda = useCallback(async () => {
    setFel(null);
    try {
      const r = await anrop("GET");
      if (!r.ok || !Array.isArray(r.data?.maskiner) || !Array.isArray(r.data?.personer)) { setFel(r.data?.error || "Kunde inte läsa maskinkontona."); return; }
      setSvar({ maskiner: r.data.maskiner, personer: r.data.personer });
    } catch { setFel("Kunde inte läsa maskinkontona. Kontrollera täckningen."); }
  }, []);
  useEffect(() => {
    void ladda();
    // Förslaget på kontots adress bygger på adminens egen — saknas den fyller man i själv.
    try { void Promise.resolve(supabase.auth.getUser()).then(({ data }) => setAdminEpost(data?.user?.email ?? "")).catch(() => undefined); } catch { /* */ }
  }, [ladda]);

  const brytare = async (m: MaskinRad, aktiv: boolean) => {
    setBesked(null);
    const r = await anrop("PATCH", { maskin_id: m.maskin_id, aktiv });
    if (!r.ok) { setBesked(r.data?.error || "Kunde inte ändra brytaren."); return; }
    await ladda();
  };
  const nyttLosen = async (m: MaskinRad) => {
    setBesked(null);
    const r = await anrop("POST", { maskin_id: m.maskin_id, nytt_losenord: true });
    if (!r.ok) { setBesked(r.data?.error || "Kunde inte byta lösenord."); return; }
    setVisa({ epost: m.epost, losenord: r.data.losenord, maskin: m.namn });
  };
  const nollstallKod = async (p: PersonRad) => {
    setBesked(null); setNollstall(null);
    const r = await fetch("/api/maskin/kod/nollstall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ medarbetare_id: p.id }) });
    if (!r.ok) { setBesked("Kunde inte nollställa koden."); return; }
    await ladda();
  };

  if (fel) return <Fel onForsok={ladda}>{fel}</Fel>;
  if (!svar) return <Laddar />;
  const paSumma = svar.maskiner.filter(m => m.aktiv).length;

  return (
    <div data-maskinkonton>
      <Sektion>Maskinkonton</Sektion>
      <Stod style={{ margin: `0 ${AVSTAND.xs}px ${AVSTAND.m}px` }}>
        {paSumma === 0 ? "Ingen maskin har maskinkonto på. Alla maskiner är inloggade som förare, som förut." : `${paSumma} ${paSumma === 1 ? "maskin har" : "maskiner har"} maskinkonto på.`}
      </Stod>
      {besked && <Besked>{besked}</Besked>}
      <Lista>
        {svar.maskiner.map((m, i) => (
          <div key={m.maskin_id} data-maskin={m.maskin_id} style={{ padding: `${AVSTAND.m}px 0`, borderBottom: i === svar.maskiner.length - 1 ? "none" : `1px solid ${FARG.linje}` }}>
            <Reglage label={m.namn} value={m.aktiv} onChange={v => void brytare(m, v)}
              hint={m.aktiv ? (m.kontoFinns ? `På · konto: ${m.epost}` : "På · men inget konto är upplagt än") : m.kontoFinns ? `Av · maskinen fungerar som förut (konto finns: ${m.epost})` : "Av · maskinen fungerar som förut"} />
            <div style={{ display: "flex", gap: AVSTAND.s }}>
              {!m.kontoFinns && <Sekundar onClick={() => setNytt(m)}>Lägg upp konto</Sekundar>}
              {m.kontoFinns && <Sekundar onClick={() => void nyttLosen(m)}>Nytt lösenord</Sekundar>}
            </div>
          </div>
        ))}
      </Lista>

      <Sektion>Koder för maskinen</Sektion>
      <Stod style={{ margin: `0 ${AVSTAND.xs}px ${AVSTAND.m}px` }}>Förarna väljer sin kod själva i telefonen (Mer › Kod för maskinen).</Stod>
      <Lista>
        {svar.personer.map((p, i) => (
          nollstall === p.id ? (
            <Bekrafta key={p.id} text={`Nollställa ${p.namn}s kod? ${p.namn.split(" ")[0]} väljer en ny i telefonen.`} ja="Nollställ" onJa={() => void nollstallKod(p)} onNej={() => setNollstall(null)} />
          ) : (
            <Rad key={p.id} rubrik={p.namn} detalj={p.harKod ? "Har valt kod" : "Ingen kod än"} sista={i === svar.personer.length - 1}
              hoger={p.harKod ? <Sekundar onClick={() => setNollstall(p.id)}>Nollställ</Sekundar> : undefined} />
          )
        ))}
      </Lista>

      {nytt && (
        <LaggUpp maskin={nytt} adminEpost={adminEpost} onStang={() => setNytt(null)}
          onKlar={(epost, losenord) => { setVisa({ epost, losenord, maskin: nytt.namn }); setNytt(null); void ladda(); }} />
      )}
      {visa && (
        <Sheet titel="Lösenord" hoger={<button type="button" onClick={() => setVisa(null)} style={{ background: "none", border: "none", color: FARG.bla, ...TYP.text, cursor: "pointer" }}>Klar</button>} onStang={() => setVisa(null)}>
          <Kort>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>Logga in på {visa.maskin} med</div>
            {visa.epost && <div data-konto-epost style={{ ...TYP.listtitel, wordBreak: "break-all" }}>{visa.epost}</div>}
            <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.m }}>Lösenord</div>
            <div data-konto-losenord style={{ ...TYP.rubrik, wordBreak: "break-all", userSelect: "all" }}>{visa.losenord}</div>
          </Kort>
          <Stod>Lösenordet visas bara nu. Skriv in det på maskindatorn, sedan behövs det inte mer.</Stod>
          <Primar onClick={() => { void navigator.clipboard?.writeText(visa.losenord).catch(() => undefined); }} style={{ marginTop: AVSTAND.l }}>Kopiera lösenordet</Primar>
        </Sheet>
      )}
    </div>
  );
}

function LaggUpp({ maskin, adminEpost, onStang, onKlar }: { maskin: MaskinRad; adminEpost: string; onStang: () => void; onKlar: (epost: string, losenord: string) => void }) {
  // Förslag: adminens egen adress med +alias, så att kontot hamnar i en brevlåda som finns (lösenordsbyte mejlas dit).
  const forslag = (() => {
    const [lokal, dom] = adminEpost.split("@");
    return lokal && dom ? `${lokal.split("+")[0]}+${maskin.maskin_id.toLowerCase()}@${dom}` : "";
  })();
  const [epost, setEpost] = useState(forslag);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const spara = async () => {
    setSparar(true); setFel(null);
    const r = await anrop("POST", { maskin_id: maskin.maskin_id, epost });
    setSparar(false);
    if (!r.ok) { setFel(r.data?.error || "Kunde inte lägga upp kontot."); return; }
    onKlar(r.data.epost, r.data.losenord);
  };
  return (
    <Sheet titel={`Konto för ${maskin.namn}`} vanster={<button type="button" onClick={onStang} style={{ background: "none", border: "none", color: FARG.bla, ...TYP.text, cursor: "pointer" }}>Avbryt</button>} onStang={onStang}>
      <Falt label="E-postadress för kontot" value={epost} onChange={setEpost} placeholder="namn@exempel.se" hint="Kontot loggar in med den här adressen. Välj en brevlåda du själv kommer åt." />
      {fel && <Besked>{fel}</Besked>}
      <Primar onClick={() => void spara()} disabled={sparar || !epost.includes("@")}>{sparar ? "Lägger upp …" : "Lägg upp kontot"}</Primar>
    </Sheet>
  );
}
