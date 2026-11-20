/**
 * Lastbilsflytt ger förarens flyttrad (beslut Martin 2026-10-19).
 *
 * Flyttloggen (maskin_flytt) säger när lastbilen hämtade maskinen (hamtad_tid) och lämnade den (sluttid). Raden skapas hos den
 * förare som hade maskinen den dagen, märkt "Från flyttloggen", med tid lastning → avlastning. Den skrivs som ett SEGMENT
 * (arbetsdag_segment, kalla 'flyttlogg'): tid MÄRKT inom förarens redan betalda dag, så lönen är oförändrad — samma bevis som för
 * GPS-raden (lib/flyttRad.ts, lib/lonesystem/flytt.lon.test.ts). Tid utanför förarens pass läggs ALDRIG till automatiskt: raden
 * klipps mot passet, och en flytt som inte rör förarens pass ger ingen rad (föraren kan lägga till den manuellt).
 *
 * Ingen rad om flytten startar efter ordinarie arbetstid (avtalet, §5 mom 3: "senast kl. 17.00"), på helg eller röd dag (då
 * flyttar Martin/Joacim själva). Ingen rad på en bekräftad dag, och aldrig två gånger: flyttens id (`flytt_id`) är raden och
 * gravstenens identitet, så en rad föraren ändrat eller svepat bort kommer aldrig tillbaka. Loggen går före GPS: ligger en
 * GPS-flyttrad på samma flytt ersätter loggen den, så det blir EN rad.
 *
 * Rena funktioner. Databasen läses och skrivs av lib/flyttloggSynk.ts.
 */
import { getRödaDagar } from "./roda-dagar";
import { sthlmOffsetMin } from "./optiTid";
import { flyttKommentar } from "./flyttRad";

/** Ordinarie arbetstid slutar 17:00 (Skogsavtalet 2025–2027 §5 mom 3). En flytt som startar vid eller efter detta ger ingen rad. */
export const ORDINARIE_SLUT = "17:00";
const ORDINARIE_SLUT_SEK = 17 * 3600;

/** En rad ur maskin_flytt, de fält vi läser. */
export type LogFlytt = {
  id: string; maskin_id: string | null; avbruten?: boolean | null;
  hamtad_tid: string | null; sluttid: string | null;
  fran_objekt_id: string | null; till_objekt_id: string | null; fran_plats_id: string | null; till_plats_id: string | null;
  flytt_km: number | string | null;
};
/** En förares dag på en maskin (alla dagar synken känner, också bekräftade — de avgör vem som hade maskinen). */
export type MaskinDag = {
  medarbetare_id: string; datum: string; maskin_id: string | null;
  start_tid: string | null; slut_tid: string | null; skyddad: boolean;
};
export type UpptagetSegment = {
  id: string; medarbetare_id: string; datum: string; start_tid: string; slut_tid: string; kalla?: string | null; flytt_id?: string | null;
};
export type Gravsten = { medarbetare_id: string; datum: string; start_tid: string; slut_tid: string; flytt_id?: string | null };

export type FlyttloggRad = {
  medarbetare_id: string; datum: string; start_tid: string; slut_tid: string;
  aktivitet_typ: "flytt"; debiterbar: false; objekt_id: null; kommentar: string; kalla: "flyttlogg"; flytt_id: string;
};

/** Svensk lokal dag och sekunder sedan midnatt för ett verkligt ögonblick (ISO med tidszon). Null om det inte går att tolka. */
export function lokalSthlm(iso: string | null | undefined): { datum: string; sek: number } | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const lokalMs = ms + sthlmOffsetMin(ms) * 60_000;
  const d = new Date(lokalMs);
  const datum = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { datum, sek: d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() };
}

/** Ordinarie dag: måndag–fredag som varken är röd dag eller helgafton (mom 3: de ingår inte i ordinarie arbetstid). */
export function arOrdinarieDag(datum: string): boolean {
  const d = new Date(`${datum}T12:00:00Z`);
  const veckodag = d.getUTCDay(); // 0 = söndag, 6 = lördag
  if (veckodag === 0 || veckodag === 6) return false;
  return !getRödaDagar(d.getUTCFullYear())[datum];
}

/** Är det synkens egen rad från flyttloggen? */
export function arFlyttloggsRad(rad: { kalla?: string | null } | null | undefined): boolean {
  return rad?.kalla === "flyttlogg";
}

const tSek = (t: string): number => { const d = (t || "0:0:0").split(":").map(Number); return d[0] * 3600 + (d[1] || 0) * 60 + (d[2] || 0); };
const tMin = (t: string): number => Math.floor(tSek(t) / 60);
const hhmmss = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;
const overlappar = (s: number, e: number, b: { s: number; e: number }) => s < b.e && b.s < e;

