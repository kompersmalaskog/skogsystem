"use client";
// Förhandsvisningen före export, per förare och rad för rad: vad, löneart (kod + namn i Fortnox), antal, enhet.
// En rad som HAR antal men saknar kod är RÖD och förklarad. En frivillig löneart (premien) utan kod är orange: den hoppas över.
// Det som visas kommer ur dry_run-svaret — samma kodväg som den skarpa sändningen, så förhandsvisningen kan inte säga något annat.
import React, { useState } from "react";
import { AVSTAND, FARG, TNUM, TYP } from "@/lib/design/tokens";
import ManadRubrik from "@/components/design/ManadRubrik";
import { enhetForMangd, fmtMangd, loneartInfo, type Loneartkopplingar } from "@/lib/lonesystem/loneart";
import { antalBlockerande, type BlockerandeLoneart } from "@/lib/lonesystem/loneartSaknas";
import { arSandbar } from "@/lib/lonesystem/forarGodkannande";
import { Bekrafta, Kort, Lank, Lista, Primar, Rad, Sheet, Stod, Tertiar } from "./ui";

export type VisadLonerad = { loneart: string; mangd: string; kod: string | null; status: string };

/** Förarens lönerader: `lonerader` ur svaret; äldre svar utan den härleds ur raderna som skickas. */
export function lonerader(m: any): VisadLonerad[] {
  if (Array.isArray(m?.lonerader)) return m.lonerader;
  return (m?.rader || []).map((r: any) => ({ loneart: r.loneart, mangd: String(r.Number), kod: r.SalaryCode, status: "skickas" }));
}

const mangdText = (r: VisadLonerad) => `${fmtMangd(r.mangd)} ${enhetForMangd(loneartInfo(r.loneart)?.enhet ?? "", r.mangd)}`.trim();

