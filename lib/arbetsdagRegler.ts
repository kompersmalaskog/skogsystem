// ─────────────────────────────────────────────────────────────
// Vad en ARBETSDAG är — EN regel för lönen, förarens tidsspecifikation och
// kalenderns "jobbade dagar". Tre vyer som räknar dagar var för sig är samma
// fälla som tre veckonummer var.
//
// Beslut 2026-09-12 (Martin, efter första dry_run mot augusti): en dag räknas
// som arbetsdag när maskintid + extra tid är minst 60 minuter. Under det är
// minuterna fortfarande betald tid, men dagen ger varken 8 timmar i övertids-
// basen, en vältlappsvecka eller reseersättning, och den listas som KORTPASS i
// granskningsvyn så den kan granskas eller tas bort.
//
// Varför 60: det är där datat delar sig (maj–sep 2026). Allt under 60 minuter
// var inloggningar på någon annans maskin eller flyttdagar (Martin 5 min på
// skotaren en söndag, Joacim 26 min på Scorpion vid maskinflytten 10 aug) —
// ingen gick till jobbet för dem. Allt över 60 var riktiga korta dagar. Det är
// den enda gränsen som inte ändrar övertiden för någon riktig dag. Utan
// tröskeln tog Martins två femminutersdagar bort 16 timmar ur hans övertid.
//
// Bråkdelsdagar (timmar/8) valdes BORT: det gör om månadsövertid till dags-
// övertid, en avtalsfråga som inte ska avgöras av en tröskel.
// ─────────────────────────────────────────────────────────────

/** Minsta totala arbetstid (maskin + extra) för att en dag ska räknas som arbetsdag. */
export const ARBETSDAG_MIN_MINUTER = 60;

/** Är dagen en arbetsdag i lönens mening? totalMin = maskintid + extra tid samma dag. */
export function arArbetsdag(totalMin: number | null | undefined): boolean {
  return (totalMin || 0) >= ARBETSDAG_MIN_MINUTER;
}

// ─── Rast ────────────────────────────────────────────────────
// rast_min kommer ur maskinens "Meal break"-block, summerade per dag. Ingen
// normal lunch i materialet är ett enda block över 40 minuter; däremot bokförs
// stillestånd (flytt, väntan, service) som rast när föraren väljer "Meal break"
// i terminalen vid omstart — maskinen loggar då samtidigt ett avbrott "Övrigt"
// med samma startsekund (Stefan 11/21/28 aug 2026: 98/107/110 min).
// Fel rast = fel betald tid, rakt in i övertiden.

/** Över det här frågar appen föraren vid Bekräfta och granskningsvyn flaggar dagen. */
export const RAST_FRAGA_MIN = 60;

/** Rasthjulets tak. Var 120 — då gick en rast på 128 inte ens att visa, alltså
 *  inte heller att rätta. Ett maskinpass med mer än fyra timmars rast är inte
 *  en rast utan två pass. */
export const RAST_HJUL_MAX = 240;

// ─── Passets längd ───────────────────────────────────────────
// arbetad_min i databasen räknas (slut − start) modulo 24 h minus rast (migration
// 2026-09-15). Modulo gör att ett pass över midnatt blir rätt — men också att en
// felskriven sluttid (07:00 efter start 08:00) blir 23 timmar i stället för ett
// uppenbart minus. Fångstnätet: allt över ARBETSDAG_MAX_MINUTER är en FRÅGA till
// föraren vid Bekräfta och en rad i granskningsvyn. Det är en fråga, inte ett
// påstående om fel — de längsta äkta dagarna i prod är 15–16,4 timmar (Dalarna
// maj–juni 2026), så marginalen är en timme. Negativ tid (rasten längre än
// passet) fixas inte av modulo och flaggas på samma sätt; den kläms ALDRIG till
// noll — felet ska synas tills någon rättar det.

/** Över det här är passet en fråga, inte ett faktum. */
export const ARBETSDAG_MAX_MINUTER = 16 * 60;

/** Passets minuter räknade EXAKT som databasen (modulo 24 h, minus rast) —
 *  så klientens fråga och kolumnen aldrig säger olika. Klockslag "HH:MM" eller
 *  "HH:MM:SS". null om ett klockslag saknas. */
export function passMinuter(start: string | null | undefined, slut: string | null | undefined, rastMin: number | null | undefined): number | null {
  if (!start || !slut) return null;
  const t = (s: string) => { const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const diff = ((t(slut) - t(start)) % 1440 + 1440) % 1440;
  return diff - (rastMin || 0);
}

// ─── Ingen rast ──────────────────────────────────────────────
// Ponsse-skotarna (A110148, A030353) skriver ALDRIG Meal break, kort stopp
// eller tomgång i sina MOM-filer — Martin hade 45 av 47 Dalarna-dagar på noll
// rast, Max 48 av 54, medan Rottne och Scorpion loggar rasten (Oskar 1 av 51).
// Noll är där det KORREKTA värdet: skotarförarna kör i regel hela dagar utan
// rast (Martin 2026-09-15). Därför INGEN fråga till föraren — en fråga man
// alltid svarar ja på slutar man läsa, och då missar man dagen svaret borde
// varit nej (samma princip som brandriskfrågan: fråga bara där svaret
// varierar; Stefans tvåtimmarsraster varierar, noll på en skotare gör det inte).
// Det som finns är EN summeringsrad i granskningsvyn — information till
// arbetsgivaren, för noll rast påverkar övertid och vilotid.

/** Från den här passlängden räknas ett pass utan rast i summeringen. */
export const RAST_SAKNAS_FRAN_MINUTER = 6 * 60;

/** Pass utan rast som granskningen summerar: minst sex timmar och rast 0. */
export function rastSaknas(passMin: number | null | undefined, rastMin: number | null | undefined): boolean {
  return passMin != null && passMin >= RAST_SAKNAS_FRAN_MINUTER && (rastMin || 0) === 0;
}

export type PassOrimlighet = "lang" | "negativ";

/** Är passet orimligt? 'lang' = över taket, 'negativ' = rasten längre än passet. */
export function passOrimlighet(min: number | null | undefined): PassOrimlighet | null {
  if (min == null) return null;
  if (min < 0) return "negativ";
  if (min > ARBETSDAG_MAX_MINUTER) return "lang";
  return null;
}
