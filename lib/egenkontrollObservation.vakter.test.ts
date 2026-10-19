import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// VAKTER MOT DEN HAR ARTEN AV FEL: en observation som slinker in i en raknare.
//
// Observationer ar tillagg, inga punkter att beta av. De delas bort vid kallan (hamtaRunda) och raknas
// aldrig i "N av M klara". Det far inte vila pa att tio konsumenter minns ett filter - utan pa att NY KOD
// som lasar punkterna antingen filtrerar bort dem eller medvetet delar dem. Dessa tester lasar KALLKODEN
// och larmar om nagon laser egenkontroll_punkt utan att ha tagit stallning.

const ROT = join(__dirname, '..');
const las = (rel: string) => readFileSync(join(ROT, rel), 'utf-8');

function alla(dir: string, ut: string[] = []): string[] {
  for (const namn of readdirSync(join(ROT, dir))) {
    if (namn === 'node_modules' || namn === '.next' || namn.startsWith('.')) continue;
    const rel = join(dir, namn);
    const st = statSync(join(ROT, rel));
    if (st.isDirectory()) alla(rel, ut);
    else if (/\.(ts|tsx)$/.test(namn) && !/\.test\.(ts|tsx)$/.test(namn)) ut.push(rel);
  }
  return ut;
}

