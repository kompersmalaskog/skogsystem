'use client';

// "Lass idag" — lassregistrering i arbetsrapporten för maskiner utan automatisk källa
// (dim_maskin.datakalla = 'manuell', JD810E). Ett block per objekt: objekt, antal lass
// (stepper), m³fub per lass (stepper), summa. Spara ersätter dagens manuella rader i
// fakt_lass för dag + maskin + objekt (lib/lass/manuellaLass) — raderna ligger i
// fakt_lass som alla andras. Redigerbart de senaste 7 dagarna, admin alltid; därefter
// läst. Komponenten avgör själv om den ska synas (maskinens datakälla).
// Tomt läge: arbetsdag med timmar utan registrerade lass → "Inga lass registrerade" (orange).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, KORT, RADIE, TNUM, TRAFFYTA, TYP, VIKT } from "@/lib/design/tokens";
import {
  LAST_TEXT, MANUELL_FILNAMN, MAX_LASS_PER_DAG, MAX_M3_PER_LASS, STANDARD_M3_PER_LASS,
  farRedigera, grupperaPerObjekt, senasteVarden, sparaManuellaLass, summaText, supabaseLassPort, taBortManuellaLass,
} from "@/lib/lass/manuellaLass";

export type LassObjekt = { id: string; namn: string; vo?: string | null; status?: string | null };

type Props = {
  datum: string;
  /** Dagens datum (lokalt) — 7-dagarsregeln räknas härifrån. */
  idag: string;
  maskinId: string | null;
  medarbetareId: string | null;
  arAdmin: boolean;
  dagensObjektId: string | null;
  objektLista: LassObjekt[];
  /** Dagen har rapporterade timmar — då är "inga lass" en avvikelse (orange). */
  harTimmar: boolean;
  /** 'kort' = eget kort (dagsvyn); 'rad' = inuti ett befintligt kort (redigera-vyn). */
  variant?: "kort" | "rad";
};

type Block = {
  objektId: string | null;
  antal: number;
  m3: number;
  sparat: { antal: number; m3: number } | null;
  sparar: boolean;
  fel: string | null;
  taBortSteg: 0 | 1;
};

const port = supabaseLassPort(supabase);

/** Äldre statusvärden sorteras som i arbetsrapportens objektväljare. */
function grupp(o: LassObjekt): "pagaende" | "planerad" | "avslutad" {
  const s = (o.status || "").toLowerCase();
  if (s === "pagaende" || s === "skordning" || s === "skotning") return "pagaende";
  if (s === "avslutat" || s === "klar") return "avslutad";
  return "planerad";
}

