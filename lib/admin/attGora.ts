// Översiktens att-göra-lista — ren uppbyggnad. Inga nya trösklar: varje rad kommer ur en regel som redan
// finns i admin (Att åtgärda i Medarbetare, Maskiners nya-lista, Vilobrott, Avtal, Datahälsa).
//
// Bara det admin ska GÖRA (Martin 2026-10-21): inget som "stämmer", ingen räknare över dagar. Varje rad är en rubrik och högst en kort
// undertext — inga namn- eller datumlistor på raden (de ligger bakom trycket). Lönen, vilobrotten och arbetstiden är EN rad var.
//
// Indatat är resultat per källa. En källa som inte gick att läsa blir en egen rad ("Kunde inte kontrollera
// …"), aldrig en tyst nolla: ett läsfel är inte "inget väntar".
import type { MedarbetarKontroller } from "@/lib/medarbetarKontroll";
import type { LeveransRad } from "@/app/datahalsa/useDatahalsa";
import { LEV_GUL_DYGN } from "@/app/datahalsa/useDatahalsa";
import type { VilobrottRad } from "@/lib/admin/vilobrottLista";
import { sorteraAttGora, type ArbetstidForare } from "@/lib/arbetstidsgranser";
import { godkannandeAv } from "@/lib/lonesystem/forarGodkannande";

export type AdminFlik = "oversikt" | "medarbetare" | "maskiner" | "lon" | "avtal";

/** Vart en rad leder: en flik (med underflik/parametrar), en annan sida, eller en ny läsning. */
export type Mal =
  | { typ: "flik"; flik: AdminFlik; underflik?: string; params?: Record<string, string> }
  | { typ: "sida"; href: string }
  /** Vilobrotten: en person → hennes ark med dagarna brotten gäller; utan person → listan över vem som har obesvarade (Översikten öppnar det på plats). */
  | { typ: "vilobrott"; medarbetare_id?: string }
  /** Arbetstid: förarna nära eller över en gräns, i ett ark på plats. */
  | { typ: "arbetstid" }
  | { typ: "forsok" };

export type Sak = {
  id: string; rubrik: string; detalj?: string; knapp: string; mal: Mal;
  /** false = raden syns men kräver ingen åtgärd nu och räknas inte i siffran (menyn, rubriken). Saknas = räknas. */
  raknas?: false;
};

/** Antalet rader som kräver åtgärd nu — menyns siffra och Översiktens rubrik. */
export const antalKraver = (saker: Sak[]) => saker.filter(s => s.raknas !== false).length;

/** Resultat av en läsning: data, eller felet som stoppade den. */
export type Kalla<T> = { data: T | null; fel: string | null };

export type Person = { id: string; namn: string | null; user_id: string | null };
export type MaskinRad = { maskin_id: string; visningsnamn: string | null; modell: string | null; bekraftad: boolean; aktiv_till: string | null };
/** Lönen för arbetsmånaden: klara = förarens godkännande finns (Admin skickar dem), väntar = föraren har inte godkänt, skickade = redan i Fortnox. */
export type LonLage = { arbetsManad: string; antalKlara: number; antalVantar: number; antalSkickade: number };
export type AvtalRad = { giltigt_till: string | null };

export type ArbetstidSvar = { forare: ArbetstidForare[]; varningar: string[] };

export type AttGoraIndata = {
  kontroller: Kalla<MedarbetarKontroller>;
  personer: Kalla<Person[]>;
  maskiner: Kalla<MaskinRad[]>;
  lon: Kalla<LonLage>;
  vilobrott: Kalla<VilobrottRad[]>;
  avtal: Kalla<AvtalRad | null>;
  /** Lagkontrollen för arbetstid (/api/lon/arbetstid): alla förare med data, sex gränser var. */
  arbetstid: Kalla<ArbetstidSvar>;
  leverans: Kalla<LeveransRad[]>;
};

const MANADER = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

export const manadNamn = (ym: string) => MANADER[Number(ym.slice(5, 7)) - 1] || ym;
export const datumLangt = (d: string) => `${Number(d.slice(8, 10))} ${MANADER[Number(d.slice(5, 7)) - 1] || ""} ${d.slice(0, 4)}`;

