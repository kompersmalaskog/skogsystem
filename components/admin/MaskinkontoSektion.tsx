"use client";
// Maskinkonton och koder (Admin › Medarbetare, längst ned). Svaret först: vilka maskiner som har maskinkonto på.
//   Maskinkonto: EN brytare per maskin, och för de maskiner som har ett konto när det skapades. Kontot skapas av servern själv första gången en
//   maskindator med brytaren på startar — admin lägger inte upp något och ser aldrig något lösenord. Av = maskinen fungerar som förut.
//   Koder: varje förare väljer sin kod själv i telefonen (Mer › Kod för maskinen). Admin kan nollställa en kod.
import React, { useCallback, useEffect, useState } from "react";
import { AVSTAND, FARG } from "@/lib/design/tokens";
import { Sektion, Stod, Lista, Rad, Sekundar, Besked, Fel, Laddar, Reglage, Bekrafta } from "./ui";

type MaskinRad = { maskin_id: string; namn: string; typ: string; kontoFinns: boolean; aktiv: boolean; skapat: string | null };
type PersonRad = { id: string; namn: string; roll: string; harKod: boolean };
type Svar = { maskiner: MaskinRad[]; personer: PersonRad[] };

async function anrop(metod: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const r = await fetch("/api/maskin/konto", { method: metod, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

/** Raden under brytaren: kontot skapas när maskinen startar, så "på" utan konto är normalt tills första starten. */
function kontoText(m: MaskinRad): string {
  if (!m.aktiv) return "Av · maskinen fungerar som förut";
  if (!m.kontoFinns) return "På · kontot skapas när maskinen startar";
  const d = m.skapat ? new Date(m.skapat) : null;
  const dag = d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short", year: "numeric" }).format(d).replace(".", "") : null;
  return dag ? `På · konto skapat ${dag}` : "På · konto finns";
}

export default function MaskinkontoSektion() {
  const [svar, setSvar] = useState<Svar | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [besked, setBesked] = useState<string | null>(null);
  const [nollstall, setNollstall] = useState<string | null>(null);

  const ladda = useCallback(async () => {
    setFel(null);
    try {
      const r = await anrop("GET");
      if (!r.ok || !Array.isArray(r.data?.maskiner) || !Array.isArray(r.data?.personer)) { setFel(r.data?.error || "Kunde inte läsa maskinkontona."); return; }
      setSvar({ maskiner: r.data.maskiner, personer: r.data.personer });
    } catch { setFel("Kunde inte läsa maskinkontona. Kontrollera täckningen."); }
  }, []);
  useEffect(() => { void ladda(); }, [ladda]);

  const brytare = async (m: MaskinRad, aktiv: boolean) => {
    setBesked(null);
    const r = await anrop("PATCH", { maskin_id: m.maskin_id, aktiv });
    if (!r.ok) { setBesked(r.data?.error || "Kunde inte ändra brytaren."); return; }
    await ladda();
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
            <Reglage label={m.namn} value={m.aktiv} onChange={v => void brytare(m, v)} hint={kontoText(m)} />
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

    </div>
  );
}
