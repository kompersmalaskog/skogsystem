import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// VAKTER (PR 8a): det som inte syns i ett enhetstest eftersom det bor i kartans effekter och i sidans koppling.
//
// Kartan (RundKarta) har ingen jsdom-test - MapLibre kors i en riktig Chromium (se PR-texten). Dessa tester lasar KALLKODEN och larmar om
// reglerna glider: att ett nytt lager tands av en "!== false" (standarden lagger da nagot nytt pa kartan), att hyttsparet hamtas utan att
// nagon bett om det, att knappen hamnar i dockan (dar den far dockan att vaxa), eller att en avstangd rad gar att trycka pa.

const ROT = join(__dirname, '..');
const las = (rel: string) => readFileSync(join(ROT, rel), 'utf-8');

describe('RundKarta: underlagen tands bara av ett uttryckligt ja', () => {
  const karta = las('app/egenkontroll/RundKarta.tsx');

  it('planens vagar, bada spar-rollerna och Vidas grans lases som `=== true` - aldrig `!== false` (det ar punkter/provytor/observationer som ar tanda tills nagot annat sags)', () => {
    for (const nyckel of ['ekPlanVagar', 'ekVidaGrans']) {
      expect(karta, nyckel).toMatch(new RegExp(`egnaVarden\\.${nyckel} === true`));
      expect(karta, nyckel).not.toMatch(new RegExp(`egnaVarden\\.${nyckel} !== false`));
    }
    expect(karta).toMatch(/egnaVarden\[nyckel\] === true/);                       // spar-rollerna, i en loop over roll -> nyckel
    expect(karta).toMatch(/'skordare' \? 'ekSparSkordare' : 'ekSparSkotare'/);
    expect(karta).not.toMatch(/ekSpar\w+ !== false/);
  });

  it('hyttsparet laggs FORE kontrollpunkternas nummer och symboler (ett tryckt fram spar doljer aldrig en punkt) och efter linjerna', () => {
    expect(karta).toMatch(/laggTillLager\(map, spec, 'ek-p-nummer'\)/);
  });

  it('tvarstrecken lyfts med planens vagar (opacitet 1) och gar tillbaka till kontextens nedtonade annars', () => {
    expect(karta).toMatch(/setPaintProperty\(BACKVAG_LAGER_ID, 'icon-opacity', planPa \? 1 : BACKVAG_OPACITET\)/);
  });

  it('inget av de nya lagren har en tryckhanterare: tryckhanteraren fragar bara ek-p-*, provyte- och observationslagren', () => {
    expect(karta).toMatch(/id\.startsWith\('ek-p-'\) \|\| provytaLagerIdn\(\)\.includes\(id\) \|\| observationLagerIdn\(\)\.includes\(id\)/);
    expect(karta).not.toMatch(/ek-spar/);                                          // spar-id:n finns bara i lib (egenkontrollkarta), aldrig som trycklager
  });
});

describe('sidan: valet sparas per enhet, hyttsparet hamtas bara pa begaran, knappen bor vid kartan', () => {
  const sida = las('app/egenkontroll/[objektId]/page.tsx');

  it('lagervalet kommer fran hooken (per enhet) - inte fran en egen useState som glomde det vid varje omladdning', () => {
    expect(sida).toMatch(/const \[egnaVarden, setEgnaVarden\] = useEgenkontrollLager\(\)/);
    expect(sida).not.toMatch(/useState<Record<string, boolean>>\(\{\s*ekPunkter/);
  });

  it('hyttsparet hamtas bara nar nagon bett om det: menyn oppen, en basvag markerad eller ett sparlager tant', () => {
    expect(sida).toMatch(/const sparBegard = lagerMeny \|\| basvagMarkerad \|\| egnaVarden\.ekSparSkordare === true \|\| egnaVarden\.ekSparSkotare === true/);
    expect(sida).toMatch(/if \(!sparBegard \|\| spar !== null\) return;/);
  });

  it('ett misslyckat forsok gors om nar menyn oppnas igen (inte i en slinga)', () => {
    expect(sida).toMatch(/if \(spar\?\.typ === 'fel'\) setSparState\(null\)/);
    expect(sida).toMatch(/onClick=\{oppnaLagerMeny\}/);
  });

  it('knappen "Visa hyttspåret" skriver SAMMA varden som menyn (tillampaSparKnapp pa egnaVarden) och bor INTE i dockans rad', () => {
    expect(sida).toMatch(/setEgnaVarden\(\(prev\) => tillampaSparKnapp\(lagerIndata, prev\)\)/);
    const rad = las('app/egenkontroll/BrickaRad.tsx');
    expect(rad).not.toMatch(/hyttsp/i);
    expect(las('app/egenkontroll/RundDock.tsx')).not.toMatch(/hyttsp/i);
  });

  it('menyn far sina rader fran lib (EN kalla for texterna) - inte en hardkodad lista', () => {
    expect(sida).toMatch(/egnaLager=\{lagerRaderLista\}/);
    expect(sida).not.toMatch(/const EGNA_LAGER/);
  });
});

describe('lagermenyn: en avstangd rad gar inte att trycka pa och visar alltid "av"', () => {
  const meny = las('components/KartLagerMeny.tsx');
  it('onClick saknas pa en avstangd rad, och reglaget visar `pa` (som ar falskt for en avstangd rad)', () => {
    expect(meny).toMatch(/onClick=\{lager\.avstangd \? undefined :/);
    expect(meny).toMatch(/const pa = !lager\.avstangd && !!egnaVarden\[lager\.id\]/);
    expect(meny).toMatch(/aria-disabled=\{lager\.avstangd \? true : undefined\}/);
  });
});
