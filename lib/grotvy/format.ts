// Textformat för GROT-arken i /oversikt-v2. Ren logik — ingen webbläsar-ICU.
//
// toLocaleDateString('sv-SE', { month: 'short' }) ger "3 okt." i en miljö och
// "3 okt" i en annan; kanvasen säger "3 okt". Månadsnamnen står därför här, så
// en rad ser likadan ut på telefonen, i testet och i förhandsvisningen.
//
// Alla datum är kalenderdagar ('YYYY-MM-DD'). Dagräkningen går via UTC-datum,
// så sommartid aldrig kan ge 39 eller 41 dagar där det är 40.

const MANADER = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** Dagens datum som 'YYYY-MM-DD' i lokal tid. */
export function idagLokal(nu: Date = new Date()): string {
  const m = String(nu.getMonth() + 1).padStart(2, '0');
  const d = String(nu.getDate()).padStart(2, '0');
  return `${nu.getFullYear()}-${m}-${d}`;
}

/** Datumdelen av 'YYYY-MM-DD' eller en ISO-tid. Ogiltigt → null. */
export function dagAv(d: string | null | undefined): string | null {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function utcDag(d: string): number {
  return Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
}

/** Hela kalenderdagar från a till b (positivt när b ligger efter a). */
export function dagarMellan(a: string, b: string): number {
  return Math.round((utcDag(b) - utcDag(a)) / 86400000);
}

/** Dagar sedan `d` fram till `idag`. Ogiltigt datum → null. */
export function dagarSedan(d: string | null | undefined, idag: string): number | null {
  const dag = dagAv(d);
  return dag ? dagarMellan(dag, idag) : null;
}

/** '2026-10-03' → '3 okt'. Annat år än `idag`s tas med: '3 okt 2025' (`utanAr` = aldrig året). Ogiltigt → ''. */
export function kortDatum(d: string | null | undefined, idag: string, utanAr = false): string {
  const dag = dagAv(d);
  if (!dag) return '';
  const ar = Number(dag.slice(0, 4));
  const text = `${Number(dag.slice(8, 10))} ${MANADER[Number(dag.slice(5, 7)) - 1]}`;
  return utanAr || ar === Number(idag.slice(0, 4)) ? text : `${text} ${ar}`;
}

/** 1240 → '1 240' (hårt mellanslag). Egen formatering, samma på alla enheter. */
export function tusental(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

/** 'avverkat 19 aug · 40 dgr'. Saknas datumet säger raden det i stället för att gissa.
 *  Året tas bara med när det är ett år sedan eller mer: "N dgr" bär redan åldern, och "12 dec 2025"
 *  i stället för "12 dec" kostar en rad på en smal telefon. */
export function avverkatText(avverkat: string | null | undefined, idag: string): string {
  const dagar = dagarSedan(avverkat, idag);
  const dag = dagAv(avverkat);
  if (dagar == null || !dag) return 'avverkningsdatum saknas';
  const datum = kortDatum(dag, idag, dagar < 365);
  return `avverkat ${datum} · ${dagar} dgr`;
}

/** Markägarens datum: 'senast 3 okt'. Skälet (grot_skal) visas ingenstans i v2 — det är alltid markberedning/plantering.
 *  Att datumet har passerat står INTE här utan som ett eget ord, FORSENAD_TEXT, som vyn sätter i rött. */
export function senastText(senast: string | null | undefined, idag: string): string {
  const dag = dagAv(senast);
  return dag ? `senast ${kortDatum(dag, idag)}` : '';
}

/** Ordet på raden när markägarens datum har passerat (visas i rött, efter 'senast 3 okt'). */
export const FORSENAD_TEXT = 'försenad';

/** Markkravet som visas i orange på listraden och i arket. Bara det som begränsar visas: 'tal_blott' (marken tål blött)
 *  är inget att varna för och syns därför bara som valt läge på knappen i sektionen Markägaren. */
export const TORRT_TJALE_TEXT = 'bara torrt/tjäle';
export function markkravText(markkrav: string | null | undefined): string {
  return markkrav === 'torrt_eller_tjale' ? TORRT_TJALE_TEXT : '';
}

/** De två knapparna i sektionen Markägaren, i visad ordning. `varde` är det som lagras i dim_objekt.grot_markkrav. */
export const MARKKRAV_KNAPPAR: { varde: 'tal_blott' | 'torrt_eller_tjale'; etikett: string }[] = [
  { varde: 'tal_blott', etikett: 'Tål blött' },
  { varde: 'torrt_eller_tjale', etikett: 'Bara torrt/tjäle' },
];

/** Chippen på kartan: 'GROT · 28', och 'GROT · 28 · 2 snart' när något har markägarens datum inom SNART_DAGAR. */
export function grotChipText(antal: number, snart: number): string {
  return snart > 0 ? `GROT · ${antal} · ${snart} snart` : `GROT · ${antal}`;
}

/** Ett datum som går att spara som markägarens datum: ett riktigt kalenderdatum 'YYYY-MM-DD' mellan 2000 och 2100.
 *  Datumväljaren ger ett halvskrivet värde medan man skriver (tomt, '0002-…') — det är inte "rensa" och sparas inte. */
export function arRimligtSenast(v: string | null | undefined): boolean {
  const dag = dagAv(v);
  if (!dag || dag !== v) return false;
  if (dag < '2000-01-01' || dag > '2100-12-31') return false;
  const d = new Date(utcDag(dag));
  return d.getUTCFullYear() === Number(dag.slice(0, 4)) && d.getUTCMonth() === Number(dag.slice(5, 7)) - 1 && d.getUTCDate() === Number(dag.slice(8, 10));
}

/** 'skördat 1 240 m³' — traktens skördade volym i m³fub (volym_m3sub). */
export function skordatText(m3: number): string {
  return `skördat ${tusental(m3)} m³`;
}

/** '≈ 434 m³ GROT (schablon)' — alltid märkt som uppskattning, aldrig som mätt. */
export function grotSchablonText(m3: number): string {
  return `≈ ${tusental(m3)} m³ GROT (schablon)`;
}

/** Vägavstånd i hela km. ORS-svaret är avrundat till heltal i route_cache, så 0 betyder "under en kilometer"
 *  (två trakter vid samma väg) — det står som '<1', inte som ett nollavstånd som ser ut som ett fel. */
export function kmText(km: number): string {
  return km < 1 ? '<1' : String(Math.round(km));
}

/** 'N km från Namn'. Okänt avstånd → '–' (aldrig fågelväg). */
export function avstandText(km: number | null | undefined, franNamn: string | null | undefined): string {
  if (km == null || !franNamn) return '–';
  return `${kmText(km)} km från ${franNamn}`;
}

/** 4,2 ha — en decimal, decimalkomma. Saknad/ogiltig areal → ''. */
export function arealText(ha: number | null | undefined): string {
  if (ha == null || !Number.isFinite(ha) || ha <= 0) return '';
  return `${String(Math.round(ha * 10) / 10).replace('.', ',')} ha`;
}

/** Texten när "Lägg i kö" och "Visa på kartan" är avstängda: trakten finns i datat (dim_objekt) men
 *  har ingen objekt-rad i planeringen, och både kön (maskin_ko.objekt_id) och kartan pekar på den. */
export const SAKNAR_OBJEKT_TEXT = 'saknar objekt i planeringen';

