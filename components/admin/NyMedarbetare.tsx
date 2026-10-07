"use client";
// Ny medarbetare = ETT flöde, fyra steg, ett i taget. Förut låg det utspritt: personen i Medarbetare, hempunkten i
// personen, operatören i Att åtgärda, anställningsnumret i Lön → Lönesystem (så Oscar fastnade).
//
// Varje steg sparas när man går vidare. Vilka steg som är klara HÄRLEDS ur det som är sparat (lib/admin/introduktion),
// så flödet kan avbrytas, laddas om och tas upp igen: ?ny=1&person=<id>&steg=<n> i adressen.
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, RADIE, TYP, TNUM } from "@/lib/design/tokens";
import { maskinNamnMap, DIM_MASKIN_NAMN_KOLUMNER } from "@/lib/maskinNamn";
import { hamtaAnstallning, sparaAnstallningsnummer, IGEN_RAD } from "@/lib/admin/anstallningsnummer";
import { INTRO_STEG, introKlara, forstaOgjorda } from "@/lib/admin/introduktion";
import type { MedarbetarKontroller } from "@/lib/medarbetarKontroll";
import { Titel, Sektion, Stod, Kort, Lista, Rad, Falt, Val, Primar, Sekundar, Tertiar, Lank, Besked, Laddar, Fel, Ikon } from "./ui";
import { useAdminNav } from "./nav";
import { OperatorRad } from "./MedarbetareKontroller";
import { HempunktKort, KopplaOperatörModal, ROLLER, type Medarbetare } from "./medarbetarDelar";

const KOLUMNER = "id, namn, epost, hemadress, roll, maskin_id, timlon_kr, manadslon_kr, anstallningsdatum, user_id, hem_lat, hem_lng, hem_koord_kalla, hem_geokod_status, hem_geokod_etikett, hem_geokod_precision, hem_geokod_lat, hem_geokod_lng";

