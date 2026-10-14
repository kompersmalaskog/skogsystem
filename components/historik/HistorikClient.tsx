"use client";
// Historikvyn (admin): produktionsrapporter 2011–2026 ur mejlexporterna. Lista → maskin → år med objekt.
// En sak per skärm. Läser bara (vy_hist_maskin_ar, vy_hist_objekt_lista); RLS släpper bara in roll = 'admin'.
// Tillstånd i URL:ens hash (#s=slutavverkning&m=…&a=gallring&y=2024&an=1&v=ar) så att bakåt-knappen och delade länkar fungerar.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, designCss, FARG, KNAPP, RADIE, TYP, VY_ROT } from "@/lib/design/tokens";
import Tillstand from "@/components/design/Tillstand";
import { hamtaMaskinAr, hamtaObjekt, signeradLank } from "@/lib/historik/data";
import { felSlag, felText, type HistorikFelSlag } from "@/lib/historik/fel";
import { indexAtgard, SKOTARE_UTAN_INDEX } from "@/lib/historik/indexForklaring";
import {
  ATGARD_ETIKETT, SEGMENT_ETIKETT, antagnaIAtgard, arSpann, aren, atgardsrader, fewObjects, fmt, FOR_LITE_DATA, harIndex, huvudtal, kandaLuckor, MIN_OBJEKT, nyckeltal, okandaObjekt, procent, rad,
  skordarlista, skotarlista, standardAtgard, VOLYM_SAKNAS_LASS, type ListRad, type Segment,
} from "@/lib/historik/berakna";
import type { AtgardKod, MaskinArRad, MaskinTyp, ObjektRad } from "@/lib/historik/typer";
import { Diagram, Listrad, maskinFarg, Notis, Nyckelrad, Sektion, Tillbaka, Vaxel } from "./delar";
import IndexInfo from "./IndexInfo";

type Vy = { seg: Segment; maskin: string | null; atgard: AtgardKod | null; ar: number | null; antagna: boolean; objekt: boolean };
const START: Vy = { seg: "slutavverkning", maskin: null, atgard: null, ar: null, antagna: false, objekt: false };

function ur_hash(): Vy {
  if (typeof window === "undefined") return START;
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const seg = (p.get("s") as Segment) || START.seg;
  const a = p.get("a");
  const y = p.get("y");
  return {
    seg: seg === "gallring" || seg === "slutavverkning" || seg === "skadaspecial" ? seg : START.seg,
    maskin: p.get("m"),
    atgard: a ? (a as AtgardKod) : null,
    ar: y ? Number(y) : null,
    antagna: p.get("an") === "1",
    objekt: p.get("v") === "ar",
  };
}

function till_hash(v: Vy): string {
  const p = new URLSearchParams();
  p.set("s", v.seg);
  if (v.maskin) p.set("m", v.maskin);
  if (v.maskin && v.atgard) p.set("a", v.atgard);
  if (v.maskin && v.ar !== null) p.set("y", String(v.ar));
  if (v.antagna) p.set("an", "1");
  if (v.maskin && v.objekt) p.set("v", "ar");
  return "#" + p.toString();
}

function useVy() {
  const [vy, setVy] = useState<Vy>(START);
  useEffect(() => {
    setVy(ur_hash());
    const lyssna = () => setVy(ur_hash());
    window.addEventListener("popstate", lyssna);
    window.addEventListener("hashchange", lyssna);
    return () => { window.removeEventListener("popstate", lyssna); window.removeEventListener("hashchange", lyssna); };
  }, []);
  const gaTill = useCallback((patch: Partial<Vy>, ersatt = false) => {
    setVy((nu) => {
      const ny = { ...nu, ...patch };
      const h = till_hash(ny);
      if (typeof window !== "undefined") (ersatt ? window.history.replaceState : window.history.pushState).call(window.history, null, "", h);
      return ny;
    });
  }, []);
  return [vy, gaTill] as const;
}

