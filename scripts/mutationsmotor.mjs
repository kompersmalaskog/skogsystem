// Mutationsmotor (lag och lön: testnivå full). Delas av scripts/mutationskontroll-*.mjs.
//
// Ändrar EN sak i taget i en källfil — en tröskel, en jämförelse, en rad — kör de angivna testfilerna och kräver att de blir RÖDA. En
// mutant som överlever betyder att något kan ändras utan att något test märker det. Filerna återställs alltid: före varje ny mutant, vid
// avbrott av ett fel i mönstren och i slutet (aterstall() före varje process.exit — en finally körs inte vid process.exit). Utgångsläget
// måste vara grönt, annars säger "rött" ingenting. Avslutar med 1 om någon mutant överlevde, 2 vid fel i mönster eller röd grund.
//
// EN tung körning åt gången: kör inte tillsammans med tsc, build eller en annan vitest.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * @param {{ filer: string[], tester: string[], standardFil: string, mutationer: [string, string, string, string?][] }} cfg
 *   mutationer: [namn, från, till, fil?] — `från` måste finnas EXAKT en gång i filen (annars är mutationen tvetydig och motorn stannar).
 */
export function kor({ filer, tester, standardFil, mutationer }) {
  const originalFil = Object.fromEntries(filer.map(f => [f, readFileSync(f, "utf8")]));
  const aterstall = () => { for (const [fil, innehall] of Object.entries(originalFil)) writeFileSync(fil, innehall); };
  const raknaForekomster = (s, d) => (d ? s.split(d).length - 1 : 0);
  const vitest = () => spawnSync("npx", ["vitest", "run", ...tester, "--reporter=dot"], { encoding: "utf8", env: { ...process.env, CI: "1" } });

  const overlevde = [];
  let dog = 0;
  try {
    const grund = vitest();
    if (grund.status !== 0) { console.error("Testerna är röda innan mutationerna — rätta dem först.\n" + grund.stdout + grund.stderr); aterstall(); process.exit(2); }
    for (const [namn, fran, till, fil = standardFil] of mutationer) {
      if (!(fil in originalFil)) { console.error(`✗ "${namn}": ${fil} finns inte bland filerna som återställs`); aterstall(); process.exit(2); }
      const original = originalFil[fil];
      const n = raknaForekomster(original, fran);
      if (n !== 1) { console.error(`✗ "${namn}": mönstret finns ${n} gånger i ${fil} (ska vara exakt 1):\n   ${fran}`); aterstall(); process.exit(2); }
      aterstall();
      writeFileSync(fil, original.replace(fran, () => till));
      const dod = vitest().status !== 0;
      if (dod) dog++; else overlevde.push(namn);
      console.log(`${dod ? "död     " : "ÖVERLEVDE"}  ${namn}`);
    }
  } finally {
    aterstall();
  }
  console.log(`\n${dog} av ${mutationer.length} mutanter dödades${overlevde.length ? `, ${overlevde.length} överlevde:` : "."}`);
  for (const n of overlevde) console.log("  - " + n);
  aterstall();
  process.exit(overlevde.length ? 1 : 0);
}
