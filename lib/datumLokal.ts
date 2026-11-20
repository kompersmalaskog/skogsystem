/**
 * Lokalt datum som YYYY-MM-DD — UTAN UTC-konvertering.
 *
 * `new Date(...).toISOString().slice(0,10)` på ett datum byggt ur LOKALA
 * komponenter (t.ex. `new Date(år, månad, 0)` = lokal midnatt) flyttar datumet
 * bakåt ett dygn i UTC+-tidszoner (Sverige UTC+1/+2): lokal midnatt blir
 * föregående dygn 22:00–23:00 UTC. Effekten: sista dagen i månaden föll ur
 * varje datum-range som byggdes så — kalenderns månadscache, km-månadssumman,
 * löneperioden och Fortnox-exporten tappade tyst sin sista dag (31 mars,
 * 30 april, 31 maj …), för alla förare, sedan appen byggdes.
 *
 * Använd denna för DATUM byggda ur lokala komponenter. arbetsdag.datum lagras
 * som lokalt svenskt datum, så jämförelser ska ske mot lokalt datum.
 */
export function ymdLokal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Sista dagen i månaden (1-indexerad månad) som YYYY-MM-DD, lokal. */
export function sistaDagenIManaden(år: number, månad1indexerad: number): string {
  return ymdLokal(new Date(år, månad1indexerad, 0));
}