export default function NyMedarbetare() {
  const { nav, gaTill } = useAdminNav();
  const personId = nav.params.person || null;
  const stegParam = Number(nav.params.steg);

  const [person, setPerson] = useState<Medarbetare | null>(null);
  const [anst, setAnst] = useState<{ lonesystemId: string | null; nr: string }>({ lonesystemId: null, nr: "" });
  const [maskiner, setMaskiner] = useState<Record<string, string>>({});
  const [kontroller, setKontroller] = useState<MedarbetarKontroller | null>(null);
  const [laddar, setLaddar] = useState(!!personId);
  const [laddFel, setLaddFel] = useState<string | null>(null);

  const ladda = useCallback(async () => {
    setLaddFel(null);
    try {
      const [maskinRes, kontrollerRes] = await Promise.all([
        supabase.from("dim_maskin").select(`${DIM_MASKIN_NAMN_KOLUMNER}, bekraftad, aktiv_till`),
        fetch("/api/medarbetare/kontroller", { cache: "no-store" }).then(r => r.json().catch(() => ({}))).catch(() => ({})),
      ]);
      if (maskinRes.error) throw maskinRes.error;
      const rader = ((maskinRes.data || []) as any[]).filter(m => m.bekraftad && !m.aktiv_till);
      setMaskiner(maskinNamnMap(rader));
      setKontroller(kontrollerRes?.ok ? (kontrollerRes as MedarbetarKontroller) : null);
      if (personId) {
        const pRes = await supabase.from("medarbetare").select(KOLUMNER).eq("id", personId).maybeSingle();
        if (pRes.error) throw pRes.error;
        setPerson((pRes.data as Medarbetare | null) ?? null);
        const a = await hamtaAnstallning(personId);
        if (a.fel) throw new Error(a.fel);
        setAnst({ lonesystemId: a.lonesystemId, nr: a.nr });
      } else {
        setPerson(null);
      }
    } catch (e: any) {
      setLaddFel(e?.message || String(e));
    } finally {
      setLaddar(false);
    }
  }, [personId]);

  useEffect(() => { ladda(); }, [ladda]);

  if (laddar) return <><Titel>Ny medarbetare</Titel><Laddar /></>;
  if (laddFel) return <><Titel>Ny medarbetare</Titel><Fel onForsok={() => { setLaddar(true); ladda(); }}>Kunde inte öppna flödet: {laddFel}</Fel></>;

  const klara = introKlara(person, anst.nr);
  const antalKlara = klara.filter(Boolean).length;
  const steg = stegParam >= 1 && stegParam <= 4 ? stegParam : (person ? forstaOgjorda(klara) : 1);
  const tillSteg = (n: number, id: string | null = person?.id ?? personId) =>
    gaTill({ flik: "medarbetare", params: { ny: "1", ...(id ? { person: id } : {}), steg: String(n) } });
  const lamna = () => gaTill({ flik: "medarbetare" });

  return (
    <>
      <Titel>Ny medarbetare</Titel>

      {/* Stapeln: fyra delar, en per klart steg */}
      <div role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={antalKlara} aria-label="Hur många steg som är klara"
        style={{ display: "flex", gap: AVSTAND.xs }}>
        {INTRO_STEG.map((s, i) => (
          <div key={s.nr} style={{ flex: 1, height: AVSTAND.s, borderRadius: RADIE.stapel, background: klara[i] ? FARG.text : s.nr === steg ? FARG.text3 : FARG.fyllning }} />
        ))}
      </div>
      <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, ...TNUM, color: FARG.text2 }}>Steg {steg} av 4</p>

      {/* Stegen, med ✓ på de klara */}
      <Sektion topp={AVSTAND.l}>Stegen</Sektion>
      <Lista>
        {INTRO_STEG.map((s, i) => {
          const oppen = !!person || s.nr === 1;
          return (
            <div key={s.nr} data-steg={s.nr} data-klar={klara[i] ? "true" : undefined}>
              <Rad sista={i === INTRO_STEG.length - 1} onClick={oppen && s.nr !== steg ? () => tillSteg(s.nr) : undefined} chevron={oppen && s.nr !== steg}
                rubrik={<span style={{ display: "inline-flex", alignItems: "center", gap: AVSTAND.m }}>
                  {klara[i] ? <Ikon namn="check_circle" farg={FARG.gron} fylld /> : <span style={{ width: AVSTAND.xl - AVSTAND.xs, textAlign: "center", ...TYP.meta, ...TNUM, color: FARG.text2 }}>{s.nr}</span>}
                  <span>{s.namn}</span>
                </span>}
                rubrikFarg={s.nr === steg ? FARG.text : FARG.text2} dampad={klara[i] && s.nr !== steg} />
            </div>
          );
        })}
      </Lista>

      <div style={{ marginTop: AVSTAND.sektion }}>
        {steg === 1 && <Steg1 person={person} onKlar={id => tillSteg(2, id)} onAvbryt={lamna} />}
        {steg === 2 && person && <Steg2 person={person} onLadda={ladda} onTillbaka={() => tillSteg(1)} onNasta={() => tillSteg(3)} onAvbryt={lamna} />}
        {steg === 3 && person && <Steg3 person={person} maskiner={maskiner} kontroller={kontroller} onLadda={ladda} onTillbaka={() => tillSteg(2)} onNasta={() => tillSteg(4)} onAvbryt={lamna} />}
        {steg === 4 && person && <Steg4 person={person} lonesystemId={anst.lonesystemId} nr={anst.nr} onTillbaka={() => tillSteg(3)} onKlar={() => gaTill({ flik: "medarbetare", params: { person: person.id } })} onAvbryt={lamna} />}
        {steg > 1 && !person && (
          <Kort><Stod style={{ marginTop: 0 }}>Personen finns inte ännu. Börja med steg 1.</Stod><Sekundar smal onClick={() => tillSteg(1, null)} style={{ marginTop: AVSTAND.m }}>Till steg 1</Sekundar></Kort>
        )}
      </div>
    </>
  );
}

/* ─── Gemensamt ─── */

function Knappar({ children, tillbaka, onAvbryt, avbrytText }: { children: React.ReactNode; tillbaka?: () => void; onAvbryt: () => void; avbrytText: string }) {
  return (
    <div style={{ marginTop: AVSTAND.xl, display: "flex", flexDirection: "column", gap: AVSTAND.s }}>
      {children}
      <div style={{ display: "flex", justifyContent: tillbaka ? "space-between" : "center", alignItems: "center" }}>
        {tillbaka && <Lank onClick={tillbaka}>Tillbaka</Lank>}
        <Tertiar onClick={onAvbryt}>{avbrytText}</Tertiar>
      </div>
    </div>
  );
}

/* ─── Steg 1: namn och e-post ─── */