export default function HistorikClient() {
  const [rader, setRader] = useState<MaskinArRad[] | null>(null);
  const [fel, setFel] = useState<HistorikFelSlag | null>(null);
  const [vy, gaTill] = useVy();

  useEffect(() => {
    let avbruten = false;
    hamtaMaskinAr(supabase)
      .then((r) => { if (!avbruten) setRader(r); })
      .catch((e: unknown) => { console.error("historik: kunde inte läsa vy_hist_maskin_ar", e); if (!avbruten) setFel(felSlag(e)); });
    return () => { avbruten = true; };
  }, []);

  const skarm = !vy.maskin ? "lista" : vy.objekt ? "ar" : "maskin";
  return (
    <div style={VY_ROT}>
      <style>{designCss}</style>
      <div style={{ maxWidth: AVSTAND.xxl * 20, margin: "0 auto", paddingBottom: AVSTAND.xxl * 2 }}>
        {fel ? (
          <Fel slag={fel} />
        ) : rader === null ? (
          <p style={{ ...TYP.text, color: FARG.text2, paddingTop: AVSTAND.xl }}>Hämtar maskinsammanställningen …</p>
        ) : (
          <Tillstand nyckel={skarm + (vy.maskin ?? "")}>
            {skarm === "lista" && <Lista rader={rader} vy={vy} gaTill={gaTill} />}
            {skarm === "maskin" && vy.maskin && <MaskinSida rader={rader} vy={vy} gaTill={gaTill} />}
            {skarm === "ar" && vy.maskin && <ArSida rader={rader} vy={vy} gaTill={gaTill} />}
          </Tillstand>
        )}
      </div>
    </div>
  );
}

type SidProps = { rader: MaskinArRad[]; vy: Vy; gaTill: (patch: Partial<Vy>, ersatt?: boolean) => void };

