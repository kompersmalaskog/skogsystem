"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, TYP } from "@/lib/design/tokens";
import { maskinSomUrl } from "@/lib/maskinSom";
import { ymdLokal } from "@/lib/datumLokal";
import { Sektion, Stod, Kort, Lista, Rad, Falt, Val, Reglage, Primar, Sekundar, Tillbaka, Destruktiv, Besked, Fel, Laddar, Tomt, Bekrafta } from "./ui";
import { useAdminNav } from "./nav";

/* dim_maskin — admin äger visningsnamn/tillverkare/maskin_typ/sander_filer/
   aktiv_fran/aktiv_till på bekräftade maskiner (importens guard rör dem ej).
   maskin_id är nyckeln mot filerna — visas men redigeras ALDRIG efter skapande.
   maskin_typ lagrar StanForD-värdet ('Harvester'/'Forwarder') som resten av
   appen filtrerar på — dropdownen visar svenska men skriver det engelska värdet.
   modell hålls läs-only (fil-ägt). kravprofil/klarar_typ/extramaskin rörs INTE
   här — de bor i sina egna domäner (kalibrering/helikopter). */
type Maskin = {
  maskin_id: string;
  visningsnamn: string | null;
  tillverkare: string | null;
  modell: string | null;
  maskin_typ: string | null;
  sander_filer: boolean;

  /** auto = maskinfiler, manuell = föraren registrerar lass i arbetsrapporten (20260924). */
  datakalla?: "auto" | "manuell" | null;
  aktiv_fran: string | null;
  aktiv_till: string | null;
  bekraftad: boolean;
};

type FilInfo = { forstaFil: string | null; antalFiler: number };

const TYP_VAL: { value: string; label: string }[] = [
  { value: "Harvester", label: "Skördare" },
  { value: "Forwarder", label: "Skotare" },
];

function typLabel(t: string | null): string {
  if (!t) return "—";
  return TYP_VAL.find(o => o.value === t)?.label ?? t;
}

function maskinNamn(m: Maskin): string {
  return m.visningsnamn?.trim() || m.modell || m.maskin_id;
}

// Datumgräns för date-inputarna. Desktop-Chromes date-input tillåter ett
// 6-siffrigt år i årssegmentet — skriver man en extra siffra blir "2026" till
// "202607", och Postgres `date` ACCEPTERAR 6-siffriga år så skräpet lagras tyst
// (aktiv_till blev "202607-02-26" = år 202607). min/max hjälper pickern; den
// bärande garantin är datumFel() som gate:ar sparandet.
const DATUM_MIN = "1970-01-01";
const DATUM_MAX = "2100-12-31";
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returnerar felmeddelande om strängen inte är exakt ÅÅÅÅ-MM-DD (fyrsiffrigt år)
// och ett verkligt datum inom [1970, 2100]. Tomt = giltigt (fältet rensat).
function datumFel(s: string, etikett: string): string | null {
  if (!s) return null;
  if (!DATUM_RE.test(s)) return `${etikett}: ogiltigt format — ska vara ÅÅÅÅ-MM-DD (fyrsiffrigt år).`;
  const [y, m, d] = s.split("-").map(Number);
  if (y < 1970 || y > 2100) return `${etikett}: året ${y} verkar fel — skriv ett fyrsiffrigt år.`;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
    return `${etikett}: ${s} är inte ett giltigt datum.`;
  return null;
}