const dygn = (n: number) => `${n} dygn`;
const dagar = (n: number) => `${n} ${n === 1 ? "dag" : "dagar"}`;

/** Avtalet "går ut inom en månad" = slutdatumet är högst 31 dagar bort, eller redan passerat. */
export function avtalKraverDig(giltigtTill: string | null, idag: string): "utgatt" | "snart" | null {
  const d = (giltigtTill || "").slice(0, 10);
  if (!d) return null;
  if (d < idag) return "utgatt";
  const dagarKvar = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${idag}T12:00:00Z`)) / 86400000);
  return dagarKvar <= 31 ? "snart" : null;
}

/**
 * Lönens läge för arbetsmånaden ur det som redan finns: vilka förare som har dagar, vilka som godkänt (loneunderlag) och vilka som
 * skickats (fortnox_export_logg). Företagsledare har ingen lön i appen och räknas inte. Skickad vinner över godkänd.
 */
export function raknaLonLage(i: {
  arbetsManad: string;
  /** Förare med minst en arbetsdag i arbetsmånaden. */
  medDagar: string[];
  foretagsledare: string[];
  /** loneunderlag för arbetsmånaden: status per förare. */
  underlag: { medarbetare_id: string; status: string | null }[];
  /** Förare som finns som skickade i Fortnox-loggen för löneperioden. */
  skickade: string[];
}): LonLage {
  const ledare = new Set(i.foretagsledare);
  const med = Array.from(new Set(i.medDagar)).filter(id => !ledare.has(id));
  const skickade = new Set(i.skickade);
  const godkanda = new Set(i.underlag.filter(u => godkannandeAv(u.status) === "godkand").map(u => u.medarbetare_id));
  let antalKlara = 0, antalVantar = 0, antalSkickade = 0;
  for (const id of med) {
    if (skickade.has(id)) antalSkickade++;
    else if (godkanda.has(id)) antalKlara++;
    else antalVantar++;
  }
  return { arbetsManad: i.arbetsManad, antalKlara, antalVantar, antalSkickade };
}

/** "3 klara · 2 väntar på föraren" — en del som är noll skrivs inte (inget "0 klara"). */
export function lonUndertext(l: Pick<LonLage, "antalKlara" | "antalVantar">): string {
  const delar: string[] = [];
  if (l.antalKlara > 0) delar.push(`${l.antalKlara} ${l.antalKlara === 1 ? "klar" : "klara"}`);
  if (l.antalVantar > 0) delar.push(`${l.antalVantar} väntar på föraren`);
  return delar.join(" · ");
}

/**
 * Läsvarningen om flyttdagar som saknar förare (/api/lon/arbetstid) hör till arbetstidens detaljer, inte till Översiktens rader: den visas i
 * arket men gör aldrig ensam att raden "Arbetstid" finns. Alla andra varningar är läsfel som påverkar talen och gör det.
 */
export const arFlyttdagUtanForare = (varning: string) => /flyttdag(ar)? kunde inte kopplas till en förare/.test(varning);

export type AttGoraUt = {
  saker: Sak[];
  /** Förare som är gula eller röda på någon arbetstidsgräns, röda först. Tom när ingen närmar sig eller källan fallerade. Visas i arket bakom raden "Arbetstid". */
  arbetstid: ArbetstidForare[];
  /** Alla varningar från arbetstidskällan (läsfel och flyttdagar utan förare) — visas i arket, aldrig tyst. */
  arbetstidVarningar: string[];
};

export function byggAttGora(i: AttGoraIndata, idag: string): AttGoraUt {
  const saker: Sak[] = [];
  const felRad = (id: string, vad: string, fel: string) =>
    saker.push({ id: `fel-${id}`, rubrik: `Kunde inte kontrollera ${vad}`, detalj: fel, knapp: "Försök igen", mal: { typ: "forsok" } });

  // ── Lön: EN rad. "N klara · M väntar på föraren". Är allt skickat finns ingen rad. ──
  if (i.lon.fel) felRad("lon", "lönen", i.lon.fel);
  else if (i.lon.data) {
    const l = i.lon.data;
    if (l.antalKlara + l.antalVantar > 0) {
      saker.push({
        id: "lon", rubrik: `Lönen för ${manadNamn(l.arbetsManad)}`, detalj: lonUndertext(l),
        knapp: "Öppna", mal: { typ: "flik", flik: "lon", underflik: "underlag" },
      });
    }
  }

  // ── Vilobrott: EN rad. Vem och vilka dagar ligger bakom trycket. ──
  if (i.vilobrott.fel) felRad("vilobrott", "vilobrott", i.vilobrott.fel);
  else if (i.vilobrott.data) {
    const obesvarade = i.vilobrott.data.filter(b => !b.svar);
    if (obesvarade.length > 0) {
      const personer = Array.from(new Set(obesvarade.map(b => b.medarbetare_id)));
      saker.push({
        id: "vila", rubrik: "Vilobrott", detalj: `${obesvarade.length} ${obesvarade.length === 1 ? "obesvarat" : "obesvarade"}`,
        // En enda person: rakt till hennes dagar (en lista med en rad vore ett onödigt tryck).
        knapp: "Öppna", mal: personer.length === 1 ? { typ: "vilobrott", medarbetare_id: personer[0] } : { typ: "vilobrott" },
      });
    }
  }

  // ── Arbetstid: EN rad. Lagens sex gränser (lib/arbetstidsgranser); förarna och gränserna ligger i arket. ──
  let arbetstid: ArbetstidForare[] = [];
  let arbetstidVarningar: string[] = [];
  if (i.arbetstid.fel) felRad("arbetstid", "arbetstiden", i.arbetstid.fel);
  else if (i.arbetstid.data) {
    // Delägare (arbetstidslagen gäller inte) räknas aldrig. Gul från 90 % av gränsen, röd över: att varna FÖRE gränsen är poängen (Martin 2026-10-17).
    arbetstid = sorteraAttGora(i.arbetstid.data.forare).filter(f => !f.foretagsledare);
    arbetstidVarningar = i.arbetstid.data.varningar;
    const lasFel = arbetstidVarningar.filter(v => !arFlyttdagUtanForare(v));
    const over = arbetstid.filter(f => f.varsta === "rod").length;
    if (arbetstid.length > 0) {
      saker.push({
        id: "arbetstid", rubrik: `${arbetstid.length} förare nära arbetstidsgränsen`,
        // Ordet bär meningen när någon redan passerat gränsen (färgen förstärker bara).
        detalj: over > 0 ? `${over} över gränsen` : undefined,
        knapp: "Öppna", mal: { typ: "arbetstid" },
        // Gul = varna före gränsen: raden syns, men en förare som bara är NÄRA kräver ingen åtgärd nu. Röd (över) gör det.
        ...(over === 0 ? { raknas: false as const } : {}),
      });
    } else if (lasFel.length > 0) {
      // Inga förare att peka ut — men talen bygger på en läsning som föll: det är inte "ingen närmar sig".
      saker.push({ id: "arbetstid", rubrik: "Arbetstiden kunde inte kontrolleras helt", knapp: "Öppna", mal: { typ: "arbetstid" } });
    }
  }

  // ── Personer: saknar maskin, hempunkt eller inloggning ──
  const personProblem = new Map<string, { namn: string; problem: string[] }>();
  const lagg = (id: string, namn: string, p: string) => {
    const e = personProblem.get(id) || { namn, problem: [] as string[] };
    e.problem.push(p); personProblem.set(id, e);
  };
  if (i.kontroller.fel) felRad("personer", "personerna", i.kontroller.fel);
  else if (i.kontroller.data) {
    for (const f of i.kontroller.data.forareUtanMaskin) lagg(f.id, f.namn, "saknar maskin");
    for (const h of i.kontroller.data.saknarHempunkt) {
      lagg(h.id, h.namn, h.orsak === "ingen_adress" ? "saknar hemadress" : h.orsak === "osaker" ? "hemadressen är osäker" : h.orsak === "misslyckad" ? "hemadressen hittades inte" : "hemadressen väntar på geokodning");
    }
  }
  // Geokodade hempunkter som ingen sett på kartan: km räknas redan, men punkten är inte kontrollerad. En rad per person
  // som leder till personen, där kartan med "Stämmer" / "Flytta punkten" finns.
  if (i.kontroller.data) {
    for (const h of i.kontroller.data.obekraftadHempunkt ?? []) {
      saker.push({
        id: `hempunkt-${h.id}`, rubrik: `Hempunkten är inte bekräftad – ${h.namn}`,
        detalj: "Km räknas från en punkt ingen har sett på kartan",
        knapp: "Öppna", mal: { typ: "flik", flik: "medarbetare", params: { person: h.id } },
      });
    }
  }
  if (i.personer.fel) felRad("inloggning", "inloggningarna", i.personer.fel);
  else if (i.personer.data) for (const p of i.personer.data) if (!p.user_id) lagg(p.id, p.namn || "Namnlös", "ingen inloggning kopplad");
  personProblem.forEach((e, id) => {
    saker.push({ id: `person-${id}`, rubrik: e.namn, detalj: e.problem.join(" · "), knapp: "Öppna", mal: { typ: "flik", flik: "medarbetare", params: { person: id } } });
  });

  // ── Okänd operatör vars namn matchar en medarbetare ──
  if (i.kontroller.data) {
    for (const o of i.kontroller.data.okandaOperatorer) {
      saker.push({
        id: `operator-${o.operator_id}`,
        rubrik: `Operatören "${o.operator_namn}" matchar ${o.medarbetare.namn}`,
        detalj: `${dagar(o.datum.length)} utan koppling, tiden når inte lönen`,
        knapp: "Öppna", mal: { typ: "flik", flik: "medarbetare" },
      });
    }
  }

  // ── Ny maskin i importen ──
  if (i.maskiner.fel) felRad("maskiner", "maskinerna", i.maskiner.fel);
  else if (i.maskiner.data) {
    const nya = i.maskiner.data.filter(m => !m.bekraftad && !m.aktiv_till);
    for (const m of nya) {
      saker.push({
        id: `maskin-${m.maskin_id}`, rubrik: `Ny maskin i importen: ${m.visningsnamn || m.modell || m.maskin_id}`,
        detalj: m.maskin_id, knapp: "Öppna", mal: { typ: "flik", flik: "maskiner", params: { maskin: m.maskin_id } },
      });
    }
  }

  // ── Avtalet ──
  if (i.avtal.fel) felRad("avtalet", "avtalet", i.avtal.fel);
  else if (i.avtal.data) {
    const k = avtalKraverDig(i.avtal.data.giltigt_till, idag);
    if (k) {
      saker.push({
        id: "avtal", rubrik: k === "utgatt" ? "Avtalet har gått ut" : "Avtalet går ut inom en månad",
        detalj: `Gäller till ${datumLangt(i.avtal.data.giltigt_till!)}`, knapp: "Öppna", mal: { typ: "flik", flik: "avtal" },
      });
    }
  }

  // ── Maskiner som inte skickat fil på länge (Datahälsa) ──
  if (i.leverans.fel) felRad("maskinfilerna", "maskinfilerna", i.leverans.fel);
  else if (i.leverans.data) {
    // Samma urval som Datahälsa: ur drift, filfria och obekräftade maskiner larmar aldrig.
    const tysta = i.leverans.data.filter(r => !r.aktivTill && r.sanderFiler && r.bekraftad && r.dagarSedan != null && r.dagarSedan > LEV_GUL_DYGN);
    for (const r of tysta) {
      saker.push({
        id: `tyst-${r.maskinId}`, rubrik: `${r.namn} har inte skickat fil på ${dygn(r.dagarSedan!)}`,
        detalj: r.senasteData ? `Senaste data ${datumLangt(r.senasteData)}` : undefined, knapp: "Öppna", mal: { typ: "sida", href: "/datahalsa" },
      });
    }
  }

  return { saker, arbetstid, arbetstidVarningar };
}