function Steg1({ person, onKlar, onAvbryt }: { person: Medarbetare | null; onKlar: (id: string) => void; onAvbryt: () => void }) {
  const [namn, setNamn] = useState(person?.namn || "");
  const [epost, setEpost] = useState(person?.epost || "");
  const [roll, setRoll] = useState(person?.roll || "forare");
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const spara = async () => {
    if (!namn.trim()) { setFel("Namn krävs."); return; }
    setSparar(true); setFel(null);
    const fält = { namn: namn.trim(), epost: epost.trim() || null, roll };
    // .select() visar vilka rader som faktiskt skrevs: 0 rader utan fel = RLS stoppade den tyst.
    const r = person
      ? await supabase.from("medarbetare").update(fält).eq("id", person.id).select("id")
      : await supabase.from("medarbetare").insert(fält).select("id");
    setSparar(false);
    if (r.error) { setFel(r.error.message); return; }
    const id: string | undefined = (r.data as any[])?.[0]?.id;
    if (!id) { setFel(IGEN_RAD.replace("Ändringen", person ? "Ändringen" : "Personen")); return; }
    onKlar(id);
  };

  return (
    <>
      <Kort>
        <Falt label="Namn" value={namn} onChange={setNamn} placeholder="För- och efternamn" />
        <Falt label="E-post" value={epost} onChange={setEpost} placeholder="namn@exempel.se" type="email"
          hint={person?.user_id ? "Inloggning kopplad." : "Kopplas automatiskt till ett inloggningskonto när ett konto med samma e-post finns. Utan koppling kommer personen inte in i appen."} />
        <Val label="Roll" value={roll} onChange={setRoll} options={ROLLER} />
      </Kort>
      {fel && <Besked>{fel}</Besked>}
      <Knappar onAvbryt={onAvbryt} avbrytText={person ? "Avbryt, fortsätt senare" : "Avbryt"}>
        <Primar onClick={spara} disabled={sparar || !namn.trim()}>{sparar ? "Sparar…" : "Spara och fortsätt"}</Primar>
      </Knappar>
    </>
  );
}

/* ─── Steg 2: hemadress ─── */

