// Mutationskontroll for vagvarningen (band + ⚠ utanfor gransen + rad per vag i objektinfon).
//
// Varje mutant ar ett satt felet kan komma tillbaka. En mutant som OVERLEVER betyder att inget test ser skillnaden - da ar testet pynt.
// Kor: node scripts/mutationskontroll-vagrisk.mjs
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TESTER = [
  'lib/vagRisk.test.ts',
  'lib/vagRisk.dom.test.ts',
  'lib/tmaVagar.vakter.test.ts',
  'components/planering/VagRiskRader.render.test.tsx',
  'components/planering/ObjektKortEnkel.render.test.tsx',
  'components/planering/TraktOversikt.render.test.tsx',
  'components/planering/ObjektInfo.test.tsx',
];
const V = 'lib/vagRisk.ts';

const MUTANTER = [
  // Lagen
  [V, "return nivå === 'low' ? 'lag' : 'hog';", "return nivå === 'low' ? 'lag' : nivå === 'medium' ? 'obedomd' : 'hog';", 'forhojd risk blir ej bedomd i stallet for hog'],
  [V, "if (nivå === null) return 'obedomd';", "if (nivå === null) return 'lag';", 'obesvarad bedomning raknas som lag risk'],
  [V, "lag: { band: false, symbol: false,", "lag: { band: false, symbol: true,", 'lag risk far en symbol pa kartan'],
  [V, "lag: { band: false, symbol: false,", "lag: { band: true, symbol: false,", 'lag risk far ett band pa kartan'],
  [V, "rad: 'låg risk ✓'", "rad: 'låg risk'", 'bocken saknas pa raden'],
  // Var symbolen ligger
  [V, "const ute = kand.filter((c) => !c.inne);", "const ute = kand;", 'symbolen far ligga innanfor traktgransen'],
  [V, "const iOrdning = pool.slice().sort((a, b) => a.d - b.d);", "const iOrdning = pool.slice().sort((a, b) => b.d - a.d);", 'langst fran gransen i stallet for narmast'],
  [V, "const fri = iOrdning.find((c) => c.luft >= VAG_FRI_M);", "const fri = iOrdning[0];", 'symbolen flyttas aldrig fran en upptagen plats'],
  [V, "export const VAG_FRI_M = 40;", "export const VAG_FRI_M = 1;", 'friheten fran andra symboler ar obetydlig'],
  [V, "poly.length && ute.some((c) => c.d >= VAG_UTANFOR_M) ? ute.filter((c) => c.d >= VAG_UTANFOR_M) : ute", "ute", 'ingen marginal ut fran gransen'],
  [V, "const upptaget = hinder.slice();", "const upptaget: LatLon[] = [];", 'andra symboler raknas inte som hinder'],
  [V, "if (pos && lage !== 'lag') { symboler.push({ nyckel: v.nyckel, agare: v.agare, pos, risk: lage }); upptaget.push(pos); }", "if (pos && lage !== 'lag') { symboler.push({ nyckel: v.nyckel, agare: v.agare, pos, risk: lage }); }", 'en satt ⚠ ar inget hinder for nasta vag'],
  [V, "const val = fri ?? iOrdning.reduce((a, b) => (b.luft > a.luft ? b : a));", "const val = fri ?? iOrdning[0];", 'utan fri plats valjs inte den med mest luft'],
  // Raden
  [V, "rader.push({ nyckel: v.nyckel, agare: v.agare, rubrik: vagRubrik(v), risk: lage, status: u.rad, farg: u.farg });", "if (lage !== 'lag') rader.push({ nyckel: v.nyckel, agare: v.agare, rubrik: vagRubrik(v), risk: lage, status: u.rad, farg: u.farg });", 'lag risk saknar rad i objektinfon'],
  [V, "if (ref) return `Väg ${ref}`;", "if (ref) return ref;", 'rubriken saknar ordet Vag'],
  // Sidan
  ['app/planering/page.tsx', "const vagarInfo = vagVy.rader.length ? { rader: vagVy.rader, onOppna: (agare: string) => { stang(); setTmaOpen(agare); } } : null;", "const vagarInfo = null;", 'objektinfon far inga rader'],
  ['app/planering/page.tsx', "onOppna: (agare: string) => { stang(); setTmaOpen(agare); } } : null;", "onOppna: (agare: string) => { stang(); } } : null;", 'trycket pa raden oppnar ingen riskbedomning'],
  ['app/planering/page.tsx', "...traktdelDelar.filter((d) => !justeradeTraktdelar.has(d.partKey)).map((d) => d.ringLatLon),", "", 'Vidas traktdelar raknas inte som trakt'],
  ['app/planering/page.tsx', "...(markers as any[]).filter((m: any) => harXY(m) && m.isMarker && !arAlltidPrick(m.type)).map((m: any) => svgToLatLon(m.x, m.y)),", "", 'vara symboler ar inga hinder'],
  // Korten
  ['components/planering/ObjektKort.tsx', "<VagRiskRader vagar={p.vagar} />", "", 'planerarens kort visar inga vagrader'],
  ['components/planering/ObjektKortEnkel.tsx', "<VagRiskRader vagar={p.vagar} />", "", 'maskinens kort visar inga vagrader'],
  ['components/planering/TraktOversikt.tsx', "<VagRiskRader vagar={p.vagar} luftUnder={AVSTAND.l} />", "", 'Hela trakten visar inga vagrader'],
  ['components/planering/VagRiskRader.tsx', "onTryck={() => vagar.onOppna(r.agare)}", "onTryck={() => {}}", 'raden i komponenten gor ingenting'],
];

const kor = () => {
  try {
    execSync(`npx vitest run ${TESTER.map((t) => JSON.stringify(t)).join(' ')}`, { stdio: 'pipe' });
    return true;
  } catch { return false; }
};

if (!kor()) { console.error('Testerna ar roda UTAN mutation - fixa dem forst.'); process.exit(1); }

let doda = 0;
for (const [fil, fran, till, vad] of MUTANTER) {
  const original = readFileSync(fil, 'utf8');
  if (!original.includes(fran)) { console.error(`SAKNAS i ${fil}: ${fran.slice(0, 60)}`); process.exit(1); }
  writeFileSync(fil, original.replace(fran, till));
  const gront = kor();
  writeFileSync(fil, original);
  if (gront) console.log(`OVERLEVDE: ${vad}`);
  else { doda++; console.log(`dod: ${vad}`); }
}
console.log(`\n${doda} av ${MUTANTER.length} mutanter dodade.`);
process.exit(doda === MUTANTER.length ? 0 : 1);