function Fel({ slag }: { slag: HistorikFelSlag }) {
  return (
    <div style={{ paddingTop: AVSTAND.xl }}>
      <h1 style={{ margin: 0, ...TYP.rubrik }}>Kunde inte läsa historiken</h1>
      <p style={{ ...TYP.text, color: FARG.text2 }}>{felText(slag)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- LISTA

function listMeta(r: ListRad): string {
  const delar = [arSpann(r.arFran, r.arTill), `${r.antalObjekt} objekt`];
  const g = fmt(r.g15, 0);
  if (g) delar.push(`${g} h G15`);
  return delar.join(" · ");
}

function Lista({ rader, vy, gaTill }: SidProps) {
  const seg = vy.seg;
  const atgard: AtgardKod | null = seg === "skadaspecial" ? null : seg;
  const skordare = useMemo(() => (atgard ? skordarlista(rader, atgard, vy.antagna) : []), [rader, atgard, vy.antagna]);
  const skada = useMemo(() => skordarlista(rader, "skada", false), [rader]);
  const special = useMemo(() => skordarlista(rader, "special", false), [rader]);
  const skotare = useMemo(() => skotarlista(rader), [rader]);
  const antagna = atgard ? antagnaIAtgard(rader, atgard) : 0;
  // Maskinsidan öppnas i den åtgärd listan visar bara om maskinen har minst MIN_OBJEKT objekt där. Annars i den åtgärd maskinen har flest objekt i
  // (Rottne under Slutavverkning har ett objekt per år men 148 i gallring: man ska inte landa på ett enda objekt).
  const oppna = (r: ListRad, a: AtgardKod | null) => gaTill({ maskin: r.maskin, atgard: a !== null && r.antalObjekt >= MIN_OBJEKT ? a : null, ar: null, objekt: false });

  const rad_ = (r: ListRad, a: AtgardKod | null) => {
    const siffra = fmt(r.tal, r.talTyp === "index" ? 0 : 1);
    const notiser: string[] = [];
    if (r.talTyp === "index") {
      const f = fewObjects(r.antalMedIndex);
      if (f && siffra) notiser.push(`Index: ${f.toLowerCase()}`);
      if (r.forLite) notiser.push(FOR_LITE_DATA);
      else if (siffra === null) notiser.push("Index saknas: G15 under 2 timmar eller stammar saknas");
    } else {
      const f = fewObjects(r.antalObjekt);
      if (f) notiser.push(f);
      if (r.forLite) notiser.push(FOR_LITE_DATA);
      else if (siffra === null) notiser.push("m³/G15 saknas: G15 saknas i rapporten");
    }
    if (r.baserat) notiser.push(r.baserat[0].toUpperCase() + r.baserat.slice(1));
    if (atgard && r.antagna > 0 && vy.antagna) notiser.push(`Inkl. ${r.antagna} antagna objekt`);
    return <Listrad key={r.maskin} namn={r.maskin} meta={listMeta(r)} siffra={siffra ?? "–"} enhet={r.talTyp === "index" ? "viktat index" : "m³/G15"} notiser={notiser} onClick={() => oppna(r, a)} />;
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.m, marginTop: AVSTAND.xl }}>
        <h1 style={{ margin: 0, ...TYP.titel }}>Historik</h1>
        <a href="/admin/historik/jamfor" style={{ ...KNAPP.sekundar, width: "auto", textDecoration: "none", flexShrink: 0 }}>Jämför</a>
      </div>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>Produktionsrapporter 2011–2026 · bara admin. Index<IndexInfo atgard={indexAtgard(atgard)} rader={rader} /> jämför bara inom samma åtgärd.</p>

      <Sektion typ="skördare" titel="Skördare">
        <Vaxel
          varden={(["gallring", "slutavverkning", "skadaspecial"] as Segment[]).map((s) => ({ id: s, etikett: SEGMENT_ETIKETT[s] }))}
          valt={seg}
          onVal={(s) => gaTill({ seg: s }, true)}
        />
        {atgard && antagna > 0 && (
          <button type="button" aria-pressed={vy.antagna} onClick={() => gaTill({ antagna: !vy.antagna }, true)} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>
            {vy.antagna ? `Antagna ingår (${antagna}). Tryck för att ta bort` : `+${antagna} antagna objekt ingår inte. Tryck för att ta med`}
          </button>
        )}
        {atgard && !vy.antagna && antagna > 0 && (
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>Antagna = åtgärden är bara maskinstandard (Komatsu 941, Bear, AptMan), inte läst ur namn eller ämne.</p>
        )}
        <div style={{ marginTop: AVSTAND.s }}>
          {atgard ? (
            skordare.length ? skordare.map((r) => rad_(r, atgard)) : <Tomt text={`Inga skördare har objekt i ${ATGARD_ETIKETT[atgard].toLowerCase()} med åtgärd ur namn eller ämne.${antagna > 0 ? " Tryck på knappen ovan för att ta med antagna." : ""}`} />
          ) : (
            <>
              <h3 style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.micro, color: FARG.text2 }}>Skada</h3>
              {skada.length ? skada.map((r) => rad_(r, "skada")) : <Tomt text="Inga skadeobjekt." />}
              <h3 style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.micro, color: FARG.text2 }}>Special</h3>
              {special.length ? special.map((r) => rad_(r, "special")) : <Tomt text="Inga specialjobb." />}
              <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.m}px 0 0` }}>Skada och special har inget index. Siffran är m³/G15 och jämförs bara inom samma åtgärd.</p>
            </>
          )}
        </div>
      </Sektion>

      <Sektion typ="skotare" titel="Skotare">
        <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>Alla åtgärder tillsammans. {SKOTARE_UTAN_INDEX}</p>
        {skotare.map((r) => rad_(r, null))}
      </Sektion>
    </div>
  );
}

function Tomt({ text }: { text: string }) {
  return <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.m}px 0` }}>{text}</p>;
}

// ---------------------------------------------------------------------------------------------- MASKINSIDA