export default function LassIdag({ datum, idag, maskinId, medarbetareId, arAdmin, dagensObjektId, objektLista, harTimmar, variant = "kort" }: Props) {
  const [datakalla, setDatakalla] = useState<"laddar" | "auto" | "manuell">("laddar");
  const [block, setBlock] = useState<Block[] | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [valjareFor, setValjareFor] = useState<number | null>(null);
  const [laddFel, setLaddFel] = useState(false);

  const kanRedigera = farRedigera(datum, idag, arAdmin);
  const namnFor = (id: string | null) => (id ? objektLista.find(o => o.id === id)?.namn || id : null);

  // Maskinens datakälla — bara 'manuell' visar kortet. Saknas kolumnen (migrationen inte
  // körd) behandlas maskinen som 'auto': kortet syns inte, inget går sönder.
  useEffect(() => {
    let avbruten = false;
    setDatakalla("laddar");
    if (!maskinId) { setDatakalla("auto"); return; }
    supabase.from("dim_maskin").select("datakalla").eq("maskin_id", maskinId).maybeSingle().then(({ data, error }) => {
      if (avbruten) return;
      if (error) { console.warn("[lass] dim_maskin.datakalla kunde inte läsas", error.message); setDatakalla("auto"); return; }
      setDatakalla((data as any)?.datakalla === "manuell" ? "manuell" : "auto");
    });
    return () => { avbruten = true; };
  }, [maskinId]);

  // Dagens sparade rader, maskinens senaste värden (default) och förarens operator-id på maskinen.
  useEffect(() => {
    if (datakalla !== "manuell" || !maskinId) return;
    let avbruten = false;
    setBlock(null); setLaddFel(false);
    Promise.all([
      supabase.from("fakt_lass").select("objekt_id, lass_nummer, volym_m3sub").eq("filnamn", MANUELL_FILNAMN).eq("maskin_id", maskinId).eq("datum", datum),
      supabase.from("fakt_lass").select("datum, objekt_id, lass_nummer, volym_m3sub").eq("filnamn", MANUELL_FILNAMN).eq("maskin_id", maskinId)
        .order("datum", { ascending: false }).order("lass_nummer", { ascending: false }).limit(60),
      medarbetareId ? supabase.from("operator_medarbetare").select("operator_id").eq("medarbetare_id", medarbetareId) : Promise.resolve({ data: [], error: null }),
    ]).then(([dagens, senaste, om]) => {
      if (avbruten) return;
      if (dagens.error || senaste.error) { console.error("[lass] kunde inte läsa fakt_lass", dagens.error || senaste.error); setLaddFel(true); setBlock([]); return; }
      const egna = ((om.data as any[]) || []).map(r => String(r.operator_id)).find(id => id.startsWith(`${maskinId}_`)) ?? null;
      setOperatorId(egna);
      const sparade = grupperaPerObjekt((dagens.data as any[]) || []);
      const def = senasteVarden((senaste.data as any[]) || []);
      const b: Block[] = sparade.map(s => ({ objektId: s.objektId, antal: s.antal, m3: s.m3PerLass, sparat: { antal: s.antal, m3: s.m3PerLass }, sparar: false, fel: null, taBortSteg: 0 }));
      if (b.length === 0) b.push({ objektId: dagensObjektId, antal: def?.antal ?? 1, m3: def?.m3PerLass ?? STANDARD_M3_PER_LASS, sparat: null, sparar: false, fel: null, taBortSteg: 0 });
      setBlock(b);
    });
    return () => { avbruten = true; };
    // dagensObjektId styr bara defaulten på ett tomt block — ingen omladdning när den ändras.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datakalla, maskinId, datum, medarbetareId]);

  const upp = (i: number, patch: Partial<Block>) => setBlock(b => (b ? b.map((x, k) => (k === i ? { ...x, ...patch } : x)) : b));

  async function spara(i: number) {
    const b = block?.[i];
    if (!b || !b.objektId || !maskinId) return;
    upp(i, { sparar: true, fel: null });
    const r = await sparaManuellaLass(port, { datum, maskinId, objektId: b.objektId }, b.antal, b.m3, operatorId, { idag, arAdmin });
    if (r.ok) upp(i, { sparar: false, sparat: { antal: b.antal, m3: b.m3 } });
    else upp(i, { sparar: false, fel: r.fel });
    if (r.ok && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
  }

  async function taBort(i: number) {
    const b = block?.[i];
    if (!b || !b.objektId || !maskinId) return;
    upp(i, { sparar: true, fel: null });
    const r = await taBortManuellaLass(port, { datum, maskinId, objektId: b.objektId }, { idag, arAdmin });
    if (!r.ok) { upp(i, { sparar: false, fel: r.fel, taBortSteg: 0 }); return; }
    setBlock(bl => {
      const rest = (bl || []).filter((_, k) => k !== i);
      return rest.length > 0 ? rest : [{ objektId: dagensObjektId, antal: b.antal, m3: b.m3, sparat: null, sparar: false, fel: null, taBortSteg: 0 }];
    });
  }

  const laggTill = () => setBlock(b => {
    const ny: Block = { objektId: null, antal: b?.[0]?.antal ?? 1, m3: b?.[0]?.m3 ?? STANDARD_M3_PER_LASS, sparat: null, sparar: false, fel: null, taBortSteg: 0 };
    const nya = [...(b || []), ny];
    setValjareFor(nya.length - 1);
    return nya;
  });

  const valbara = useMemo(() => {
    const upptagna = new Set((block || []).map(b => b.objektId).filter(Boolean) as string[]);
    const lista = objektLista.filter(o => grupp(o) !== "avslutad" && !upptagna.has(o.id));
    return { pagaende: lista.filter(o => grupp(o) === "pagaende"), planerade: lista.filter(o => grupp(o) === "planerad") };
  }, [objektLista, block]);

  if (datakalla !== "manuell") return null;

  const rubrik = datum === idag ? "Lass idag" : "Lass";
  const ingaSparade = !!block && block.every(b => !b.sparat);
  const allaSparade = !!block && block.length > 0 && block.every(b => !!b.sparat);
  const wrap: React.CSSProperties = variant === "kort"
    ? { ...KORT, marginTop: AVSTAND.m }
    : { padding: `${AVSTAND.l}px 0 0`, borderTop: `1px solid ${FARG.linje}` };

  const stepper = (label: string, value: number, min: number, max: number, onChange: (v: number) => void, enhet?: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.s, minHeight: TRAFFYTA.min, padding: `${AVSTAND.xs}px 0` }}>
      <span style={{ ...TYP.meta, color: FARG.text2 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: AVSTAND.s }}>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Minska ${label}`} disabled={value <= min}
          style={{ ...KNAPP.sekundar, width: TRAFFYTA.min, padding: 0, ...TYP.rubrik, ...(value <= min ? INAKTIV : {}) }}>−</button>
        <span style={{ ...TYP.rubrik, ...TNUM, color: FARG.text, minWidth: 44, textAlign: "center" }}>{value}{enhet ? <span style={{ ...TYP.meta, color: FARG.text2 }}> {enhet}</span> : null}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Öka ${label}`} disabled={value >= max}
          style={{ ...KNAPP.sekundar, width: TRAFFYTA.min, padding: 0, ...TYP.rubrik, ...(value >= max ? INAKTIV : {}) }}>+</button>
      </div>
    </div>
  );

  return (
    <section style={wrap} aria-label={rubrik}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: AVSTAND.s }}>
        <p style={{ margin: 0, ...TYP.listtitel, color: FARG.text }}>{rubrik}</p>
        <span style={{ ...TYP.meta, color: FARG.text2 }}>{kanRedigera ? "Manuell registrering" : LAST_TEXT}</span>
      </div>

      {block == null ? (
        <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Laddar lass…</p>
      ) : (
        <>
          {laddFel && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.rod }}>Kunde inte läsa dagens lass – ladda om sidan.</p>}

          {/* Tomt läge: timmar rapporterade men inga lass — en avvikelse, i ord och färg. */}
          {harTimmar && ingaSparade && !laddFel && (
            <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, color: FARG.orange, display: "flex", alignItems: "center", gap: AVSTAND.xs }}>
              <span className="material-symbols-outlined" style={{ fontSize: IKON.text }}>warning</span>
              Inga lass registrerade
            </p>
          )}

          {!kanRedigera ? (
            // Läst: bara det som finns.
            block.filter(b => b.sparat).map(b => (
              <p key={b.objektId ?? "x"} style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, ...TNUM, color: FARG.text }}>
                {namnFor(b.objektId)} · {summaText(b.sparat!.antal, b.sparat!.m3)}
              </p>
            ))
          ) : (
            block.map((b, i) => {
              const dirty = !b.sparat || b.sparat.antal !== b.antal || b.sparat.m3 !== b.m3;
              const kanSpara = dirty && !!b.objektId && !b.sparar;
              return (
                <div key={i} style={{ marginTop: AVSTAND.m, background: FARG.upphojt, borderRadius: RADIE.kort, padding: `${AVSTAND.s}px ${AVSTAND.m}px ${AVSTAND.m}px` }}>
                  {/* Objekt — valbart tills blocket är sparat (byt objekt = ta bort + lägg till). */}
                  <button type="button" onClick={() => { if (!b.sparat) setValjareFor(i); }} disabled={!!b.sparat}
                    style={{ ...KNAPP.tertiar, display: "flex", width: "100%", justifyContent: "space-between", gap: AVSTAND.s, cursor: b.sparat ? "default" : "pointer" }}>
                    <span style={{ ...TYP.meta, color: FARG.text2 }}>Objekt</span>
                    <span style={{ display: "flex", alignItems: "center", gap: AVSTAND.xs, minWidth: 0 }}>
                      <span style={{ ...TYP.listtitel, color: b.objektId ? FARG.text : FARG.bla, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {namnFor(b.objektId) || "Välj objekt"}
                      </span>
                      {!b.sparat && <span className="material-symbols-outlined" style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>}
                    </span>
                  </button>
                  {stepper("Antal lass", b.antal, 1, MAX_LASS_PER_DAG, v => upp(i, { antal: v }))}
                  {stepper("m³fub per lass", b.m3, 1, MAX_M3_PER_LASS, v => upp(i, { m3: v }))}
                  <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.text, ...TNUM, color: FARG.text }}>{summaText(b.antal, b.m3)}</p>

                  {b.taBortSteg === 1 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: AVSTAND.s, marginTop: AVSTAND.m }}>
                      <button type="button" onClick={() => upp(i, { taBortSteg: 0 })} style={{ ...KNAPP.sekundar }}>Behåll</button>
                      <button type="button" onClick={() => taBort(i)} disabled={b.sparar} style={{ ...KNAPP.sekundar, color: FARG.rod }}>{b.sparar ? "Tar bort…" : `Ta bort ${b.sparat?.antal ?? b.antal} lass`}</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => spara(i)} disabled={!kanSpara}
                      style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m, ...(kanSpara ? {} : INAKTIV) }}>
                      {b.sparar ? "Sparar…" : b.sparat && !dirty ? "Sparat" : "Spara"}
                    </button>
                  )}
                  {b.fel && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.rod }}>{b.fel}</p>}
                  {b.sparat && b.taBortSteg === 0 && (
                    <div style={{ display: "flex", justifyContent: "center", marginTop: AVSTAND.xs }}>
                      <button type="button" onClick={() => upp(i, { taBortSteg: 1 })} style={{ ...KNAPP.tertiar, color: FARG.text2 }}>Ta bort</button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {kanRedigera && allaSparade && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: AVSTAND.xs }}>
              <button type="button" onClick={laggTill} style={KNAPP.tertiar}>
                <span className="material-symbols-outlined" style={{ fontSize: IKON.text }}>add</span>
                Lägg till objekt
              </button>
            </div>
          )}
        </>
      )}

      {/* Objektväljare — pågående först, sedan planerade; avslutade och redan valda visas inte. */}
      {valjareFor != null && (
        <div onClick={() => setValjareFor(null)} className="tona-opacity" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} className="sheet-upp"
            style={{ width: "100%", maxWidth: 520, background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, maxHeight: "70vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: `${AVSTAND.l}px`, borderBottom: `1px solid ${FARG.linje}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>Välj objekt</h3>
              <button type="button" onClick={() => setValjareFor(null)} style={KNAPP.lank}>Stäng</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: `0 ${AVSTAND.l}px ${AVSTAND.xl}px` }}>
              {([["Pågående", valbara.pagaende], ["Planerade", valbara.planerade]] as const).map(([r, lista]) => lista.length === 0 ? null : (
                <div key={r}>
                  <p style={{ margin: `${AVSTAND.l}px 0 ${AVSTAND.xs}px`, ...TYP.micro, color: FARG.text2 }}>{r}</p>
                  {lista.map(o => (
                    <button key={o.id} type="button" onClick={() => { upp(valjareFor, { objektId: o.id }); setValjareFor(null); }}
                      style={{ ...KNAPP.tertiar, display: "flex", width: "100%", justifyContent: "space-between", gap: AVSTAND.s, borderBottom: `1px solid ${FARG.linje}`, textAlign: "left" }}>
                      <span style={{ ...TYP.text, color: FARG.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.namn}</span>
                      {o.vo && <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2, flexShrink: 0 }}>{o.vo}</span>}
                    </button>
                  ))}
                </div>
              ))}
              {valbara.pagaende.length + valbara.planerade.length === 0 && (
                <p style={{ margin: `${AVSTAND.l}px 0`, ...TYP.meta, color: FARG.text2 }}>Inga fler objekt att välja — pågående och planerade objekt kommer från trakt-importen.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export const _internt = { grupp, VIKT };