export function LoneradLista({ rader }: { rader: VisadLonerad[]; kopplingar?: Loneartkopplingar }) {
  if (rader.length === 0) return <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Inga lönerader denna period.</p>;
  return (
    <div>
      {rader.map(r => {
        const info = loneartInfo(r.loneart);
        return (
          <div key={r.loneart} data-lonerad={r.loneart} data-status={r.status} style={{ padding: `${AVSTAND.xs}px 0` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: AVSTAND.s }}>
              <span style={{ ...TYP.meta, color: FARG.text }}>{info?.label ?? r.loneart}</span>
              <span style={{ ...TYP.meta, ...TNUM, color: FARG.text, fontWeight: TYP.listtitel.fontWeight, whiteSpace: "nowrap" }}>{mangdText(r)}</span>
            </div>
            {/* Koden och namnet i Fortnox står i Lönearter, inte på varje rad: en rad som skickas är bara namn och antal. */}
            {r.status === "saknar_kod" && (
              <div style={{ ...TYP.meta, color: FARG.text2 }}><span style={{ color: FARG.rod, fontWeight: TYP.listtitel.fontWeight }}>Saknar löneart</span> — skickas inte</div>
            )}
            {r.status === "valfri_utan_kod" && (
              <div style={{ ...TYP.meta, color: FARG.text2 }}><span style={{ color: FARG.orange, fontWeight: TYP.listtitel.fontWeight }}>Hoppas över</span> — frivillig, ingen kod</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Överst i förhandsvisningen när något HINDRAR sändningen. Den enda primärknappen på skärmen är då Koppla koder. */
export function SaknasKort({ blockerande, onKoppla }: { blockerande: BlockerandeLoneart[]; onKoppla: () => void }) {
  if (blockerande.length === 0) return null;
  const n = antalBlockerande(blockerande);
  return (
    <div data-saknas-banner="">
      <Kort style={{ marginBottom: AVSTAND.m }}>
        <p style={{ margin: 0, ...TYP.listtitel, color: FARG.rod }}>Kan inte skickas än</p>
        <p style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.text2 }}>
          {n} {n === 1 ? "rad" : "rader"} har ett antal men ingen löneart i Fortnox, och skickas därför inte.
        </p>
        <Lista style={{ background: "transparent", padding: 0 }}>
          {blockerande.map((b, i) => (
            <Rad key={b.loneart} rubrik={b.label} detalj={b.forare.map(f => `${f.namn} ${fmtMangd(f.mangd)} ${enhetForMangd(b.enhet, f.mangd)}`).join(", ")} sista={i === blockerande.length - 1} />
          ))}
        </Lista>
        <Primar onClick={onKoppla} style={{ marginTop: AVSTAND.m }}>Koppla koder</Primar>
      </Kort>
    </div>
  );
}

/**
 * Bekräftelsen före en skarp sändning. Finns det röda rader finns ingen "Skicka till Fortnox" här: valen är att koppla koderna eller
 * UTTRYCKLIGEN skicka utan raderna (ett andra steg som listar vad som uteblir och säger att de ALDRIG skickas senare — lönehanteraren
 * lägger in dem för hand). Först då går begäran iväg, med skicka_utan_saknade.
 */
export function SkickaDialog({ arbetsManad, data, blockerande, skickar, onKoppla, onSkicka, onStang }: {
  /** Arbetsmånaden ("2026-08"), huvudnamnet: dialogen säger "Augusti · lön i september". */
  arbetsManad: string;
  data: any;
  blockerande: BlockerandeLoneart[];
  skickar: boolean;
  onKoppla: () => void;
  onSkicka: (skickaUtanSaknade: boolean) => void;
  onStang: () => void;
}) {
  const [steg, setSteg] = useState<"val" | "bekrafta">("val");
  // Företagsledare har inga lönerader (lönen ligger utanför appen) och står inte i listan. Förarens godkännande styr: bara de som godkänt skickas,
  // de som väntar står kvar utan att skickas (Martin 2026-10-21).
  const medarbetare: any[] = (data.medarbetare || []).filter((m: any) => !m.foretagsledare);
  const skickas = medarbetare.filter(m => arSandbar(m) && m.anstallningsnummer);
  const vantar = medarbetare.filter(m => m.status !== "skickat" && !arSandbar(m));
  const antalLon = skickas.length;
  const radAntal = skickas.reduce((n, m) => n + (m.rader?.length ?? 0), 0);
  const harVarningar = skickas.some(m => m.varningar?.length > 0);
  const spard = blockerande.length > 0;
  const utan = blockerande.flatMap(b => b.forare.map(f => `${b.label} ${fmtMangd(f.mangd)} ${enhetForMangd(b.enhet, f.mangd)} (${f.namn})`));

  return (
    <Sheet titel={`Skicka ${antalLon} till Fortnox?`} vyNyckel={steg} onStang={onStang} attr={{ "data-skicka-dialog": "" }}
      vanster={<Lank smal onClick={onStang}>Avbryt</Lank>}>
      {/* Steg 2 handlar bara om det som uteblir: förarlistan vore bara scroll före varningen. */}
      {steg === "val" && (
        <>
          <Stod farg={FARG.text} style={{ marginTop: 0, ...TYP.listtitel }}><ManadRubrik arbetsManad={arbetsManad} /></Stod>
          <Stod style={{ marginTop: 0 }}>{antalLon} förare · {radAntal} lönerader</Stod>
          {vantar.length > 0 && <Stod attr={{ "data-vantar-dialog": "" }}>{vantar.length} väntar på föraren och skickas inte.</Stod>}
          {harVarningar && <Stod farg={FARG.orange}>Det finns saker att kolla — granska innan du skickar.</Stod>}

          <Lista style={{ marginTop: AVSTAND.m }}>
            {medarbetare.map((m, i) => (
              <Rad key={i} rubrik={m.namn} hoger={`${m.rader.length} rader`}
                detalj={m.status === "skickat" ? <span style={{ color: FARG.gron }}>Redan skickat</span>
                  : !arSandbar(m) ? <span style={{ color: FARG.text2 }}>Väntar på föraren – skickas inte</span>
                  : !m.anstallningsnummer ? <span style={{ color: FARG.rod }}>Saknar anst.nr</span> : undefined}
                sista={i === medarbetare.length - 1} />
            ))}
          </Lista>
        </>
      )}

      <div style={{ marginTop: steg === "val" ? AVSTAND.l : 0 }}>
        {!spard && (
          <Primar onClick={() => onSkicka(false)} disabled={skickar}>{skickar ? "Skickar…" : `Skicka ${antalLon} till Fortnox`}</Primar>
        )}

        {spard && steg === "val" && (
          <>
            <Stod farg={FARG.rod} style={{ marginTop: 0, marginBottom: AVSTAND.m }}>
              Det går inte att skicka allt: {utan.join(", ")} saknar löneart i Fortnox.
            </Stod>
            <Primar onClick={onKoppla}>Koppla koder</Primar>
            <div style={{ marginTop: AVSTAND.s, display: "flex", justifyContent: "center" }}>
              <Tertiar smal onClick={() => setSteg("bekrafta")}>Skicka utan dessa rader</Tertiar>
            </div>
          </>
        )}

        {spard && steg === "bekrafta" && (
          <Bekrafta
            text={<>
              <strong>Raderna skickas aldrig senare.</strong><br />
              Det här går inte till Fortnox:
              {utan.map(u => <React.Fragment key={u}><br />• {u}</React.Fragment>)}
              <br />
              Lönehanteraren måste lägga in dem för hand i Fortnox. De läggs inte på senare, varken nästa gång du skickar eller av sig själva — förarna räknas som skickade.
            </>}
            ja={skickar ? "Skickar…" : "Skicka utan raderna"} nej="Tillbaka" upptagen={skickar}
            onJa={() => onSkicka(true)} onNej={() => setSteg("val")} />
        )}
      </div>
    </Sheet>
  );
}