function MaskinSida({ rader, vy, gaTill }: SidProps) {
  const maskin = vy.maskin as string;
  const typ: MaskinTyp = rader.find((r) => r.maskin === maskin)?.typ ?? "skördare";
  const urval = vy.antagna ? "alla" : "namn";
  const rader_ = atgardsrader(rader, maskin, typ, vy.antagna);
  // vald åtgärd: den i hashen om den finns, annars den åtgärd maskinen har flest objekt i (skotare: alla åtgärder), annars första raden
  const finns = (a: AtgardKod | null) => rader_.some((r) => r.atgard === a);
  const dominerande = standardAtgard(rader, maskin, typ);
  const valdAtgard: AtgardKod | null = finns(vy.atgard) && (vy.atgard !== null || typ === "skotare") ? vy.atgard : finns(dominerande) ? dominerande : typ === "skotare" ? null : (rader_[0]?.atgard ?? null);
  const hela = rad(rader, maskin, valdAtgard, null, urval);
  const serie = rader.filter((r) => r.maskin === maskin && r.atgard === valdAtgard && r.urval === urval && r.ar !== null).sort((a, b) => (a.ar as number) - (b.ar as number));
  const valdRad = vy.ar !== null ? rad(rader, maskin, valdAtgard, vy.ar, urval) : hela;
  const ar = aren(rader, maskin, valdAtgard, urval);
  const ht = huvudtal(hela);
  const okanda = okandaObjekt(rader, maskin);
  const antagnaHar = rader_.find((r) => r.atgard === valdAtgard)?.antagna ?? 0;
  const index = harIndex(typ, valdAtgard);
  const atgLabel = valdAtgard === null ? "Alla åtgärder" : ATGARD_ETIKETT[valdAtgard];

  return (
    <div>
      <Tillbaka text="Historik" onClick={() => gaTill({ maskin: null, atgard: null, ar: null, objekt: false })} />
      <h1 style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.titel }}>{maskin}</h1>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0`, display: "flex", alignItems: "center", gap: AVSTAND.s }}>
        <span aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: maskinFarg(typ) }} />
        {typ === "skördare" ? "Skördare" : "Skotare"} · {ar.length ? arSpann(ar[0], ar[ar.length - 1]) : "–"}
      </p>

      {kandaLuckor(maskin).map((t) => (
        <p key={t} style={{ ...TYP.meta, color: FARG.text3, margin: `${AVSTAND.s}px 0 0` }}>{t}</p>
      ))}

      <div style={{ marginTop: AVSTAND.sektion }}>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>{atgLabel}</div>
        {ht.ord ? (
          <div style={{ ...TYP.rubrik, marginTop: AVSTAND.xs }}>{ht.ord}</div>
        ) : (
          <div style={{ display: "flex", alignItems: "baseline", gap: AVSTAND.s, marginTop: AVSTAND.xs }}>
            <span style={{ ...TYP.tal }}>{ht.varde}</span>
            <span style={{ ...TYP.meta, color: FARG.text2 }}>{ht.enhet}</span>
          </div>
        )}
        {hela && (
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>
            {hela.antal_objekt} objekt{fmt(hela.g15_h, 0) ? ` · ${fmt(hela.g15_h, 0)} h G15` : ""}
            {index ? ` · mot ${ATGARD_ETIKETT[valdAtgard as AtgardKod].toLowerCase()}kurvan` : ""}
            {!index && valdAtgard !== null ? " · jämförs inte med andra åtgärder" : ""}
          </div>
        )}
        {ht.baserat && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{ht.baserat}</div>}
        {hela && index && hela.viktat_index !== null && fewObjects(hela.antal_med_index) && <Notis text={`Index: ${(fewObjects(hela.antal_med_index) as string).toLowerCase()}`} />}
        {hela && !index && hela.m3_per_g15 !== null && fewObjects(hela.antal_med_g15) && <Notis text={fewObjects(hela.antal_med_g15) as string} />}
      </div>

      <Sektion titel="Åtgärd">
        {rader_.map((r) => (
          <Listrad
            key={String(r.atgard)}
            namn={r.etikett}
            meta={`${r.antalObjekt} objekt${fmt(r.g15, 0) ? ` · ${fmt(r.g15, 0)} h G15` : ""}`}
            siffra={r.harIndex ? (fmt(r.index, 0) ?? "–") : undefined}
            enhet={r.harIndex ? "viktat index" : undefined}
            notiser={[...(r.harIndex && r.antalMedIndex < MIN_OBJEKT ? [`Index: bygger på ${r.antalMedIndex} objekt`] : []), ...(!r.harIndex && r.antalObjekt < MIN_OBJEKT ? [`Bygger på ${r.antalObjekt} objekt`] : [])]}
            vald={r.atgard === valdAtgard}
            onClick={() => gaTill({ atgard: r.atgard, ar: null }, true)}
          />
        ))}
        {okanda > 0 && (
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.m}px 0 0` }}>
            {okanda} objekt saknar känd åtgärd{typ === "skotare" ? " och ingår bara i Alla åtgärder" : " och visas inte här"}.
          </p>
        )}
        {typ === "skördare" && antagnaHar > 0 && (
          <button type="button" aria-pressed={vy.antagna} onClick={() => gaTill({ antagna: !vy.antagna, ar: null }, true)} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>
            {vy.antagna ? `Antagna ingår (${antagnaHar}). Tryck för att ta bort` : `+${antagnaHar} antagna objekt ingår inte. Tryck för att ta med`}
          </button>
        )}
      </Sektion>

      {serie.length > 0 && (
        <Sektion titel={index ? <>År för år · viktat index<IndexInfo atgard={indexAtgard(valdAtgard)} rader={rader} /></> : "År för år · m³/G15"}>
          <Diagram rader={serie} valdAr={vy.ar} onVal={(a) => gaTill({ ar: a }, true)} farg={maskinFarg(typ)} referens={index ? 100 : undefined} etikett={index ? "Viktat index" : "m³/G15"} />
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>
            {index ? "100 = lika snabb som kurvan för åtgärden. " : ""}Tryck på ett år för detaljer. Dämpad stapel och n=… betyder färre än {MIN_OBJEKT} objekt.
          </p>
        </Sektion>
      )}

      {valdRad && (
        <Sektion titel={vy.ar !== null ? `Nyckeltal ${vy.ar}` : "Nyckeltal hela perioden"}>
          {nyckeltal(valdRad).map((n) => (
            <Nyckelrad key={n.etikett} {...n} />
          ))}
          {valdRad.antal_objekt < MIN_OBJEKT && <Notis text={`Alla siffror bygger på ${valdRad.antal_objekt} objekt`} />}
          {vy.ar !== null ? (
            <button type="button" onClick={() => gaTill({ objekt: true })} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.l }}>
              Visa de {valdRad.antal_objekt} objekten bakom {vy.ar}
            </button>
          ) : (
            <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.m}px 0 0` }}>Välj ett år i diagrammet för att se objekten bakom det.</p>
          )}
        </Sektion>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- ÅR (objekt)

function ArSida({ rader, vy, gaTill }: SidProps) {
  const maskin = vy.maskin as string;
  const ar = vy.ar;
  const typ: MaskinTyp = rader.find((r) => r.maskin === maskin)?.typ ?? "skördare";
  const [objekt, setObjekt] = useState<ObjektRad[] | null>(null);
  const [fel, setFel] = useState<HistorikFelSlag | null>(null);
  const [oppnar, setOppnar] = useState<string | null>(null);
  const [lankFel, setLankFel] = useState<string | null>(null);

  useEffect(() => {
    if (ar === null) return;
    let avbruten = false;
    setObjekt(null);
    hamtaObjekt(supabase, maskin, ar, vy.atgard, vy.antagna)
      .then((o) => { if (!avbruten) setObjekt(o); })
      .catch((e: unknown) => { console.error("historik: kunde inte läsa vy_hist_objekt_lista", e); if (!avbruten) setFel(felSlag(e)); });
    return () => { avbruten = true; };
  }, [maskin, ar, vy.atgard, vy.antagna]);

  async function oppnaRapport(o: ObjektRad) {
    if (!o.storage_path) return;
    setOppnar(o.sha256);
    setLankFel(null);
    try {
      const url = await signeradLank(supabase, o.storage_path);
      window.open(url, "_blank", "noopener");
    } catch {
      setLankFel("Kunde inte öppna rapporten. Försök igen; länken gäller bara i 60 sekunder.");
    } finally {
      setOppnar(null);
    }
  }

  const atgLabel = vy.atgard === null ? "Alla åtgärder" : ATGARD_ETIKETT[vy.atgard];
  const index = harIndex(typ, vy.atgard);
  return (
    <div>
      <Tillbaka text={maskin} onClick={() => gaTill({ objekt: false })} />
      <h1 style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.titel }}>{ar}</h1>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>
        {maskin} · {atgLabel}{objekt ? ` · ${objekt.length} objekt` : ""}{index && <> · index<IndexInfo atgard={indexAtgard(vy.atgard)} rader={rader} /></>}
      </p>
      {lankFel && <Notis text={lankFel} />}
      <div style={{ marginTop: AVSTAND.l }}>
        {fel ? (
          <p style={{ ...TYP.text, color: FARG.text2 }}>{felText(fel, "objekten")}</p>
        ) : objekt === null ? (
          <p style={{ ...TYP.text, color: FARG.text2 }}>Hämtar objekten bakom {ar} …</p>
        ) : objekt.length === 0 ? (
          <p style={{ ...TYP.text, color: FARG.text2 }}>Inga objekt för {ar} i den här åtgärden med åtgärd ur namn eller ämne. Antagna objekt tas med från maskinsidan.</p>
        ) : (
          objekt.map((o) => {
            const datum = o.startdatum && o.slutdatum && o.startdatum !== o.slutdatum ? `${o.startdatum} – ${o.slutdatum}` : (o.startdatum ?? o.rapportdatum ?? "datum saknas");
            const delar = [datum, o.g15_h !== null ? `${fmt(o.g15_h, 1)} h G15` : "G15 saknas i rapporten"];
            const fran = o.volym_kvalitet?.startsWith("fran_skordare_") ? " · Från skördare" : "";
            if (o.volym_m3fub !== null) delar.push(`${fmt(o.volym_m3fub, 0)} m³${fran || (o.volym_kvalitet && o.volym_kvalitet !== "lass_utan_storlek" ? " · Osäker" : "")}`);
            else delar.push(o.volym_kvalitet === "lass_utan_storlek" ? VOLYM_SAKNAS_LASS.toLowerCase() : "volym saknas");
            const meta2 = [o.forare ? `${o.forare}${o.forare_andel !== null ? ` ${procent(o.forare_andel)}` : ""}` : typ === "skördare" ? "Förare saknas i rapporten" : null, o.atgard !== vy.atgard ? ATGARD_ETIKETT[o.atgard] : null, o.urval === "standard" ? "antagen åtgärd" : null, o.atgard_kalla?.startsWith("kopplad_till_skordare") ? "åtgärd ur kopplad skördarrapport" : null].filter(Boolean).join(" · ");
            const notiser: string[] = [];
            if (o.volym_kvalitet === "osaker_lasstorlek") notiser.push("Osäker volym: lasstorleken ligger utanför 6–18 m³ och räknas inte med i m³/G15");
            else if (o.volym_kvalitet && o.volym_kvalitet !== "lass_utan_storlek" && !o.volym_kvalitet.startsWith("fran_skordare_")) notiser.push("Volymen är osäker i rapporten (lass × 1 m³ eller schablon)");
            if (o.antal_andra_utskrifter > 0) notiser.push(`${o.antal_andra_utskrifter} andra utskrifter av samma objekt räknas inte`);
            const siffra = index ? fmt(o.index, 0) : fmt(o.m3_per_g15, 1);
            return (
              <div key={o.sha256}>
                <Listrad
                  namn={o.objekt ?? "Namn saknas"}
                  meta={delar.join(" · ") + (meta2 ? `\n${meta2}` : "")}
                  siffra={siffra ?? "–"}
                  enhet={siffra === null ? (index ? "index saknas" : "m³/G15 saknas") : index ? "index" : "m³/G15"}
                  notiser={notiser}
                />
                {o.storage_path && (
                  <button type="button" onClick={() => oppnaRapport(o)} style={{ ...KNAPP.lank, marginLeft: AVSTAND.s }} disabled={oppnar === o.sha256}>
                    {oppnar === o.sha256 ? "Öppnar …" : o.filtyp === "pdf" ? "Originalrapport (PDF)" : `Ladda ned originalrapport (${(o.filtyp ?? "fil").toUpperCase()})`}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