function Steg2({ person, onLadda, onTillbaka, onNasta, onAvbryt }: { person: Medarbetare; onLadda: () => void; onTillbaka: () => void; onNasta: () => void; onAvbryt: () => void }) {
  const [adress, setAdress] = useState(person.hemadress || "");
  const [kor, setKor] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const sparadAdress = (person.hemadress || "").trim();
  const nastaOk = person.hem_lat != null && adress.trim() === sparadAdress;

  const hitta = async () => {
    if (!adress.trim()) { setFel("Skriv en adress först."); return; }
    setKor(true); setFel(null);
    const u = await supabase.from("medarbetare").update({ hemadress: adress.trim() }).eq("id", person.id).select("id");
    if (u.error || !u.data?.length) { setKor(false); setFel(u.error?.message || IGEN_RAD); return; }
    const r = await fetch("/api/medarbetare/geokoda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: person.id }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setKor(false);
    if (!r || !r.ok || !j?.ok) { setFel(j?.error || "Geokodningen misslyckades. Kontrollera adressen och försök igen."); }
    onLadda();
  };

  return (
    <>
      <Kort>
        <Falt label="Hemadress" value={adress} onChange={setAdress} placeholder="Gata, ort"
          hint="Km räknas från hempunkten. Adressen slås upp direkt och du ser hur exakt den hittades." />
        <Sekundar onClick={hitta} disabled={kor || !adress.trim()}>{kor ? "Letar…" : "Hitta adressen"}</Sekundar>
      </Kort>
      {fel && <Besked>{fel}</Besked>}
      {sparadAdress && <><Sektion>Var adressen hamnade</Sektion><HempunktKort m={person} onLadda={onLadda} /></>}
      <Knappar tillbaka={onTillbaka} onAvbryt={onAvbryt} avbrytText="Avbryt, fortsätt senare">
        <Primar onClick={onNasta} disabled={!nastaOk}>Nästa</Primar>
        {!nastaOk && <Tertiar onClick={onNasta} style={{ alignSelf: "center" }}>Lägg in hempunkten senare</Tertiar>}
      </Knappar>
    </>
  );
}

/* ─── Steg 3: maskin och operatör ─── */

function Steg3({ person, maskiner, kontroller, onLadda, onTillbaka, onNasta, onAvbryt }: {
  person: Medarbetare; maskiner: Record<string, string>; kontroller: MedarbetarKontroller | null;
  onLadda: () => void; onTillbaka: () => void; onNasta: () => void; onAvbryt: () => void;
}) {
  const [maskinId, setMaskinId] = useState(person.maskin_id || "");
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [visaKoppla, setVisaKoppla] = useState(false);
  const forslag = (kontroller?.okandaOperatorer || []).filter(o => o.medarbetare.id === person.id);

  const spara = async () => {
    setSparar(true); setFel(null);
    if (maskinId !== (person.maskin_id || "")) {
      const r = await supabase.from("medarbetare").update({ maskin_id: maskinId || null }).eq("id", person.id).select("id");
      if (r.error || !r.data?.length) { setSparar(false); setFel(r.error?.message || IGEN_RAD); return; }
    }
    setSparar(false);
    onNasta();
  };

  return (
    <>
      <Kort>
        <Val label="Maskin" value={maskinId} onChange={setMaskinId} options={[
          { value: "", label: "Välj maskin" },
          ...Object.entries(maskiner).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => ({ value: id, label: `${n} (${id})` })),
        ]} hint="Maskinen Dag-vyn och Starta arbetspass utgår från. MOM kan inte skapa förarens dagar utan den." />
      </Kort>

      <Sektion>Operatör</Sektion>
      {forslag.length > 0 ? (
        <Lista>
          {forslag.map((o, i) => <OperatorRad key={o.operator_id} o={o} maskiner={maskiner} sista={i === forslag.length - 1} />)}
        </Lista>
      ) : (
        <Kort>
          <Stod style={{ marginTop: 0 }}>
            Ingen okänd operatör med personens namn än. Operatören dyker upp i maskinfilerna när personen loggat in på maskinen första gången, och då föreslår Översikten kopplingen.
          </Stod>
        </Kort>
      )}
      <Lank onClick={() => setVisaKoppla(true)} style={{ marginTop: AVSTAND.s }}>+ Koppla en operatör själv</Lank>
      {visaKoppla && <KopplaOperatörModal medarbetareId={person.id} onKlar={() => { setVisaKoppla(false); onLadda(); }} onAvbryt={() => setVisaKoppla(false)} />}

      {fel && <Besked>{fel}</Besked>}
      <Knappar tillbaka={onTillbaka} onAvbryt={onAvbryt} avbrytText="Avbryt, fortsätt senare">
        <Primar onClick={spara} disabled={sparar || !maskinId}>{sparar ? "Sparar…" : "Spara och fortsätt"}</Primar>
        {!maskinId && <Tertiar onClick={onNasta} style={{ alignSelf: "center" }}>Lägg in maskinen senare</Tertiar>}
      </Knappar>
    </>
  );
}

/* ─── Steg 4: anställningsnummer ─── */

function Steg4({ person, lonesystemId, nr, onTillbaka, onKlar, onAvbryt }: {
  person: Medarbetare; lonesystemId: string | null; nr: string; onTillbaka: () => void; onKlar: () => void; onAvbryt: () => void;
}) {
  const [varde, setVarde] = useState(nr);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const spara = async () => {
    setSparar(true); setFel(null);
    const f = await sparaAnstallningsnummer(person.id, lonesystemId, varde);
    setSparar(false);
    if (f) { setFel(f); return; }
    onKlar();
  };

  return (
    <>
      <Kort>
        <Falt label="Anställningsnummer" value={varde} onChange={setVarde} placeholder="—"
          hint={lonesystemId ? "Det nummer Fortnox känner personen under. Utan det kan lönen inte skickas." : "Anslut Fortnox under Lön → Lönesystem först. Numret hör till kopplingen."} disabled={!lonesystemId} />
      </Kort>
      {fel && <Besked>{fel}</Besked>}
      <Knappar tillbaka={onTillbaka} onAvbryt={onAvbryt} avbrytText="Avbryt, fortsätt senare">
        <Primar onClick={spara} disabled={sparar || !varde.trim() || !lonesystemId}>{sparar ? "Sparar…" : "Klar"}</Primar>
        {!varde.trim() && <Tertiar onClick={onKlar} style={{ alignSelf: "center" }}>Lägg in numret senare</Tertiar>}
      </Knappar>
    </>
  );
}