export default function MaskinerFlik() {
  // Vilken maskin som är öppen står i adressen (?maskin=…).
  const { nav, gaTill } = useAdminNav();
  const valdId = nav.params.maskin || null;
  const tillLista = () => gaTill({ flik: "maskiner" });
  const oppna = (id: string) => gaTill({ flik: "maskiner", params: { maskin: id } });

  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [filinfo, setFilinfo] = useState<Record<string, FilInfo>>({});
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);

  const ladda = async () => {
    setLaddar(true);
    setFel(null);
    try {
      const { data, error } = await supabase
        .from("dim_maskin")
        .select("maskin_id, visningsnamn, tillverkare, modell, maskin_typ, sander_filer, datakalla, aktiv_fran, aktiv_till, bekraftad")
        .order("visningsnamn", { nullsFirst: false });
      if (error) throw error;
      const rader = (data || []) as Maskin[];
      setMaskiner(rader);

      // Fil-info bara för obekräftade — "första fil / antal filer" i upptäckt-kortet.
      const obekr = rader.filter(m => !m.bekraftad && !m.aktiv_till).map(m => m.maskin_id);
      if (obekr.length > 0) {
        const { data: filer } = await supabase
          .from("meta_importerade_filer")
          .select("maskin_id, importerad_tid")
          .in("maskin_id", obekr);
        const info: Record<string, FilInfo> = {};
        for (const f of (filer || []) as { maskin_id: string; importerad_tid: string | null }[]) {
          if (!f.maskin_id) continue;
          const cur = info[f.maskin_id] || { forstaFil: null, antalFiler: 0 };
          cur.antalFiler += 1;
          if (f.importerad_tid && (!cur.forstaFil || f.importerad_tid < cur.forstaFil)) {
            cur.forstaFil = f.importerad_tid;
          }
          info[f.maskin_id] = cur;
        }
        setFilinfo(info);
      } else {
        setFilinfo({});
      }
    } catch (e: any) {
      setFel(e.message || String(e));
    } finally {
      setLaddar(false);
    }
  };

  useEffect(() => { ladda(); }, []);

  if (laddar) return <Laddar />;
  if (fel) return <Fel onForsok={ladda}>Kunde inte ladda maskiner: {fel}</Fel>;

  if (valdId) {
    const m = maskiner.find(x => x.maskin_id === valdId);
    if (!m) {
      return (
        <>
          <Tillbaka onClick={tillLista}>Maskiner</Tillbaka>
          <Tomt>Maskinen finns inte längre.</Tomt>
        </>
      );
    }
    return (
      <DetaljVy
        key={m.maskin_id}
        maskin={m}
        onKlar={() => { tillLista(); ladda(); }}
        onTillbaka={tillLista}
      />
    );
  }

  return <ListaVy maskiner={maskiner} filinfo={filinfo} onValj={oppna} />;
}

/* ─── LISTA ─── */

function ListaVy({
  maskiner, filinfo, onValj,
}: {
  maskiner: Maskin[];
  filinfo: Record<string, FilInfo>;
  onValj: (id: string) => void;
}) {
  // Status ur DATUM/BEKRÄFTELSE, aldrig ur filtystnad (en tyst maskin kan vara
  // på semester, inte ur drift). Obekräftad = Väntar; aktiv_till satt = Ur drift.
  const obekraftade = maskiner.filter(m => !m.bekraftad && !m.aktiv_till);
  const iDrift = maskiner.filter(m => m.bekraftad && !m.aktiv_till);
  const urDrift = maskiner.filter(m => !!m.aktiv_till);

  return (
    <>
      {obekraftade.length > 0 && (
        <>
          <Sektion topp={0} orange>Nya maskiner i importen ({obekraftade.length})</Sektion>
          <Lista>
            {obekraftade.map((m, i) => {
              const fi = filinfo[m.maskin_id];
              const forsta = fi?.forstaFil ? new Date(fi.forstaFil).toLocaleDateString("sv-SE") : null;
              return (
                <Rad key={m.maskin_id} onClick={() => onValj(m.maskin_id)} sista={i === obekraftade.length - 1}
                  rubrik={m.maskin_id}
                  detalj={<>
                    {[m.tillverkare, typLabel(m.maskin_typ)].filter(Boolean).join(" · ") || "okänd typ"}
                    {forsta ? ` · första fil ${forsta}` : ""}
                    {fi?.antalFiler ? ` · ${fi.antalFiler} fil${fi.antalFiler === 1 ? "" : "er"}` : ""}
                  </>}
                  hoger={<span style={{ color: FARG.orange, ...TYP.listtitel }}>Bekräfta</span>} chevron />
              );
            })}
          </Lista>
        </>
      )}

      <Sektion topp={obekraftade.length > 0 ? AVSTAND.sektion : 0}>I drift ({iDrift.length})</Sektion>
      {iDrift.length === 0 ? (
        <Kort><Tomt>Inga maskiner i drift. Nya maskiner dyker upp här när importen hittar dem.</Tomt></Kort>
      ) : (
        <Lista>
          {iDrift.map((m, i) => <MaskinRad key={m.maskin_id} m={m} sist={i === iDrift.length - 1} onValj={onValj} />)}
        </Lista>
      )}

      {urDrift.length > 0 && (
        <>
          <Sektion>Ur drift ({urDrift.length})</Sektion>
          <Lista>
            {urDrift.map((m, i) => <MaskinRad key={m.maskin_id} m={m} sist={i === urDrift.length - 1} onValj={onValj} grattonad />)}
          </Lista>
        </>
      )}
    </>
  );
}

