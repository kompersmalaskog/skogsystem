"use client";
// Lön → Lönearter: vad i appen skickas som vilken löneart i Fortnox. EN lista, EN plats.
//
// Raderna kommer ur katalogen (lib/lonesystem/loneart): etikett, enhet och förklaring hör till lönearten. Koden och namnet i Fortnox
// kommer ur lonesystem_artikelmappning — det är DEN tabellen exporten läser, så det du ändrar här är det som skickas.
// Tom kod = "Ej kopplad": ingen rad skickas. Att lämna koden tom och spara tar bort kopplingen.
//
// Tryck på en rad → ett ark med koden (och namnet i Fortnox) → Spara. Skrivningen sker direkt och felet står i arket (aldrig tyst).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, KNAPP, TYP } from "@/lib/design/tokens";
import { LONEARTER, type LoneartKey } from "@/lib/lonesystem/loneart";
import { IGEN_RAD } from "@/lib/admin/anstallningsnummer";
import { Sektion, Stod, Lista, Rad, Sheet, Falt, Besked, Fel, Laddar, Etikett } from "./ui";

type Mappningsrad = { id: string; intern_typ: string; extern_kod: string; beskrivning: string | null };
type Art = (typeof LONEARTER)[number];

const navKnapp = { ...KNAPP.lank, width: "auto", display: "inline-flex", alignItems: "center", gap: AVSTAND.xs, fontFamily: "inherit", ...TYP.text } as const;
/** Spara när inget är ändrat (eller koden är ogiltig): grå text, inte blå som dämpats. Blå betyder "går att trycka". */
const navInaktiv = { color: FARG.text3, cursor: "default" } as const;

/** Siffror och bokstäver (Fortnox-koder är oftast siffror). Ingen blanksteg, inga tecken som tyder på ett skrivfel. */
const GILTIG_KOD = /^[A-Za-z0-9_-]{1,12}$/;

const grupper = (): { rubrik: string; arter: Art[] }[] => {
  const ut: { rubrik: string; arter: Art[] }[] = [];
  for (const a of LONEARTER) {
    const g = ut.find(x => x.rubrik === a.grupp);
    if (g) g.arter.push(a); else ut.push({ rubrik: a.grupp, arter: [a] });
  }
  return ut;
};

export default function LonearterUnderflik() {
  const [fel, setFel] = useState<string | null>(null);
  const [koppling, setKoppling] = useState<{ id: string } | null>(null);
  /** intern_typ → rad. `null` tills läsningen lyckats: ett läsfel får aldrig se ut som "allt är ej kopplat". */
  const [rader, setRader] = useState<Record<string, Mappningsrad> | null>(null);
  const [vald, setVald] = useState<LoneartKey | null>(null);

  const ladda = useCallback(async () => {
    setFel(null);
    try {
      const k = await supabase.from("lonesystem_koppling").select("id").eq("system_typ", "fortnox").maybeSingle();
      if (k.error) throw k.error;
      setKoppling(k.data ? { id: (k.data as any).id } : null);
      const karta: Record<string, Mappningsrad> = {};
      if (k.data) {
        const r = await supabase.from("lonesystem_artikelmappning").select("id, intern_typ, extern_kod, beskrivning").eq("lonesystem_id", (k.data as any).id);
        if (r.error) throw r.error;
        for (const m of (r.data || []) as Mappningsrad[]) if ((m.extern_kod || "").trim()) karta[m.intern_typ] = m;
      }
      setRader(karta);
    } catch (e: any) {
      setRader(null);
      setFel(e?.message || String(e));
    }
  }, []);
  useEffect(() => { ladda(); }, [ladda]);

  /** Skrivningen: felet kommer tillbaka som text (arket visar det). `.select()` visar vilka rader som skrevs; 0 rader utan fel = RLS stoppade den. */
  const spara = async (key: LoneartKey, kodRaw: string, namnRaw: string): Promise<string | null> => {
    const kod = kodRaw.trim(), namn = namnRaw.trim();
    const befintlig = rader?.[key];
    if (befintlig) {
      if (!kod) {
        const { data, error } = await supabase.from("lonesystem_artikelmappning").delete().eq("id", befintlig.id).select("id");
        if (error) return error.message;
        if (!data?.length) return IGEN_RAD;
      } else {
        const { data, error } = await supabase.from("lonesystem_artikelmappning").update({ extern_kod: kod, beskrivning: namn }).eq("id", befintlig.id).select("id");
        if (error) return error.message;
        if (!data?.length) return IGEN_RAD;
      }
    } else if (kod) {
      // Raden hör till Fortnox-kopplingen — utan lonesystem_id hittar exporten den aldrig.
      if (!koppling) return "Anslut Fortnox först — koderna hör till kopplingen (Lön → Lönesystem).";
      const { data, error } = await supabase.from("lonesystem_artikelmappning")
        .insert({ lonesystem_id: koppling.id, intern_typ: key, extern_kod: kod, beskrivning: namn }).select("id");
      if (error) return error.message;
      if (!data?.length) return IGEN_RAD;
    }
    await ladda();
    return null;
  };

  const saknas = useMemo(() => (rader ? LONEARTER.filter(a => !a.valfri && !rader[a.key]) : []), [rader]);

  // `rader` är null tills en läsning lyckats: antingen läses det fortfarande, eller så felade det. Aldrig en lista som säger "Ej kopplad" på gissning.
  if (!rader) return fel ? <Fel onForsok={ladda}>Kunde inte läsa lönearterna: {fel}</Fel> : <Laddar>Läser lönearterna…</Laddar>;

  return (
    <>
      <Stod style={{ marginTop: 0 }}>
        Här väljer du vilken löneart i Fortnox varje rad i appen skickas som. Appen skickar bara antal (timmar, veckor, mil). Fortnox räknar kronorna.
      </Stod>

      {!koppling && (
        <Stod farg={FARG.orange} attr={{ "data-lonearter-ingen-koppling": "" }}>
          Anslut Fortnox under Lönesystem först. Koderna sparas på anslutningen.
        </Stod>
      )}

      {saknas.length > 0 && (
        <Stod farg={FARG.orange} attr={{ "data-lonearter-saknas": "" }}>
          {saknas.length} {saknas.length === 1 ? "löneart saknar" : "lönearter saknar"} kod: {saknas.map(a => a.label).join(", ")}.
          {" "}Finns ett antal på den i en månad stoppas exporten tills koden är ifylld, eller du väljer att skicka utan raden.
        </Stod>
      )}

      {grupper().map(g => (
        <React.Fragment key={g.rubrik}>
          <Sektion>{g.rubrik}</Sektion>
          <Lista>
            {g.arter.map((a, i) => {
              const m = rader[a.key];
              return (
                <div key={a.key} data-loneart={a.key}>
                  <Rad
                    rubrik={<>{a.label}{a.valfri && <span style={{ marginLeft: AVSTAND.s }}><Etikett>Frivillig</Etikett></span>}</>}
                    detalj={m
                      ? ((m.beskrivning || "").trim()
                        ? `I Fortnox: ${m.beskrivning!.trim()}`
                        : <span style={{ color: FARG.orange }}>Namnet i Fortnox saknas</span>)
                      : a.forklaring}
                    hoger={m
                      ? <span style={{ ...TYP.listtitel, color: FARG.text }}>{m.extern_kod}</span>
                      : <span style={{ color: FARG.text3 }}>Ej kopplad</span>}
                    chevron
                    onClick={() => setVald(a.key)}
                    sista={i === g.arter.length - 1}
                  />
                </div>
              );
            })}
          </Lista>
        </React.Fragment>
      ))}

      {vald && (
        <LoneartArk
          art={LONEARTER.find(a => a.key === vald)!}
          befintlig={rader[vald]}
          andraKoder={LONEARTER.filter(a => a.key !== vald && rader[a.key]).map(a => ({ label: a.label, kod: rader[a.key].extern_kod.trim() }))}
          onSpara={(kod, namn) => spara(vald, kod, namn)}
          onStang={() => setVald(null)}
        />
      )}
    </>
  );
}