/**
 * Vilka flyttloggsrader ska skapas, och vilka GPS-rader ska de ersätta?
 *  - `dagar`: alla förares dagar på maskinerna (bekräftade med). Den som hade maskinen = den vars pass täcker mest av flytten;
 *    lika mycket hos två är tvetydigt och ger ingen rad. Är hens dag bekräftad rörs inget.
 *  - `upptagna`: befintliga segment. En GPS-rad (kalla 'flytt') som överlappar ersätts; allt annat som överlappar blockerar.
 *  - `borta`: gravstenar. Flyttens id, eller en överlappande tid, hindrar raden.
 */
export function planeraFlyttloggsRader(i: {
  flyttar: LogFlytt[]; dagar: MaskinDag[]; upptagna: UpptagetSegment[]; borta: Gravsten[];
  namn: { objekt: Record<string, string>; plats: Record<string, string> };
}): { skapa: FlyttloggRad[]; ersatt: string[] } {
  type Kandidat = { rad: FlyttloggRad; s: number; e: number; ersatt: string[] };
  const kandidater: Kandidat[] = [];

  for (const f of i.flyttar) {
    if (f.avbruten || !f.maskin_id) continue;
    const h = lokalSthlm(f.hamtad_tid), s = lokalSthlm(f.sluttid);
    if (!h || !s) continue;
    if (Date.parse(f.sluttid as string) <= Date.parse(f.hamtad_tid as string)) continue;
    const datum = h.datum;
    if (!arOrdinarieDag(datum)) continue;
    if (h.sek >= ORDINARIE_SLUT_SEK) continue;
    const slutSek = s.datum === datum ? s.sek : 24 * 3600; // en avlastning efter midnatt räknas som dagens slut

    // Vem hade maskinen? Mest överlapp mellan flytten och förarens pass; tvetydigt = ingen.
    let bast: { dag: MaskinDag; ovl: number } | null = null, lika = false;
    for (const d of i.dagar) {
      if (d.maskin_id !== f.maskin_id || d.datum !== datum || !d.start_tid || !d.slut_tid) continue;
      const ovl = Math.min(slutSek, tSek(d.slut_tid)) - Math.max(h.sek, tSek(d.start_tid));
      if (ovl < 60) continue;
      if (!bast || ovl > bast.ovl) { bast = { dag: d, ovl }; lika = false; }
      else if (ovl === bast.ovl) lika = true;
    }
    if (!bast || lika || bast.dag.skyddad) continue;
    const dag = bast.dag;

    // Klipps mot förarens pass; hela minuter på båda ändar (golv).
    const sMin = Math.floor(Math.max(h.sek, tSek(dag.start_tid as string)) / 60);
    const eMin = Math.floor(Math.min(slutSek, tSek(dag.slut_tid as string)) / 60);
    if (eMin <= sMin) continue;

    // Gravstenar: flyttens id, eller en överlappande tid (också en gravsten för en GPS-rad föraren tagit bort).
    const gravar = i.borta.filter(b => b.medarbetare_id === dag.medarbetare_id && b.datum === datum);
    if (gravar.some(b => b.flytt_id === f.id || overlappar(sMin, eMin, { s: tMin(b.start_tid), e: tMin(b.slut_tid) }))) continue;

    // Befintliga segment: samma flytt finns redan (även om föraren ändrat tiden) → klart.
    const mina = i.upptagna.filter(u => u.medarbetare_id === dag.medarbetare_id && u.datum === datum);
    if (mina.some(u => u.flytt_id === f.id)) continue;
    const krockar = mina.filter(u => overlappar(sMin, eMin, { s: tMin(u.start_tid), e: tMin(u.slut_tid) }));
    if (krockar.some(u => u.kalla !== "flytt")) continue; // förarens egen period eller en annan flyttloggsrad: rör aldrig
    const gps = krockar.map(u => u.id);

    const namn = (obj: string | null, plats: string | null) => (obj && i.namn.objekt[obj]) || (plats && i.namn.plats[plats]) || null;
    const km = f.flytt_km == null || f.flytt_km === "" ? null : Number(f.flytt_km);
    kandidater.push({
      s: sMin, e: eMin, ersatt: gps,
      rad: {
        medarbetare_id: dag.medarbetare_id, datum, start_tid: hhmmss(sMin), slut_tid: hhmmss(eMin),
        aktivitet_typ: "flytt", debiterbar: false, objekt_id: null,
        kommentar: flyttKommentar(namn(f.fran_objekt_id, f.fran_plats_id), namn(f.till_objekt_id, f.till_plats_id), km != null && Number.isFinite(km) ? km : null),
        kalla: "flyttlogg", flytt_id: f.id,
      },
    });
  }

  // Tidsordning; överlappande flyttar (samma förare och dag) ger bara den första.
  kandidater.sort((a, b) => a.rad.datum.localeCompare(b.rad.datum) || a.s - b.s || a.e - b.e);
  const valda: Kandidat[] = [];
  for (const k of kandidater) {
    if (valda.some(v => v.rad.medarbetare_id === k.rad.medarbetare_id && v.rad.datum === k.rad.datum && overlappar(k.s, k.e, { s: v.s, e: v.e }))) continue;
    valda.push(k);
  }
  return { skapa: valda.map(v => v.rad), ersatt: [...new Set(valda.flatMap(v => v.ersatt))] };
}