function MaskinRad({
  m, sist, onValj, grattonad,
}: {
  m: Maskin; sist: boolean; onValj: (id: string) => void; grattonad?: boolean;
}) {
  const saldDatum = m.aktiv_till ? new Date(m.aktiv_till).toLocaleDateString("sv-SE") : null;
  const delar = [typLabel(m.maskin_typ), m.modell, saldDatum && `ur drift ${saldDatum}`, !m.sander_filer && "sänder ej filer"].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: AVSTAND.m, borderBottom: sist ? "none" : `1px solid ${FARG.linje}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Rad onClick={() => onValj(m.maskin_id)} sista rubrik={maskinNamn(m)} detalj={delar} dampad={grattonad} chevron />
      </div>
      {/* Maskiner som är ur drift är inte väljbara → ingen knapp där. */}
      {!grattonad && <OppnaSomMaskin maskinId={m.maskin_id} />}
    </div>
  );
}

/** "Öppna som maskin": öppnar /maskin?som=<maskin_id> i NY flik (appen i maskinläge som den maskinen, utan
 *  DB-skrivningar). Länk, inte window.open — rätt semantik och fungerar med mittenklick. */
function OppnaSomMaskin({ maskinId }: { maskinId: string }) {
  return (
    <a href={maskinSomUrl(maskinId)} target="_blank" rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: `0 ${AVSTAND.m}px`, color: FARG.bla, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0, ...TYP.meta }}>
      Öppna som maskin
    </a>
  );
}

/* ─── DETALJ / REDIGERA / BEKRÄFTA ─── */

function DetaljVy({
  maskin, onKlar, onTillbaka,
}: {
  maskin: Maskin;
  onKlar: () => void;
  onTillbaka: () => void;
}) {
  const [visningsnamn, setVisningsnamn] = useState(maskin.visningsnamn || "");
  const [tillverkare, setTillverkare] = useState(maskin.tillverkare || "");
  const [maskinTyp, setMaskinTyp] = useState(maskin.maskin_typ || "");
  const [sanderFiler, setSanderFiler] = useState(maskin.sander_filer);
  const [manuellKalla, setManuellKalla] = useState(maskin.datakalla === "manuell");
  const [aktivFran, setAktivFran] = useState(maskin.aktiv_fran || "");
  const [aktivTill, setAktivTill] = useState(maskin.aktiv_till || "");
  const [sparar, setSparar] = useState(false);
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [urDriftLage, setUrDriftLage] = useState(false);

  const obekraftad = !maskin.bekraftad;

  const ändrat =
    visningsnamn !== (maskin.visningsnamn || "") ||
    tillverkare !== (maskin.tillverkare || "") ||
    maskinTyp !== (maskin.maskin_typ || "") ||
    sanderFiler !== maskin.sander_filer ||
    manuellKalla !== (maskin.datakalla === "manuell") ||
    aktivFran !== (maskin.aktiv_fran || "") ||
    aktivTill !== (maskin.aktiv_till || "");

  const faltPayload = () => ({
    visningsnamn: visningsnamn.trim() || null,
    tillverkare: tillverkare.trim() || null,
    maskin_typ: maskinTyp || null,
    sander_filer: sanderFiler,
    datakalla: manuellKalla ? "manuell" : "auto",
    aktiv_fran: aktivFran || null,
    aktiv_till: aktivTill || null,
  });

  // Verifierat sparande: .select() ger tillbaka de faktiskt uppdaterade raderna.
  // 0 rader UTAN error = RLS blockerade tyst (dim_maskin-skrivning kräver
  // roll='admin' via ar_admin()) — surfa upp det som fel, aldrig falskt "sparat".
  const verifieraSkriv = async (patch: Record<string, any>): Promise<boolean> => {
    const { data, error } = await supabase.from("dim_maskin")
      .update(patch).eq("maskin_id", maskin.maskin_id).select("maskin_id");
    if (error) { setSparFel(error.message); return false; }
    if (!data || data.length === 0) {
      setSparFel("Sparningen nådde inga rader — troligen behörighet (ändringar kräver admin-roll).");
      return false;
    }
    return true;
  };

  const skriv = async (extra: Record<string, any> = {}) => {
    // Datum-gate: släpp aldrig igenom ett icke-kanoniskt datum (6-siffrigt år
    // etc.) till dim_maskin. Bättre ärligt fel än tyst skräp i DB.
    const dFel = datumFel(aktivFran, "Aktiv från") || datumFel(aktivTill, "Aktiv till");
    if (dFel) { setSparFel(dFel); return; }
    setSparar(true);
    setSparFel(null);
    const ok = await verifieraSkriv({ ...faltPayload(), ...extra });
    setSparar(false);
    if (ok) onKlar();
  };

  const bekrafta = () => {
    if (!visningsnamn.trim()) { setSparFel("Visningsnamn krävs för att bekräfta"); return; }
    skriv({ bekraftad: true });
  };

  const taUrDrift = async () => {
    // Sätt aktiv_till till valt datum (default idag). All historik bevaras —
    // maskinen faller bara ur bevakning.
    const idag = ymdLokal(new Date()); // lokalt datum, inte UTC
    setSparar(true);
    setSparFel(null);
    const ok = await verifieraSkriv({ aktiv_till: idag });
    setSparar(false);
    if (ok) onKlar();
  };

  const aterIDrift = async () => {
    setSparar(true);
    setSparFel(null);
    const ok = await verifieraSkriv({ aktiv_till: null });
    setSparar(false);
    if (ok) onKlar();
  };

  return (
    <>
      <Tillbaka onClick={onTillbaka}>Maskiner</Tillbaka>

      {obekraftad && (
        <Kort style={{ marginBottom: AVSTAND.l }}>
          <p style={{ margin: 0, ...TYP.listtitel, color: FARG.orange }}>Ny maskin upptäckt i importen</p>
          <Stod>Serienumret kommer ur maskinfilen och är rätt. Fyll i visningsnamn och aktiv från, bekräfta sedan. Därefter skyddas dina uppgifter från att skrivas över vid nästa fil.</Stod>
        </Kort>
      )}

      {/* Serienummer — låst */}
      <Sektion topp={AVSTAND.s}>Identitet</Sektion>
      <Kort>
        <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>Serienummer (nyckel mot filerna, kan inte ändras)</div>
        <div style={{ ...TYP.text, color: FARG.text, wordBreak: "break-all" }}>{maskin.maskin_id}</div>
        {maskin.modell && <Stod style={{ marginTop: AVSTAND.m }}>Modell (ur fil): <span style={{ color: FARG.text }}>{maskin.modell}</span></Stod>}
      </Kort>

      {/* Grunduppgifter */}
      <Sektion>Grunduppgifter</Sektion>
      <Kort>
        <Falt label="Visningsnamn" value={visningsnamn} onChange={setVisningsnamn} placeholder="t.ex. Scorpion Giant" />
        <Falt label="Tillverkare" value={tillverkare} onChange={setTillverkare} placeholder="t.ex. Ponsse" />
        <Val label="Maskintyp" value={maskinTyp} onChange={setMaskinTyp} options={[
          { value: "", label: "— välj —" },
          ...TYP_VAL,
          ...(maskinTyp && !TYP_VAL.some(o => o.value === maskinTyp)
            ? [{ value: maskinTyp, label: `${maskinTyp} (ur fil)` }] : []),
        ]} />
        <Reglage label="Sänder filer" value={sanderFiler} onChange={setSanderFiler}
          hint="Av för maskiner som aldrig skickar maskinfiler (t.ex. JD810E). Då förväntas ingen data." />
        <Reglage label="Manuell datakälla" value={manuellKalla} onChange={setManuellKalla}
          hint="På för maskiner utan maskinfiler (JD810E): föraren registrerar lass i arbetsrapporten och importen avvisar FPR-filer för maskinen. En maskin har en källa." />
      </Kort>

      {/* Driftperiod */}
      <Sektion>Driftperiod</Sektion>
      <Kort>
        <Falt label="Aktiv från" value={aktivFran} onChange={setAktivFran} type="date" min={DATUM_MIN} max={DATUM_MAX} />
        <Falt label="Aktiv till" value={aktivTill} onChange={setAktivTill} type="date" min={DATUM_MIN} max={DATUM_MAX}
          hint="Sätts när maskinen säljs eller tas ur drift. Historiken bevaras, maskinen faller bara ur bevakning." />
      </Kort>

      {sparFel && <Besked>{sparFel}</Besked>}

      {/* Knappar */}
      <div style={{ marginTop: AVSTAND.xl, display: "flex", flexDirection: "column", gap: AVSTAND.m }}>
        {obekraftad ? (
          <Primar onClick={bekrafta} disabled={sparar || !visningsnamn.trim()}>{sparar ? "Bekräftar…" : "Bekräfta maskin"}</Primar>
        ) : (
          <Primar onClick={() => skriv()} disabled={!ändrat || sparar}>{sparar ? "Sparar…" : "Spara ändringar"}</Primar>
        )}

        {/* Ur drift / åter i drift */}
        {maskin.aktiv_till ? (
          <Sekundar onClick={aterIDrift} disabled={sparar}>Återställ till drift</Sekundar>
        ) : !obekraftad && !urDriftLage ? (
          <Destruktiv onClick={() => setUrDriftLage(true)} style={{ alignSelf: "center" }}>Ta ur drift / markera såld</Destruktiv>
        ) : !obekraftad && urDriftLage ? (
          <Bekrafta
            text={`Ta ${maskinNamn(maskin)} ur drift per idag? Maskinen slutar bevakas men all historik finns kvar. Du kan återställa den när som helst.`}
            ja={sparar ? "…" : "Ja, ta ur drift"} upptagen={sparar} onJa={taUrDrift} onNej={() => setUrDriftLage(false)} />
        ) : null}
      </div>
    </>
  );
}
