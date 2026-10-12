"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, RADIE, TYP, TNUM } from "@/lib/design/tokens";
import { Sektion, Stod, Kort, Lista, Rad, Primar, Besked, Fel, Laddar, Tomt, Ikon } from "./ui";
import { ymdLokal } from "@/lib/datumLokal";
import UtjamningsSektion from "./UtjamningsSektion";

type Avtal = {
  id?: string;
  namn?: string | null;
  giltigt_fran?: string | null;
  giltigt_till?: string | null;
  overtid_vardag_kr?: number | null;
  max_overtid_ar_h?: number | null;
  ob_kvall_kr?: number | null;
  ob_natt_kr?: number | null;
  ob_helg_kr?: number | null;
  ob_sondag_kr?: number | null;
  km_ersattning_kr?: number | null;
  km_grans_per_dag?: number | null;
  fardtid_kr_per_mil?: number | null;
  atk_procent?: number | null;
  atk_procent_nasta?: number | null;
  atk_ledig_tid_h?: number | null;
  traktamente_hel_kr?: number | null;
  traktamente_halv_kr?: number | null;
  skift_tillagg_kr?: number | null;
  bortovaro_12h_kr?: number | null;
  [k: string]: any;
};

type Fält = {
  key: keyof Avtal;
  label: string;
  suffix?: string;
  type?: "number" | "text" | "date";
  step?: string;
};

type FältGrupp = { rubrik: string; fält: Fält[] };

const GRUPPER: FältGrupp[] = [
  {
    rubrik: "Avtal",
    fält: [
      { key: "namn", label: "Namn", type: "text" },
      { key: "giltigt_fran", label: "Giltigt från", type: "date" },
      { key: "giltigt_till", label: "Giltigt till", type: "date" },
    ],
  },
  {
    rubrik: "Övertid",
    fält: [
      { key: "overtid_vardag_kr", label: "Övertidsersättning vardag", suffix: "kr/tim", step: "0.01" },
      // Kolumnen heter max_overtid_ar_h — förr "max_overtid_ar", som inte finns:
      // fältet sparade till ingenting och appen föll alltid tillbaka på 250.
      { key: "max_overtid_ar_h", label: "Max övertid", suffix: "tim/år", step: "1" },
    ],
  },
  {
    rubrik: "OB-ersättning",
    fält: [
      { key: "ob_kvall_kr", label: "Mån–fre kväll/natt (17–06:30)", suffix: "kr/tim", step: "0.01" },
      { key: "ob_natt_kr",  label: "Nattarbete (00–05)",             suffix: "kr/tim", step: "0.01" },
      { key: "ob_helg_kr",   label: "Helg",                           suffix: "kr/tim", step: "0.01" },
      { key: "ob_sondag_kr", label: "Söndag",                        suffix: "kr/tim", step: "0.01" },
    ],
  },
  {
    rubrik: "Färdmedel & färdtid",
    fält: [
      { key: "km_ersattning_kr", label: "Färdmedelsersättning", suffix: "kr/mil", step: "0.01" },
      { key: "km_grans_per_dag", label: "Km-gräns",             suffix: "km/dag", step: "1" },
      { key: "fardtid_kr_per_mil", label: "Färdtidsersättning", suffix: "kr/mil", step: "0.01" },
    ],
  },
  {
    rubrik: "ATK",
    fält: [
      { key: "atk_procent",        label: "Avsättning",    suffix: "%",        step: "0.01" },
      { key: "atk_procent_nasta",  label: "Nästa period",  suffix: "%",        step: "0.01" },
      { key: "atk_ledig_tid_h",    label: "Ledig tid",     suffix: "tim/år",   step: "0.1" },
    ],
  },
  {
    rubrik: "Traktamente",
    fält: [
      { key: "traktamente_hel_kr",  label: "Heldag",  suffix: "kr", step: "1" },
      { key: "traktamente_halv_kr", label: "Halvdag", suffix: "kr", step: "1" },
    ],
  },
  {
    rubrik: "Övriga tillägg",
    fält: [
      { key: "skift_tillagg_kr",  label: "Skifttillägg",    suffix: "kr/tim", step: "0.01" },
      { key: "bortovaro_12h_kr",  label: "Bortovaro >12h",  suffix: "kr/tim", step: "0.01" },
    ],
  },
];