describe('ingen laser egenkontroll_punkt forbi lib/egenkontroll.ts', () => {
  it("'egenkontroll_punkt' ar bara en tabell lib/egenkontroll.ts ror - sidor och komponenter gar via funktionerna", () => {
    const traffar = [...alla('app'), ...alla('components'), ...alla('lib')]
      .filter((f) => f !== join('lib', 'egenkontroll.ts'))
      .filter((f) => /from\(\s*['"]egenkontroll_punkt['"]\s*\)/.test(las(f)));
    expect(traffar).toEqual([]);
  });
});

describe('varje LASNING av egenkontroll_punkt har tagit stallning till observationerna', () => {
  const kalla = las('lib/egenkontroll.ts');

  /** Varje kedja som borjar pa .from('egenkontroll_punkt') och slutar vid nasta semikolon. */
  const kedjor = Array.from(kalla.matchAll(/\.from\(\s*'egenkontroll_punkt'\s*\)[\s\S]*?;/g)).map((m) => ({
    text: m[0],
    // Funktionen kedjan ligger i: narmaste "function namn(" fore den.
    funktion: Array.from(kalla.slice(0, m.index).matchAll(/function\s+(\w+)\s*[(<]/g)).pop()?.[1] ?? '',
  }));

  it('kedjorna hittades (annars bevisar de tomma looparna ingenting)', () => {
    expect(kedjor.length).toBeGreaterThanOrEqual(8);
  });

  it('en lasning av FLERA punkter utan .neq(kalla, observation) maste ligga i en funktion som delar dem (delaObservationer)', () => {
    const lasningar = kedjor.filter((k) => /\.select\(/.test(k.text) && !/\.(insert|update|delete)\(/.test(k.text));
    const flera = lasningar.filter((k) => !/\.eq\(\s*'id'/.test(k.text)); // en enskild punkt-uppslagning ar ingen raknare
    expect(flera.length).toBeGreaterThanOrEqual(3); // hamtaVantande, hamtaRunda, avslutaRunda
    const bortglomda = flera.filter((k) => {
      if (/\.neq\(\s*'kalla'\s*,\s*'observation'\s*\)/.test(k.text)) return false;
      // Funktionens hela text ska delaObservationer.
      const start = kalla.indexOf(`function ${k.funktion}`);
      const slut = kalla.indexOf('\nexport ', start + 10);
      return !/delaObservationer\(/.test(kalla.slice(start, slut === -1 ? undefined : slut));
    });
    expect(bortglomda.map((k) => k.funktion)).toEqual([]);
  });

  it('de tre direkta raknarna filtrerar bort observationer: hamtaVantande och avslutaRunda med .neq, hamtaRunda med delaObservationer', () => {
    const per = (namn: string) => kedjor.filter((k) => k.funktion === namn && /\.select\(/.test(k.text) && !/\.(insert|update|delete)\(/.test(k.text));
    for (const namn of ['hamtaVantande', 'avslutaRunda']) {
      expect(per(namn).length, namn).toBeGreaterThan(0);
      for (const k of per(namn)) expect(k.text, namn).toMatch(/\.neq\(\s*'kalla'\s*,\s*'observation'\s*\)/);
    }
    const hamtaRundaStart = kalla.indexOf('export async function hamtaRunda');
    const hamtaRundaSlut = kalla.indexOf('\n}\n', hamtaRundaStart);
    expect(kalla.slice(hamtaRundaStart, hamtaRundaSlut)).toMatch(/delaObservationer\(/);
  });

  it('skrivningarna pa en observation gar mot kalla = observation - en planpunkts id kan aldrig skrivas om eller raderas hit', () => {
    for (const namn of ['andraObservation', 'taBortObservation']) {
      const start = kalla.indexOf(`export async function ${namn}`);
      const slut = kalla.indexOf('\nexport ', start + 10);
      expect(kalla.slice(start, slut === -1 ? undefined : slut), namn).toMatch(/\.eq\(\s*'kalla'\s*,\s*'observation'\s*\)/);
    }
  });

  it('observationerna skapas med INSERT och ENDAST dar - aldrig upsert nagonstans i egenkontrollen', () => {
    expect(kalla).not.toMatch(/\.upsert\(/);
    const skapaStart = kalla.indexOf('export async function skapaObservation');
    expect(kalla.slice(skapaStart, kalla.indexOf('\nexport ', skapaStart + 10))).toMatch(/\.insert\(/);
  });
});

describe('sidan raknar aldrig in observationer i punkterna', () => {
  const sida = las('app/egenkontroll/[objektId]/page.tsx');
  const rader = sida.split('\n');

  it('allaPunkter ar vy.punkter - och bara det', () => {
    expect(sida).toMatch(/const allaPunkter = vy\?\.punkter \?\? \[\];/);
  });

  it('raknarna "kvar", "antalBattre", avslutaStatus, terrangKvar och serien ror inte observationer', () => {
    const raknare = rader.filter((r) =>
      /\bconst kvar\b|\bconst antalBattre\b|avslutaStatus\(|raknaTerrangKvar\(|byggSerie\(|\bconst antalAvvikelser\b/.test(r));
    // "N av M klara" (antalPlan/besvaradePlan) är borta sedan hel-läget slutade lista punkterna (Martin 2026-10-19); kvar, antalBattre,
    // avslutaStatus och antalAvvikelser är de räknare som finns kvar.
    expect(raknare.length).toBeGreaterThanOrEqual(4);
    for (const r of raknare) expect(r, r).not.toMatch(/observation/i);
  });

  it('observationerna visas under en EGEN rubrik, inte i nagon av planpunktsgrupperna', () => {
    expect(sida).toMatch(/<SectionHeader>Observationer<\/SectionHeader>/);
  });
});

describe('Rora inte byggSokvag - formatet ar lasbarande', () => {
  it('byggSokvag ar oforandrad: {egenkontroll_id}/{punkt_id}-{timestamp}.jpg', () => {
    expect(las('lib/egenkontrollfoto.ts')).toContain('return `${egenkontrollId}/${punktId}-${Date.now()}.jpg`;');
  });

  it('observationens bild far sin sokvag ur byggSokvag med punktens id - inget eget format', () => {
    const sheet = las('app/egenkontroll/ObservationSheet.tsx');
    expect(sheet).toMatch(/byggSokvag\(\s*egenkontrollId\s*,\s*id\s*\)/);
    expect(sheet).not.toMatch(/\$\{egenkontrollId\}\//);
  });
});

describe('aldrig confirm() eller alert()', () => {
  it.each(['app/egenkontroll/ObservationSheet.tsx', 'app/egenkontroll/ObservationLista.tsx', 'lib/egenkontrollObservation.ts'])(
    '%s',
    (fil) => {
      const utan = las(fil).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(utan).not.toMatch(/\b(window\.)?(confirm|alert|prompt)\s*\(/);
    },
  );
});
