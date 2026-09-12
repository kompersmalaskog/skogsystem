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