function LoneartArk({ art, befintlig, andraKoder, onSpara, onStang }: {
  art: Art;
  befintlig?: Mappningsrad;
  andraKoder: { label: string; kod: string }[];
  onSpara: (kod: string, namn: string) => Promise<string | null>;
  onStang: () => void;
}) {
  const [kod, setKod] = useState(befintlig?.extern_kod || "");
  const [namn, setNamn] = useState(befintlig?.beskrivning || "");
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [upptagen, setUpptagen] = useState(false);

  const kodRen = kod.trim();
  const ogiltig = kodRen !== "" && !GILTIG_KOD.test(kodRen);
  const andrat = kodRen !== (befintlig?.extern_kod || "").trim() || namn.trim() !== (befintlig?.beskrivning || "").trim();
  const kanSpara = andrat && !ogiltig && !upptagen;
  const dublett = kodRen && !ogiltig ? andraKoder.find(a => a.kod === kodRen) : undefined;
  const kopplarBort = !!befintlig && kodRen === "";

  const tryckSpara = async () => {
    setUpptagen(true); setSparFel(null);
    const f = await onSpara(kod, namn);
    setUpptagen(false);
    if (f) setSparFel(f); else onStang();
  };

  return (
    <Sheet titel={art.label} vyNyckel="lonearter" onStang={onStang}
      vanster={<button type="button" onClick={onStang} style={navKnapp}>Avbryt</button>}
      hoger={(
        <button type="button" disabled={!kanSpara} onClick={tryckSpara}
          style={{ ...navKnapp, fontWeight: TYP.listtitel.fontWeight, ...(kanSpara ? null : navInaktiv) }}>
          {upptagen ? "Sparar…" : "Spara"}
        </button>
      )}>
      <Stod style={{ marginTop: 0, marginBottom: AVSTAND.l }}>
        {art.forklaring}{" "}Antal skickas i {art.enhetText}.{art.valfri ? " Utan kod hoppas raden över." : ""}
      </Stod>

      <Falt label="Kod i Fortnox" value={kod} onChange={v => { setKod(v); setSparFel(null); }} placeholder="Till exempel 11" maxLength={12}
        hint={befintlig ? "Lämna tomt för att koppla bort." : undefined} />
      <Falt label="Namn i Fortnox" value={namn} onChange={v => { setNamn(v); setSparFel(null); }} placeholder="Skriv av namnet som det står i Fortnox"
        hint="Så vet alla vad koden betyder." maxLength={80} />

      {ogiltig && <Stod farg={FARG.rod}>Koden får bara innehålla siffror och bokstäver.</Stod>}
      {dublett && <Stod farg={FARG.orange}>Samma kod används redan av {dublett.label}. Det går att spara, men kontrollera att det är rätt.</Stod>}
      {kopplarBort && (
        <Stod farg={FARG.orange}>Utan kod skickas inga rader för {art.label}.{art.valfri ? "" : " Har en månad ett antal på den stoppas exporten."}</Stod>
      )}
      {sparFel && <Besked>{sparFel}</Besked>}
    </Sheet>
  );
}
