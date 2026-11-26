"use client";
// Maskinkonto och kod för maskinen (2026-11-25: förut två långa listor längst ned i Medarbetare, nu där de hör hemma).
//   MaskinkontoRad: på maskinens egen sida i Admin › Maskiner.  MaskinKodRad: på personens egen sida i Admin › Medarbetare.
//   Maskinkonto: EN brytare per maskin, och för de maskiner som har ett konto när det skapades. Kontot skapas av servern själv första gången en
//   maskindator med brytaren på startar — admin lägger inte upp något och ser aldrig något lösenord. Av = maskinen fungerar som förut.
//   Koder: varje förare väljer sin kod själv i telefonen (Mer › Kod för maskinen). Admin kan nollställa en kod.
import React, { useCallback, useEffect, useState } from "react";
import { AVSTAND, FARG } from "@/lib/design/tokens";
import { Sektion, Lista, Rad, Sekundar, Besked, Fel, Laddar, Reglage, Bekrafta } from "./ui";

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

/** Läser maskinkontona och koderna (en fråga, samma svar för båda raderna). */
function useMaskinkonton() {
  const [svar, setSvar] = useState<Svar | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const ladda = useCallback(async () => {
    setFel(null);
    try {
      const r = await anrop("GET");
      if (!r.ok || !Array.isArray(r.data?.maskiner) || !Array.isArray(r.data?.personer)) { setFel(r.data?.error || "Kunde inte läsa maskinkontona."); return; }
      setSvar({ maskiner: r.data.maskiner, personer: r.data.personer });
    } catch { setFel("Kunde inte läsa maskinkontona. Kontrollera täckningen."); }
  }, []);
  useEffect(() => { void ladda(); }, [ladda]);
  return { svar, fel, ladda };
}

/** Maskinens sida: EN brytare. Av = maskinen fungerar som förut. En maskin som inte har någon rad (inte skördare/skotare) visar ingenting. */
export function MaskinkontoRad({ maskinId }: { maskinId: string }) {
  const { svar, fel, ladda } = useMaskinkonton();
  const [besked, setBesked] = useState<string | null>(null);
  if (fel) return <><Sektion>Maskinkonto</Sektion><Fel onForsok={ladda}>{fel}</Fel></>;
  if (!svar) return null;
  const m = svar.maskiner.find(x => x.maskin_id === maskinId);
  if (!m) return null;
  const brytare = async (aktiv: boolean) => {
    setBesked(null);
    const r = await anrop("PATCH", { maskin_id: m.maskin_id, aktiv });
    if (!r.ok) { setBesked(r.data?.error || "Kunde inte ändra brytaren."); return; }
    await ladda();
  };
  return (
    <div data-maskinkonto>
      <Sektion>Maskinkonto</Sektion>
      {besked && <Besked>{besked}</Besked>}
      <Lista>
        <div data-maskin={m.maskin_id} style={{ padding: `${AVSTAND.m}px 0` }}>
          <Reglage label="Eget konto i maskinen" value={m.aktiv} onChange={v => void brytare(v)} hint={kontoText(m)} />
        </div>
      </Lista>
    </div>
  );
}

/** Personens sida: har hen valt en kod för maskinen? Nollställ frågar först. Läsfel visas inte som "ingen kod". */
export function MaskinKodRad({ personId }: { personId: string }) {
  const { svar, fel, ladda } = useMaskinkonton();
  const [fraga, setFraga] = useState(false);
  const [besked, setBesked] = useState<string | null>(null);
  if (fel) return <><Sektion>Kod för maskinen</Sektion><Fel onForsok={ladda}>{fel}</Fel></>;
  if (!svar) return <><Sektion>Kod för maskinen</Sektion><Laddar /></>;
  const p = svar.personer.find(x => x.id === personId);
  if (!p) return null;
  const nollstall = async () => {
    setBesked(null); setFraga(false);
    const r = await fetch("/api/maskin/kod/nollstall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ medarbetare_id: p.id }) });
    if (!r.ok) { setBesked("Kunde inte nollställa koden."); return; }
    await ladda();
  };
  return (
    <div data-maskinkod>
      <Sektion>Kod för maskinen</Sektion>
      {besked && <Besked>{besked}</Besked>}
      {fraga ? (
        <Bekrafta text={`Nollställa ${p.namn}s kod? ${p.namn.split(" ")[0]} väljer en ny i telefonen.`} ja="Nollställ" onJa={() => void nollstall()} onNej={() => setFraga(false)} />
      ) : (
        <Lista>
          <Rad rubrik={p.harKod ? "Har valt kod" : "Ingen kod än"} detalj={p.harKod ? undefined : "Väljs i telefonen: Mer › Kod för maskinen."} sista
            hoger={p.harKod ? <Sekundar smal onClick={() => setFraga(true)}>Nollställ</Sekundar> : undefined} />
        </Lista>
      )}
    </div>
  );
}