/** Hela månader kvar till slutdatumet (0 = under en månad). Null om inget slutdatum. Utgånget hanteras av arUtgatt. */
function månaderKvar(giltigtTill: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(giltigtTill || "");
  if (!m) return null;
  const nu = new Date();
  let mån = (Number(m[1]) - nu.getFullYear()) * 12 + (Number(m[2]) - 1 - nu.getMonth());
  if (Number(m[3]) < nu.getDate()) mån -= 1;
  return Math.max(0, mån);
}

/** Slutdatumet ligger före idag (lokalt datum). */
function arUtgatt(giltigtTill: string | null | undefined): boolean {
  const d = (giltigtTill || "").slice(0, 10);
  return !!d && d < ymdLokal(new Date());
}

export default function AvtalFlik({ currentUser }: { currentUser: { id: string; namn?: string | null } }) {
  const [aktuellt, setAktuellt] = useState<Avtal | null>(null);
  const [form, setForm] = useState<Avtal>({});
  const [historik, setHistorik] = useState<Avtal[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [sparOk, setSparOk] = useState(false);

  const ladda = async () => {
    setLaddar(true);
    setFel(null);
    try {
      const { data, error } = await supabase
        .from("gs_avtal")
        .select("*")
        .order("giltigt_fran", { ascending: false });
      if (error) throw error;
      const rader = data || [];
      if (rader.length === 0) { setAktuellt(null); setHistorik([]); return; }
      setAktuellt(rader[0]);
      setForm(rader[0]);
      setHistorik(rader.slice(1));
    } catch (e: any) {
      setFel(e.message || String(e));
    } finally {
      setLaddar(false);
    }
  };

  useEffect(() => { ladda(); }, []);

  const ändrat = (() => {
    if (!aktuellt) return false;
    for (const g of GRUPPER) for (const f of g.fält) {
      const a = aktuellt[f.key], b = form[f.key];
      const na = a == null || a === "" ? null : a;
      const nb = b == null || b === "" ? null : b;
      if (String(na) !== String(nb)) return true;
    }
    return false;
  })();

  const spara = async () => {
    if (!aktuellt?.id) { setSparFel("Ingen avtalsrad att uppdatera"); return; }
    setSparar(true); setSparFel(null); setSparOk(false);

    // Skicka bara fält som finns på befintlig rad (för att undvika fel på okända kolumner)
    const existerandeKolumner = new Set(Object.keys(aktuellt));
    const payload: Record<string, any> = {};
    for (const g of GRUPPER) for (const f of g.fält) {
      if (!existerandeKolumner.has(f.key as string)) continue;
      const v = form[f.key];
      if (f.type === "number" || f.step !== undefined) {
        payload[f.key as string] = v === "" || v == null ? null : parseFloat(String(v));
      } else {
        payload[f.key as string] = v === "" ? null : v;
      }
    }

    // .select() ger tillbaka raderna som faktiskt skrevs: 0 rader utan fel = RLS stoppade den tyst
    // (gs_avtal kräver admin). Då får det aldrig stå "Sparat".
    const { data, error } = await supabase.from("gs_avtal").update(payload).eq("id", aktuellt.id).select("id");
    setSparar(false);
    if (error) { setSparFel(error.message); return; }
    if (!data?.length) { setSparFel("Ändringen sparades inte — raden träffades inte (bara admin kan ändra avtalet)."); return; }
    setSparOk(true);
    setTimeout(() => setSparOk(false), 2000);
    ladda();
  };

  if (laddar) return <Laddar>Laddar avtal…</Laddar>;
  if (fel) return <Fel onForsok={ladda}>Kunde inte ladda avtal: {fel}</Fel>;
  if (!aktuellt) return <Kort><Tomt>Inget avtal i databasen (gs_avtal är tom).</Tomt></Kort>;

  const utgåttRedan = arUtgatt(aktuellt.giltigt_till);
  const månKvar = utgåttRedan ? null : månaderKvar(aktuellt.giltigt_till);
  const varningUtgång = månKvar !== null && månKvar <= 3;
  const datum = (d: string | null | undefined, kort?: boolean) =>
    d ? new Date(d).toLocaleDateString("sv-SE", kort ? { month: "short", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <>
      {/* Aktuellt avtal */}
      <Kort>
        <div style={{ ...TYP.micro, color: FARG.text2 }}>Aktuellt avtal</div>
        <div style={{ ...TYP.rubrik, color: FARG.text, marginTop: AVSTAND.xs }}>{aktuellt.namn || "Namnlöst avtal"}</div>
        <Stod>{datum(aktuellt.giltigt_fran)} – {datum(aktuellt.giltigt_till)}</Stod>
      </Kort>

      {/* Påminnelse om utgång */}
      {(varningUtgång || utgåttRedan) && (
        <Kort style={{ marginTop: AVSTAND.m, display: "flex", alignItems: "flex-start", gap: AVSTAND.m }}>
          <Ikon namn="warning" farg={FARG.orange} />
          <div>
            <p style={{ margin: 0, ...TYP.listtitel, color: FARG.orange }}>
              {utgåttRedan ? "Avtalet har gått ut" : `Avtalet går ut om ${månKvar === 0 ? "mindre än en månad" : `${månKvar} månad${månKvar === 1 ? "" : "er"}`}`}
            </p>
            <Stod>Uppdatera giltighetstiden eller lägg in det nya avtalet.</Stod>
          </div>
        </Kort>
      )}

      {/* Redigerbart formulär */}
      {GRUPPER.map(g => {
        // Ett fält utan kolumn i avtalsraden visas aldrig: ett tekniskt fel är inget en admin kan göra något åt.
        const synliga = g.fält.filter(f => f.key in aktuellt);
        if (synliga.length === 0) return null;
        return (
          <div key={g.rubrik}>
            <Sektion>{g.rubrik}</Sektion>
            <Lista>
              {synliga.map((f, i) => (
                <AvtalFält
                  key={String(f.key)}
                  fält={f}
                  value={form[f.key]}
                  onChange={v => setForm(s => ({ ...s, [f.key]: v }))}
                  sista={i === synliga.length - 1}
                />
              ))}
            </Lista>
          </div>
        );
      })}

      {/* Spara */}
      {sparFel && <Besked>{sparFel}</Besked>}
      {sparOk && <Besked slag="ok">Sparat ✓</Besked>}
      <Primar onClick={spara} disabled={!ändrat || sparar} style={{ marginTop: AVSTAND.xl }}>
        {sparar ? "Sparar…" : "Spara ändringar"}
      </Primar>

      {/* Utjämningsperioder (§5 mom 2): före, hör till avtalets arbetstidsregel */}
      <UtjamningsSektion namnInloggad={currentUser.namn || "admin"} />

      {/* Historik */}
      <Sektion>Tidigare avtal ({historik.length})</Sektion>
      {historik.length === 0 ? (
        <Kort><Tomt>Inga tidigare avtalsversioner. Den som gällde före det nuvarande står här när ett nytt läggs in.</Tomt></Kort>
      ) : (
        <Lista>
          {historik.map((h, i) => (
            <Rad key={h.id || i} sista={i === historik.length - 1}
              rubrik={h.namn || "Namnlöst"}
              hoger={`${datum(h.giltigt_fran, true)} – ${datum(h.giltigt_till, true)}`}
              detalj={[h.overtid_vardag_kr != null && `Övertid ${h.overtid_vardag_kr} kr/tim`, h.traktamente_hel_kr != null && `Traktamente ${h.traktamente_hel_kr} kr`].filter(Boolean).join(" · ") || undefined} />
          ))}
        </Lista>
      )}
    </>
  );
}

function AvtalFält({
  fält, value, onChange, sista,
}: {
  fält: Fält;
  value: any;
  onChange: (v: any) => void;
  sista: boolean;
}) {
  const isDate = fält.type === "date";
  const isNumber = fält.step !== undefined;
  const id = `avtal-${String(fält.key)}`;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
      gap: AVSTAND.s, padding: `${AVSTAND.s}px 0`, minHeight: 56,
      borderBottom: sista ? "none" : `1px solid ${FARG.linje}`,
    }}>
      <label htmlFor={id} style={{ ...TYP.text, color: FARG.text, flex: "1 1 200px" }}>
        {fält.label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: AVSTAND.s, flex: "0 1 auto" }}>
        <input
          id={id}
          type={isDate ? "date" : isNumber ? "number" : "text"}
          step={fält.step}
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          style={{
            minHeight: 44, boxSizing: "border-box", background: FARG.upphojt, border: "none", borderRadius: RADIE.rad,
            padding: `0 ${AVSTAND.m}px`, color: FARG.text, fontFamily: "inherit", outline: "none",
            width: isDate ? 160 : fält.type === "text" ? 200 : 120,
            textAlign: isNumber ? "right" : "left", ...TYP.text, ...(isNumber ? TNUM : null),
          }}
        />
        {fält.suffix && <span style={{ ...TYP.meta, color: FARG.text2, minWidth: 48 }}>{fält.suffix}</span>}
      </div>
    </div>
  );
}
