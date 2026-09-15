// Verifierar lib/roda-dagar mot officiella svenska helgdagar 2025–2028 (facit
// skrivet för hand ur almanackan: påskdagen 2025-04-20, 2026-04-05, 2027-03-28,
// 2028-04-16; midsommardagen = lördagen 20–26 juni; alla helgons dag = lördagen
// 31 okt–6 nov). Helglönen bygger på formeln — en felräknad påsk ger fel lön
// varje år utan att någon märker. Kör: npx tsx scripts/verifiera-roda-dagar.ts
import { getRödaDagar } from "../lib/roda-dagar";

const FACIT: Record<number, Record<string, string>> = {
  2025: { "Nyårsdagen": "2025-01-01", "Trettondedag jul": "2025-01-06", "Långfredag": "2025-04-18", "Påskdagen": "2025-04-20", "Annandag påsk": "2025-04-21", "Första maj": "2025-05-01", "Kristi himmelsfärd": "2025-05-29", "Nationaldagen": "2025-06-06", "Pingstdagen": "2025-06-08", "Midsommarafton": "2025-06-20", "Midsommardagen": "2025-06-21", "Alla helgons dag": "2025-11-01", "Julafton": "2025-12-24", "Juldagen": "2025-12-25", "Annandag jul": "2025-12-26", "Nyårsafton": "2025-12-31" },
  2026: { "Nyårsdagen": "2026-01-01", "Trettondedag jul": "2026-01-06", "Långfredag": "2026-04-03", "Påskdagen": "2026-04-05", "Annandag påsk": "2026-04-06", "Första maj": "2026-05-01", "Kristi himmelsfärd": "2026-05-14", "Nationaldagen": "2026-06-06", "Pingstdagen": "2026-05-24", "Midsommarafton": "2026-06-19", "Midsommardagen": "2026-06-20", "Alla helgons dag": "2026-10-31", "Julafton": "2026-12-24", "Juldagen": "2026-12-25", "Annandag jul": "2026-12-26", "Nyårsafton": "2026-12-31" },
  2027: { "Nyårsdagen": "2027-01-01", "Trettondedag jul": "2027-01-06", "Långfredag": "2027-03-26", "Påskdagen": "2027-03-28", "Annandag påsk": "2027-03-29", "Första maj": "2027-05-01", "Kristi himmelsfärd": "2027-05-06", "Nationaldagen": "2027-06-06", "Pingstdagen": "2027-05-16", "Midsommarafton": "2027-06-25", "Midsommardagen": "2027-06-26", "Alla helgons dag": "2027-11-06", "Julafton": "2027-12-24", "Juldagen": "2027-12-25", "Annandag jul": "2027-12-26", "Nyårsafton": "2027-12-31" },
  2028: { "Nyårsdagen": "2028-01-01", "Trettondedag jul": "2028-01-06", "Långfredag": "2028-04-14", "Påskdagen": "2028-04-16", "Annandag påsk": "2028-04-17", "Första maj": "2028-05-01", "Kristi himmelsfärd": "2028-05-25", "Nationaldagen": "2028-06-06", "Pingstdagen": "2028-06-04", "Midsommarafton": "2028-06-23", "Midsommardagen": "2028-06-24", "Alla helgons dag": "2028-11-04", "Julafton": "2028-12-24", "Juldagen": "2028-12-25", "Annandag jul": "2028-12-26", "Nyårsafton": "2028-12-31" },
};

let fel = 0, saknas = 0;
for (const år of [2025, 2026, 2027, 2028]) {
  const lib = getRödaDagar(år);
  const libByNamn: Record<string, string> = {};
  for (const [d, n] of Object.entries(lib)) libByNamn[n] = d;
  console.log(`\n${år}`);
  for (const [namn, datum] of Object.entries(FACIT[år])) {
    const libD = libByNamn[namn];
    const dow = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"][new Date(datum + "T00:00:00").getDay()];
    if (libD === undefined) { saknas++; console.log(`  SAKNAS i lib   ${namn.padEnd(20)} facit ${datum} (${dow})`); }
    else if (libD !== datum) { fel++; console.log(`  FEL            ${namn.padEnd(20)} lib ${libD}  facit ${datum} (${dow})`); }
    else console.log(`  ok             ${namn.padEnd(20)} ${datum} (${dow})`);
  }
  for (const n of Object.keys(libByNamn)) if (!(n in FACIT[år])) console.log(`  EXTRA i lib    ${n} ${libByNamn[n]}`);
}
console.log(`\nfel: ${fel} · saknas: ${saknas}`);
process.exit(fel > 0 ? 1 : 0);
