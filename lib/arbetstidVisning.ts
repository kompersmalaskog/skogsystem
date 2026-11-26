// Arbetstidens gränser som föraren ser dem i Min tid — och admin i Lön › Arbetstid (Martin 2026-11-26: "det andra också").
// EN källa för vilka gränser som visas, i vilken ordning, vad raderna heter och vad lagen säger. Talen kommer ur
// lib/arbetstidsgranser (byggArbetstid) via /api/lon/arbetstid; här räknas ingenting om.
import type { ArbetstidForare, Gransstatus, Niva } from "@/lib/arbetstidsgranser";

/** De fyra gränserna föraren håller koll på själv. Vila har sin egen sida (Vilobrott). */
export const VISADE_GRANSER = ["overtid_manad", "allman_overtid_ar", "extra_overtid_ar", "snitt_48"] as const;

const MANADER = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

/** Radens namn och den dämpade texten efter det. */
export function gransRubrik(id: string, nu: Date): [string, string] {
  switch (id) {
    case "overtid_manad": return [`Övertid i ${MANADER[nu.getMonth()]}`, "t.o.m. igår"];
    case "allman_overtid_ar": return [`Övertid ${nu.getFullYear()}`, ""];
    case "extra_overtid_ar": return ["Extra övertid", "över årets tak"];
    case "snitt_48": return ["Snitt per vecka", "senaste 4 månaderna"];
    default: return [id, ""];
  }
}

/** Vad lagen säger, skrivet så att föraren förstår (admins längre "Varför?" i Översikten handlar om hur appen räknar). */
export const LAGEN_FORARE: Record<string, string> = {
  overtid_manad: "Arbetstidslagen 8 §: högst 50 timmar övertid per kalendermånad (eller 48 timmar på fyra veckor). Övertid blir det först när månadens ordinarie timmar är fyllda, precis som på lönen.",
  allman_overtid_ar: "Skogsavtalet § 5 mom 5: högst 250 timmar övertid per kalenderår. Lagen säger 200, avtalet tillåter 250.",
  extra_overtid_ar: "Arbetstidslagen 8 a §: över årets tak får det bli högst 150 timmar extra övertid, och bara när det finns särskilda skäl. Prata med arbetsledningen.",
  snitt_48: "Arbetstidslagen 10 b §: all arbetstid, övertid inräknad, får vara högst 48 timmar per vecka i snitt över fyra månader. En enskild vecka får vara längre. Semester och sjukdagar räknas som 8 timmar.",
};

export const gransEnhet = (id: string) => (id === "snitt_48" ? "tim/v" : "tim");

/** De visade gränserna i ordning. Extra övertid står bara med när den finns. */
export function synligaGranser(granser: Gransstatus[]): Gransstatus[] {
  return VISADE_GRANSER
    .map(id => granser.find(g => g.id === id))
    .filter((g): g is Gransstatus => !!g && !(g.id === "extra_overtid_ar" && !((g.varde ?? 0) > 0)));
}

const tal = (n: number) => Number(n).toLocaleString("sv-SE");
const RANG: Record<Niva, number> = { lugn: 0, gul: 1, rod: 2 };

/** Kortnamnen på förarens rad i admin. */
const KORT: Record<string, string> = { overtid_manad: "Månad", allman_overtid_ar: "År", extra_overtid_ar: "Extra", snitt_48: "Vecka" };
/** Hur gränsen sägs i svaret överst ("närmar sig månadens gräns"). */
const GRANS_ORD: Record<string, string> = {
  overtid_manad: "månadens gräns", allman_overtid_ar: "årets gräns", extra_overtid_ar: "gränsen för extra övertid", snitt_48: "veckogränsen",
};

export type AdminDel = { id: string; text: string; niva: Niva };
export type AdminRad = { id: string; namn: string; niva: Niva; delar: AdminDel[]; granser: Gransstatus[]; notiser: string[] };

/** En rad per förare (inte företagsledare). Den som ligger närmast en gräns först. */
export function adminRader(forare: ArbetstidForare[]): AdminRad[] {
  const rader = forare.filter(f => !f.foretagsledare).map(f => {
    const granser = synligaGranser(f.granser);
    const niva = granser.reduce<Niva>((v, g) => (RANG[g.niva] > RANG[v] ? g.niva : v), "lugn");
    const delar = granser.map(g => ({ id: g.id, niva: g.niva, text: `${KORT[g.id]} ${g.varde == null ? "–" : tal(g.varde)} / ${tal(g.grans)}` }));
    return { id: f.medarbetare_id, namn: f.namn, niva, delar, granser, notiser: f.notiser, narmast: Math.max(0, ...granser.map(g => g.andel ?? 0)) };
  });
  rader.sort((a, b) => RANG[b.niva] - RANG[a.niva] || b.narmast - a.narmast || a.namn.localeCompare(b.namn, "sv"));
  return rader.map(({ narmast: _n, ...r }) => r);
}

const fornamn = (namn: string) => namn.split(/\s+/)[0] || namn;
const ochLista = (n: string[]) => (n.length === 1 ? n[0] : `${n.slice(0, -1).join(", ")} och ${n[n.length - 1]}`);

/** Svaret överst, i ord. Över en gräns går före nära en gräns. */
export function adminSvar(rader: AdminRad[]): { text: string; niva: Niva } {
  for (const niva of ["rod", "gul"] as const) {
    const vilka = rader.filter(r => r.niva === niva);
    if (vilka.length === 0) continue;
    const verb = niva === "rod" ? "är över" : "närmar sig";
    if (vilka.length === 1) {
      const g = vilka[0].granser.filter(x => x.niva === niva);
      const ord = g.length === 1 ? GRANS_ORD[g[0].id] : "gränserna";
      return { niva, text: `${fornamn(vilka[0].namn)} ${verb} ${ord}` };
    }
    const namn = vilka.length <= 3 ? ochLista(vilka.map(r => fornamn(r.namn))) : `${vilka.length} förare`;
    return { niva, text: `${namn} ${verb} gränsen` };
  }
  return { niva: "lugn", text: "Alla håller sig inom gränserna" };
}
